// /pages/api/admin/analytics-import.js
// Import CSV data into analytics tables
// POST { source, rows[], column_mapping? }
// Supports custom column mapping from the smart import UI

import { createClient } from "@supabase/supabase-js";

const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ═══════ FLEXIBLE VALUE PARSERS ═══════

function parseNum(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/[\s\u00A0€$]/g, "").replace(",", ".");
  return parseInt(s) || 0;
}

function parseFloat2(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/[\s\u00A0€$]/g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function parsePct(val) {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/[\s\u00A0%]/g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  // If value > 1, assume it's already a percentage (e.g., "3.75"), divide by 100
  // If value <= 1, assume it's already a ratio (e.g., "0.0375")
  return n > 1 ? n / 100 : n;
}

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();

  // YYYY-MM-DD (standard)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try native Date parsing as last resort
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];

  return null;
}

// ═══════ NORMALIZE HELPER ═══════

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Find a value in a row using custom mapping or fallback aliases
function findVal(row, dbField, customMap, aliases) {
  // 1. Try custom mapping first
  if (customMap && customMap[dbField]) {
    const key = customMap[dbField];
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }

  // 2. Try aliases (fuzzy)
  if (aliases) {
    const keys = Object.keys(row);
    for (const alias of aliases) {
      const norm = normalize(alias);
      // Exact match
      const exact = keys.find(k => normalize(k) === norm);
      if (exact && row[exact] !== undefined && row[exact] !== "") return row[exact];
    }
    // Partial/contains match
    for (const alias of aliases) {
      const norm = normalize(alias);
      const found = Object.keys(row).find(k => {
        const kn = normalize(k);
        return kn.includes(norm) || norm.includes(kn);
      });
      if (found && row[found] !== undefined && row[found] !== "") return row[found];
    }
  }

  return null;
}

// ═══════ SOURCE MAPPING CONFIGS ═══════
// Each config defines aliases for flexible column matching

const SOURCE_ALIASES = {
  gsc: {
    date: ["date", "jour", "day"],
    query: ["query", "requete", "requetes principales", "mot cle", "keyword", "top queries"],
    page: ["page", "url", "landing page", "pages les plus populaires", "page de destination"],
    clicks: ["clicks", "clics", "clic", "nb clics"],
    impressions: ["impressions", "impr", "nb impressions"],
    ctr: ["ctr", "taux de clic", "click through rate"],
    position: ["position", "pos", "position moyenne"],
  },
  youtube: {
    date: ["date", "jour", "day"],
    video_title: ["video title", "titre", "titre de la video", "title", "nom video"],
    views: ["views", "vues", "nb vues", "video views"],
    watch_time_hours: ["watch time hours", "watch time", "duree de visionnage", "duree visionnage heures", "temps de visionnage"],
    likes: ["likes", "jaime", "nb likes"],
    comments: ["comments", "commentaires", "nb commentaires"],
    shares: ["shares", "partages", "nb partages"],
    subscribers_gained: ["subscribers gained", "abonnes gagnes", "nouveaux abonnes", "new subscribers"],
    traffic_source: ["traffic source", "source de trafic", "source trafic"],
  },
  tiktok: {
    date: ["date", "jour", "day"],
    views: ["views", "vues", "video views", "nb vues"],
    reach: ["reach", "portee", "couverture"],
    likes: ["likes", "jaime"],
    comments: ["comments", "commentaires"],
    shares: ["shares", "partages"],
    engagement_rate: ["engagement rate", "taux dengagement", "taux engagement", "engagement"],
    followers: ["followers", "abonnes", "nb abonnes"],
    followers_gained: ["new followers", "nouveaux abonnes", "followers gained"],
  },
  meta: {
    date: ["date", "jour", "day"],
    platform: ["platform", "plateforme", "reseau"],
    reach_organic: ["reach organic", "organic reach", "portee organique", "portee naturelle"],
    reach_paid: ["reach paid", "paid reach", "portee payante", "portee sponsorisee"],
    impressions: ["impressions", "impr"],
    engagement: ["engagement", "engagements", "interactions"],
    clicks: ["clicks", "clics"],
    spend: ["spend", "depense", "montant depense", "budget", "cout", "cost"],
  },
  email: {
    date: ["date", "jour", "day", "date envoi"],
    channel: ["channel", "canal", "type"],
    campaign_name: ["campaign name", "campagne", "nom campagne", "campaign"],
    sends: ["sends", "envois", "destinataires", "nb envois", "sent"],
    opens: ["opens", "ouvertures", "nb ouvertures", "opened"],
    clicks: ["clicks", "clics", "nb clics", "clicked"],
    bounces: ["bounces", "rebonds"],
    unsubscribes: ["unsubscribes", "desinscriptions", "desabonnements"],
    open_rate: ["open rate", "taux douverture", "taux ouverture"],
    click_rate: ["click rate", "taux de clic", "taux clic"],
  },
  cc: {
    date: ["date", "semaine", "semaine du", "periode", "week start", "week", "mois", "date debut"],
    store_code: ["store code", "store", "code", "code centre", "code magasin", "magasincode", "centre", "magasin", "n centre", "id centre", "num centre", "store id"],
    ventes_fap: ["ventes fap", "ventes", "nb fap", "nb prestations", "prestations", "nettoyages", "qty", "quantite", "production", "nombre", "nb nettoyages", "volume"],
    ca_ht: ["ca ht", "ca", "chiffre affaires", "chiffre daffaires", "ca ttc", "revenue", "montant"],
    marge: ["marge", "marge brute", "marge ht", "profit", "benefice", "marge nette"],
  },
};

