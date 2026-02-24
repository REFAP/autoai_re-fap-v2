// /pages/api/admin/analytics-import.js
// Import CSV/PDF data into analytics tables
// POST { source, rows[] } or { source: "cc_pdf", text, date } or { source: "cc_sync" }

import { createClient } from "@supabase/supabase-js";

const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Parse Carter-Cash PDF text into structured rows
function parseCCPdfText(text, date) {
  const rows = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  let currentMagasin = null;
  for (const line of lines) {
    // Detect magasin name (usually uppercase or after "Magasin :")
    const magMatch = line.match(/^(?:Magasin\s*[:]\s*)?([A-Z][A-Z\s\-]{2,})/);

    // Detect data lines with numbers
    const numMatch = line.match(/(\d+)\s+(?:ventes?\s+)?FAP/i);
    const caMatch = line.match(/(\d[\d\s,.]*)\s*€/);
    const ventesMatch = line.match(/(\d+)\s+ventes?\s+total/i);

    if (magMatch && !numMatch) {
      currentMagasin = magMatch[1].trim();
    }

    if (currentMagasin && (numMatch || caMatch)) {
      const existing = rows.find(r => r.magasin === currentMagasin && r.date === date);
      if (existing) {
        if (numMatch) existing.ventes_fap = parseInt(numMatch[1]) || 0;
        if (caMatch) existing.ca_fap = parseFloat(caMatch[1].replace(/\s/g, "").replace(",", ".")) || 0;
        if (ventesMatch) existing.ventes_total = parseInt(ventesMatch[1]) || 0;
      } else {
        rows.push({
          date,
          magasin: currentMagasin,
          ventes_fap: numMatch ? parseInt(numMatch[1]) || 0 : 0,
          ca_fap: caMatch ? parseFloat(caMatch[1].replace(/\s/g, "").replace(",", ".")) || 0 : 0,
          ventes_total: ventesMatch ? parseInt(ventesMatch[1]) || 0 : 0,
          ca_total: 0,
          panier_moyen: 0,
        });
      }
    }
  }

  // Calculate panier_moyen
  for (const r of rows) {
    if (r.ventes_fap > 0 && r.ca_fap > 0) {
      r.panier_moyen = Math.round((r.ca_fap / r.ventes_fap) * 100) / 100;
    }
  }

  return rows;
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
    const { source, rows, text, date, purge } = req.body;

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

    // Carter-Cash PDF: parse text
    if (source === "cc_pdf") {
      if (!text || !date) return res.status(400).json({ error: "text et date requis pour cc_pdf" });
      const parsed = parseCCPdfText(text, date);
      if (parsed.length === 0) return res.status(400).json({ error: "Aucune donnée extraite du PDF" });

      const { error } = await supabase.from("analytics_cc_pdf").upsert(parsed, { onConflict: "magasin,date" });
      if (error) throw error;

      return res.status(200).json({ status: "ok", source, inserted: parsed.length, data: parsed });
    }

    // Carter-Cash dashboard sync: fetch & parse https://auto.re-fap.fr/dashboard.php
    if (source === "cc_sync") {
      const DASH_URL = "https://auto.re-fap.fr/dashboard.php";
      const DASH_PWD = process.env.CC_DASH_PASSWORD || "re_fap1972";

      // 1. Authenticate (POST password → session cookie)
      const loginResp = await fetch(DASH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `pwd=${encodeURIComponent(DASH_PWD)}`,
        redirect: "manual",
      });
      const setCookie = loginResp.headers.get("set-cookie");
      if (!setCookie) throw new Error("Echec auth dashboard.php — pas de cookie session");
      const sessionCookie = setCookie.split(";")[0];

      // 2. Fetch authenticated page
      const pageResp = await fetch(DASH_URL, { headers: { Cookie: sessionCookie } });
      if (!pageResp.ok) throw new Error(`dashboard.php HTTP ${pageResp.status}`);
      const html = await pageResp.text();

      // 3. Extract JS data arrays embedded in <script> (d801, d065, d003, d006, dautres, dca)
      const extractArr = (name) => {
        const m = html.match(new RegExp(`(?:const|var)\\s+${name}\\s*=\\s*(\\[.*?\\])`));
        return m ? JSON.parse(m[1]) : [];
      };
      const d801 = extractArr("d801");
      const d065 = extractArr("d065");
      const d003 = extractArr("d003");
      const d006 = extractArr("d006");
      const dautres = extractArr("dautres");
      const dca = extractArr("dca");

      if (d801.length === 0) throw new Error("Aucune donnee FAP trouvee dans dashboard.php — verifiez l'authentification");

      // 4. Extract month+year labels from HTML table cells (e.g. "Oct 2025", "Jan 2026")
      const mMap = { Jan:"01", Fev:"02", Mar:"03", Avr:"04", Mai:"05", Juin:"06", Juil:"07", Aou:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
      const monthRx = />(Jan|Fev|Mar|Avr|Mai|Juin|Juil|Aou|Sep|Oct|Nov|Dec)\s+(\d{4})/g;
      const seen = new Set();
      const months = [];
      let mx;
      while ((mx = monthRx.exec(html)) !== null) {
        const key = `${mx[1]} ${mx[2]}`;
        if (!seen.has(key)) { seen.add(key); months.push({ name: mx[1], year: mx[2] }); }
      }
      if (months.length === 0) throw new Error("Aucune date trouvee dans dashboard.php");

      // 5. Build rows per centre x month
      const centres = [
        { arr: d801, magasin: "Thiais (94)" },
        { arr: d065, magasin: "Lambres (59)" },
        { arr: d003, magasin: "Villeneuve d'Ascq (59)" },
        { arr: d006, magasin: "Sarcelles (95)" },
        { arr: dautres, magasin: "Autres CC" },
      ];

      const parsed2 = [];
      for (let i = 0; i < months.length && i < d801.length; i++) {
        const dateStr = `${months[i].year}-${mMap[months[i].name]}-01`;
        const totalFap = (d801[i]||0) + (d065[i]||0) + (d003[i]||0) + (d006[i]||0) + (dautres[i]||0);
        const ca = dca[i] || 0;

        for (const c of centres) {
          const fap = c.arr[i] || 0;
          if (fap <= 0) continue;
          const caShare = totalFap > 0 ? Math.round((fap / totalFap) * ca * 100) / 100 : 0;
          parsed2.push({
            date: dateStr,
            magasin: c.magasin,
            ventes_fap: fap,
            ca_fap: caShare,
            ventes_total: totalFap,
            ca_total: ca,
            panier_moyen: fap > 0 ? Math.round((caShare / fap) * 100) / 100 : 0,
          });
        }
      }

      if (parsed2.length === 0) throw new Error("Aucune donnee extraite de dashboard.php");

      const { error: syncErr } = await supabase.from("analytics_cc_pdf").upsert(parsed2, { onConflict: "magasin,date" });
      if (syncErr) throw syncErr;

      return res.status(200).json({ status: "ok", source: "cc_sync", inserted: parsed2.length, data: parsed2 });
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
