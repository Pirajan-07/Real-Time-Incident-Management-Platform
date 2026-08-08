"""
Async Postgres connection pool (asyncpg).

Usage
-----
From any route or dependency:

    from app.db.database import get_conn

    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT ...")
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

from app.config import settings

# Module-level pool; set during startup, cleared on shutdown.
_pool: asyncpg.Pool | None = None


async def init_db_pool() -> None:
    """Create the asyncpg connection pool. Called once at startup.

    Small pool size + explicit timeouts on purpose: free-tier managed
    Postgres (e.g. Render's) caps total connections quite low, and during a
    deploy the old and new app instances briefly run at the same time. A
    pool that's too greedy, with no timeout, can silently deadlock — the
    new instance can't get enough connections to finish starting, so the
    old one never gets killed to free its own. Fail fast and loud instead.
    """
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=1,
        max_size=4,
        timeout=10,           # seconds to wait for a connection from the pool
        command_timeout=30,   # seconds to wait for any single query
    )


async def close_db_pool() -> None:
    """Drain and close the connection pool. Called once at shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    """Async context manager that yields a connection from the pool."""
    if _pool is None:
        raise RuntimeError("Database pool is not initialised.")
    async with _pool.acquire() as conn:
        yield conn
