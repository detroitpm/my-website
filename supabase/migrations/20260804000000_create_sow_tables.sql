-- Baseline migration. This captures the schema exactly as it already
-- exists in the live Supabase project (verified against information_schema
-- on 2026-08-04, no drift) - it was originally created by hand in
-- Supabase's SQL Editor before this migrations folder existed. Nothing
-- needs to be re-run for this file; it exists so the schema has a
-- reviewable, versioned starting point in the repo. See supabase/README.md
-- for how to add the next one.

-- Saved Scopes of Work, one row per property address (upserted, not
-- versioned - "last save wins" for the address, matching how the rate
-- table below also treats new entries).
CREATE TABLE sows (
  id SERIAL PRIMARY KEY,
  address_key TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  type_of_work TEXT,
  media_link TEXT,
  buffer_pct NUMERIC,
  sections JSONB NOT NULL DEFAULT '[]',
  questions JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sows_updated_at_idx ON sows (updated_at DESC);

-- Price lookup, one row per distinct line-item task (exact text match,
-- normalized via task_key = lowercased/trimmed task_text). Whenever a price
-- is entered for a matching line item elsewhere in the app, this gets
-- upserted - last price entered wins.
CREATE TABLE rate_items (
  id SERIAL PRIMARY KEY,
  task_key TEXT UNIQUE NOT NULL,
  task_text TEXT NOT NULL,
  labor NUMERIC,
  material NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
