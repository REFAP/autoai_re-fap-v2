// /pages/api/admin/magasins.js
// Dashboard API — Magasins Re-FAP (assignments, prestations, corrélation)
// Compatible Vercel + Supabase

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Config Supabase manquante" });

  const mode = req.query.mode || "internal"; // "internal" ou "cc"
  const period = req.query.period || "30"; // "1", "7", "30"
  const days = parseInt(period) || 30;

  try {
    // 1. KPIs globaux
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: assignments, error: aErr } = await supabase
      .from("centre_assignments")
      .select("id, assigned_centre_id, centre_type_assigned, reason, distance_km, assigned_by, created_at")
      .eq("assigned_by", "CHATBOT")
      .gte("created_at", since);

    if (aErr) throw aErr;

    // 2. Centres (référentiel)
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name, city, postal_code, department, region, centre_type, store_code, cc_code, status")
      .eq("status", "ACTIVE");

    // 3. Conversations count (période)
    const { count: convCount } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);

    // 4. Prestations (si dispo)
    const { data: prestations } = await supabase
      .from("prestations_weekly")
      .select("store_code, qty_week, ca_ht_week, marge_week, week_start")
      .gte("week_start", new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));

    // 5. CRM Leads
    const { data: crmLeads, error: crmErr } = await supabase
      .from("crm_leads")
      .select("id, assigned_centre_id, source, source_page, contact_mode, chatbot_cid, utm_source, created_at")
      .gte("created_at", since);

    // === BUILD RESPONSE ===
    const centreMap = {};
    for (const c of centres || []) {
      centreMap[c.id] = c;
    }

    // Agrégation par magasin (assignments)
    const magasinStats = {};
    for (const a of assignments || []) {
      const c = centreMap[a.assigned_centre_id];
      if (!c) continue;
      const key = c.id;
      if (!magasinStats[key]) {
        magasinStats[key] = {
          name: c.name,
          city: c.city,
          postal_code: c.postal_code,
          department: c.department,
          region: c.region,
          type: c.centre_type === "EXPRESS" ? "EQUIPE" : "DEPOT",
          store_code: c.store_code,
          assignments: 0,
          leads: 0,
          leads_chatbot: 0,
          leads_meta: 0,
          avg_distance_km: 0,
          distances: [],
          reasons: {},
        };
      }
      magasinStats[key].assignments++;
      if (a.distance_km) magasinStats[key].distances.push(parseFloat(a.distance_km));
      const r = a.reason || "inconnu";
      magasinStats[key].reasons[r] = (magasinStats[key].reasons[r] || 0) + 1;
    }

    // Agrégation leads CRM par magasin
    for (const l of crmLeads || []) {
      const c = l.assigned_centre_id ? centreMap[l.assigned_centre_id] : null;
      if (!c) continue;
      const key = c.id;
      if (!magasinStats[key]) {
        magasinStats[key] = {
          name: c.name,
          city: c.city,
          postal_code: c.postal_code,
          department: c.department,
          region: c.region,
          type: c.centre_type === "EXPRESS" ? "EQUIPE" : "DEPOT",
          store_code: c.store_code,
          assignments: 0,
          leads: 0,
          leads_chatbot: 0,
          leads_meta: 0,
          avg_distance_km: 0,
          distances: [],
          reasons: {},
        };
      }
      magasinStats[key].leads++;
      if (l.chatbot_cid) magasinStats[key].leads_chatbot++;
      if (l.utm_source === "meta") magasinStats[key].leads_meta++;
    }

    // Calcul distance moyenne
    for (const s of Object.values(magasinStats)) {
      if (s.distances.length > 0) {
        s.avg_distance_km = Math.round(s.distances.reduce((a, b) => a + b, 0) / s.distances.length);
      }
      delete s.distances;
    }

    // Agrégation prestations par store_code
    const prestaByStore = {};
    for (const p of prestations || []) {
      if (!p.store_code) continue;
      if (!prestaByStore[p.store_code]) {
        prestaByStore[p.store_code] = { qty: 0, ca_ht: 0, marge: 0 };
      }
      prestaByStore[p.store_code].qty += p.qty_week || 0;
      prestaByStore[p.store_code].ca_ht += parseFloat(p.ca_ht_week) || 0;
      prestaByStore[p.store_code].marge += parseFloat(p.marge_week) || 0;
    }

    // Top magasins (trié par assignments)
    let topMagasins = Object.values(magasinStats)
      .sort((a, b) => b.assignments - a.assignments);

    // Enrichir avec prestations
    for (const m of topMagasins) {
      if (m.store_code && prestaByStore[m.store_code]) {
        m.prestations = prestaByStore[m.store_code];
      }
    }

    // Split EQUIPE vs DEPOT
    const equipeCount = (assignments || []).filter(a => {
      const c = centreMap[a.assigned_centre_id];
      return c?.centre_type === "EXPRESS";
    }).length;
    const depotCount = (assignments || []).length - equipeCount;

    // KPIs
    const totalLeads = (crmLeads || []).length;
    const leadsChatbot = (crmLeads || []).filter(l => l.chatbot_cid).length;
    const leadsMeta = (crmLeads || []).filter(l => l.utm_source === "meta").length;

    const kpis = {
      period_days: days,
      total_assignments: (assignments || []).length,
      total_conversations: convCount || 0,
      total_leads: totalLeads,
      leads_chatbot: leadsChatbot,
      leads_meta: leadsMeta,
      equipe: equipeCount,
      depot: depotCount,
      taux_orientation: convCount > 0 ? Math.round(100 * (assignments || []).length / convCount) : 0,
    };

    // Mode CC : on filtre les données sensibles
    if (mode === "cc") {
      topMagasins = topMagasins.map(m => ({
        name: m.name,
        city: m.city,
        type: m.type,
        assignments: m.assignments,
        leads: m.leads,
        prestations: m.prestations || null,
      }));
      return res.status(200).json({
        mode: "cc",
        kpis: {
          period_days: kpis.period_days,
          total_assignments: kpis.total_assignments,
          total_leads: kpis.total_leads,
          equipe: kpis.equipe,
          depot: kpis.depot,
        },
        magasins: topMagasins,
      });
    }

    // Mode interne : tout
    return res.status(200).json({
      mode: "internal",
      kpis,
      magasins: topMagasins,
    });

  } catch (err) {
    console.error("Dashboard magasins error:", err);
    return res.status(500).json({ error: err.message });
  }
}
