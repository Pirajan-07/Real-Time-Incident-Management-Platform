import asyncio
import json
import logging
from datetime import datetime
from fastapi import WebSocket

import redis.asyncio as aioredis
from app.config import settings

log = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        log.info(f"WebSocket connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        log.info(f"WebSocket disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: str):
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                log.warning(f"Error sending to WS client: {e}")
                disconnected.add(connection)
        
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

def _json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

async def publish_message(redis_client: aioredis.Redis, msg_type: str, data: dict):
    """Helper to publish messages from anywhere (worker or API)"""
    payload = {
        "type": msg_type,
        "data": data
    }
    json_str = json.dumps(payload, default=_json_serial)
    await redis_client.publish("ws_broadcast", json_str)

async def redis_subscriber_task():
    """Background task to listen to Redis and broadcast to WebSockets"""
    log.info("Starting Redis Pub/Sub subscriber task for WebSockets...")
    while True:
        try:
            redis = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
            async with redis.pubsub() as pubsub:
                await pubsub.subscribe("ws_broadcast")
                log.info("Subscribed to Redis channel: ws_broadcast")
                
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        # Broadcast to all connected clients
                        await manager.broadcast(message["data"])
                        
        except asyncio.CancelledError:
            log.info("Redis subscriber task cancelled.")
            break
        except Exception as e:
            log.error(f"Redis subscriber connection dropped: {e}. Reconnecting in 2s...")
            await asyncio.sleep(2)
