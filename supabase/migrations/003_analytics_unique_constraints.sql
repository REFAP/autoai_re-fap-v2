-- ============================================================
-- Analytics UNIQUE constraints — prevent duplicate imports
-- Run in Supabase SQL Editor
-- ============================================================

-- 0. Ensure analytics_gsc has the "source" column (added post-002)
ALTER TABLE analytics_gsc ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'refap-main';

-- ============================================================
-- 1. analytics_gsc — UNIQUE on (source, date)
-- ============================================================
-- Remove duplicates: keep the row with the highest id for each (source, date)
DELETE FROM analytics_gsc a
  USING analytics_gsc b
  WHERE a.source = b.source
    AND a.date   = b.date
    AND a.id     < b.id;

ALTER TABLE analytics_gsc
  ADD CONSTRAINT uq_analytics_gsc_source_date UNIQUE (source, date);

-- ============================================================
-- 2. analytics_youtube — UNIQUE on (date)
-- ============================================================
DELETE FROM analytics_youtube a
  USING analytics_youtube b
  WHERE a.date = b.date
    AND a.id   < b.id;

ALTER TABLE analytics_youtube
  ADD CONSTRAINT uq_analytics_youtube_date UNIQUE (date);

-- ============================================================
-- 3. analytics_tiktok — UNIQUE on (date)
-- ============================================================
DELETE FROM analytics_tiktok a
  USING analytics_tiktok b
  WHERE a.date = b.date
    AND a.id   < b.id;

ALTER TABLE analytics_tiktok
  ADD CONSTRAINT uq_analytics_tiktok_date UNIQUE (date);

-- ============================================================
-- 4. analytics_meta — UNIQUE on (date)
-- ============================================================
DELETE FROM analytics_meta a
  USING analytics_meta b
  WHERE a.date = b.date
    AND a.id   < b.id;

ALTER TABLE analytics_meta
  ADD CONSTRAINT uq_analytics_meta_date UNIQUE (date);

-- ============================================================
-- 5. analytics_email — UNIQUE on (date)
-- ============================================================
DELETE FROM analytics_email a
  USING analytics_email b
  WHERE a.date = b.date
    AND a.id   < b.id;

ALTER TABLE analytics_email
  ADD CONSTRAINT uq_analytics_email_date UNIQUE (date);

-- ============================================================
-- 6. analytics_cc_pdf — UNIQUE on (magasin, date)
-- ============================================================
DELETE FROM analytics_cc_pdf a
  USING analytics_cc_pdf b
  WHERE a.magasin = b.magasin
    AND a.date    = b.date
    AND a.id      < b.id;

ALTER TABLE analytics_cc_pdf
  ADD CONSTRAINT uq_analytics_cc_pdf_magasin_date UNIQUE (magasin, date);
