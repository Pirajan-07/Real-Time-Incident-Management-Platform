"""
End-to-end smoke test for POST /logs.

Run from the backend/ directory with the venv active:
    python test_logs.py

Checks:
  1. Valid POST -> 201 with id + created_at
  2. Row exists in Postgres (via asyncpg)
  3. Entry appears in Redis Stream "logs" (via redis-py)
  4. Missing API key -> 401
  5. Wrong API key   -> 401
"""

import asyncio
import json
import sys

import asyncpg
import httpx
import redis.asyncio as aioredis
from dotenv import dotenv_values

# ── Load env vars from .env (same file FastAPI uses) ──────────────────────
env = dotenv_values(".env")
BASE_URL        = "http://localhost:8000"
API_KEY         = env["INGESTION_API_KEY"]
DATABASE_URL    = env["DATABASE_URL"]
REDIS_URL       = env["REDIS_URL"]

SAMPLE_PAYLOAD = {
    "source": "auth-service",
    "level": "ERROR",
    "message": "Login failed: too many attempts",
    "response_time_ms": 342,
    "status_code": 429,
    "payload": {"user_id": "u-001", "ip": "1.2.3.4"},
}

SEP = "-" * 60


def ok(msg: str) -> None:
    print(f"  [PASS]  {msg}")


def fail(msg: str) -> None:
    print(f"  [FAIL]  {msg}")
    sys.exit(1)


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE_URL) as client:

        # ── 1. Valid POST /logs ──────────────────────────────────────────
        print(f"\n{SEP}")
        print("TEST 1: Valid POST /logs with correct API key")
        print(SEP)

        resp = await client.post(
            "/logs",
            json=SAMPLE_PAYLOAD,
            headers={"X-API-Key": API_KEY},
        )

        print(f"  Status  : {resp.status_code}")
        print(f"  Response: {resp.text}")

        if resp.status_code != 201:
            fail(f"Expected 201, got {resp.status_code}")
        body = resp.json()
        if "id" not in body or "created_at" not in body:
            fail(f"Response missing id/created_at: {body}")

        log_id = body["id"]
        ok(f"Received 201 -- log id={log_id}, created_at={body['created_at']}")

        # ── 2. Verify row in Postgres ────────────────────────────────────
        print(f"\n{SEP}")
        print("TEST 2: Row exists in Postgres logs table")
        print(SEP)

        pg = await asyncpg.connect(dsn=DATABASE_URL)
        try:
            row = await pg.fetchrow("SELECT * FROM logs WHERE id = $1", log_id)
        finally:
            await pg.close()

        if row is None:
            fail(f"No row found in logs for id={log_id}")
        print(f"  id             : {row['id']}")
        print(f"  source         : {row['source']}")
        print(f"  level          : {row['level']}")
        print(f"  message        : {row['message']}")
        print(f"  response_time  : {row['response_time_ms']} ms")
        print(f"  status_code    : {row['status_code']}")
        print(f"  payload        : {row['payload']}")
        print(f"  created_at     : {row['created_at']}")
        ok("Row confirmed in Postgres")

        # ── 3. Verify entry in Redis Stream ──────────────────────────────
        print(f"\n{SEP}")
        print('TEST 3: Entry appears in Redis Stream "logs" (XRANGE logs - +)')
        print(SEP)

        redis = aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
        try:
            entries = await redis.xrange("logs", "-", "+")
        finally:
            await redis.aclose()

        if not entries:
            fail("Redis stream 'logs' is empty")

        # Find entry matching our log id
        match = next(
            (e for _, e in entries if e.get("id") == str(log_id)),
            None,
        )
        if match is None:
            fail(f"No stream entry found with id={log_id}")

        print(f"  Stream has {len(entries)} entry/entries total")
        print(f"  Matching entry: {json.dumps(match, indent=4)}")
        ok("Entry confirmed in Redis stream")

        # ── 4. Missing API key → 401 ─────────────────────────────────────
        print(f"\n{SEP}")
        print("TEST 4: Missing X-API-Key header -> 401")
        print(SEP)

        resp = await client.post("/logs", json=SAMPLE_PAYLOAD)
        print(f"  Status  : {resp.status_code}")
        print(f"  Response: {resp.text}")
        if resp.status_code != 401:
            fail(f"Expected 401, got {resp.status_code}")
        ok("Got 401 for missing API key")

        # ── 5. Wrong API key → 401 ───────────────────────────────────────
        print(f"\n{SEP}")
        print("TEST 5: Wrong X-API-Key header -> 401")
        print(SEP)

        resp = await client.post(
            "/logs",
            json=SAMPLE_PAYLOAD,
            headers={"X-API-Key": "totally-wrong-key"},
        )
        print(f"  Status  : {resp.status_code}")
        print(f"  Response: {resp.text}")
        if resp.status_code != 401:
            fail(f"Expected 401, got {resp.status_code}")
        ok("Got 401 for wrong API key")

    print(f"\n{SEP}")
    print("ALL TESTS PASSED")
    print(SEP)


if __name__ == "__main__":
    asyncio.run(main())
