// /pages/api/admin/social-data.js
// API route — Data for Social Dashboard (Meta + YouTube)

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token invalide" });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase non configure" });

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    // Fetch all in parallel
    const [metaRes, ytRes, trafficRes, logsRes] = await Promise.all([
      supabase
        .from("meta_page_insights")
        .select("*")
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false })
        .limit(31),
      supabase
        .from("youtube_analytics")
        .select("*")
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false })
        .limit(31),
      supabase
        .from("youtube_traffic_sources")
        .select("*")
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false })
        .limit(300),
      supabase
        .from("social_sync_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

    return res.status(200).json({
      meta: metaRes.data || [],
      youtube: ytRes.data || [],
      youtube_traffic: trafficRes.data || [],
      sync_logs: logsRes.data || [],
    });
  } catch (err) {
    console.error("Social data error:", err);
    return res.status(500).json({ error: err.message });
  }
}
