-- ============================================================
-- Social Connectors — Meta Page + YouTube Analytics
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Meta Page Insights (daily snapshots)
CREATE TABLE IF NOT EXISTS meta_page_insights (
  id            BIGSERIAL PRIMARY KEY,
  page_id       TEXT NOT NULL,
  date          DATE NOT NULL,
  fans_count    INTEGER,
  impressions   INTEGER,
  reach         INTEGER,
  engagements   INTEGER,
  reactions     INTEGER,
  page_views    INTEGER,
  raw_json      JSONB,
  fetched_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (page_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_page_insights_date ON meta_page_insights (date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_page_insights_page ON meta_page_insights (page_id, date DESC);

-- 2. YouTube Analytics (daily snapshots)
CREATE TABLE IF NOT EXISTS youtube_analytics (
  id              BIGSERIAL PRIMARY KEY,
  channel_id      TEXT NOT NULL,
  date            DATE NOT NULL,
  views           INTEGER DEFAULT 0,
  watch_time_min  NUMERIC(12,2) DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  subscribers_lost   INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  raw_json        JSONB,
  fetched_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_id, date)
);

CREATE INDEX IF NOT EXISTS idx_yt_analytics_date ON youtube_analytics (date DESC);
CREATE INDEX IF NOT EXISTS idx_yt_analytics_channel ON youtube_analytics (channel_id, date DESC);

-- 3. YouTube Traffic Sources (daily breakdown)
CREATE TABLE IF NOT EXISTS youtube_traffic_sources (
  id              BIGSERIAL PRIMARY KEY,
  channel_id      TEXT NOT NULL,
  date            DATE NOT NULL,
  source_type     TEXT NOT NULL,
  views           INTEGER DEFAULT 0,
  watch_time_min  NUMERIC(12,2) DEFAULT 0,
  fetched_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_id, date, source_type)
);

CREATE INDEX IF NOT EXISTS idx_yt_traffic_date ON youtube_traffic_sources (date DESC);

-- 4. Sync log for tracking connector runs
CREATE TABLE IF NOT EXISTS social_sync_log (
  id          BIGSERIAL PRIMARY KEY,
  connector   TEXT NOT NULL,       -- 'meta' | 'youtube'
  status      TEXT NOT NULL,       -- 'success' | 'error' | 'partial'
  rows_synced INTEGER DEFAULT 0,
  error_msg   TEXT,
  started_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);
