"""
Real-time dashboard metrics.

compute_timeseries() buckets the `logs` table into fixed-width rolling
windows (default 12 x 5 minutes = the trailing hour) and returns the
error-rate % and average response time per bucket — the same series the
Dashboard's two trend charts render.

metrics_broadcaster_task() re-runs that query on an interval and pushes the
result over the existing Redis pub/sub -> WebSocket pipeline (the same
"ws_broadcast" channel logs/incidents already use), so the Dashboard updates
live without polling.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import asyncpg

from app.db.database import get_conn
from app.redis_client import get_redis
from app.ws_manager import publish_message

log = logging.getLogger("metrics")

BUCKET_SECONDS = 300   # 5 minutes per bucket
BUCKET_COUNT = 12      # 12 buckets = trailing 60 minutes
BROADCAST_INTERVAL_SECS = 15


async def compute_timeseries(conn: asyncpg.Connection) -> dict:
    """
    Groups logs into BUCKET_COUNT rolling windows of BUCKET_SECONDS each,
    counting back from now. Buckets with no logs are zero-filled so callers
    always get BUCKET_COUNT evenly-spaced points, oldest first.
    """
    rows = await conn.fetch(
        """
        SELECT
            floor(extract(epoch FROM (NOW() - created_at)) / $1)::bigint AS buckets_ago,
            COUNT(*)                                                     AS total,
            COUNT(*) FILTER (WHERE level = 'ERROR')                      AS errors,
            AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) AS avg_rt
        FROM logs
        WHERE created_at >= NOW() - ($1 * $2 * INTERVAL '1 second')
        GROUP BY buckets_ago
        """,
        BUCKET_SECONDS,
        BUCKET_COUNT,
    )
    by_bucket = {row["buckets_ago"]: row for row in rows}

    now = datetime.now(timezone.utc)
    points = []
    for buckets_ago in range(BUCKET_COUNT - 1, -1, -1):  # oldest -> newest
        row = by_bucket.get(buckets_ago)
        total = row["total"] if row else 0
        errors = row["errors"] if row else 0
        avg_rt = row["avg_rt"] if row else None
        error_rate = round((errors / total) * 100, 2) if total else 0.0
        points.append({
            "t": (now - timedelta(seconds=BUCKET_SECONDS * buckets_ago)).isoformat(),
            "total": total,
            "error_rate": error_rate,
            "avg_latency_ms": round(float(avg_rt), 1) if avg_rt is not None else None,
        })

    return {
        "bucket_seconds": BUCKET_SECONDS,
        "bucket_count": BUCKET_COUNT,
        "points": points,
    }


async def metrics_broadcaster_task() -> None:
    """Background task: recompute the timeseries and broadcast it every
    BROADCAST_INTERVAL_SECS. Mirrors redis_subscriber_task's lifecycle."""
    log.info("Starting metrics broadcaster task (every %ss)...", BROADCAST_INTERVAL_SECS)
    while True:
        try:
            async with get_conn() as conn:
                payload = await compute_timeseries(conn)
            redis_client = get_redis()
            await publish_message(redis_client, "metrics_update", payload)
        except asyncio.CancelledError:
            log.info("Metrics broadcaster task cancelled.")
            break
        except Exception as e:
            log.error("Metrics broadcaster error: %s", e)
        await asyncio.sleep(BROADCAST_INTERVAL_SECS)
