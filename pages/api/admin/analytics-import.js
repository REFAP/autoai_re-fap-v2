// /pages/api/admin/analytics-import.js
// Import CSV data into analytics tables
// POST { source, rows[] }

import { createClient } from "@supabase/supabase-js";

const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Column mapping per source
function gscMap(sourceTag) {
  return (row) => {
    // Query: EN + FR GSC headers
    const query = row.query || row.Query || row["Top queries"]
      || row.requete || row["Requêtes principales"] || row["Requête"]
      || row["Requetes principales"] || row["Requete"]
      || null;

    // Page: EN + FR GSC headers
    const page = row.page || row.Page || row.URL
      || row["Pages les plus populaires"] || row["Page de destination"]
      || null;

    // Clicks: handle FR "Clics", thousand separators, comma decimals
    const clicksRaw = row.clicks ?? row.Clicks ?? row.Clics ?? "0";
    const clicks = parseInt(String(clicksRaw).replace(/[\s\u00A0]/g, "").replace(",", ".")) || 0;

    // Impressions: same cleanup
    const impRaw = row.impressions ?? row.Impressions ?? "0";
    const impressions = parseInt(String(impRaw).replace(/[\s\u00A0]/g, "").replace(",", ".")) || 0;

    // CTR: handle "3,75 %" and "3.75%" formats
    const ctrRaw = row.ctr ?? row.CTR ?? "0";
    const ctr = parseFloat(String(ctrRaw).replace(/[\s\u00A0%]/g, "").replace(",", ".")) / 100 || 0;

    // Position: handle "4,2" comma format
    const posRaw = row.position ?? row.Position ?? "0";
    const position = parseFloat(String(posRaw).replace(/[\s\u00A0]/g, "").replace(",", ".")) || 0;

    // Date: required from Graphique.csv (validated upstream)
    const date = row.date || row.Date || null;

    return { date, source: sourceTag, query, page, clicks, impressions, ctr, position };
  };
}

