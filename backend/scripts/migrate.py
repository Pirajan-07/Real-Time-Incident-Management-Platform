"""
CLI wrapper for app.db.migrator — applies pending SQL migrations against
whatever DATABASE_URL points at. The app also runs this automatically on
every startup (see app.main's lifespan); this script is for manually
targeting a different database, e.g. a fresh local DB or checking a remote
one from your own machine.

Usage (from backend/, venv active):
    python scripts/migrate.py

Or against a specific database without touching .env:
    DATABASE_URL=postgresql://... python scripts/migrate.py       (bash)
    $env:DATABASE_URL="postgresql://..."; python scripts/migrate.py  (PowerShell)
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.db.migrator import apply_pending_migrations  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")


async def main():
    env = dotenv_values(BACKEND_DIR / ".env")
    database_url = os.environ.get("DATABASE_URL") or env.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not found in the environment or backend/.env")
        return

    conn = await asyncpg.connect(database_url)
    try:
        count = await apply_pending_migrations(conn)
        print("No pending migrations." if count == 0 else f"Applied {count} migration(s).")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
