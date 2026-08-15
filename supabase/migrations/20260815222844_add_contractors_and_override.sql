-- Adds per-SOW contractor assignment support: a managed list of contractor
-- names scoped to the individual SOW (not shared globally, unlike
-- rate_items), plus a manual override for the Contractor Total (labor
-- only) so it can differ from the line-item sum without editing every
-- line. Both ride along on the same JSONB round-trip as sections/questions.
ALTER TABLE sows ADD COLUMN contractors JSONB NOT NULL DEFAULT '[]';
ALTER TABLE sows ADD COLUMN contractor_total_override NUMERIC;
