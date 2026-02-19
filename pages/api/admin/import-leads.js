// /pages/api/admin/import-leads.js
// Import bulk des leads WordPress → Supabase crm_leads
// Usage: POST avec JSON array des leads
// Sécurisé par clé admin

import { createClient } from "@supabase/supabase-js";

const ADMIN_KEY = "refap2026admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Attribution par source_page slug uniquement (pas de chatbot_cid en bulk car historique)
async function findCentreBySlug(supabase, sourcePage, centreCache) {
  if (!sourcePage || !sourcePage.startsWith("centre-")) return null;

  // Cache pour ne pas requêter 1988 fois
  if (centreCache[sourcePage] !== undefined) return centreCache[sourcePage];

  const slug = "centre-re-fap-" + sourcePage.replace("centre-", "");
  const { data } = await supabase
    .from("centres")
    .select("id, name, centre_type")
    .eq("page_slug", slug)
    .eq("status", "ACTIVE")
    .limit(1);

  if (data && data.length > 0) {
    centreCache[sourcePage] = { centre: data[0], reason: `page centre: ${sourcePage}` };
    return centreCache[sourcePage];
  }

  // Fallback: ville dans le slug
  const cityPart = sourcePage.replace("centre-", "").replace(/-/g, " ");
  const { data: cityMatch } = await supabase
    .from("centres")
    .select("id, name, centre_type")
    .ilike("city", `%${cityPart}%`)
    .eq("status", "ACTIVE")
    .limit(1);

  if (cityMatch && cityMatch.length > 0) {
    centreCache[sourcePage] = { centre: cityMatch[0], reason: `page centre (city): ${sourcePage}` };
    return centreCache[sourcePage];
  }

  centreCache[sourcePage] = null;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const auth = req.headers["x-admin-key"] || req.body?.admin_key;
  if (auth !== ADMIN_KEY) return res.status(401).json({ error: "Invalid key" });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Config manquante" });

  const leads = req.body?.leads;
  if (!Array.isArray(leads)) return res.status(400).json({ error: "leads[] attendu" });

  const centreCache = {};
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let attributed = 0;

  // Process par batch de 50
  for (let i = 0; i < leads.length; i += 50) {
    const batch = leads.slice(i, i + 50);
    const rows = [];

    for (const d of batch) {
      // Skip si pas d'id WordPress
      if (!d.id) { skipped++; continue; }

      // Dédoublonnage
      const { data: existing } = await supabase
        .from("crm_leads")
        .select("id")
        .eq("wp_lead_id", parseInt(d.id))
        .limit(1);

      if (existing && existing.length > 0) { skipped++; continue; }

      // Attribution
      const match = await findCentreBySlug(supabase, d.source_page, centreCache);
      if (match) attributed++;

      rows.push({
        wp_lead_id: parseInt(d.id),
        firstname: d.firstname || null,
        lastname: d.lastname || null,
        email: d.email || null,
        phone: d.phone || null,
        postal_code: d.postal_code || null,
        vehicle: d.vehicle || null,
        problem: d.problem || null,
        service_type: d.service_type || null,
        message: d.message || null,
        source: d.source || null,
        source_page: d.source_page || null,
        contact_mode: d.contact_mode || null,
        form_type: d.form_type || null,
        chatbot_cid: d.chatbot_cid || null,
        utm_source: d.utm_source || null,
        utm_medium: d.utm_medium || null,
        utm_campaign: d.utm_campaign || null,
        utm_content: d.utm_content || null,
        fault_code: d.fault_code || null,
        mileage: d.mileage || null,
        symptoms: d.symptoms || null,
        competitor_price: d.competitor_price || null,
        vehicle_status: d.vehicle_status || null,
        status: d.status || "nouveau",
        assigned_centre_id: match?.centre?.id || null,
        created_at: d.created_at || new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("crm_leads").insert(rows);
      if (error) {
        console.error("Batch error:", error);
        errors += rows.length;
      } else {
        imported += rows.length;
      }
    }
  }

  return res.status(200).json({
    status: "done",
    total: leads.length,
    imported,
    skipped,
    errors,
    attributed,
  });
}
