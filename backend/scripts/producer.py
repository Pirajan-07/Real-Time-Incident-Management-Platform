"""
IncidentOps – Realistic Log Producer
=====================================
Continuously POSTs synthetic log entries to the /logs endpoint.

Usage
-----
Normal mode (all sources, ~80% INFO / 15% WARN / 5% ERROR):
    python scripts/producer.py

Burst mode (force a specific source to 80% ERROR for 30 s):
    python scripts/producer.py --burst auth-service

Options
-------
--burst <source>    Source name to put into incident mode.
--url   <url>       Backend base URL (default: http://localhost:8000).
--env   <path>      Path to .env file (default: .env).
--duration <secs>   Stop automatically after N seconds (0 = run forever).
"""

import argparse
import asyncio
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SOURCES = [
    "auth-service",
    "payment-gateway",
    "api-gateway-01",
    "notification-worker",
    "database-cluster-primary",
    "ingress-nginx",
    "user-profile",
]

# Weighted level distribution for NORMAL operation
NORMAL_LEVELS   = ["INFO"] * 80 + ["WARN"] * 15 + ["ERROR"] * 5
# Weighted level distribution for BURST / incident mode
BURST_LEVELS    = ["ERROR"] * 80 + ["WARN"] * 15 + ["INFO"] * 5

BURST_DURATION  = 30  # seconds

# ---------------------------------------------------------------------------
# Realistic message templates per source+level
# ---------------------------------------------------------------------------

MESSAGES: dict[str, dict[str, list[str]]] = {
    "auth-service": {
        "INFO": [
            "User login successful for user_id:{uid}",
            "Token issued for user_id:{uid} (ttl=3600s)",
            "Cache hit: session_id:{sid}",
            "Password policy check passed for user_id:{uid}",
            "OAuth2 token refresh successful for client:{cid}",
        ],
        "WARN": [
            "Login attempt from unusual location for user_id:{uid}",
            "Token expiring soon for user_id:{uid} (ttl=60s)",
            "Failed login attempt #{n} for user_id:{uid}",
            "MFA challenge issued for user_id:{uid}",
        ],
        "ERROR": [
            "Account locked after {n} failed attempts for user_id:{uid}",
            "Rate limit exceeded for IP {ip}",
            "JWT signature verification failed for token:{tid}",
            "Session store unreachable – falling back to stateless auth",
            "Invalid credentials for user_id:{uid}",
        ],
    },
    "payment-gateway": {
        "INFO": [
            "Payment processed: txn_id:{tid} amount:${amt}",
            "Refund issued: txn_id:{tid} amount:${amt}",
            "Webhook delivered to merchant:{mid} status:200",
            "Card tokenisation complete for card ending {last4}",
            "3DS challenge passed for txn_id:{tid}",
        ],
        "WARN": [
            "Payment retry #{n} for txn_id:{tid}",
            "Merchant {mid} response time {ms}ms (threshold 500ms)",
            "Suspicious transaction pattern: txn_id:{tid}",
            "Currency conversion rate stale (age:{age}s)",
        ],
        "ERROR": [
            "Payment declined by issuer for txn_id:{tid}",
            "PSP connection timeout after {ms}ms for txn_id:{tid}",
            "Fraud score too high for txn_id:{tid} – blocked",
            "Webhook delivery failed for merchant:{mid} (5xx response)",
            "Duplicate transaction detected: txn_id:{tid}",
        ],
    },
    "api-gateway-01": {
        "INFO": [
            "GET /api/v1/users/{uid} -> 200 in {ms}ms",
            "POST /api/v1/orders -> 201 in {ms}ms",
            "GET /api/v1/products -> 200 in {ms}ms ({n} results)",
            "Health check passed upstream:{svc}",
            "Rate limit bucket refilled for client:{cid}",
        ],
        "WARN": [
            "Upstream {svc} latency elevated: {ms}ms",
            "Client {cid} approaching rate limit ({n}/100 req/min)",
            "Retrying upstream {svc} (attempt {n}/3)",
            "Large payload detected: {n}KB on POST /api/v1/imports",
        ],
        "ERROR": [
            "Upstream {svc} returned 503 after {n} retries",
            "Circuit breaker OPEN for upstream:{svc}",
            "Rate limit exceeded for client:{cid} ({n} req/min)",
            "Request timeout ({ms}ms) on GET /api/v1/search",
            "SSL handshake failed with upstream:{svc}",
        ],
    },
    "notification-worker": {
        "INFO": [
            "Email sent to user_id:{uid} template:{tpl}",
            "Push notification delivered to device:{did}",
            "SMS dispatched to +1****{last4}",
            "Batch job completed: {n} notifications sent",
            "Queue depth normal: {n} pending jobs",
        ],
        "WARN": [
            "Email bounce for user_id:{uid} (soft bounce)",
            "Push notification delayed {ms}ms (FCM backoff)",
            "Queue depth elevated: {n} pending jobs",
            "SMTP connection pool at 80% capacity",
        ],
        "ERROR": [
            "Email delivery failed for user_id:{uid} (hard bounce)",
            "FCM token invalid for device:{did}",
            "Twilio API error {code} sending SMS to +1****{last4}",
            "Worker crashed processing job_id:{jid} – requeued",
            "Dead-letter queue threshold exceeded ({n} messages)",
        ],
    },
    "database-cluster-primary": {
        "INFO": [
            "Query completed in {ms}ms (table:users rows:{n})",
            "Checkpoint completed: {n} buffers written",
            "Replication lag: {ms}ms (replica:standby-01)",
            "Autovacuum started on table:{tbl}",
            "Connection pool utilisation: {n}%",
        ],
        "WARN": [
            "Slow query ({ms}ms) on table:{tbl} – index missing?",
            "Replication lag elevated: {ms}ms (replica:standby-01)",
            "Connection pool at {n}% capacity",
            "Table bloat detected on {tbl} (dead rows:{n})",
        ],
        "ERROR": [
            "Connection timeout to database cluster after {ms}ms",
            "Deadlock detected on table:{tbl} – transactions rolled back",
            "Out of connections ({n}/{max}) – rejecting new requests",
            "Disk usage critical: {n}% on /var/lib/postgresql",
            "Replication slot {slot} is lagging by {n} WAL segments",
        ],
    },
    "ingress-nginx": {
        "INFO": [
            "{method} {path} -> {code} {ms}ms ({n}B)",
            "TLS handshake complete for {ip} (TLSv1.3)",
            "Upstream keepalive reused for {svc}",
            "Static asset served: {path} ({n}KB, cache:HIT)",
            "Health probe {path} -> 200",
        ],
        "WARN": [
            "Upstream {svc} returned {code} for {path}",
            "Request body too large ({n}KB) from {ip}",
            "Upstream connection reset for {svc} on {path}",
            "Rate limit warning for {ip} ({n} req/s)",
        ],
        "ERROR": [
            "Upstream {svc} unavailable – 502 returned to {ip}",
            "SSL certificate expires in {n} days",
            "DDoS pattern detected from {ip} – blocking",
            "504 Gateway Timeout for {path} upstream:{svc}",
            "Worker process OOM killed – restarting",
        ],
    },
    "user-profile": {
        "INFO": [
            "Profile fetched for user_id:{uid} in {ms}ms",
            "Avatar uploaded for user_id:{uid} ({n}KB)",
            "Preferences updated for user_id:{uid}",
            "Cache warmed for user_id:{uid}",
            "GDPR export generated for user_id:{uid}",
        ],
        "WARN": [
            "Profile cache miss for user_id:{uid} – rebuilding",
            "Avatar upload slow ({ms}ms) for user_id:{uid}",
            "Stale profile data for user_id:{uid} (age:{age}s)",
        ],
        "ERROR": [
            "Profile not found for user_id:{uid}",
            "Avatar storage backend unreachable",
            "Profile update conflict for user_id:{uid} (optimistic lock)",
            "GDPR delete failed for user_id:{uid} – retrying",
        ],
    },
}

