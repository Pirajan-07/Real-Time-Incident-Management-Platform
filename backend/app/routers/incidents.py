from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field

from app.db.database import get_conn
from app.auth import get_current_user
from app.redis_client import get_redis
from app.ws_manager import publish_message

router = APIRouter(prefix="/incidents", tags=["incidents"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class IncidentOut(BaseModel):
    id: int
    title: str
    source: str
    trigger_reason: str
    metric_value: float
    threshold_value: float
    status: str
    ai_summary: str | None = None
    last_log_id: int
    created_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None


class IncidentUpdate(BaseModel):
    status: str = Field(..., pattern="^(acknowledged|resolved)$")

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[IncidentOut], summary="List incidents")
async def list_incidents(
    status: str | None = Query(None, description="Filter by status (open, acknowledged, resolved)"),
    user: str = Depends(get_current_user),
):
    """List incidents, optionally filtered by status, ordered by created_at descending."""
    async with get_conn() as conn:
        if status:
            rows = await conn.fetch("SELECT * FROM incidents WHERE status = $1 ORDER BY created_at DESC", status)
        else:
            rows = await conn.fetch("SELECT * FROM incidents ORDER BY created_at DESC")
        
        return [dict(row) for row in rows]


@router.get("/{id}", response_model=IncidentOut, summary="Get incident details")
async def get_incident(id: int, user: str = Depends(get_current_user)):
    """Get a single incident by ID."""
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM incidents WHERE id = $1", id)
        if not row:
            raise HTTPException(status_code=404, detail="Incident not found")
        return dict(row)


@router.patch("/{id}", response_model=IncidentOut, summary="Update incident status")
async def update_incident(id: int, update: IncidentUpdate, user: str = Depends(get_current_user)):
    """Update the status of an incident (to acknowledged or resolved)."""
    async with get_conn() as conn:
        # Check if incident exists
        row = await conn.fetchrow("SELECT * FROM incidents WHERE id = $1", id)
        if not row:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        now = datetime.utcnow()
        if update.status == "acknowledged":
            res = await conn.fetchrow(
                "UPDATE incidents SET status = $1, acknowledged_at = $2 WHERE id = $3 RETURNING *",
                update.status, now, id
            )
        elif update.status == "resolved":
            res = await conn.fetchrow(
                "UPDATE incidents SET status = $1, resolved_at = $2 WHERE id = $3 RETURNING *",
                update.status, now, id
            )
        else:
            # Pydantic regex validation handles this, but just in case
            raise HTTPException(status_code=400, detail="Invalid status")
            
        redis_client = get_redis()
        if redis_client:
            await publish_message(redis_client, "incident_updated", {
                "id": res["id"],
                "status": res["status"],
                "acknowledged_at": res["acknowledged_at"],
                "resolved_at": res["resolved_at"]
            })
            
        return dict(res)