// ═══════ MAPPING FUNCTIONS (using flexible findVal) ═══════

function mapGscRow(row, sourceTag, customMap) {
  const aliases = SOURCE_ALIASES.gsc;
  return {
    date: parseDate(findVal(row, "date", customMap, aliases.date)),
    source: sourceTag,
    query: findVal(row, "query", customMap, aliases.query) || null,
    page: findVal(row, "page", customMap, aliases.page) || null,
    clicks: parseNum(findVal(row, "clicks", customMap, aliases.clicks)),
    impressions: parseNum(findVal(row, "impressions", customMap, aliases.impressions)),
    ctr: parsePct(findVal(row, "ctr", customMap, aliases.ctr)),
    position: parseFloat2(findVal(row, "position", customMap, aliases.position)),
  };
}

function mapYoutubeRow(row, customMap) {
  const aliases = SOURCE_ALIASES.youtube;
  return {
    date: parseDate(findVal(row, "date", customMap, aliases.date)),
    video_title: findVal(row, "video_title", customMap, aliases.video_title) || null,
    views: parseNum(findVal(row, "views", customMap, aliases.views)),
    watch_time_hours: parseFloat2(findVal(row, "watch_time_hours", customMap, aliases.watch_time_hours)),
    likes: parseNum(findVal(row, "likes", customMap, aliases.likes)),
    comments: parseNum(findVal(row, "comments", customMap, aliases.comments)),
    shares: parseNum(findVal(row, "shares", customMap, aliases.shares)),
    subscribers_gained: parseNum(findVal(row, "subscribers_gained", customMap, aliases.subscribers_gained)),
    traffic_source: findVal(row, "traffic_source", customMap, aliases.traffic_source) || null,
  };
}

function mapTiktokRow(row, customMap) {
  const aliases = SOURCE_ALIASES.tiktok;
  return {
    date: parseDate(findVal(row, "date", customMap, aliases.date)),
    views: parseNum(findVal(row, "views", customMap, aliases.views)),
    reach: parseNum(findVal(row, "reach", customMap, aliases.reach)),
    likes: parseNum(findVal(row, "likes", customMap, aliases.likes)),
    comments: parseNum(findVal(row, "comments", customMap, aliases.comments)),
    shares: parseNum(findVal(row, "shares", customMap, aliases.shares)),
    engagement_rate: parsePct(findVal(row, "engagement_rate", customMap, aliases.engagement_rate)),
    followers: parseNum(findVal(row, "followers", customMap, aliases.followers)),
    followers_gained: parseNum(findVal(row, "followers_gained", customMap, aliases.followers_gained)),
  };
}

function mapMetaRow(row, customMap) {
  const aliases = SOURCE_ALIASES.meta;
  return {
    date: parseDate(findVal(row, "date", customMap, aliases.date)),
    platform: findVal(row, "platform", customMap, aliases.platform) || "facebook",
    reach_organic: parseNum(findVal(row, "reach_organic", customMap, aliases.reach_organic)),
    reach_paid: parseNum(findVal(row, "reach_paid", customMap, aliases.reach_paid)),
    impressions: parseNum(findVal(row, "impressions", customMap, aliases.impressions)),
    engagement: parseNum(findVal(row, "engagement", customMap, aliases.engagement)),
    clicks: parseNum(findVal(row, "clicks", customMap, aliases.clicks)),
    spend: parseFloat2(findVal(row, "spend", customMap, aliases.spend)),
  };
}

