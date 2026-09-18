-- Per-SOW toggle: when on, the Owner Copy prints each line's Labor/Material
-- $ instead of just the grand total. Owner-facing only - never changes what
-- the Contractor Copy shows. Off by default, matching the existing "prices
-- are private" default behavior.
ALTER TABLE sows ADD COLUMN show_itemized_pricing BOOLEAN NOT NULL DEFAULT false;