# Status codes by level
STATUS_BY_LEVEL = {
    "INFO":  [200, 200, 200, 201, 204],
    "WARN":  [200, 429, 503, 408],
    "ERROR": [500, 502, 503, 504, 429, 400],
}

# Response time ranges by level (ms)
RT_BY_LEVEL = {
    "INFO":  (20, 180),
    "WARN":  (200, 600),
    "ERROR": (500, 3000),
}

# Sources where response_time / status_code make sense
HTTP_SOURCES = {
    "auth-service",
    "payment-gateway",
    "api-gateway-01",
    "ingress-nginx",
    "user-profile",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rand_vars() -> dict:
    """Random template substitution variables."""
    return {
        "uid":   f"u-{random.randint(1000, 9999)}",
        "sid":   f"s-{random.randint(100000, 999999)}",
        "tid":   f"t-{random.randint(100000, 999999)}",
        "jid":   f"j-{random.randint(10000, 99999)}",
        "cid":   f"c-{random.randint(100, 999)}",
        "mid":   f"m-{random.randint(100, 999)}",
        "did":   f"d-{random.randint(10000, 99999)}",
        "ip":    f"{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
        "amt":   f"{random.uniform(1, 9999):.2f}",
        "last4": f"{random.randint(1000, 9999)}",
        "ms":    random.randint(50, 3000),
        "n":     random.randint(1, 200),
        "max":   100,
        "age":   random.randint(60, 3600),
        "tpl":   random.choice(["welcome", "reset_password", "invoice", "promo"]),
        "tbl":   random.choice(["users", "orders", "sessions", "events", "logs"]),
        "svc":   random.choice(["auth-service", "user-profile", "payment-gateway"]),
        "slot":  f"repl_slot_{random.randint(1,4)}",
        "code":  random.choice([400, 429, 500, 503]),
        "method": random.choice(["GET", "POST", "PUT", "DELETE"]),
        "path":  random.choice(["/api/v1/users", "/api/v1/orders", "/api/v1/products", "/health"]),
    }


def build_log(source: str, burst_source: str | None, burst_end: float) -> dict:
    """Build a single realistic log entry dict."""
    in_burst = (
        burst_source is not None
        and source == burst_source
        and time.monotonic() < burst_end
    )
    level = random.choice(BURST_LEVELS if in_burst else NORMAL_LEVELS)

    templates = MESSAGES.get(source, {}).get(level, ["Log entry from {source}"])
    template  = random.choice(templates)
    vars_      = _rand_vars()
    vars_["source"] = source
    message   = template.format_map(vars_)

    entry: dict = {
        "source":  source,
        "level":   level,
        "message": message,
    }

    if source in HTTP_SOURCES:
        lo, hi = RT_BY_LEVEL[level]
        entry["response_time_ms"] = random.randint(lo, hi)
        entry["status_code"]      = random.choice(STATUS_BY_LEVEL[level])
        entry["payload"] = {
            "ip":       vars_["ip"],
            "user_id":  vars_["uid"],
        }
    else:
        entry["payload"] = {"detail": vars_["tbl"]}

    return entry


def _color(level: str, text: str) -> str:
    """ANSI colour for the level badge (degrades gracefully on Windows)."""
    codes = {"INFO": "\033[32m", "WARN": "\033[33m", "ERROR": "\033[31m"}
    reset = "\033[0m"
    return f"{codes.get(level, '')}{text}{reset}"


def _console_line(entry: dict, log_id: int | None = None) -> str:
    ts    = datetime.now(timezone.utc).strftime("%H:%M:%S")
    badge = f"[{entry['level']:5s}]"
    id_s  = f"id={log_id}" if log_id else "       "
    rt    = f"{entry.get('response_time_ms', '-'):>5}ms" if entry.get("response_time_ms") is not None else "       "
    sc    = f"{entry.get('status_code', '---'):>3}"
    return (
        f"{ts}  {_color(entry['level'], badge)}  {id_s}  "
        f"{entry['source']:<28}  {sc}  {rt}  {entry['message']}"
    )


# ---------------------------------------------------------------------------
# Main async loop
# ---------------------------------------------------------------------------

async def run(
    base_url: str,
    api_key: str,
    burst_source: str | None,
    duration: float,
) -> None:
    burst_end = time.monotonic() + BURST_DURATION if burst_source else 0.0
    stop_at   = time.monotonic() + duration if duration > 0 else float("inf")

    if burst_source:
        print(
            f"[producer] BURST MODE: {burst_source} will emit ~80% ERROR "
            f"for {BURST_DURATION}s"
        )
    print(f"[producer] Sending to {base_url}/logs  (Ctrl+C to stop)\n")

    headers = {"X-API-Key": api_key}

    async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
        while time.monotonic() < stop_at:
            source = random.choice(SOURCES)
            entry  = build_log(source, burst_source, burst_end)

            try:
                resp = await client.post("/logs", json=entry, headers=headers)
                if resp.status_code == 201:
                    log_id = resp.json().get("id")
                    print(_console_line(entry, log_id))
                else:
                    print(
                        f"[producer] WARNING: unexpected status "
                        f"{resp.status_code} – {resp.text[:120]}"
                    )
            except httpx.ConnectError:
                print("[producer] WARNING: cannot connect to backend – retrying…")
            except httpx.TimeoutException:
                print("[producer] WARNING: request timed out – retrying…")
            except Exception as exc:  # noqa: BLE001
                print(f"[producer] WARNING: unexpected error – {exc}")

            # Randomised inter-message delay
            delay = random.uniform(0.5, 2.0)
            if burst_source and source == burst_source and time.monotonic() < burst_end:
                delay = random.uniform(0.1, 0.4)  # fire faster during burst

            await asyncio.sleep(delay)

    print("\n[producer] Done.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="IncidentOps realistic log producer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--burst",
        metavar="SOURCE",
        default=None,
        help=f"Source to put in incident mode for {BURST_DURATION}s. "
             f"Choices: {', '.join(SOURCES)}",
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Backend base URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--env",
        default=".env",
        help="Path to .env file (default: .env)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=0,
        help="Stop after N seconds (0 = run forever, default: 0)",
    )
    args = parser.parse_args()

    env_path = Path(args.env)
    if not env_path.exists():
        print(f"[producer] ERROR: .env file not found at {env_path.resolve()}")
        sys.exit(1)

    env = dotenv_values(env_path)
    api_key = env.get("INGESTION_API_KEY")
    if not api_key:
        print("[producer] ERROR: INGESTION_API_KEY not set in .env")
        sys.exit(1)

    if args.burst and args.burst not in SOURCES:
        print(f"[producer] ERROR: unknown source '{args.burst}'. Valid: {SOURCES}")
        sys.exit(1)

    try:
        asyncio.run(
            run(
                base_url=args.url,
                api_key=api_key,
                burst_source=args.burst,
                duration=args.duration,
            )
        )
    except KeyboardInterrupt:
        print("\n[producer] Interrupted – goodbye.")


if __name__ == "__main__":
    main()
