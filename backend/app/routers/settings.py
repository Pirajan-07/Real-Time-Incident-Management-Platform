from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.db.database import get_conn
from app.auth import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ThresholdsOut(BaseModel):
    error_rate_threshold: float
    error_rate_min_total: int
    latency_multiplier: float
    burst_error_threshold: int
    updated_at: datetime


class ThresholdsUpdate(BaseModel):
    error_rate_threshold: float = Field(..., gt=0, le=100, description="Error rate %% that triggers error_rate_spike")
    error_rate_min_total: int = Field(..., ge=1, le=10_000, description="Min log count in window before the rule can fire")
    latency_multiplier: float = Field(..., gt=1, le=50, description="avg_rt must exceed N x the 24h baseline")
    burst_error_threshold: int = Field(..., ge=1, le=1000, description="N errors within the burst window triggers failure_burst")

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/thresholds", response_model=ThresholdsOut, summary="Get current alert thresholds")
async def get_thresholds(user: str = Depends(get_current_user)):
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM alert_thresholds WHERE id = 1")
        if row is None:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "alert_thresholds row is missing")
        return dict(row)


@router.put("/thresholds", response_model=ThresholdsOut, summary="Update alert thresholds")
async def update_thresholds(update: ThresholdsUpdate, user: str = Depends(get_current_user)):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE alert_thresholds
            SET    error_rate_threshold  = $1,
                   error_rate_min_total  = $2,
                   latency_multiplier    = $3,
                   burst_error_threshold = $4,
                   updated_at            = NOW()
            WHERE  id = 1
            RETURNING *
            """,
            update.error_rate_threshold,
            update.error_rate_min_total,
            update.latency_multiplier,
            update.burst_error_threshold,
        )
        if row is None:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "alert_thresholds row is missing")
        return dict(row)
