from jose import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from app.config import settings
from app.ws_manager import manager

router = APIRouter(prefix="/ws", tags=["websocket"])

@router.websocket("/dashboard")
async def websocket_dashboard(
    websocket: WebSocket, 
    token: str = Query(None)
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        email = payload.get("sub")
        if not email:
            raise ValueError("No subject in token")
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket)
    try:
        while True:
            # We don't expect client to send anything, but we need to keep connection open
            # and detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
