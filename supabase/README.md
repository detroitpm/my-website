# Database schema (Supabase)

This folder is the source of truth for the schema of the Supabase Postgres
database the SOW builder uses (`db.js`, and the `sow-*`/`rate-*` Netlify
functions). It exists so schema changes are reviewable and versioned in git
instead of only living in whatever was last run by hand in Supabase's SQL
Editor.

**There is no automatic migration runner.** Unlike the old Netlify DB setup,
Supabase doesn't apply these on deploy. Applying a migration is a manual,
two-step process every time:

1. Add a new file to `supabase/migrations/`, named
   `YYYYMMDDHHMMSS_short_description.sql` (UTC timestamp, so files sort in
   the order they should run - copy the current time from
   `date -u +%Y%m%d%H%M%S`). Write the SQL as plain `CREATE TABLE`/
   `ALTER TABLE`/etc. statements.
2. Once it's committed, open the Supabase project's **SQL Editor** and run
   that exact file's contents against the live database.

**Rules:**
- Never edit an already-applied migration file. If something needs to
  change, write a new migration (e.g. `ALTER TABLE ... ADD COLUMN ...`)
  instead - the same discipline as not rewriting git history.
- Keep each migration focused on one change (one new table, one new
  column) rather than batching unrelated schema changes into one file -
  makes it obvious what shipped when if something needs debugging later.
- After running a migration, this README doesn't need updating - the
  migration files themselves are the record.

**Connection:** the live connection string lives only in Netlify's
environment variables as `SUPABASE_DB_URL` (Site settings → Environment
variables on the `section8pm` project) - never commit it to this repo.

**Standing permission:** Claude has standing permission to open the
Supabase SQL Editor (via browser) and run migrations from this folder
directly against the live database, and to run read/write queries against
this project, without asking first each time. This does not extend to
destructive operations outside a normal migration (dropping tables,
deleting rows, truncating) - those still get confirmed with a human first,
same as anywhere else.
