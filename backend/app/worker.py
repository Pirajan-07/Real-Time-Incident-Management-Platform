"""
IncidentOps – Redis Stream Consumer Worker
==========================================
Reads from the "logs" Redis stream via consumer group "incident-workers",
maintains a 60-second rolling window of metrics per source, evaluates three
anomaly-detection rules, and upserts incidents into Postgres.

Run from the backend/ directory (venv active):

    python -m app.worker

Detection rules (evaluated on every rolling-window update):
  1. error_rate_spike  – error % in 60s window > 10%  AND  total >= 20
  2. latency_spike     – avg_rt in window > 2× trailing-24h avg for that source
  3. failure_burst     – 5+ ERROR logs from same source in any 30s span
"""

import asyncio
import logging
import signal
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import time

import asyncpg
import redis.asyncio as aioredis
from dotenv import dotenv_values

from app.llm import generate_incident_summary
from app.slack import send_slack_alert
from app.ws_manager import publish_message

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("worker")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_env = dotenv_values(".env")
DATABASE_URL = _env["DATABASE_URL"]
REDIS_URL    = _env["REDIS_URL"]

STREAM_NAME   = "logs"
GROUP_NAME    = "incident-workers"
CONSUMER_NAME = "worker-1"
BLOCK_MS      = 2_000   # block up to 2 s waiting for new messages
BATCH_SIZE    = 10      # messages per XREADGROUP call
STATE_KEY     = "worker-1"

# Detection constants
WINDOW_SECS          = 60      # main rolling window
BURST_WINDOW_SECS    = 30      # tighter window for failure_burst
ERROR_RATE_THRESHOLD = 10.0    # %
ERROR_RATE_MIN_TOTAL = 20      # minimum log count before rule fires
LATENCY_MULTIPLIER   = 2.0     # avg_rt must exceed N× 24h baseline
BURST_ERROR_THRESHOLD = 5      # N errors in BURST_WINDOW_SECS

# Baseline refresh: re-query 24h averages every this many seconds
BASELINE_REFRESH_SECS = 300    # 5 minutes

# Summary print interval
SUMMARY_EVERY = 10

# ---------------------------------------------------------------------------
# Rolling-window data structures
# ---------------------------------------------------------------------------

@dataclass
class LogEvent:
    """A single observed log event stored in either window."""
    log_id: int
    ts: float          # unix timestamp (seconds) – from Redis stream ID
    level: str
    rt_ms: int | None


@dataclass
class SourceWindow:
    """
    Dual sliding-window state for a single source.

    • events      – 60-second window (metrics + error rate)
    • burst_events – 30-second window (failure_burst detection)
    Both share idempotency via seen_ids.
    """
    events: deque       = field(default_factory=deque)   # 60s
    burst_events: deque = field(default_factory=deque)   # 30s
    seen_ids: set       = field(default_factory=set)

    def add(self, event: LogEvent) -> bool:
        """
        Add event to both windows.  Returns True if new (not a duplicate).
        """
        if event.log_id in self.seen_ids:
            return False
        self.seen_ids.add(event.log_id)
        self.events.append(event)
        self.burst_events.append(event)
        return True

    def evict(self, now: float) -> None:
        """Evict stale entries from both windows."""
        cutoff_60 = now - WINDOW_SECS
        cutoff_30 = now - BURST_WINDOW_SECS

        while self.events and self.events[0].ts < cutoff_60:
            old = self.events.popleft()
            self.seen_ids.discard(old.log_id)

        while self.burst_events and self.burst_events[0].ts < cutoff_30:
            self.burst_events.popleft()

    # -- 60-second window metrics --------------------------------------------

    @property
    def total(self) -> int:
        return len(self.events)

    @property
    def error_count(self) -> int:
        return sum(1 for e in self.events if e.level == "ERROR")

    @property
    def error_rate(self) -> float:
        return (self.error_count / self.total * 100) if self.total else 0.0

    @property
    def avg_rt(self) -> float | None:
        rts = [e.rt_ms for e in self.events if e.rt_ms is not None]
        return sum(rts) / len(rts) if rts else None

    # -- 30-second burst window metrics --------------------------------------

    @property
    def burst_error_count(self) -> int:
        return sum(1 for e in self.burst_events if e.level == "ERROR")


