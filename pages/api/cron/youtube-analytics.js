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
const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "";
const YT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Service account credentials (JSON key or individual env vars)
const SA_EMAIL = process.env.GSC_CLIENT_EMAIL || process.env.GOOGLE_SA_EMAIL || "gsc-refap@refap-gsc.iam.gserviceaccount.com";
const SA_KEY = process.env.GSC_PRIVATE_KEY || process.env.GOOGLE_SA_PRIVATE_KEY;
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
  console.log("[YT-ANALYTICS] === Start ===");
  console.log("[YT-ANALYTICS] Env check:", {
    YOUTUBE_CHANNEL_ID: YT_CHANNEL_ID ? "set" : "UNSET",
    GSC_CLIENT_EMAIL: process.env.GSC_CLIENT_EMAIL ? "set" : "UNSET",
    GSC_PRIVATE_KEY: process.env.GSC_PRIVATE_KEY ? `set (${process.env.GSC_PRIVATE_KEY.length} chars)` : "UNSET",
    GOOGLE_SA_EMAIL: process.env.GOOGLE_SA_EMAIL ? "set" : "UNSET",
    GOOGLE_SA_PRIVATE_KEY: process.env.GOOGLE_SA_PRIVATE_KEY ? "set" : "UNSET",
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? "set" : "UNSET",
    YOUTUBE_IMPERSONATE_EMAIL: process.env.YOUTUBE_IMPERSONATE_EMAIL ? "set" : "UNSET",
  });

  // Auth: cron secret or admin dashboard token
  const token = req.headers["x-cron-secret"] || req.query.secret;
  if (CRON_SECRET && token !== CRON_SECRET && !(ADMIN_TOKEN && token === ADMIN_TOKEN)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!YT_CHANNEL_ID) {
    return res.status(500).json({ error: "YOUTUBE_CHANNEL_ID not configured" });
  }

  let auth;
  try {
    auth = getAuthClient();
    console.log("[YT-ANALYTICS] Auth client created. SA_EMAIL:", SA_EMAIL, "| SA_KEY present:", !!SA_KEY, "| SA_KEY_FILE:", !!SA_KEY_FILE);
  } catch (err) {
    console.error("[YT-ANALYTICS] getAuthClient() FAILED:", err.message);
    return res.status(500).json({ error: `Auth setup failed: ${err.message}` });
  }

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
    console.log("[YT-ANALYTICS] Step 1: Fetching core metrics...", { channel: YT_CHANNEL_ID, startStr, endStr });
    const coreReport = await youtubeAnalytics.reports.query({
      ids: `channel==${YT_CHANNEL_ID}`,
      startDate: startStr,
      endDate: endStr,
      metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares",
      dimensions: "day",
      sort: "day",
    });
    console.log("[YT-ANALYTICS] Step 1: Core metrics OK, rows:", coreReport.data.rows?.length || 0);

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
      console.log("[YT-ANALYTICS] Step 1: Upserting", coreRows.length, "core rows to Supabase...");
      const { error: coreErr } = await supabaseAdmin
        .from("youtube_analytics")
        .upsert(coreRows, { onConflict: "channel_id,date" });
      if (coreErr) throw coreErr;
      totalRows += coreRows.length;
      console.log("[YT-ANALYTICS] Step 1: Upsert OK");
    }

    // === 2. Traffic sources ===
    console.log("[YT-ANALYTICS] Step 2: Fetching traffic sources...");
    const trafficReport = await youtubeAnalytics.reports.query({
      ids: `channel==${YT_CHANNEL_ID}`,
      startDate: startStr,
      endDate: endStr,
      metrics: "views,estimatedMinutesWatched",
      dimensions: "day,insightTrafficSourceType",
      sort: "day",
    });
    console.log("[YT-ANALYTICS] Step 2: Traffic sources OK, rows:", trafficReport.data.rows?.length || 0);

    const trafficRows = (trafficReport.data.rows || []).map((row) => ({
      channel_id: YT_CHANNEL_ID,
      date: row[0],
      source_type: row[1],
      views: row[2] || 0,
      watch_time_min: row[3] || 0,
    }));

    if (trafficRows.length > 0) {
      console.log("[YT-ANALYTICS] Step 2: Upserting", trafficRows.length, "traffic rows to Supabase...");
      const { error: trafficErr } = await supabaseAdmin
        .from("youtube_traffic_sources")
        .upsert(trafficRows, { onConflict: "channel_id,date,source_type" });
      if (trafficErr) throw trafficErr;
      totalRows += trafficRows.length;
      console.log("[YT-ANALYTICS] Step 2: Upsert OK");
    }

    await logSync("youtube", "success", totalRows, null);
    console.log("[YT-ANALYTICS] === Done === totalRows:", totalRows);

    return res.status(200).json({
      status: "ok",
      period: { start: startStr, end: endStr },
      analytics_rows: coreRows.length,
      traffic_rows: trafficRows.length,
      total_synced: totalRows,
    });
  } catch (err) {
    console.error("[YT-ANALYTICS] === ERROR ===");
    console.error("[YT-ANALYTICS] message:", err.message);
    console.error("[YT-ANALYTICS] code:", err.code);
    console.error("[YT-ANALYTICS] status:", err.status || err.response?.status);
    console.error("[YT-ANALYTICS] errors:", JSON.stringify(err.errors || err.response?.data?.error));
    console.error("[YT-ANALYTICS] stack:", err.stack);
    await logSync("youtube", "error", totalRows, err.message);
    return res.status(500).json({
      error: err.message,
      code: err.code,
      status: err.status || err.response?.status,
      details: err.errors || err.response?.data?.error || null,
    });
  }
}
