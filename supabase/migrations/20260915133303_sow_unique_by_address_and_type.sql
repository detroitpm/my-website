-- One SOW per address + type of work, instead of one per address.
--
-- The original create_sow_tables migration made address_key UNIQUE, so saving
-- a second SOW for a property replaced the first. In practice a property gets
-- several: a "Pre-inspection list 1", then a "Pre-inspection list 2" after a
-- second walkthrough turns up items the first pass missed. Those are separate
-- documents and both need to survive.
--
-- type_of_work_key mirrors normalizeKey() in sow-shared.js - lowercased,
-- trimmed, runs of whitespace collapsed to one space - so "Pre-Inspection
-- List" and "pre-inspection  list" are the same SOW.
--
-- It defaults to '' and is NOT NULL on purpose. Postgres treats NULLs in a
-- unique constraint as distinct from each other, so if a blank type of work
-- were stored as NULL, every save of that SOW would insert a new duplicate
-- row instead of updating the existing one.

ALTER TABLE sows
  ADD COLUMN IF NOT EXISTS type_of_work_key TEXT NOT NULL DEFAULT '';

UPDATE sows
  SET type_of_work_key =
    lower(btrim(regexp_replace(coalesce(type_of_work, ''), '\s+', ' ', 'g')));

-- Drop whatever unique constraint currently covers address_key on its own.
-- Postgres named it sows_address_key_key by default, but match on shape
-- rather than trusting the name.
DO $$
DECLARE
  target_constraint TEXT;
BEGIN
  SELECT c.conname INTO target_constraint
  FROM pg_constraint c
  WHERE c.conrelid = 'sows'::regclass
    AND c.contype = 'u'
    AND c.conkey = ARRAY[(
      SELECT a.attnum
      FROM pg_attribute a
      WHERE a.attrelid = 'sows'::regclass
        AND a.attname = 'address_key'
    )]::smallint[];

  IF target_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sows DROP CONSTRAINT %I', target_constraint);
  END IF;
END $$;

-- Safe to add: address_key was unique until a moment ago, so every
-- (address_key, type_of_work_key) pair is already distinct.
ALTER TABLE sows
  ADD CONSTRAINT sows_address_type_key UNIQUE (address_key, type_of_work_key);
