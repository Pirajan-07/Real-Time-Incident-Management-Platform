"""
Log ingestion router.

POST /logs
----------
Requires X-API-Key header matching INGESTION_API_KEY.
Inserts a log row into Postgres and pushes it onto the Redis Stream "logs".
Returns 201 with the new log's id and created_at timestamp.
"""

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, status, Depends
from pydantic import BaseModel

from app.config import settings
from app.db.database import get_conn
from app.redis_client import get_redis
from app.auth import get_current_user

router = APIRouter(prefix="/logs", tags=["logs"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class LogIn(BaseModel):
    source: str
    level: str
    message: str
    response_time_ms: int | None = None
    status_code: int | None = None
    payload: dict[str, Any] | None = None


class LogCreated(BaseModel):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Dependency: API-key guard
# ---------------------------------------------------------------------------

def _require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Raise 401 if the X-API-Key header is missing or incorrect."""
    if x_api_key != settings.ingestion_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=LogCreated,
    summary="Ingest a log entry",
)
async def create_log(
    body: LogIn,
    x_api_key: str | None = Header(default=None),
) -> LogCreated:
    # ── Auth guard ──────────────────────────────────────────────────────────
    if x_api_key != settings.ingestion_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )

    # ── Persist to Postgres ─────────────────────────────────────────────────
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO logs (source, level, message,
                              response_time_ms, status_code, payload)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING id, created_at
            """,
            body.source,
            body.level,
            body.message,
            body.response_time_ms,
            body.status_code,
            json.dumps(body.payload) if body.payload is not None else None,
        )

    log_id: int = row["id"]
    created_at: datetime = row["created_at"]

    # ── Push to Redis Stream "logs" ──────────────────────────────────────────
    stream_entry: dict[str, str] = {
        "id": str(log_id),
        "source": body.source,
        "level": body.level,
        "message": body.message,
        "response_time_ms": str(body.response_time_ms) if body.response_time_ms is not None else "",
        "status_code": str(body.status_code) if body.status_code is not None else "",
        "payload": json.dumps(body.payload) if body.payload is not None else "",
        "created_at": created_at.isoformat(),
    }

    redis = get_redis()
    await redis.xadd("logs", stream_entry)

    return LogCreated(id=log_id, created_at=created_at)

@router.get(
    "/count",
    summary="Count logs matching optional filters",
)
async def count_logs(
    source: str | None = Query(None, description="Filter by source"),
    level: str | None = Query(None, description="Filter by log level (INFO, WARN, ERROR)"),
    since: str | None = Query(None, description="ISO timestamp lower-bound for created_at"),
    user: str = Depends(get_current_user),
) -> dict[str, int]:
    """Return the total number of logs matching the given filters (no row data)."""
    conditions: list[str] = []
    args: list[Any] = []

    if source:
        args.append(source)
        conditions.append(f"source = ${len(args)}")
    if level:
        args.append(level.upper())
        conditions.append(f"level = ${len(args)}")
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", ""))
            args.append(since_dt)
            conditions.append(f"created_at >= ${len(args)}")
        except ValueError:
            pass  # ignore malformed since param

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"SELECT COUNT(*) FROM logs {where_clause}"

    async with get_conn() as conn:
        row = await conn.fetchrow(query, *args)
        return {"count": row[0]}


@router.get(
    "",
    summary="List recent logs",
)
async def list_logs(
    source: str | None = Query(None, description="Filter by source"),
    level: str | None = Query(None, description="Filter by log level (INFO, WARN, ERROR)"),
    since: str | None = Query(None, description="ISO timestamp lower-bound for created_at"),
    limit: int = Query(50, ge=1, le=1000, description="Max number of logs to return"),
    user: str = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List recent logs, optionally filtered by source, level, and/or time range."""
    # Build WHERE clause dynamically from provided filters
    conditions: list[str] = []
    args: list[Any] = []

    if source:
        args.append(source)
        conditions.append(f"source = ${len(args)}")
    if level:
        args.append(level.upper())
        conditions.append(f"level = ${len(args)}")
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", ""))
            args.append(since_dt)
            conditions.append(f"created_at >= ${len(args)}")
        except ValueError:
            pass  # ignore malformed since param

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    args.append(limit)
    query = f"SELECT * FROM logs {where_clause} ORDER BY created_at DESC LIMIT ${len(args)}"

    async with get_conn() as conn:
        rows = await conn.fetch(query, *args)

        # Convert JSON strings/bytes or asyncpg Records into standard dicts
        result = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("payload"), str):
                d["payload"] = json.loads(d["payload"])
            result.append(d)

        return result
