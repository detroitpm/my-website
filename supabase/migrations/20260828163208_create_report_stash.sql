-- A drop box for reports built by the Claude skill so they don't have to be
-- downloaded and re-uploaded as a JSON file. The build-underwriting-report
-- skill POSTs its finished report here; pre-purchase-report.html lists the
-- recent ones in a "Load from Claude" picker and loads the chosen one
-- straight into the builder.
--
-- Not the same as underwriting_reports (that's the saved/edited work, keyed
-- by address). This is a rolling inbox - one row per skill run, newest
-- first, old rows pruned on insert. `kind` leaves room for the SOW builder
-- to use the same box later.
CREATE TABLE report_stash (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'ppr',
  address TEXT NOT NULL,
  source TEXT,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX report_stash_kind_created_at_idx ON report_stash (kind, created_at DESC);
