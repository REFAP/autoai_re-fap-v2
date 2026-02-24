-- ============================================================
-- Analytics Multi-Sources — Tables pour dashboard cross-canal
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. GSC (Google Search Console) — import CSV
CREATE TABLE IF NOT EXISTS analytics_gsc (
  id            BIGSERIAL PRIMARY KEY,
  date          DATE NOT NULL,
  query         TEXT,
  page          TEXT,
  clicks        INTEGER DEFAULT 0,
  impressions   INTEGER DEFAULT 0,
  ctr           NUMERIC(6,4) DEFAULT 0,
  position      NUMERIC(6,2) DEFAULT 0,
  uploaded_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_gsc_date ON analytics_gsc (date DESC);

-- 2. YouTube — import CSV
CREATE TABLE IF NOT EXISTS analytics_youtube (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  video_title     TEXT,
  views           INTEGER DEFAULT 0,
  watch_time_hours NUMERIC(10,2) DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  traffic_source  TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_youtube_date ON analytics_youtube (date DESC);

-- 3. TikTok — import CSV
CREATE TABLE IF NOT EXISTS analytics_tiktok (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  views           INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  engagement_rate NUMERIC(6,4) DEFAULT 0,
  followers       INTEGER DEFAULT 0,
  followers_gained INTEGER DEFAULT 0,
  uploaded_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_tiktok_date ON analytics_tiktok (date DESC);

-- 4. Meta / Instagram — import CSV
CREATE TABLE IF NOT EXISTS analytics_meta (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  platform        TEXT DEFAULT 'facebook',  -- 'facebook' | 'instagram'
  reach_organic   INTEGER DEFAULT 0,
  reach_paid      INTEGER DEFAULT 0,
  impressions     INTEGER DEFAULT 0,
  engagement      INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  spend           NUMERIC(10,2) DEFAULT 0,
  uploaded_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_meta_date ON analytics_meta (date DESC);

-- 5. Email / SMS (Brevo) — import CSV
CREATE TABLE IF NOT EXISTS analytics_email (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  channel         TEXT DEFAULT 'email',  -- 'email' | 'sms'
  campaign_name   TEXT,
  sends           INTEGER DEFAULT 0,
  opens           INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  bounces         INTEGER DEFAULT 0,
  unsubscribes    INTEGER DEFAULT 0,
  open_rate       NUMERIC(6,4) DEFAULT 0,
  click_rate      NUMERIC(6,4) DEFAULT 0,
  uploaded_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_email_date ON analytics_email (date DESC);

-- 6. Carter-Cash PDF — extraction automatique
CREATE TABLE IF NOT EXISTS analytics_cc_pdf (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  magasin         TEXT NOT NULL,
  ventes_fap      INTEGER DEFAULT 0,
  ca_fap          NUMERIC(10,2) DEFAULT 0,
  ventes_total    INTEGER DEFAULT 0,
  ca_total        NUMERIC(10,2) DEFAULT 0,
  panier_moyen    NUMERIC(10,2) DEFAULT 0,
  uploaded_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_cc_pdf_date ON analytics_cc_pdf (date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_cc_pdf_magasin ON analytics_cc_pdf (magasin, date DESC);
