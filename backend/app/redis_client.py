"""
Async Redis client (redis-py asyncio).

Usage
-----
From any route:

    from app.redis_client import get_redis

    redis = get_redis()
    await redis.xadd("logs", {...})
"""

import redis.asyncio as aioredis

from app.config import settings

# Module-level client; set during startup.
_redis: aioredis.Redis | None = None


async def init_redis() -> None:
    """Create the Redis client and verify connectivity. Called at startup."""
    global _redis
    _redis = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
    )
    # Ping to fail fast if Redis is unreachable.
    await _redis.ping()


async def close_redis() -> None:
    """Close the Redis connection. Called at shutdown."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


def get_redis() -> aioredis.Redis:
    """Return the shared Redis client (must call init_redis first)."""
    if _redis is None:
        raise RuntimeError("Redis client is not initialised.")
    return _redis
