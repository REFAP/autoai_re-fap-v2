// /pages/api/admin/analytics-data.js
import { createClient } from "@supabase/supabase-js";

const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function dateDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

function aggregateByDate(rows, fields) {
  const map = {};
  for (const row of rows) {
    const d = row.date;
    if (!map[d]) { map[d] = { date: d }; for (const f of fields) map[d][f] = 0; }
    for (const f of fields) map[d][f] += Number(row[f]) || 0;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function applyLag(signalByDate, salesByDate, lag) {
  const signalVals = [], salesVals = [];
  for (const d of Object.keys(salesByDate).sort()) {
    const sd = new Date(new Date(d).getTime() - lag * 86400000).toISOString().split("T")[0];
    if (signalByDate[sd] !== undefined && salesByDate[d] !== undefined) {
      signalVals.push(signalByDate[sd]);
      salesVals.push(salesByDate[d]);
    }
  }
  return { signalVals, salesVals, correlation: pearson(signalVals, salesVals) };
}

const CENTRES_LABELS = {
  "801": "Thiais (94)",
  "065": "Lambres (59)",
  "003": "Villeneuve d'Ascq (59)",
  "006": "Sarcelles (95)",
  "autres": "Autres CC",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "Token invalide" });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase non configuré" });

  try {
    const days = parseInt(req.query.days) || 30;
    const since = dateDaysAgo(days);

    const [
      gscMainRes, gscCcRes, ytRes, tiktokRes, metaRes, emailRes,
      ventesRes, ventesTotalRes, margesRes,
      leadsRes, chatbotRes,
    ] = await Promise.all([
      supabase.from("analytics_gsc").select("*").eq("source", "refap-main").gte("date", since).order("date"),
      supabase.from("analytics_gsc").select("*").eq("source", "refap-cc").gte("date", since).order("date"),
      supabase.from("analytics_youtube").select("*").gte("date", since).order("date"),
      supabase.from("analytics_tiktok").select("*").gte("date", since).order("date"),
      supabase.from("analytics_meta").select("*").gte("date", since).order("date"),
      supabase.from("analytics_email").select("*").gte("date", since).order("date"),
      supabase.from("cc_ventes_mensuelles").select("*").neq("code_centre", "total").order("mois"),
      supabase.from("cc_ventes_mensuelles").select("mois, ca_ht").eq("code_centre", "total"),
      supabase.from("cc_marges_mensuelles").select("*").order("mois"),
      supabase.from("crm_leads").select("id, created_at").gte("created_at", since + "T00:00:00"),
      supabase.from("messages").select("id, conversation_id, created_at").gte("created_at", since + "T00:00:00").order("created_at"),
    ]);

    const gscMain = gscMainRes.data || [];
    const gscCc   = gscCcRes.data   || [];
    const yt      = ytRes.data      || [];
    const tiktok  = tiktokRes.data  || [];
    const meta    = metaRes.data    || [];
    const email   = emailRes.data   || [];
    const ventes  = ventesRes.data  || [];
    const leads   = leadsRes.data   || [];
    const chatbot = chatbotRes.data || [];

    // CA global par mois (lignes total)
    const caGlobal = {};
    for (const r of ventesTotalRes.data || []) caGlobal[r.mois] = Number(r.ca_ht) || 0;

    // Loyer proraté par mois+centre
    const loyerMap = {};
    for (const m of margesRes.data || []) loyerMap[`${m.mois}_${m.code_centre}`] = Number(m.loyer_prorate) || 0;

    // ─── FAP total par mois (pour prorata CA) ───
    const fapTotalParMois = {};
    for (const v of ventes) {
      fapTotalParMois[v.mois] = (fapTotalParMois[v.mois] || 0) + (Number(v.nb_fap) || 0);
    }

    // ─── CC rows enrichis avec CA prorata ───
    const cc = ventes.map(v => {
      const fapTotal = fapTotalParMois[v.mois] || 1;
      const ratio    = (Number(v.nb_fap) || 0) / fapTotal;
      const caMois   = caGlobal[v.mois] || 0;
      return {
        date:       v.mois + "-01",
        mois:       v.mois,
        magasin:    CENTRES_LABELS[v.code_centre] || v.code_centre,
        code_centre: v.code_centre,
        ventes_fap: Number(v.nb_fap) || 0,
        ca_fap:     Math.round(caMois * ratio * 100) / 100,
        marge:      Math.round((caMois * ratio - (loyerMap[`${v.mois}_${v.code_centre}`] || 0)) * 100) / 100,
      };
    });

    // ─── GSC ───
    function computeGscTotals(rows) {
      const t = { clicks: 0, impressions: 0, avgPosition: 0 };
      for (const r of rows) { t.clicks += r.clicks || 0; t.impressions += r.impressions || 0; t.avgPosition += Number(r.position) || 0; }
      if (rows.length) t.avgPosition = Math.round((t.avgPosition / rows.length) * 10) / 10;
      t.ctr = t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0;
      return t;
    }
    const gscMainDaily = aggregateByDate(gscMain, ["clicks", "impressions"]);
    const gscCcDaily   = aggregateByDate(gscCc,   ["clicks", "impressions"]);
    const gscMainTotals = computeGscTotals(gscMain);
    const gscCcTotals   = computeGscTotals(gscCc);

    // ─── YouTube ───
    const ytDaily  = aggregateByDate(yt, ["views", "watch_time_hours", "likes", "shares"]);
    const ytTotals = { views: 0, watchTimeH: 0, likes: 0, shares: 0, subscribers: 0 };
    for (const r of yt) { ytTotals.views += r.views || 0; ytTotals.watchTimeH += Number(r.watch_time_hours) || 0; ytTotals.subscribers += r.subscribers_gained || 0; }

    // ─── TikTok ───
    const tiktokDaily  = aggregateByDate(tiktok, ["views", "reach", "likes"]);
    const tiktokTotals = { views: 0, reach: 0, likes: 0, followers: 0 };
    for (const r of tiktok) { tiktokTotals.views += r.views || 0; tiktokTotals.reach += r.reach || 0; tiktokTotals.followers = Math.max(tiktokTotals.followers, r.followers || 0); }

    // ─── Meta ───
    const metaDaily  = aggregateByDate(meta, ["reach_organic", "reach_paid", "engagement", "impressions", "clicks", "spend"]);
    const metaTotals = { reachOrganic: 0, reachPaid: 0, engagement: 0, spend: 0 };
    for (const r of meta) { metaTotals.reachOrganic += r.reach_organic || 0; metaTotals.reachPaid += r.reach_paid || 0; metaTotals.engagement += r.engagement || 0; metaTotals.spend += Number(r.spend) || 0; }
    metaTotals.spend = Math.round(metaTotals.spend * 100) / 100;

    // ─── Email ───
    const emailDaily  = aggregateByDate(email, ["sends", "opens", "clicks"]);
    const emailTotals = { sends: 0, opens: 0, clicks: 0, avgOpenRate: 0, avgClickRate: 0 };
    for (const r of email) { emailTotals.sends += r.sends || 0; emailTotals.opens += r.opens || 0; emailTotals.clicks += r.clicks || 0; }
    emailTotals.avgOpenRate  = emailTotals.sends > 0 ? Math.round((emailTotals.opens  / emailTotals.sends) * 10000) / 100 : 0;
    emailTotals.avgClickRate = emailTotals.sends > 0 ? Math.round((emailTotals.clicks / emailTotals.sends) * 10000) / 100 : 0;

    // ─── CC totaux ───
    const ccDaily  = aggregateByDate(cc, ["ventes_fap", "ca_fap", "marge"]);
    const ccTotals = { ventesFap: 0, caFap: 0, marge: 0, panierMoyen: 0 };
    for (const r of cc) { ccTotals.ventesFap += r.ventes_fap; ccTotals.caFap += r.ca_fap; ccTotals.marge += r.marge; }
    ccTotals.caFap       = Math.round(ccTotals.caFap * 100) / 100;
    ccTotals.marge       = Math.round(ccTotals.marge * 100) / 100;
    ccTotals.panierMoyen = ccTotals.ventesFap > 0 ? Math.round((ccTotals.caFap / ccTotals.ventesFap) * 100) / 100 : 0;

    // ─── CC par magasin ───
    const ccByMagasin = {};
    for (const r of cc) {
      if (!ccByMagasin[r.magasin]) ccByMagasin[r.magasin] = { ventes_fap: 0, ca_fap: 0, marge: 0 };
      ccByMagasin[r.magasin].ventes_fap += r.ventes_fap;
      ccByMagasin[r.magasin].ca_fap     += r.ca_fap;
      ccByMagasin[r.magasin].marge      += r.marge;
    }
    const ccMagasins = Object.entries(ccByMagasin)
      .map(([mag, d]) => ({
        magasin:      mag,
        ventes_fap:   d.ventes_fap,
        ca_fap:       Math.round(d.ca_fap * 100) / 100,
        marge:        Math.round(d.marge * 100) / 100,
        panier_moyen: d.ventes_fap > 0 ? Math.round((d.ca_fap / d.ventes_fap) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.ventes_fap - a.ventes_fap);

    // ─── CC mensuel ───
    const ccMonthlyMap = {};
    for (const r of cc) {
      if (!ccMonthlyMap[r.mois]) ccMonthlyMap[r.mois] = {};
      if (!ccMonthlyMap[r.mois][r.magasin]) ccMonthlyMap[r.mois][r.magasin] = { ventes: 0, ca: 0, marge: 0 };
      ccMonthlyMap[r.mois][r.magasin].ventes += r.ventes_fap;
      ccMonthlyMap[r.mois][r.magasin].ca     += r.ca_fap;
      ccMonthlyMap[r.mois][r.magasin].marge  += r.marge;
    }
    const ccMonthly = Object.entries(ccMonthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stores]) => {
        const storeArr = Object.entries(stores)
          .map(([mag, d]) => ({ magasin: mag, ventes: d.ventes, ca: Math.round(d.ca * 100) / 100, marge: Math.round(d.marge * 100) / 100 }))
          .sort((a, b) => b.ventes - a.ventes);
        return {
          month,
          stores: storeArr,
          totalVentes: storeArr.reduce((s, d) => s + d.ventes, 0),
          totalCa:     Math.round((caGlobal[month] || 0) * 100) / 100,
          totalMarge:  Math.round(storeArr.reduce((s, d) => s + d.marge, 0) * 100) / 100,
        };
      });

    let margeCum = 0;
    const ccMargeCumulative = ccMonthly.map(m => {
      margeCum += m.totalMarge;
      return { month: m.month, marge_cum: Math.round(margeCum * 100) / 100 };
    });

    // ─── Leads ───
    const leadsDaily = {};
    for (const l of leads) { const d = String(l.created_at).split("T")[0]; leadsDaily[d] = (leadsDaily[d] || 0) + 1; }

    // ─── Chatbot ───
    const chatbotConvByDay = {};
    const seenConvs = new Set();
    for (const m of chatbot) {
      if (seenConvs.has(m.conversation_id)) continue;
      seenConvs.add(m.conversation_id);
      const d = String(m.created_at).replace(" ", "T").split("T")[0];
      chatbotConvByDay[d] = (chatbotConvByDay[d] || 0) + 1;
    }

    // ─── Corrélations ───
    const salesByDate = {};
    for (const r of ccDaily) salesByDate[r.date] = r.ventes_fap;

    const gscMainSignal = {}; for (const r of gscMainDaily) gscMainSignal[r.date] = r.clicks;
    const gscCcSignal   = {}; for (const r of gscCcDaily)   gscCcSignal[r.date]   = r.clicks;
    const ytSignal      = {}; for (const r of ytDaily)      ytSignal[r.date]      = r.views;
    const tiktokSignal  = {}; for (const r of tiktokDaily)  tiktokSignal[r.date]  = r.views;
    const metaSignal    = {}; for (const r of metaDaily)    metaSignal[r.date]    = (r.reach_organic || 0) + (r.reach_paid || 0);
    const emailSignal   = {}; for (const r of emailDaily)   emailSignal[r.date]   = r.clicks;

    const rawCorr = {
      gsc_main: applyLag(gscMainSignal,    salesByDate, 3),
      gsc_cc:   applyLag(gscCcSignal,      salesByDate, 3),
      youtube:  applyLag(ytSignal,         salesByDate, 5),
      tiktok:   applyLag(tiktokSignal,     salesByDate, 5),
      meta:     applyLag(metaSignal,       salesByDate, 5),
      email:    applyLag(emailSignal,      salesByDate, 3),
      leads:    applyLag(leadsDaily,       salesByDate, 1),
      chatbot:  applyLag(chatbotConvByDay, salesByDate, 1),
    };
    const correlations = {};
    for (const [k, v] of Object.entries(rawCorr)) correlations[k] = { correlation: Math.round(v.correlation * 1000) / 1000, dataPoints: v.signalVals.length };

    // ─── Attribution ───
    const volumes = {
      gsc_main: gscMainTotals.clicks, gsc_cc: gscCcTotals.clicks,
      youtube: ytTotals.views, tiktok: tiktokTotals.views,
      meta: metaTotals.reachOrganic + metaTotals.reachPaid,
      email: emailTotals.clicks, leads: leads.length, chatbot: seenConvs.size,
    };
    const maxVol = Math.max(...Object.values(volumes), 1);
    const attribution = {};
    let attrTotal = 0;
    for (const [k, v] of Object.entries(correlations)) { const s = Math.max(0, v.correlation) * (volumes[k] / maxVol); attribution[k] = s; attrTotal += s; }
    for (const k of Object.keys(attribution)) attribution[k] = attrTotal > 0 ? Math.round((attribution[k] / attrTotal) * 1000) / 10 : 0;

    // ─── Overlay ───
    const allDates = new Set([
      ...gscMainDaily.map(r => r.date), ...gscCcDaily.map(r => r.date),
      ...ytDaily.map(r => r.date), ...ccDaily.map(r => r.date),
      ...Object.keys(leadsDaily), ...Object.keys(chatbotConvByDay),
    ]);
    const overlay = [...allDates].sort().map(d => ({
      date: d,
      ventes_fap:      salesByDate[d]         || 0,
      gsc_main_clicks: gscMainSignal[d]        || 0,
      gsc_cc_clicks:   gscCcSignal[d]          || 0,
      yt_views:        ytSignal[d]             || 0,
      meta_reach:      metaSignal[d]           || 0,
      leads:           leadsDaily[d]           || 0,
      chatbot:         chatbotConvByDay[d]     || 0,
    }));

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      days,
      totals: {
        gsc_main: gscMainTotals, gsc_cc: gscCcTotals,
        youtube: ytTotals, tiktok: tiktokTotals,
        meta: metaTotals, email: emailTotals, cc: ccTotals,
        leads: { total: leads.length },
        chatbot: { conversations: seenConvs.size },
      },
      daily: { gsc_main: gscMainDaily, gsc_cc: gscCcDaily, youtube: ytDaily, tiktok: tiktokDaily, meta: metaDaily, email: emailDaily, cc: ccDaily },
      ccMagasins, ccMonthly, ccMargeCumulative,
      correlations, attribution, overlay,
    });

  } catch (err) {
    console.error("Analytics data error:", err);
    return res.status(500).json({ error: err.message });
  }
}
