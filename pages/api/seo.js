// /pages/api/seo.js
// GET /api/seo?days=30&token=xxx
// Returns top 10 pages and top 10 queries for the given period

import { supabaseAdmin } from "../../lib/supabaseAdmin";

const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth — same pattern as /api/admin/stats
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token invalide" });
  }

  const days = parseInt(req.query.days, 10) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  try {
    const { data: topPages, error: pagesErr } = await supabaseAdmin
      .rpc("top_pages", { since_date: sinceStr, row_limit: 10 });

    if (pagesErr) throw pagesErr;

    const { data: topQueries, error: queriesErr } = await supabaseAdmin
      .rpc("top_queries", { since_date: sinceStr, row_limit: 10 });

    if (queriesErr) throw queriesErr;

    // Totals for the period
    const { data: totals, error: totalsErr } = await supabaseAdmin
      .from("seo_metrics")
      .select("clicks, impressions")
      .gte("date", sinceStr)
      .eq("source", "gsc");

    let totalClicks = 0, totalImpressions = 0;
    if (!totalsErr && totals) {
      for (const row of totals) {
        totalClicks += row.clicks || 0;
        totalImpressions += row.impressions || 0;
      }
    }

    return res.status(200).json({
      topPages,
      topQueries,
      days,
      totals: { clicks: totalClicks, impressions: totalImpressions },
    });
  } catch (err) {
    console.error("SEO API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