function mapEmailRow(row, customMap) {
  const aliases = SOURCE_ALIASES.email;
  return {
    date: parseDate(findVal(row, "date", customMap, aliases.date)),
    channel: findVal(row, "channel", customMap, aliases.channel) || "email",
    campaign_name: findVal(row, "campaign_name", customMap, aliases.campaign_name) || null,
    sends: parseNum(findVal(row, "sends", customMap, aliases.sends)),
    opens: parseNum(findVal(row, "opens", customMap, aliases.opens)),
    clicks: parseNum(findVal(row, "clicks", customMap, aliases.clicks)),
    bounces: parseNum(findVal(row, "bounces", customMap, aliases.bounces)),
    unsubscribes: parseNum(findVal(row, "unsubscribes", customMap, aliases.unsubscribes)),
    open_rate: parsePct(findVal(row, "open_rate", customMap, aliases.open_rate)),
    click_rate: parsePct(findVal(row, "click_rate", customMap, aliases.click_rate)),
  };
}

// ═══════ SOURCE CONFIG FOR BATCH UPSERT ═══════

const SOURCE_CONFIG = {
  gsc_main: { table: "analytics_gsc", onConflict: "source,date", map: (row, cm) => mapGscRow(row, "refap-main", cm) },
  gsc_cc: { table: "analytics_gsc", onConflict: "source,date", map: (row, cm) => mapGscRow(row, "refap-cc", cm) },
  youtube: { table: "analytics_youtube", onConflict: "date", map: (row, cm) => mapYoutubeRow(row, cm) },
  tiktok: { table: "analytics_tiktok", onConflict: "date", map: (row, cm) => mapTiktokRow(row, cm) },
  meta: { table: "analytics_meta", onConflict: "date", map: (row, cm) => mapMetaRow(row, cm) },
  email: { table: "analytics_email", onConflict: "date", map: (row, cm) => mapEmailRow(row, cm) },
};

