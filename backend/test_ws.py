import asyncio
import httpx
import json
import subprocess
import websockets
from dotenv import dotenv_values

async def main():
    env = dotenv_values('.env')
    api_key = env['INGESTION_API_KEY']
    
    print("1. Starting API server and worker...")
    api_log = open('api_log.txt', 'w')
    api_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'uvicorn', 'app.main:app', '--port', '8000'], stdout=api_log, stderr=api_log)
    with open('worker_ws_log.txt', 'w') as f:
        worker_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'app.worker'], stdout=f, stderr=f)
    
    await asyncio.sleep(4)
    
    print("2. Resolving all existing incidents...")
    subprocess.run(['docker', 'compose', 'exec', 'postgres', 'psql', '-U', 'user', '-d', 'incidentops', '-c', "UPDATE incidents SET status = 'resolved';"])
    
    print("3. Logging in to get JWT...")
    async with httpx.AsyncClient() as client:
        resp = await client.post('http://127.0.0.1:8000/auth/login', json={'email': 'admin@incidentops.com', 'password': 'admin123'})
        token = resp.json()['access_token']
        
    print(f"4. Connecting to WebSocket dashboard with token...")
    ws_uri = f"ws://127.0.0.1:8000/ws/dashboard?token={token}"
    
    async def listen_ws():
        try:
            async with websockets.connect(ws_uri) as ws:
                print("   [WS] Connected successfully!")
                while True:
                    msg = await ws.recv()
                    data = json.loads(msg)
                    print(f"   [WS RECEIVE] {data['type'].upper()} -> {data['data']}")
        except websockets.exceptions.ConnectionClosed:
            print("   [WS] Connection closed.")
            
    ws_task = asyncio.create_task(listen_ws())
    
    print("5. Sending 6 ERROR logs for auth-service to trigger a new incident...")
    await asyncio.sleep(1)
    async with httpx.AsyncClient() as client:
        for i in range(6):
            await client.post('http://127.0.0.1:8000/logs', 
                headers={'X-API-Key': api_key}, 
                json={'source': 'auth-service', 'level': 'ERROR', 'message': f'WS test err {i}', 'response_time_ms': 100})
            await asyncio.sleep(0.05)
            
    print("6. Waiting for processing...")
    await asyncio.sleep(4)
    
    print("7. Intentional WS disconnect...")
    ws_task.cancel()
    await asyncio.sleep(1) # Let cancellation process
    
    print("8. Updating incident status via API to check backend doesn't crash after WS disconnect...")
    # Get incidents to find the ID
    async with httpx.AsyncClient() as client:
        resp = await client.get('http://127.0.0.1:8000/incidents', headers={'Authorization': f'Bearer {token}'})
        open_incs = [inc for inc in resp.json() if inc['status'] == 'open' and inc['source'] == 'auth-service']
        
        if open_incs:
            inc_id = open_incs[0]['id']
            print(f"   Patching incident #{inc_id} to acknowledged...")
            await client.patch(f'http://127.0.0.1:8000/incidents/{inc_id}', headers={'Authorization': f'Bearer {token}'}, json={'status': 'acknowledged'})
            print("   Patch successful!")
    
    print("\\nCleaning up processes...")
    api_proc.terminate()
    worker_proc.terminate()
    api_log.close()
    
    print("\\n--- API Log ---")
    with open('api_log.txt', 'r') as f:
        print(f.read())

if __name__ == "__main__":
    asyncio.run(main())
