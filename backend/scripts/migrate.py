"""
Applies SQL files from app/db/migrations/ in filename order, tracking what's
already run in a `schema_migrations` table so it's safe to re-run.

Usage (from backend/, venv active, containers up):
    python scripts/migrate.py
"""

import asyncio
from pathlib import Path

import asyncpg
from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).parent.parent
MIGRATIONS_DIR = BACKEND_DIR / "app" / "db" / "migrations"


async def main():
    env = dotenv_values(BACKEND_DIR / ".env")
    conn = await asyncpg.connect(env["DATABASE_URL"])
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename   TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT NOW()
            )
            """
        )
        applied = {r["filename"] for r in await conn.fetch("SELECT filename FROM schema_migrations")}
        all_files = sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql"))

        if not applied:
            # First run against a DB that was already bootstrapped by hand -
            # record what's already there instead of re-running CREATE TABLE
            # against tables that already exist.
            already_initialised = await conn.fetchval("SELECT to_regclass('public.logs')")
            if already_initialised:
                print(f"Existing database detected - marking {len(all_files)} migration(s) as already applied:")
                for name in all_files:
                    print(f"  {name}")
                    await conn.execute(
                        "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", name
                    )
                print("Bootstrapped. Re-run this script whenever a new migration file is added.")
                return

        pending = [f for f in all_files if f not in applied]
        if not pending:
            print("No pending migrations.")
            return

        for name in pending:
            print(f"Applying {name}...")
            sql = (MIGRATIONS_DIR / name).read_text()
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("INSERT INTO schema_migrations (filename) VALUES ($1)", name)
        print(f"Applied {len(pending)} migration(s).")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
