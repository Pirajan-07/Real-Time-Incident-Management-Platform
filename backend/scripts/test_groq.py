import asyncio
import httpx
from dotenv import dotenv_values
from pathlib import Path
import sys
import json

async def main():
    # Load env
    env_path = Path(__file__).parent.parent / '.env'
    env = dotenv_values(env_path)
    api_key = env.get("LLM_API_KEY")
    
    if not api_key or api_key == "changeme":
        print("ERROR: Invalid or missing LLM_API_KEY in .env")
        sys.exit(1)
        
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "user", "content": "Say hello in one sentence."}
        ]
    }
    
    print(f"Calling Groq API with model: {payload['model']}...")
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, headers=headers, json=payload, timeout=10.0)
            print(f"Status Code: {resp.status_code}")
            print("\nRaw JSON Response:")
            print(json.dumps(resp.json(), indent=2))
        except Exception as e:
            print(f"Error during request: {e}")

if __name__ == "__main__":
    asyncio.run(main())
