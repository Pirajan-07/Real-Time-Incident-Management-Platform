import httpx
import logging
import traceback
from app.config import settings

log = logging.getLogger(__name__)

async def send_slack_alert(
    incident_id: int, 
    title: str,
    source: str, 
    trigger_reason: str, 
    metric_value: float, 
    threshold_value: float
) -> None:
    """
    Fire-and-forget task to send a Slack notification for a new incident.
    """
    webhook_url = settings.slack_webhook_url
    if not webhook_url or webhook_url == "changeme" or webhook_url == "":
        log.warning("SLACK_WEBHOOK_URL not set. Skipping Slack alert.")
        return

    text = (
        f"🚨 *New Incident Detected: {title}* 🚨\n"
        f"• *Incident ID:* #{incident_id}\n"
        f"• *Source:* {source}\n"
        f"• *Reason:* {trigger_reason}\n"
        f"• *Metric:* {metric_value} (Threshold: {threshold_value})"
    )

    payload = {
        "text": text
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json=payload, timeout=5.0)
            resp.raise_for_status()
            log.info(f"Sent Slack alert for incident #{incident_id}")
    except Exception as e:
        log.error(f"Failed to send Slack alert for incident #{incident_id}: {e}")
        log.debug(traceback.format_exc())