# Shared state: source -> SourceWindow
windows: dict[str, SourceWindow] = defaultdict(SourceWindow)

# 24-hour response-time baseline per source: source -> avg_rt_ms (float|None)
baseline_rt: dict[str, float | None] = {}

# Rate limit state for LLM calls (timestamps)
llm_call_times: deque[float] = deque()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stream_id_to_ts(stream_id: str) -> float:
    """Redis stream IDs: '<milliseconds>-<seq>'. Extract UTC unix float."""
    return int(stream_id.split("-")[0]) / 1000.0


def _entry_ts(stream_id: str) -> float:
    return _stream_id_to_ts(stream_id)


# ---------------------------------------------------------------------------
# 24-hour baseline refresh
# ---------------------------------------------------------------------------

async def _refresh_baselines(pg_conn: asyncpg.Connection) -> None:
    """
    Query the trailing 24-hour average response_time_ms per source.
    Only considers rows where response_time_ms IS NOT NULL.
    Results are cached in the module-level `baseline_rt` dict.
    """
    rows = await pg_conn.fetch(
        """
        SELECT source, AVG(response_time_ms)::FLOAT AS avg_rt
        FROM   logs
        WHERE  created_at >= NOW() - INTERVAL '24 hours'
          AND  response_time_ms IS NOT NULL
        GROUP  BY source
        """
    )
    for row in rows:
        baseline_rt[row["source"]] = row["avg_rt"]
    log.info(
        "Baseline refresh: %d sources updated. %s",
        len(rows),
        {r["source"]: f"{r['avg_rt']:.0f}ms" for r in rows},
    )


# ---------------------------------------------------------------------------
# Anomaly detection rules
# ---------------------------------------------------------------------------

def _check_rules(source: str) -> list[dict]:
    """
    Evaluate all three detection rules for a given source.
    Returns a list of triggered rule dicts:
        {trigger_reason, metric_value, threshold_value, title, last_log_id}
    """
    w = windows[source]
    fired: list[dict] = []

    # Latest log id we've seen for this source (for last_log_id column)
    last_id = w.events[-1].log_id if w.events else 0

    # -- Rule 1: error_rate_spike --------------------------------------------
    if w.total >= ERROR_RATE_MIN_TOTAL and w.error_rate > ERROR_RATE_THRESHOLD:
        fired.append({
            "trigger_reason":  "error_rate_spike",
            "title":           f"Error Rate Spike - {source}",
            "metric_value":    round(w.error_rate, 2),
            "threshold_value": ERROR_RATE_THRESHOLD,
            "last_log_id":     last_id,
        })

    # -- Rule 2: latency_spike -----------------------------------------------
    baseline = baseline_rt.get(source)
    if baseline and w.avg_rt is not None:
        threshold = baseline * LATENCY_MULTIPLIER
        if w.avg_rt > threshold:
            fired.append({
                "trigger_reason":  "latency_spike",
                "title":           f"Latency Spike - {source}",
                "metric_value":    round(w.avg_rt, 2),
                "threshold_value": round(threshold, 2),
                "last_log_id":     last_id,
            })

    # -- Rule 3: failure_burst -----------------------------------------------
    burst_last_id = w.burst_events[-1].log_id if w.burst_events else 0
    if w.burst_error_count >= BURST_ERROR_THRESHOLD:
        fired.append({
            "trigger_reason":  "failure_burst",
            "title":           f"Failure Burst - {source}",
            "metric_value":    float(w.burst_error_count),
            "threshold_value": float(BURST_ERROR_THRESHOLD),
            "last_log_id":     burst_last_id,
        })

    return fired


# ---------------------------------------------------------------------------
# Incident upsert (create or update)
# ---------------------------------------------------------------------------

