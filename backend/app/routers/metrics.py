from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.db.database import get_conn
from app.metrics import compute_timeseries

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/timeseries", summary="Bucketed error-rate / latency history for the trailing hour")
async def get_timeseries(user: str = Depends(get_current_user)) -> dict:
    """Same series broadcast live over the websocket as 'metrics_update' —
    this is just the initial snapshot for first page load."""
    async with get_conn() as conn:
        return await compute_timeseries(conn)