// ═══════ HANDLER ═══════

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "Token invalide" });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase non configure" });

  try {
    const { source, rows, purge, column_mapping } = req.body;
    const customMap = column_mapping || null;

    if (!source) return res.status(400).json({ error: "source requis" });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "rows[] requis (aucune donnee)" });

    // ═══════ GSC PURGE ═══════
    const GSC_SOURCE_TAGS = { gsc_main: "refap-main", gsc_cc: "refap-cc" };
    if (purge && GSC_SOURCE_TAGS[source]) {
      const { error: delError } = await supabase
        .from("analytics_gsc")
        .delete()
        .eq("source", GSC_SOURCE_TAGS[source]);
      if (delError) throw delError;
    }

    // ═══════ CARTER-CASH CSV ═══════
    if (source === "cc_csv") {
      const cols = Object.keys(rows[0]);
      const aliases = SOURCE_ALIASES.cc;

      // Fetch store_code → cc_code mapping from centres table
      const { data: centres } = await supabase
        .from("centres")
        .select("store_code, cc_code")
        .not("store_code", "is", null);
      const ccCodeMap = {};
      for (const c of centres || []) {
        if (c.store_code && c.cc_code) ccCodeMap[String(c.store_code).trim()] = c.cc_code;
      }

      // Detect pivot format: columns matching YYYY-MM pattern
      const dateColRegex = /^(\d{4}-\d{2})/;
      const dateCols = cols.filter(c => dateColRegex.test(c));
      const isPivot = dateCols.length >= 2;

      function computeWeekEnd(dateStr, isMonthly) {
        if (isMonthly) {
          const [y, m] = dateStr.split("-").map(Number);
          const lastDay = new Date(y, m, 0).getDate();
          return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        }
        const d = new Date(dateStr + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 6);
        return d.toISOString().split("T")[0];
      }

      let mapped = [];

      if (isPivot) {
        // PIVOT FORMAT: months as columns
        const storeCodeCol = customMap?.store_code || cols.find(c =>
          /^(magasincode|store_code|code_centre|code_magasin|code)$/i.test(c.replace(/[\s_]/g, ""))
        ) || cols.find(c => /code/i.test(c));

        const monthCols = dateCols.filter(c => {
          const lower = c.toLowerCase();
          return !lower.includes("total") && !lower.includes("moyenne") && !lower.includes("cumul");
        });

        if (!storeCodeCol) {
          return res.status(400).json({
            error: `Format pivot detecte (colonnes mois: ${dateCols.slice(0, 3).join(", ")}...) mais pas de colonne code magasin. Colonnes disponibles: [${cols.join(", ")}]. Mappez la colonne store_code manuellement.`,
          });
        }

        for (const row of rows) {
          const rawCode = row[storeCodeCol];
          if (!rawCode) continue;
          const store_code = String(rawCode).trim();

          for (const mc of monthCols) {
            const val = row[mc];
            if (val === undefined || val === "" || val === null) continue;

            const match = mc.match(dateColRegex);
            if (!match) continue;
            const week_start = match[1] + "-01";
            const num = parseFloat2(val);

            mapped.push({
              store_code,
              cc_code: ccCodeMap[store_code] || store_code,
              week_start,
              week_end: computeWeekEnd(week_start, true),
              qty_week: Math.round(num),
              ca_ht_week: 0,
              marge_week: 0,
            });
          }
        }
      } else {
        // FLAT FORMAT
        mapped = rows.map(row => {
          const dateVal = findVal(row, "date", customMap, aliases.date);
          const storeVal = findVal(row, "store_code", customMap, aliases.store_code);

          if (!dateVal && !storeVal) return null;

          const date = parseDate(dateVal);
          const store_code = String(storeVal || "").trim();
          if (!date || !store_code) return null;

          const qty = parseNum(findVal(row, "ventes_fap", customMap, aliases.ventes_fap));
          const ca = parseFloat2(findVal(row, "ca_ht", customMap, aliases.ca_ht));
          const marge = parseFloat2(findVal(row, "marge", customMap, aliases.marge));

          return {
            store_code,
            cc_code: ccCodeMap[store_code] || store_code,
            week_start: date,
            week_end: computeWeekEnd(date, false),
            qty_week: qty,
            ca_ht_week: Math.round(ca * 100) / 100,
            marge_week: Math.round(marge * 100) / 100,
          };
        }).filter(Boolean);
      }

      if (mapped.length === 0) {
        return res.status(400).json({
          error: `Aucune ligne valide trouvee. Colonnes detectees: [${cols.join(", ")}]. Format ${isPivot ? "pivot" : "plat"}. Verifiez que les colonnes date et store_code sont correctement mappees.`,
        });
      }

      let totalInserted = 0;
      for (let i = 0; i < mapped.length; i += 500) {
        const batch = mapped.slice(i, i + 500);
        const { error } = await supabase.from("prestations_weekly").upsert(batch, { onConflict: "store_code,week_start" });
        if (error) throw error;
        totalInserted += batch.length;
      }

      const skipped = rows.length - (isPivot ? mapped.length : mapped.length);

      return res.status(200).json({
        status: "ok",
        source: "cc_csv",
        inserted: totalInserted,
        skipped: rows.length - mapped.length,
        stores: [...new Set(mapped.map(r => r.store_code))],
      });
    }

    // ═══════ STANDARD ANALYTICS SOURCES ═══════
    const config = SOURCE_CONFIG[source];
    if (!config) return res.status(400).json({ error: `Source inconnue: ${source}. Sources valides: ${Object.keys(SOURCE_CONFIG).join(", ")}, cc_csv` });

    // Map all rows using the flexible mapper
    const allMapped = rows.map(row => {
      try {
        return config.map(row, customMap);
      } catch {
        return null;
      }
    });

    // Filter: keep rows with a valid date
    const mapped = allMapped.filter(r => r && r.date);
    const skipped = rows.length - mapped.length;

    if (mapped.length === 0) {
      const sampleCols = rows.length > 0 ? Object.keys(rows[0]).join(", ") : "aucune";
      return res.status(400).json({
        error: `Aucune ligne valide (toutes sans date ou non parsables). Colonnes du fichier: [${sampleCols}]. Verifiez le mapping de la colonne date.`,
      });
    }

    // Batch upsert (500 per batch)
    let totalInserted = 0;
    for (let i = 0; i < mapped.length; i += 500) {
      const batch = mapped.slice(i, i + 500);
      const { error } = await supabase.from(config.table).upsert(batch, { onConflict: config.onConflict });
      if (error) throw error;
      totalInserted += batch.length;
    }

    return res.status(200).json({
      status: "ok",
      source,
      inserted: totalInserted,
      skipped,
      purged: !!purge,
    });
  } catch (err) {
    console.error("Analytics import error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};
