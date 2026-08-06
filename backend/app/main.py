from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import close_db_pool, init_db_pool, get_conn
from app.redis_client import close_redis, init_redis, get_redis
from app.routers import logs, incidents, auth, ws, settings as settings_router, metrics as metrics_router
import asyncio
from app.ws_manager import redis_subscriber_task
from app.metrics import metrics_broadcaster_task


# ---------------------------------------------------------------------------
# Lifespan: start-up & shut-down hooks
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Start-up ────────────────────────────────────────────────────────────
    await init_db_pool()
    await init_redis()
    
    # Start Redis WebSocket subscriber task
    subscriber_task = asyncio.create_task(redis_subscriber_task())
    # Start periodic dashboard metrics broadcaster
    metrics_task = asyncio.create_task(metrics_broadcaster_task())
    yield
    # ── Shut-down ───────────────────────────────────────────────────────────
    subscriber_task.cancel()
    metrics_task.cancel()
    await close_db_pool()
    await close_redis()


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="IncidentOps API",
    description="Real-Time Incident Management Platform backend",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS – origins come from CORS_ORIGINS (comma-separated); defaults to the
# local Vite dev server. Set it to the deployed frontend's URL in production.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

app.include_router(logs.router)
app.include_router(incidents.router)
app.include_router(auth.router)
app.include_router(ws.router)
app.include_router(settings_router.router)
app.include_router(metrics_router.router)


@app.get("/health", tags=["health"])
async def health_check():
    """Health check including DB and Redis connectivity and stream lag."""
    health_status = {"status": "ok", "db": "unknown", "redis": "unknown", "stream_lag": -1}
    
    # Check Postgres
    try:
        async with get_conn() as conn:
            await conn.execute("SELECT 1")
            health_status["db"] = "ok"
    except Exception as e:
        health_status["db"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
        
    # Check Redis & Stream Lag
    try:
        redis = get_redis()
        await redis.ping()
        health_status["redis"] = "ok"
        
        # Calculate lag: XLEN of "logs" - consumer group pending/delivered?
        # Actually, stream lag = total entries in stream - total entries consumed by group.
        # But for simplicity, we can get stream info.
        # Let's get the consumer_state from DB for the last processed ID
        last_id_str = "0-0"
        if health_status["db"] == "ok":
            async with get_conn() as conn:
                row = await conn.fetchrow("SELECT last_stream_id FROM consumer_state WHERE consumer_name = 'worker-1'")
                if row and row["last_stream_id"]:
                    last_id_str = row["last_stream_id"]
                    
        # Get stream info to find the last generated ID
        try:
            info = await redis.xinfo_stream("logs")
            last_generated_id = info.get("last-generated-id", "0-0")
            
            # Simple approximation of lag (just comparing IDs as strings is hard, 
            # XLEN is total, but we can't easily subtract IDs. Let's just output both for now)
            health_status["last_processed_id"] = last_id_str
            health_status["last_generated_id"] = last_generated_id
            
            # True lag could be done by counting entries between last_processed and +
            # Or by using XPENDING/XINFO GROUPS if we used consumer groups lag field (Redis 7)
            group_info = await redis.xinfo_groups("logs")
            for g in group_info:
                if g["name"] == "incident-workers":
                    health_status["stream_lag"] = g.get("lag", -1)
                    break
        except Exception:
            pass # Stream might not exist yet
            
    except Exception as e:
        health_status["redis"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
        
    return health_status
# Reload trigger
