-- Saved pre-purchase underwriting reports from pre-purchase-report.html.
-- One row per property address (upserted, "last save wins" - same discipline
-- as the sows table). Standalone: NOT linked to walkthrough_requests / the
-- Stripe booking flow. The whole report body (cover fields, disclosures,
-- context photos, flagged line items, media links, PM notes) rides along as
-- JSONB, matching how the front-end's `report` object is shaped so a load
-- can be dropped straight back into the builder.
CREATE TABLE underwriting_reports (
  id SERIAL PRIMARY KEY,
  address_key TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  prepared_for TEXT,
  inspection_date TEXT,
  company_name TEXT,
  companycam_project_id TEXT,
  media_link TEXT,
  front_exterior_photo TEXT,
  buffer_pct NUMERIC,
  legal_disclosures TEXT,
  context_photos JSONB NOT NULL DEFAULT '[]',
  sections JSONB NOT NULL DEFAULT '[]',
  media_list_links JSONB NOT NULL DEFAULT '[]',
  pm_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX underwriting_reports_updated_at_idx ON underwriting_reports (updated_at DESC);
