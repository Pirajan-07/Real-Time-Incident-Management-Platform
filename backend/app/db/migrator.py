"""
Shared migration-application logic — used both by scripts/migrate.py (manual
CLI run) and by app.main's startup (automatic). The automatic path matters
because Render's free web-service tier has no Shell/one-off-job access to
run scripts/migrate.py by hand, and the free Postgres plan gets recreated
from scratch periodically — the app needs to be able to heal its own schema
on every boot with nobody available to run a command.
"""

import logging
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
log = logging.getLogger("migrator")


async def apply_pending_migrations(conn) -> int:
    """
    Applies any .sql files in migrations/ not yet recorded in
    schema_migrations, in filename order, inside a transaction each.
    Returns the number of migrations actually applied.

    Bootstraps schema_migrations against a pre-existing database (tables
    already created by hand, before this tracking table existed) by marking
    everything as already-applied instead of re-running CREATE TABLE
    statements against tables that already exist.
    """
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
        already_initialised = await conn.fetchval("SELECT to_regclass('public.logs')")
        if already_initialised:
            log.info("Existing database detected — marking %d migration(s) as already applied.", len(all_files))
            for name in all_files:
                await conn.execute(
                    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", name
                )
            return 0

    pending = [f for f in all_files if f not in applied]
    for name in pending:
        log.info("Applying migration %s...", name)
        sql = (MIGRATIONS_DIR / name).read_text()
        async with conn.transaction():
            await conn.execute(sql)
            await conn.execute("INSERT INTO schema_migrations (filename) VALUES ($1)", name)

    if pending:
        log.info("Applied %d migration(s).", len(pending))
    return len(pending)
