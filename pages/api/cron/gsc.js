// /pages/api/cron/gsc.js
// Cron endpoint — Vercel calls daily at 06:00 UTC
// Fetches last 7 days of GSC data and upserts into seo_metrics

import { google } from "googleapis";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Authenticate with GSC via Service Account
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GSC_CLIENT_EMAIL,
        private_key: process.env.GSC_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });

    const searchconsole = google.searchconsole({ version: "v1", auth });
    const siteUrl = process.env.GSC_SITE_URL;

    // 2. Fetch last 7 days (GSC has ~2 day delay)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const fmt = (d) => d.toISOString().split("T")[0];

    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ["date", "page", "query"],
        rowLimit: 5000,
      },
    });

    const rows = response.data.rows || [];

    if (rows.length === 0) {
      return res.status(200).json({ message: "No data from GSC", inserted: 0 });
    }

    // 3. Transform rows for Supabase
    const records = rows.map((row) => ({
      date: row.keys[0],
      page: row.keys[1],
      query: row.keys[2],
      source: "gsc",
      clicks: row.clicks,
      impressions: row.impressions,
      position: Math.round(row.position * 100) / 100,
    }));

    // 4. Upsert into Supabase (batch of 500)
    let totalUpserted = 0;
    const batchSize = 500;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await supabaseAdmin
        .from("seo_metrics")
        .upsert(batch, { onConflict: "date,source,page,query" });

      if (error) {
        console.error("Supabase upsert error:", error);
        throw error;
      }
      totalUpserted += batch.length;
    }

    return res.status(200).json({
      message: "GSC sync complete",
      inserted: totalUpserted,
      dateRange: { start: fmt(startDate), end: fmt(endDate) },
    });
  } catch (err) {
    console.error("GSC cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
