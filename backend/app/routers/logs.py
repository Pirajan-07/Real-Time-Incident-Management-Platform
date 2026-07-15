"""
Log ingestion router.

POST /logs
----------
Requires X-API-Key header matching INGESTION_API_KEY.
Inserts a log row into Postgres and pushes it onto the Redis Stream "logs".
Returns 201 with the new log's id and created_at timestamp.
"""

import json
from datetime import datetime
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
    "",
    summary="List recent logs",
)
async def list_logs(
    source: str | None = Query(None, description="Filter by source"),
    limit: int = Query(50, ge=1, le=1000, description="Max number of logs to return"),
    user: str = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List recent logs, optionally filtered by source."""
    async with get_conn() as conn:
        if source:
            rows = await conn.fetch(
                "SELECT * FROM logs WHERE source = $1 ORDER BY created_at DESC LIMIT $2",
                source, limit
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM logs ORDER BY created_at DESC LIMIT $1",
                limit
            )
            
        # Convert JSON strings/bytes or asyncpg Records into standard dicts
        result = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("payload"), str):
                d["payload"] = json.loads(d["payload"])
            result.append(d)
            
        return result
