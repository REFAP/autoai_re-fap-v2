// /pages/api/cron/youtube-analytics.js
// Cron connector — YouTube Analytics API
// Uses service account gsc-refap@refap-gsc.iam.gserviceaccount.com
// Fetches: views, watch time, traffic sources
//
// Prerequisites:
// 1. Enable YouTube Analytics API in Google Cloud project refap-gsc
// 2. Add the service account as a manager on the YouTube channel
//    OR use impersonation if Google Workspace domain-wide delegation is set up

import { google } from "googleapis";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const CRON_SECRET = process.env.CRON_SECRET || "";
const YT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Service account credentials (JSON key or individual env vars)
const SA_EMAIL = process.env.GOOGLE_SA_EMAIL || "gsc-refap@refap-gsc.iam.gserviceaccount.com";
const SA_KEY = process.env.GOOGLE_SA_PRIVATE_KEY;
// If using a JSON key file path
const SA_KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;
// If impersonating a user (for domain-wide delegation)
const IMPERSONATE_EMAIL = process.env.YOUTUBE_IMPERSONATE_EMAIL;

async function logSync(connector, status, rowsSynced, errorMsg) {
  await supabaseAdmin.from("social_sync_log").insert({
    connector,
    status,
    rows_synced: rowsSynced,
    error_msg: errorMsg || null,
    finished_at: new Date().toISOString(),
  });
}

function getAuthClient() {
  if (SA_KEY_FILE) {
    // Use JSON key file
    const auth = new google.auth.GoogleAuth({
      keyFile: SA_KEY_FILE,
      scopes: [
        "https://www.googleapis.com/auth/yt-analytics.readonly",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      clientOptions: IMPERSONATE_EMAIL ? { subject: IMPERSONATE_EMAIL } : undefined,
    });
    return auth;
  }

  if (SA_KEY) {
    // Use env vars directly
    const auth = new google.auth.JWT({
      email: SA_EMAIL,
      key: SA_KEY.replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/yt-analytics.readonly",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      subject: IMPERSONATE_EMAIL || undefined,
    });
    return auth;
  }

  throw new Error("No Google credentials configured. Set GOOGLE_SA_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS.");
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

export default async function handler(req, res) {
  const token = req.headers["x-cron-secret"] || req.query.secret;
  if (CRON_SECRET && token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!YT_CHANNEL_ID) {
    return res.status(500).json({ error: "YOUTUBE_CHANNEL_ID not configured" });
  }

  const auth = getAuthClient();
  const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });

  // Fetch last 30 days by default, or use query params
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // yesterday (analytics lag)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (parseInt(req.query.days) || 30));

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  let totalRows = 0;

  try {
    // === 1. Core metrics (views, watchTime, subscribers, engagement) ===
    const coreReport = await youtubeAnalytics.reports.query({
      ids: `channel==${YT_CHANNEL_ID}`,
      startDate: startStr,
      endDate: endStr,
      metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares",
      dimensions: "day",
      sort: "day",
    });

    const coreRows = (coreReport.data.rows || []).map((row) => ({
      channel_id: YT_CHANNEL_ID,
      date: row[0],
      views: row[1] || 0,
      watch_time_min: row[2] || 0,
      subscribers_gained: row[3] || 0,
      subscribers_lost: row[4] || 0,
      likes: row[5] || 0,
      comments: row[6] || 0,
      shares: row[7] || 0,
      raw_json: {
        dimensions: row[0],
        metrics: {
          views: row[1],
          estimatedMinutesWatched: row[2],
          subscribersGained: row[3],
          subscribersLost: row[4],
          likes: row[5],
          comments: row[6],
          shares: row[7],
        },
      },
    }));

    if (coreRows.length > 0) {
      const { error: coreErr } = await supabaseAdmin
        .from("youtube_analytics")
        .upsert(coreRows, { onConflict: "channel_id,date" });
      if (coreErr) throw coreErr;
      totalRows += coreRows.length;
    }

    // === 2. Traffic sources ===
    const trafficReport = await youtubeAnalytics.reports.query({
      ids: `channel==${YT_CHANNEL_ID}`,
      startDate: startStr,
      endDate: endStr,
      metrics: "views,estimatedMinutesWatched",
      dimensions: "day,insightTrafficSourceType",
      sort: "day",
    });

    const trafficRows = (trafficReport.data.rows || []).map((row) => ({
      channel_id: YT_CHANNEL_ID,
      date: row[0],
      source_type: row[1],
      views: row[2] || 0,
      watch_time_min: row[3] || 0,
    }));

    if (trafficRows.length > 0) {
      const { error: trafficErr } = await supabaseAdmin
        .from("youtube_traffic_sources")
        .upsert(trafficRows, { onConflict: "channel_id,date,source_type" });
      if (trafficErr) throw trafficErr;
      totalRows += trafficRows.length;
    }

    await logSync("youtube", "success", totalRows, null);

    return res.status(200).json({
      status: "ok",
      period: { start: startStr, end: endStr },
      analytics_rows: coreRows.length,
      traffic_rows: trafficRows.length,
      total_synced: totalRows,
    });
  } catch (err) {
    console.error("YouTube Analytics sync error:", err);
    await logSync("youtube", "error", totalRows, err.message);
    return res.status(500).json({ error: err.message });
  }
}