const COLUMN_MAP = {
  gsc_main: {
    table: "analytics_gsc",
    onConflict: "source,date",
    map: gscMap("refap-main"),
  },
  gsc_cc: {
    table: "analytics_gsc",
    onConflict: "source,date",
    map: gscMap("refap-cc"),
  },
  youtube: {
    table: "analytics_youtube",
    onConflict: "date",
    map: (row) => ({
      date: row.date || row.Date || row.Jour,
      video_title: row.video_title || row["Video title"] || row.Titre || row["Titre de la vidéo"],
      views: parseInt(row.views || row.Views || row.Vues || 0),
      watch_time_hours: parseFloat(String(row.watch_time_hours || row["Watch time (hours)"] || row["Durée de visionnage (heures)"] || "0").replace(",", ".")) || 0,
      likes: parseInt(row.likes || row.Likes || row["J'aime"] || 0),
      comments: parseInt(row.comments || row.Comments || row.Commentaires || 0),
      shares: parseInt(row.shares || row.Shares || row.Partages || 0),
      subscribers_gained: parseInt(row.subscribers_gained || row["Subscribers gained"] || row["Abonnés gagnés"] || 0),
      traffic_source: row.traffic_source || row["Traffic source"] || row["Source de trafic"] || null,
    }),
  },
  tiktok: {
    table: "analytics_tiktok",
    onConflict: "date",
    map: (row) => ({
      date: row.date || row.Date,
      views: parseInt(row.views || row.Views || row.Vues || row["Video views"] || 0),
      reach: parseInt(row.reach || row.Reach || row["Portée"] || 0),
      likes: parseInt(row.likes || row.Likes || row["J'aime"] || 0),
      comments: parseInt(row.comments || row.Comments || row.Commentaires || 0),
      shares: parseInt(row.shares || row.Shares || row.Partages || 0),
      engagement_rate: parseFloat(String(row.engagement_rate || row["Engagement rate"] || row["Taux d'engagement"] || "0").replace("%", "").replace(",", ".")) / 100 || 0,
      followers: parseInt(row.followers || row.Followers || row["Abonnés"] || 0),
      followers_gained: parseInt(row.followers_gained || row["New followers"] || row["Nouveaux abonnés"] || 0),
    }),
  },
  meta: {
    table: "analytics_meta",
    onConflict: "date",
    map: (row) => ({
      date: row.date || row.Date,
      platform: row.platform || row.Platform || row.Plateforme || "facebook",
      reach_organic: parseInt(row.reach_organic || row["Organic reach"] || row["Portée organique"] || 0),
      reach_paid: parseInt(row.reach_paid || row["Paid reach"] || row["Portée payante"] || 0),
      impressions: parseInt(row.impressions || row.Impressions || 0),
      engagement: parseInt(row.engagement || row.Engagement || row.Engagements || 0),
      clicks: parseInt(row.clicks || row.Clicks || row.Clics || 0),
      spend: parseFloat(String(row.spend || row.Spend || row["Dépense"] || row["Montant dépensé"] || "0").replace(",", ".").replace("€", "").trim()) || 0,
    }),
  },
  email: {
    table: "analytics_email",
    onConflict: "date",
    map: (row) => ({
      date: row.date || row.Date,
      channel: row.channel || row.Channel || row.Canal || "email",
      campaign_name: row.campaign_name || row["Campaign name"] || row.Campagne || null,
      sends: parseInt(row.sends || row.Sends || row.Envois || row["Destinataires"] || 0),
      opens: parseInt(row.opens || row.Opens || row.Ouvertures || 0),
      clicks: parseInt(row.clicks || row.Clicks || row.Clics || 0),
      bounces: parseInt(row.bounces || row.Bounces || row.Rebonds || 0),
      unsubscribes: parseInt(row.unsubscribes || row.Unsubscribes || row["Désinscriptions"] || 0),
      open_rate: parseFloat(String(row.open_rate || row["Open rate"] || row["Taux d'ouverture"] || "0").replace("%", "").replace(",", ".")) / 100 || 0,
      click_rate: parseFloat(String(row.click_rate || row["Click rate"] || row["Taux de clic"] || "0").replace("%", "").replace(",", ".")) / 100 || 0,
    }),
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "Token invalide" });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase non configuré" });

  try {
    const { source, rows, purge } = req.body;

    if (!source) return res.status(400).json({ error: "source requis" });

    // GSC purge: delete existing rows for this source before re-import
    const GSC_SOURCE_TAGS = { gsc_main: "refap-main", gsc_cc: "refap-cc" };
    if (purge && GSC_SOURCE_TAGS[source]) {
      const { error: delError } = await supabase
        .from("analytics_gsc")
        .delete()
        .eq("source", GSC_SOURCE_TAGS[source]);
      if (delError) throw delError;
    }

    // Carter-Cash CSV upload → UPSERT into prestations_weekly
    if (source === "cc_csv") {
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "rows[] requis" });

      const mapped = rows.map(row => {
        const date = row.date || row.Date || null;
        const store_code = row.store_code || row["store_code"] || row.Store || row.store || null;
        const qty = parseInt(row.ventes_fap || row["ventes_fap"] || row.Ventes || 0);
        const ca = parseFloat(String(row.ca_ht || row["ca_ht"] || row.CA || "0").replace(",", ".").replace(/\s/g, "")) || 0;
        const marge = parseFloat(String(row.marge || row.Marge || "0").replace(",", ".").replace(/\s/g, "")) || 0;

        if (!date || !store_code) return null;

        return {
          store_code,
          week_start: date,
          qty_week: qty,
          ca_ht_week: Math.round(ca * 100) / 100,
          marge_week: Math.round(marge * 100) / 100,
        };
      }).filter(Boolean);

      if (mapped.length === 0) return res.status(400).json({ error: "Aucune ligne valide (colonnes attendues : date, store_code, ventes_fap, ca_ht, marge)" });

      // Batch upsert (500 per batch) — UNIQUE constraint on (store_code, week_start)
      let totalInserted = 0;
      for (let i = 0; i < mapped.length; i += 500) {
        const batch = mapped.slice(i, i + 500);
        const { error } = await supabase.from("prestations_weekly").upsert(batch, { onConflict: "store_code,week_start" });
        if (error) throw error;
        totalInserted += batch.length;
      }

      return res.status(200).json({
        status: "ok",
        source: "cc_csv",
        inserted: totalInserted,
        stores: [...new Set(mapped.map(r => r.store_code))],
      });
    }

    // CSV sources
    const config = COLUMN_MAP[source];
    if (!config) return res.status(400).json({ error: `Source inconnue: ${source}` });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "rows[] requis" });

    // GSC: reject non-Graphique.csv files (missing Date column)
    if ((source === "gsc_main" || source === "gsc_cc") && rows.length > 0) {
      const keys = Object.keys(rows[0]);
      const hasDate = keys.some(k => k.toLowerCase() === "date");
      if (!hasDate) {
        return res.status(400).json({
          error: "Veuillez importer le fichier Graphique.csv pour les données temporelles. Les fichiers Pages.csv, Requêtes.csv, Appareils.csv ne sont pas acceptés.",
        });
      }
    }

    const mapped = rows.map(config.map).filter(r => r.date);

    // Batch upsert (500 per batch)
    let totalInserted = 0;
    for (let i = 0; i < mapped.length; i += 500) {
      const batch = mapped.slice(i, i + 500);
      const { error } = await supabase.from(config.table).upsert(batch, { onConflict: config.onConflict });
      if (error) throw error;
      totalInserted += batch.length;
    }

    return res.status(200).json({ status: "ok", source, inserted: totalInserted, purged: !!purge });
  } catch (err) {
    console.error("Analytics import error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};
