import asyncio, subprocess, httpx
from dotenv import dotenv_values

async def main():
    env = dotenv_values('.env')
    api_key = env['INGESTION_API_KEY']
    
    print("1. Starting API server and worker...")
    api_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'uvicorn', 'app.main:app', '--port', '8000'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open('worker_slack_log.txt', 'w') as f:
        worker_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'app.worker'], stdout=f, stderr=f)
    
    await asyncio.sleep(4)
    
    print("2. Resolving all existing incidents via DB...")
    subprocess.run(['docker', 'compose', 'exec', 'postgres', 'psql', '-U', 'user', '-d', 'incidentops', '-c', "UPDATE incidents SET status = 'resolved';"])
    
    print("3. Sending 6 ERROR logs for notification-worker to trigger an incident...")
    async with httpx.AsyncClient() as client:
        for _ in range(6):
            await client.post('http://127.0.0.1:8000/logs', 
                headers={'X-API-Key': api_key}, 
                json={'source': 'notification-worker', 'level': 'ERROR', 'message': 'FCM token invalid', 'response_time_ms': 100})
            await asyncio.sleep(0.05)
            
    print("4. Waiting 5 seconds for Slack task to process...")
    await asyncio.sleep(5)

    print("\\nCleaning up processes...")
    api_proc.terminate()
    worker_proc.terminate()
    
    print("\\n--- Worker Log Output (Checking for Slack) ---")
    with open('worker_slack_log.txt', 'r') as f:
        for line in f:
            if "Slack alert" in line or "[INCIDENT CREATED]" in line:
                print(line.strip())

if __name__ == "__main__":
    asyncio.run(main())
