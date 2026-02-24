/**
 * /pages/api/admin/baseline.js
 * Route API — Analyse performance chatbot Mistral vs Déterministe
 */

import { createClient } from "@supabase/supabase-js";

const CUTOVER_DATE = "2026-02-22";
const BASELINE_DAYS = 30;
const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function fetchAll(supabase, table, select, start, end) {
  const results = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table).select(select)
      .gte("updated_at", start).lt("updated_at", end)
      .range(from, from + 999).order("updated_at", { ascending: true });
    if (error || !data?.length) break;
    results.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return results;
}

async function fetchMessages(supabase, start, end) {
  const results = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("messages").select("conversation_id, role, created_at")
      .gte("created_at", start).lt("created_at", end)
      .range(from, from + 999);
    if (error || !data?.length) break;
    results.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return results;
}

function analyse(enrichments, messages) {
  const total = enrichments.length;
  if (!total) return null;

  const turnsByCid = {};
  for (const m of messages) {
    if (m.role === "user") turnsByCid[m.conversation_id] = (turnsByCid[m.conversation_id] || 0) + 1;
  }

  const funnel = { symptome: 0, marque: 0, modele: 0, km: 0, tentatives: 0, ville: 0, cta: 0 };
  const dropoff = { symptome: 0, marque: 0, modele: 0, km: 0, tentatives: 0, ville: 0, cta: 0 };
  const symptomeDist = {}, marqueDist = {};
  let flowComplet = 0;
  const turnsArr = Object.values(turnsByCid);

  for (const e of enrichments) {
    const s = !!e.symptome_principal && e.symptome_principal !== "inconnu";
    const m = !!e.marque;
    const mo = !!e.modele;
    const k = !!e.km;
    const t = !!e.previous_attempts;
    const v = !!(e.ville || e.departement);
    const c = e.outcome === "cta_clicked" || e.a_demande_prix;

    if (s) funnel.symptome++;
    if (m) funnel.marque++;
    if (mo) funnel.modele++;
    if (k) funnel.km++;
    if (t) funnel.tentatives++;
    if (v) funnel.ville++;
    if (c) funnel.cta++;
    if (m && v) flowComplet++;

    if (!s) dropoff.symptome++;
    else if (!m) dropoff.marque++;
    else if (!mo) dropoff.modele++;
    else if (!k) dropoff.km++;
    else if (!t) dropoff.tentatives++;
    else if (!v) dropoff.ville++;
    else dropoff.cta++;

    if (e.symptome_principal) symptomeDist[e.symptome_principal] = (symptomeDist[e.symptome_principal] || 0) + 1;
    if (e.marque) marqueDist[e.marque] = (marqueDist[e.marque] || 0) + 1;
  }

  const avg = (arr) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

  return {
    total,
    turns_avg: avg(turnsArr),
    flow_complet: flowComplet,
    flow_complet_pct: +((flowComplet / total) * 100).toFixed(1),
    funnel: Object.fromEntries(
      Object.entries(funnel).map(([k, v]) => [k, { n: v, pct: +((v / total) * 100).toFixed(1) }])
    ),
    dropoff,
    top_symptomes: Object.entries(symptomeDist).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v]) => ({ label: k, n: v, pct: +((v / total) * 100).toFixed(1) })),
    top_marques: Object.entries(marqueDist).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([k, v]) => ({ label: k, n: v, pct: +((v / total) * 100).toFixed(1) })),
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth par token (même mécanisme que stats.js)
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token invalide" });
  }

  const supabase = getSupabase();
  const cutoverEnd = CUTOVER_DATE + "T00:00:00Z";
  const cutoverStart = new Date(new Date(cutoverEnd).getTime() - BASELINE_DAYS * 86400000).toISOString();
  const now = new Date().toISOString();

  const [baseE, baseM, currE, currM] = await Promise.all([
    fetchAll(supabase, "conversation_enrichments", "*", cutoverStart, cutoverEnd),
    fetchMessages(supabase, cutoverStart, cutoverEnd),
    fetchAll(supabase, "conversation_enrichments", "*", cutoverEnd, now),
    fetchMessages(supabase, cutoverEnd, now),
  ]);

  res.status(200).json({
    generated_at: now,
    cutover: CUTOVER_DATE,
    baseline: {
      label: `Mistral (${BASELINE_DAYS}j avant migration)`,
      period: { start: cutoverStart, end: cutoverEnd },
      metrics: analyse(baseE, baseM),
    },
    current: {
      label: "Déterministe v7.0 (depuis migration)",
      period: { start: cutoverEnd, end: now },
      metrics: analyse(currE, currM),
    },
  });
}
