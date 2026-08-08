# local_dev_bootstrap/

These two files are **not** part of the automated migration chain in
`app/db/migrations/` — they use `psql`-only syntax (`\gexec`) that no real
database driver (asyncpg included) can execute, and they create a Postgres
role literally named `"user"` and grant it privileges. That only makes
sense for the local `docker-compose.yml` Postgres container, where you're
bootstrapping a brand-new instance by hand as its superuser.

Managed providers (Render, Railway, Neon, ...) already create the database
and a connection user for you — there's no role named `"user"` to grant
anything to, and the app couldn't have connected in the first place if its
own login role didn't already exist. Trying to run these against a managed
database will fail (found the hard way: `apply_pending_migrations` raised
`PostgresSyntaxError` on `\gexec` the first time it ran against a genuinely
fresh database instead of the already-bootstrapped local one).

If you need to bootstrap a **fresh local Postgres container** from
scratch, run these by hand via `psql` (which understands `\gexec`), e.g.:

```bash
docker compose exec -T postgres psql -U postgres -f - < app/db/local_dev_bootstrap/000_create_db.sql
docker compose exec -T postgres psql -U postgres -d incidentops -f - < app/db/local_dev_bootstrap/000b_grant_privileges.sql
```

Then run `python scripts/migrate.py` (or just start the app — it migrates
itself) to apply `app/db/migrations/`.
