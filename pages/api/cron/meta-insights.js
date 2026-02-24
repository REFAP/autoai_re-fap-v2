// /pages/api/cron/meta-insights.js
// Cron connector — Meta (Facebook) Page Insights
// Permissions available: pages_show_list, business_management
// Page ID: 145915515278886 (Re Fap)
//
// With current permissions we can fetch:
//   - Page info (name, fan_count, etc.)
//   - Page posts (if pages_read_user_content granted)
// For full insights (impressions, reach, engagement), pages_read_engagement is needed.
// The connector handles both cases gracefully.

import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const CRON_SECRET = process.env.CRON_SECRET || "";
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID || "145915515278886";
const GRAPH_API = "https://graph.facebook.com/v19.0";

async function logSync(connector, status, rowsSynced, errorMsg) {
  await supabaseAdmin.from("social_sync_log").insert({
    connector,
    status,
    rows_synced: rowsSynced,
    error_msg: errorMsg || null,
    finished_at: new Date().toISOString(),
  });
}

async function fetchGraphAPI(endpoint, params = {}) {
  const url = new URL(`${GRAPH_API}/${endpoint}`);
  url.searchParams.set("access_token", META_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) {
    throw new Error(`Graph API error: ${json.error.message} (code ${json.error.code})`);
  }
  return json;
}

export default async function handler(req, res) {
  // Auth: cron secret or admin token
  const token = req.headers["x-cron-secret"] || req.query.secret;
  if (CRON_SECRET && token !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!META_ACCESS_TOKEN) {
    return res.status(500).json({ error: "META_ACCESS_TOKEN not configured" });
  }

  const today = new Date().toISOString().split("T")[0];
  let rowsSynced = 0;

  try {
    // Step 1: Fetch page basic info (always works with pages_show_list)
    const pageInfo = await fetchGraphAPI(META_PAGE_ID, {
      fields: "id,name,fan_count,followers_count,new_like_count,talking_about_count,were_here_count",
    });

    const row = {
      page_id: META_PAGE_ID,
      date: today,
      fans_count: pageInfo.fan_count || pageInfo.followers_count || null,
      impressions: null,
      reach: null,
      engagements: null,
      reactions: null,
      page_views: null,
      raw_json: { page_info: pageInfo },
    };

    // Step 2: Try to fetch insights (requires pages_read_engagement)
    try {
      const insights = await fetchGraphAPI(`${META_PAGE_ID}/insights`, {
        metric: "page_impressions,page_engaged_users,page_post_engagements,page_views_total,page_fan_adds",
        period: "day",
        since: Math.floor(new Date(today).getTime() / 1000 - 86400),
        until: Math.floor(new Date(today).getTime() / 1000),
      });

      if (insights.data) {
        for (const metric of insights.data) {
          const val = metric.values?.[0]?.value || 0;
          switch (metric.name) {
            case "page_impressions":
              row.impressions = val;
              break;
            case "page_engaged_users":
              row.engagements = val;
              break;
            case "page_post_engagements":
              row.reactions = val;
              break;
            case "page_views_total":
              row.page_views = val;
              break;
          }
        }
        row.raw_json.insights = insights.data;
      }
    } catch (insightsErr) {
      // Expected with current permissions — log but don't fail
      row.raw_json.insights_error = insightsErr.message;
      console.warn("Meta insights not available (expected):", insightsErr.message);
    }

    // Step 3: Try to fetch page reach (separate endpoint)
    try {
      const reachData = await fetchGraphAPI(`${META_PAGE_ID}/insights`, {
        metric: "page_impressions_unique",
        period: "day",
        since: Math.floor(new Date(today).getTime() / 1000 - 86400),
        until: Math.floor(new Date(today).getTime() / 1000),
      });
      if (reachData.data?.[0]?.values?.[0]?.value) {
        row.reach = reachData.data[0].values[0].value;
      }
    } catch {
      // Expected with current permissions
    }

    // Step 4: Upsert into Supabase
    const { error: upsertErr } = await supabaseAdmin
      .from("meta_page_insights")
      .upsert(row, { onConflict: "page_id,date" });

    if (upsertErr) throw upsertErr;
    rowsSynced = 1;

    await logSync("meta", row.impressions !== null ? "success" : "partial", rowsSynced, null);

    return res.status(200).json({
      status: "ok",
      date: today,
      page: pageInfo.name || META_PAGE_ID,
      fans: row.fans_count,
      has_insights: row.impressions !== null,
      message: row.impressions !== null
        ? "Full insights synced"
        : "Basic data synced. For full insights, add pages_read_engagement permission.",
    });
  } catch (err) {
    console.error("Meta sync error:", err);
    await logSync("meta", "error", rowsSynced, err.message);
    return res.status(500).json({ error: err.message });
  }
}
