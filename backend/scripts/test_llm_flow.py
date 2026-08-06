import asyncio, httpx, time, os, subprocess

async def main():
    # Load env
    from dotenv import dotenv_values
    env = dotenv_values('.env')
    api_key = env['INGESTION_API_KEY']
    
    print('1. Starting uvicorn and worker...')
    api_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'uvicorn', 'app.main:app', '--port', '8000'])
    worker_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'app.worker'])
    
    await asyncio.sleep(4)
    
    print('2. Resolving all existing incidents via DB...')
    subprocess.run(['docker', 'compose', 'exec', 'postgres', 'psql', '-U', 'user', '-d', 'incidentops', '-c', "UPDATE incidents SET status = 'resolved';"])
    
    print('3. Sending 6 ERROR logs for notification-worker directly...')
    async with httpx.AsyncClient() as client:
        for _ in range(6):
            await client.post('http://127.0.0.1:8000/logs', 
                headers={'X-API-Key': api_key}, 
                json={'source': 'notification-worker', 'level': 'ERROR', 'message': 'FCM token invalid', 'response_time_ms': 100})
            await asyncio.sleep(0.1)
    await asyncio.sleep(10)
    
    print('5. Fetching incidents via API...')
    async with httpx.AsyncClient() as client:
        # Login
        resp = await client.post('http://127.0.0.1:8000/auth/login', json={'email': 'admin@incidentops.com', 'password': 'admin123'})
        token = resp.json()['access_token']
        
        # Get incidents
        resp = await client.get('http://127.0.0.1:8000/incidents', headers={'Authorization': f'Bearer {token}'})
        incidents = resp.json()
        
        # Find the open one
        open_incs = [i for i in incidents if i['status'] == 'open']
        print(f'\nFound {len(open_incs)} open incidents.')
        for inc in open_incs:
            print(f"\n--- Incident #{inc['id']} ---:")
            print(f"Title: {inc['title']}")
            print(f"AI Summary:\n{inc.get('ai_summary', 'NULL')}")
            
    print('Cleaning up processes...')
    api_proc.terminate()
    worker_proc.terminate()

asyncio.run(main())
