-- Contractors move from a per-SOW list to a global, reusable table (like
-- rate_items) - add one once, it shows up in every SOW's dropdowns from
-- then on. The old sows.contractors JSONB column is left in place but no
-- longer written/read by the app; dropping it isn't necessary.
CREATE TABLE contractors (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Key location: one free-text field per SOW, shown on the Contractor Copy
-- only (never the Owner Copy) and only when show_key_location is true -
-- an on/off toggle independent of clearing the text itself.
ALTER TABLE sows ADD COLUMN key_location TEXT;
ALTER TABLE sows ADD COLUMN show_key_location BOOLEAN NOT NULL DEFAULT true;
