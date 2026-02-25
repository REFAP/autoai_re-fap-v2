-- ============================================================
-- prestations_weekly — UNIQUE constraint on (store_code, week_start)
-- Prevents duplicate rows when importing Carter-Cash CSV data.
-- The cc_csv import uses UPSERT: if (store_code, week_start) exists,
-- values are updated instead of inserting a duplicate.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Remove existing duplicates: keep the row with the highest id
--    for each (store_code, week_start) pair
DELETE FROM prestations_weekly a
  USING prestations_weekly b
  WHERE a.store_code  = b.store_code
    AND a.week_start  = b.week_start
    AND a.id          < b.id;

-- 2. Add the UNIQUE constraint
ALTER TABLE prestations_weekly
  ADD CONSTRAINT uq_prestations_weekly_store_date
  UNIQUE (store_code, week_start);
