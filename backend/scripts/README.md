# backend/scripts

Manual dev tools and integration checks — **not** an automated test suite.
Several of these spin up their own `uvicorn`/`worker` subprocesses and shell
out to `docker compose exec postgres ...`, so they only work run locally,
from the `backend/` directory, with the venv active and the containers
already up (`docker compose up -d` from the repo root).

| Script | Purpose |
| :--- | :--- |
| `producer.py` | Continuously POSTs synthetic logs to `/logs` (normal or `--burst <source>` mode). This is what feeds the dashboard with traffic in local dev. |
| `test_groq.py` | One-off smoke test that the configured `LLM_API_KEY` can reach Groq. |
| `test_logs.py` | Exercises `POST /logs`: valid insert, Postgres row, Redis stream entry, missing/wrong API key. |
| `test_rate_limit.py`, `test_llm_flow.py`, `test_slack.py`, `test_ws.py`, `test_regression.py` | End-to-end scenarios that boot the API + worker, drive traffic through `producer.py`/direct POSTs, and print pass/fail based on the resulting incidents, Slack calls, or WS frames. |
| `verify_integration.py` | Walks the full loop once (list incidents → open a WS connection → trigger a burst → wait for `incident_created`/`incident_updated` → acknowledge it) as a manual smoke test. |
| `verify_hash.py` | Checks a bcrypt hash against a candidate password — handy when rotating `ADMIN_PASSWORD_HASH`. |

None of these read secrets from anywhere but `.env` — if you're adding a new
one, do the same (`dotenv_values('.env')`); never hardcode a key or token,
even a short-lived one.
