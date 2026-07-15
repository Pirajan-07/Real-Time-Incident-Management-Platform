import asyncio
import httpx
import logging
import traceback
from app.config import settings
from app.db.database import get_conn

log = logging.getLogger(__name__)

async def generate_incident_summary(
    incident_id: int, 
    source: str, 
    trigger_reason: str, 
    metric_value: float, 
    threshold_value: float,
    related_logs: list[dict]
) -> None:
    """
    Fire-and-forget task to generate an AI summary for a new incident.
    Calls Groq API and updates the incidents table.
    """
    if not settings.llm_api_key or settings.llm_api_key == "changeme":
        log.warning("LLM_API_KEY not set. Skipping AI summary.")
        return

    # Build the prompt
    logs_text = "\n".join(
        f"[{log_item['level']}] {log_item['message']}" 
        for log_item in related_logs
    )
    
    prompt = f"""
An incident has been triggered.
Source: {source}
Reason: {trigger_reason}
Metric: {metric_value} (Threshold was {threshold_value})

Recent logs from this source:
{logs_text}

Based on this information:
1. Provide a likely root cause in 2-3 sentences.
2. Provide 2-3 suggested troubleshooting steps.

Keep it concise and formatting clean. Do not include markdown headers, just the text.
"""

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json=payload, timeout=15.0)
            resp.raise_for_status()
            
            data = resp.json()
            summary = data["choices"][0]["message"]["content"].strip()
            
            async with get_conn() as conn:
                await conn.execute(
                    "UPDATE incidents SET ai_summary = $1 WHERE id = $2",
                    summary, incident_id
                )
            log.info(f"Generated AI summary for incident #{incident_id}")
            
    except Exception as e:
        log.error(f"Failed to generate AI summary for incident #{incident_id}: {e}")
        log.debug(traceback.format_exc())
