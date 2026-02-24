// /pages/api/admin/magasins.js
// Dashboard API — Magasins Re-FAP
// v3.2 — Fix: by_source et operators alimentés pour les garages
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

  const mode = req.query.mode || "internal";
 const period = req.query.period || "30";
const days = period === "24h" ? 1 : parseInt(period) || 30;

  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [
      { data: assignments, error: aErr },
      { data: centres },
      { count: convCount },
      { data: prestations },
      { data: crmLeads },
      { data: garages },
    ] = await Promise.all([
      supabase.from("centre_assignments")
        .select("id, assigned_centre_id, centre_type_assigned, reason, distance_km, assigned_by, operator_name, garage_partenaire_id, garage_name, created_at")
        .gte("created_at", since),
      supabase.from("centres")
        .select("id, name, city, postal_code, department, region, centre_type, store_code, cc_code, status")
        .eq("status", "ACTIVE"),
      supabase.from("conversations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabase.from("prestations_weekly")
        .select("store_code, qty_week, ca_ht_week, marge_week, week_start")
        .gte("week_start", new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)),
      supabase.from("crm_leads")
        .select("id, assigned_centre_id, source, source_page, contact_mode, chatbot_cid, utm_source, created_at")
        .gte("created_at", since),
      supabase.from("garages_partenaires")
        .select("id, nom, reseau, ville, code_postal, email, status")
        .eq("status", "ACTIVE"),
    ]);

    if (aErr) throw aErr;

    const centreMap = {};
    for (const c of centres || []) centreMap[c.id] = c;
    const garageMap = {};
    for (const g of garages || []) garageMap[g.id] = g;

    // CC magasins
    const magasinStats = {};
    function ensureMagasin(centreId) {
      const c = centreMap[centreId];
      if (!c) return null;
      if (!magasinStats[c.id]) {
        magasinStats[c.id] = {
          name: c.name, city: c.city, postal_code: c.postal_code,
          department: c.department, region: c.region,
          type: c.centre_type === "EXPRESS" ? "EQUIPE" : "DEPOT",
          store_code: c.store_code,
          assignments: 0, leads: 0, leads_chatbot: 0, leads_meta: 0,
          avg_distance_km: 0, distances: [], reasons: {}, by_source: {}, operators: {},
        };
      }
      return magasinStats[c.id];
    }

    // Garage stats
    const garageStats = {};
    let totalGarageOrientations = 0;

    // v3.2 — Deux if indépendants : un assignment peut compter dans garage ET dans CC
    for (const a of assignments || []) {

      // Garage — compter si garage_partenaire_id présent
      if (a.garage_partenaire_id) {
        totalGarageOrientations++;
        const g = garageMap[a.garage_partenaire_id];
        const gId = a.garage_partenaire_id;
        if (!garageStats[gId]) {
          garageStats[gId] = {
            id: gId,
            nom: a.garage_name || (g ? g.nom : "Inconnu"),
            reseau: g ? g.reseau : "INDEPENDANT",
            ville: g ? g.ville : null,
            orientations: 0,
            by_source: {},   // ← AJOUT
            operators: {},
          };
        }
        garageStats[gId].orientations++;
        // Source (bot, opérateur, téléphone...)
        const src = a.assigned_by || "UNKNOWN";   // ← AJOUT
        garageStats[gId].by_source[src] = (garageStats[gId].by_source[src] || 0) + 1;  // ← AJOUT
        if (a.operator_name) {
          garageStats[gId].operators[a.operator_name] = (garageStats[gId].operators[a.operator_name] || 0) + 1;
        }
      }

      // CC — compter si assigned_centre_id présent
      if (a.assigned_centre_id) {
        const m = ensureMagasin(a.assigned_centre_id);
        if (m) {
          m.assignments++;
          if (a.distance_km) m.distances.push(parseFloat(a.distance_km));
          const r = a.reason || "inconnu";
          m.reasons[r] = (m.reasons[r] || 0) + 1;
          const src = a.assigned_by || "UNKNOWN";
          m.by_source[src] = (m.by_source[src] || 0) + 1;
          if (a.operator_name) {
            m.operators[a.operator_name] = (m.operators[a.operator_name] || 0) + 1;
          }
        }
      }
    }

    // CRM Leads
    for (const l of crmLeads || []) {
      const m = l.assigned_centre_id ? ensureMagasin(l.assigned_centre_id) : null;
      if (!m) continue;
      m.leads++;
      if (l.chatbot_cid) m.leads_chatbot++;
      if (l.utm_source === "meta") m.leads_meta++;
    }

    // Distance moyenne
    for (const s of Object.values(magasinStats)) {
      if (s.distances.length > 0) {
        s.avg_distance_km = Math.round(s.distances.reduce((a, b) => a + b, 0) / s.distances.length);
      }
      delete s.distances;
    }

    // Prestations
    const prestaByStore = {};
    for (const p of prestations || []) {
      if (!p.store_code) continue;
      if (!prestaByStore[p.store_code]) prestaByStore[p.store_code] = { qty: 0, ca_ht: 0, marge: 0 };
      prestaByStore[p.store_code].qty += p.qty_week || 0;
      prestaByStore[p.store_code].ca_ht += parseFloat(p.ca_ht_week) || 0;
      prestaByStore[p.store_code].marge += parseFloat(p.marge_week) || 0;
    }

    let topMagasins = Object.values(magasinStats).sort((a, b) => b.assignments - a.assignments);
    for (const m of topMagasins) {
      if (m.store_code && prestaByStore[m.store_code]) m.prestations = prestaByStore[m.store_code];
    }

    // Top garages
    const topGarages = Object.values(garageStats).sort((a, b) => b.orientations - a.orientations);
    const garageByReseau = {};
    for (const g of topGarages) {
      garageByReseau[g.reseau] = (garageByReseau[g.reseau] || 0) + g.orientations;
    }

    // KPIs globaux
    const equipeCount = (assignments || []).filter(a => a.assigned_centre_id && centreMap[a.assigned_centre_id]?.centre_type === "EXPRESS").length;
    const depotCount = (assignments || []).filter(a => a.assigned_centre_id && centreMap[a.assigned_centre_id]?.centre_type !== "EXPRESS").length;
    const globalBySource = {};
    for (const a of assignments || []) {
      if (a.assigned_centre_id) {
        const src = a.assigned_by || "UNKNOWN";
        globalBySource[src] = (globalBySource[src] || 0) + 1;
      }
    }

    const kpis = {
      period_days: days,
      total_assignments: equipeCount + depotCount,
      total_garage_orientations: totalGarageOrientations,
      total_all: (assignments || []).length,
      total_conversations: convCount || 0,
      total_leads: (crmLeads || []).length,
      leads_chatbot: (crmLeads || []).filter(l => l.chatbot_cid).length,
      leads_meta: (crmLeads || []).filter(l => l.utm_source === "meta").length,
      equipe: equipeCount,
      depot: depotCount,
      taux_orientation: convCount > 0 ? Math.round(100 * (equipeCount + depotCount) / convCount) : 0,
      by_source: globalBySource,
      garage_by_reseau: garageByReseau,
      total_garages_db: (garages || []).length,
    };

    // Mode CC
    if (mode === "cc") {
      return res.status(200).json({
        mode: "cc",
        kpis: {
          period_days: kpis.period_days,
          total_assignments: kpis.total_assignments,
          total_leads: kpis.total_leads,
          equipe: kpis.equipe,
          depot: kpis.depot,
          by_source: kpis.by_source,
        },
        magasins: topMagasins.map(m => ({
          name: m.name, city: m.city, type: m.type,
          assignments: m.assignments, leads: m.leads,
          by_source: m.by_source,
          prestations: m.prestations || null,
        })),
      });
    }

    return res.status(200).json({ mode: "internal", kpis, magasins: topMagasins, garages: topGarages });

  } catch (err) {
    console.error("Dashboard magasins error:", err);
    return res.status(500).json({ error: err.message });
  }
}
