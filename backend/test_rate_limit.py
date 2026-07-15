import asyncio, subprocess, time, httpx, os
from dotenv import dotenv_values

async def main():
    env = dotenv_values('.env')
    api_key = env['INGESTION_API_KEY']
    
    print("1. Starting API server and worker...")
    api_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'uvicorn', 'app.main:app', '--port', '8000'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open('worker_ratelimit_log.txt', 'w') as f:
        worker_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'app.worker'], stdout=f, stderr=f)
    
    await asyncio.sleep(4)
    
    print("2. Resolving all existing incidents via DB...")
    subprocess.run(['docker', 'compose', 'exec', 'postgres', 'psql', '-U', 'user', '-d', 'incidentops', '-c', "UPDATE incidents SET status = 'resolved';"])
    
    sources = [
        'api-gateway-01',
        'auth-service',
        'database-cluster-primary',
        'ingress-nginx',
        'notification-worker',
        'payment-gateway',
        'user-profile'
    ]
    
    print("3. Sending 6 ERROR logs for 7 different sources to trigger 7 distinct NEW incidents...")
    async with httpx.AsyncClient() as client:
        for source in sources:
            print(f"   Bursting {source}...")
            for _ in range(6):
                await client.post('http://127.0.0.1:8000/logs', 
                    headers={'X-API-Key': api_key}, 
                    json={'source': source, 'level': 'ERROR', 'message': 'Forced error for rate limit test', 'response_time_ms': 100})
                await asyncio.sleep(0.05)
            await asyncio.sleep(0.5) # small gap between bursts
            
    print("4. Waiting 15 seconds for LLM tasks to process...")
    await asyncio.sleep(15)
    
    print("5. Fetching incidents via API...")
    async with httpx.AsyncClient() as client:
        resp = await client.post('http://127.0.0.1:8000/auth/login', json={'email': 'admin@incidentops.com', 'password': 'admin123'})
        token = resp.json()['access_token']
        
        resp = await client.get('http://127.0.0.1:8000/incidents', headers={'Authorization': f'Bearer {token}'})
        incidents = resp.json()
        
        open_incs = [i for i in incidents if i['status'] == 'open']
        print(f"\\nFound {len(open_incs)} open incidents.")
        
        # Sort ascending to show the order they were triggered
        open_incs = sorted(open_incs, key=lambda i: i['id'])
        for inc in open_incs:
            summary_status = "Generated" if inc.get('ai_summary') else "NULL"
            print(f"Incident #{inc['id']} | {inc['source']} | AI Summary: {summary_status}")

    print("\\nCleaning up processes...")
    api_proc.terminate()
    worker_proc.terminate()
    
    print("\\n--- Worker Log Warnings ---")
    with open('worker_ratelimit_log.txt', 'r') as f:
        for line in f:
            if "LLM rate limit reached" in line:
                print(line.strip())

if __name__ == "__main__":
    asyncio.run(main())
