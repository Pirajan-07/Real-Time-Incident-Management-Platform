import asyncio, subprocess, time, httpx, os
from dotenv import dotenv_values

async def main():
    env = dotenv_values('.env')
    api_key = env['INGESTION_API_KEY']

    print("1. Starting API server and worker... (redirecting worker output to worker_log.txt)")
    api_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'uvicorn', 'app.main:app', '--port', '8000'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open('worker_log.txt', 'w') as f:
        worker_proc = subprocess.Popen(['.venv\\Scripts\\python.exe', '-m', 'app.worker'], stdout=f, stderr=f)
    
    await asyncio.sleep(4)
    
    print("2. Running producer in normal mode for 25 seconds...")
    subprocess.run(['.venv\\Scripts\\python.exe', 'scripts/producer.py', '--duration', '25'])
    
    print("3. Sending 6 errors to notification-worker to test dedup update...")
    async with httpx.AsyncClient() as client:
        for _ in range(6):
            await client.post('http://127.0.0.1:8000/logs', 
                headers={'X-API-Key': api_key}, 
                json={'source': 'notification-worker', 'level': 'ERROR', 'message': 'FCM token invalid', 'response_time_ms': 100})
            await asyncio.sleep(0.1)
            
    print("4. Waiting 5 seconds for worker to process...")
    await asyncio.sleep(5)
    
    print("Cleaning up processes...")
    api_proc.terminate()
    worker_proc.terminate()
    
    print("\n--- Worker Log Output (Last 40 lines) ---")
    with open('worker_log.txt', 'r') as f:
        lines = f.readlines()
        print("".join(lines[-40:]))

if __name__ == "__main__":
    asyncio.run(main())