async def _trigger_ai_summary(pg_conn: asyncpg.Connection, incident_id: int, source: str, rule: dict) -> None:
    now = time.time()
    # Clean up old timestamps (older than 60s)
    while llm_call_times and llm_call_times[0] < now - 60:
        llm_call_times.popleft()
        
    if len(llm_call_times) >= 5:
        log.warning(f"LLM rate limit reached (5 calls/min). Skipping AI summary for incident #{incident_id}.")
        return
        
    llm_call_times.append(now)
    
    # Fetch recent logs
    rows = await pg_conn.fetch(
        "SELECT level, message FROM logs WHERE source = $1 ORDER BY created_at DESC LIMIT 10",
        source
    )
    related_logs = [dict(r) for r in rows]
    
    # Fire and forget
    asyncio.create_task(
        generate_incident_summary(
            incident_id=incident_id,
            source=source,
            trigger_reason=rule["trigger_reason"],
            metric_value=float(rule["metric_value"]),
            threshold_value=float(rule["threshold_value"]),
            related_logs=related_logs
        )
    )

async def _upsert_incident(
    redis_client: aioredis.Redis,
    pg_conn: asyncpg.Connection,
    source: str,
    rule: dict,
) -> None:
    """
    Dedup logic:
      • If an OPEN incident already exists for this (source, trigger_reason),
        UPDATE its metric_value and last_log_id only.
      • Otherwise INSERT a new incident row.
    Prints a console line in both cases.
    """
    existing = await pg_conn.fetchrow(
        """
        SELECT id, metric_value
        FROM   incidents
        WHERE  source         = $1
          AND  trigger_reason = $2
          AND  status         = 'open'
        ORDER  BY created_at DESC
        LIMIT  1
        """,
        source,
        rule["trigger_reason"],
    )

    if existing:
        await pg_conn.execute(
            """
            UPDATE incidents
            SET    metric_value = $1,
                   last_log_id  = $2
            WHERE  id = $3
            """,
            rule["metric_value"],
            rule["last_log_id"],
            existing["id"],
        )
        print(
            f"[INCIDENT UPDATED] #{existing['id']} {rule['trigger_reason']} "
            f"{source}  {rule['metric_value']} vs {rule['threshold_value']} "
            f"(was {existing['metric_value']})",
            flush=True,
        )
        asyncio.create_task(publish_message(redis_client, "incident_updated", {
            "id": existing["id"],
            "metric_value": rule["metric_value"],
            "last_log_id": rule["last_log_id"]
        }))
    else:
        row = await pg_conn.fetchrow(
            """
            INSERT INTO incidents
                (title, source, trigger_reason, metric_value, threshold_value,
                 status, last_log_id)
            VALUES ($1, $2, $3, $4, $5, 'open', $6)
            RETURNING id
            """,
            rule["title"],
            source,
            rule["trigger_reason"],
            rule["metric_value"],
            rule["threshold_value"],
            rule["last_log_id"],
        )
        print(
            f"[INCIDENT CREATED] #{row['id']} {rule['trigger_reason']} "
            f"{source}  {rule['metric_value']} vs {rule['threshold_value']}",
            flush=True,
        )
        
        asyncio.create_task(publish_message(redis_client, "incident_created", {
            "id": row["id"],
            "title": rule["title"],
            "source": source,
            "trigger_reason": rule["trigger_reason"],
            "metric_value": rule["metric_value"],
            "threshold_value": rule["threshold_value"],
            "status": "open",
            "last_log_id": rule["last_log_id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }))

        await _trigger_ai_summary(pg_conn, row["id"], source, rule)
        
        # Fire and forget Slack alert
        asyncio.create_task(
            send_slack_alert(
                incident_id=row["id"],
                title=rule["title"],
                source=source,
                trigger_reason=rule["trigger_reason"],
                metric_value=float(rule["metric_value"]),
                threshold_value=float(rule["threshold_value"])
            )
        )


# ---------------------------------------------------------------------------
# Summary printer
# ---------------------------------------------------------------------------

def _print_summary() -> None:
    now = datetime.now().strftime("%H:%M:%S")
    sep = "=" * 82
    print(f"\n{sep}", flush=True)
    print(
        f"  ROLLING WINDOW SUMMARY  ({now})  "
        f"window={WINDOW_SECS}s  burst={BURST_WINDOW_SECS}s",
        flush=True,
    )
    print(
        f"{'Source':<30} {'Total':>6} {'Err%':>7} {'AvgRT':>8} "
        f"{'Burst':>6} {'Baseline':>10}",
        flush=True,
    )
    print("-" * 82, flush=True)

    if not any(w.total > 0 for w in windows.values()):
        print("  (no data in window)", flush=True)
    else:
        for src in sorted(windows):
            w = windows[src]
            if w.total == 0 and w.burst_error_count == 0:
                continue
            avg    = f"{w.avg_rt:.0f}ms"  if w.avg_rt  is not None else "  N/A"
            base   = f"{baseline_rt.get(src):.0f}ms" if baseline_rt.get(src) else "  N/A"
            burst  = f"{w.burst_error_count} err"
            alerts = []
            if w.total >= ERROR_RATE_MIN_TOTAL and w.error_rate > ERROR_RATE_THRESHOLD:
                alerts.append("ERR%")
            bl = baseline_rt.get(src)
            if bl and w.avg_rt and w.avg_rt > bl * LATENCY_MULTIPLIER:
                alerts.append("LAT")
            if w.burst_error_count >= BURST_ERROR_THRESHOLD:
                alerts.append("BURST")
            flag = f"  <-- {','.join(alerts)}" if alerts else ""
            print(
                f"  {src:<28} {w.total:>6} {w.error_rate:>6.1f}% "
                f"{avg:>7} {burst:>7} {base:>9}{flag}",
                flush=True,
            )
    print(sep, flush=True)


# ---------------------------------------------------------------------------
# Consumer-state persistence
# ---------------------------------------------------------------------------

async def _save_consumer_state(conn: asyncpg.Connection, last_id: str) -> None:
    await conn.execute(
        """
        INSERT INTO consumer_state (consumer_name, last_stream_id, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (consumer_name)
        DO UPDATE SET last_stream_id = EXCLUDED.last_stream_id,
                      updated_at     = EXCLUDED.updated_at
        """,
        STATE_KEY,
        last_id,
    )


# ---------------------------------------------------------------------------
# Consumer group setup
# ---------------------------------------------------------------------------

async def _ensure_consumer_group(redis: aioredis.Redis) -> None:
    try:
        await redis.xgroup_create(
            name=STREAM_NAME,
            groupname=GROUP_NAME,
            id="0",
            mkstream=True,
        )
        log.info("Consumer group '%s' created on stream '%s'.", GROUP_NAME, STREAM_NAME)
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            log.info("Consumer group '%s' already exists – resuming.", GROUP_NAME)
        else:
            raise


# ---------------------------------------------------------------------------
# Process a single batch of stream messages
# ---------------------------------------------------------------------------

async def _process_batch(
    redis: aioredis.Redis,
    pg_conn: asyncpg.Connection,
    messages: list,
) -> str | None:
    last_id: str | None = None
    now = datetime.now(timezone.utc).timestamp()

    affected_sources: set[str] = set()

    for stream_id, entry in messages:
        try:
            log_id = int(entry.get("id", 0))
            level  = entry.get("level", "INFO").upper()
            source = entry.get("source", "unknown")
            rt_raw = entry.get("response_time_ms", "")
            rt_ms  = int(rt_raw) if rt_raw and str(rt_raw).strip() else None
            ts     = _entry_ts(stream_id)
        except (ValueError, TypeError) as exc:
            log.warning("Skipping malformed entry %s: %s", stream_id, exc)
            await redis.xack(STREAM_NAME, GROUP_NAME, stream_id)
            continue

        event = LogEvent(log_id=log_id, ts=ts, level=level, rt_ms=rt_ms)
        
        asyncio.create_task(publish_message(redis, "log", {
            "source": source,
            "level": level,
            "message": entry.get("message", ""),
            "timestamp": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        }))

        w = windows[source]
        w.evict(now)
        added = w.add(event)

        if not added:
            log.debug("Duplicate log id=%d – skipping.", log_id)
        else:
            affected_sources.add(source)

        # XACK after state update (crash safety)
        await redis.xack(STREAM_NAME, GROUP_NAME, stream_id)
        last_id = stream_id
        log.debug("Processed id=%d src=%s lvl=%s", log_id, source, level)

    # -- Run detection rules on affected sources -----------------------------
    for source in affected_sources:
        for rule in _check_rules(source):
            await _upsert_incident(redis, pg_conn, source, rule)

    # -- Persist consumer state ----------------------------------------------
    if last_id:
        await _save_consumer_state(pg_conn, last_id)

    return last_id


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def run() -> None:
    log.info("Starting IncidentOps consumer worker…")

    redis = aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    await redis.ping()
    log.info("Connected to Redis at %s", REDIS_URL)

    from app.db.database import init_db_pool, get_conn, close_db_pool
    await init_db_pool()
    log.info("Connected to Postgres at %s", DATABASE_URL)

    await _ensure_consumer_group(redis)

    # -- Initial baseline load -----------------------------------------------
    async with get_conn() as conn:
        await _refresh_baselines(conn)

    # -- Claim any unacked pending messages from a prior crash ---------------
    log.info("Checking for pending (unacked) messages from prior runs…")
    async with get_conn() as conn:
        pending = await redis.xpending_range(
            STREAM_NAME, GROUP_NAME, min="-", max="+", count=100
        )
        if pending:
            log.info("Found %d pending messages – reclaiming…", len(pending))
            ids = [p["message_id"] for p in pending]
            claimed = await redis.xclaim(
                STREAM_NAME, GROUP_NAME, CONSUMER_NAME,
                min_idle_time=0, message_ids=ids,
            )
            if claimed:
                await _process_batch(redis, conn, claimed)
                log.info("Reclaimed %d pending messages.", len(claimed))

    last_summary  = asyncio.get_event_loop().time()
    last_baseline = asyncio.get_event_loop().time()

    log.info("Entering main consume loop (Ctrl-C to stop)…")
    try:
        async with get_conn() as conn:
            while True:
                now_loop = asyncio.get_event_loop().time()

                # Periodic 24h baseline refresh
                if now_loop - last_baseline >= BASELINE_REFRESH_SECS:
                    await _refresh_baselines(conn)
                    last_baseline = now_loop

                # Rolling-window summary + eviction
                if now_loop - last_summary >= SUMMARY_EVERY:
                    ts_now = datetime.now(timezone.utc).timestamp()
                    for w in windows.values():
                        w.evict(ts_now)
                    _print_summary()
                    last_summary = now_loop

                results = await redis.xreadgroup(
                    groupname=GROUP_NAME,
                    consumername=CONSUMER_NAME,
                    streams={STREAM_NAME: ">"},
                    count=BATCH_SIZE,
                    block=BLOCK_MS,
                )

                if not results:
                    continue

                for _stream_name, messages in results:
                    await _process_batch(redis, conn, messages)

    except asyncio.CancelledError:
        log.info("Consume loop cancelled.")
    finally:
        log.info("Shutting down – closing connections…")
        await redis.aclose()
        await close_db_pool()
        log.info("Worker stopped cleanly.")


# ---------------------------------------------------------------------------
# Entry point + graceful shutdown
# ---------------------------------------------------------------------------

def _handle_signal(loop: asyncio.AbstractEventLoop) -> None:
    log.info("Shutdown signal received.")
    for task in asyncio.all_tasks(loop):
        task.cancel()


def main() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal, loop)
        except NotImplementedError:
            pass  # Windows SIGTERM

    try:
        loop.run_until_complete(run())
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        loop.close()


if __name__ == "__main__":
    main()
