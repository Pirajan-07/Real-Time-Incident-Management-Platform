import asyncio
import json
import urllib.request
import httpx
import websockets
from datetime import datetime, timedelta, timezone

from dotenv import dotenv_values
from jose import jwt

# Secrets are loaded from .env, never hardcoded (this file is committed to git).
_env = dotenv_values('.env')
API_KEY = _env['INGESTION_API_KEY']

# Mint a short-lived admin token locally — same claims POST /auth/login would
# issue — instead of embedding a static one in source.
TOKEN = jwt.encode(
    {"sub": _env['ADMIN_EMAIL'], "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
    _env['JWT_SECRET'],
    algorithm=_env.get('JWT_ALGORITHM', 'HS256'),
)
WS_URL = f"ws://localhost:8000/ws/dashboard?token={TOKEN}"

async def run_verification():
    print("--- 1. Testing GET /incidents ---")
    req = urllib.request.Request("http://localhost:8000/incidents", headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        res = urllib.request.urlopen(req)
        incidents = json.loads(res.read())
        print(f"[OK] Fetched {len(incidents)} existing incidents from Postgres.")
    except Exception as e:
        print(f"[ERROR] Failed to fetch incidents: {e}")

    print("\n--- 2. Connecting to WebSocket ---")
    async with websockets.connect(WS_URL) as ws:
        print("[OK] Connected to WS!")
        
        print("\n--- 3. Triggering a Burst (Incident) ---")
        async with httpx.AsyncClient() as client:
            for _ in range(6):
                await client.post("http://localhost:8000/logs", headers={"X-API-Key": API_KEY}, json={
                    "source": "payment-gateway",
                    "level": "ERROR",
                    "message": "Direct manual trigger error",
                    "response_time_ms": 1500,
                    "status_code": 500,
                    "payload": {}
                })
                await asyncio.sleep(0.1)
        print("[OK] Burst triggered manually.")

        print("\n--- 4. Waiting for WS frames ---")
        incident_id = None
        for _ in range(50):  # Wait for frames
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=3.0)
                data = json.loads(msg)
                
                print(f"[WS FRAME] Type: {data.get('type')}")
                
                if data.get("type") in ["incident_created", "incident_updated"]:
                    incident_id = data["data"]["id"]
                    print(f"[OK] Received live incident event for ID: {incident_id}")
                    break
            except asyncio.TimeoutError:
                continue

        if incident_id:
            print(f"\n--- 5. Acknowledging Incident {incident_id} ---")
            patch_req = urllib.request.Request(
                f"http://localhost:8000/incidents/{incident_id}",
                data=json.dumps({"status": "acknowledged"}).encode(),
                headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
                method="PATCH"
            )
            patch_res = urllib.request.urlopen(patch_req)
            print(f"[OK] PATCH /incidents/{incident_id} returned {patch_res.status}")

            print("\n--- 6. Waiting for incident_updated WS frame ---")
            for _ in range(10):
                msg = await ws.recv()
                data = json.loads(msg)
                if data.get("type") == "incident_updated" and data["data"]["status"] == "acknowledged":
                    print(f"[OK] Received live incident_updated event! Status is {data['data']['status']}")
                    break
        else:
            print("[ERROR] Did not receive incident_created frame.")

asyncio.run(run_verification())
