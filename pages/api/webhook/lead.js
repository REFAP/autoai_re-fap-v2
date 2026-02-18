// /pages/api/webhook/lead.js
// Reçoit les leads du handler WordPress v3.2 et les insère dans Supabase
// + Attribution centre automatique par code postal
// Sécurisé par clé partagée

import { createClient } from "@supabase/supabase-js";

const WEBHOOK_SECRET = process.env.REFAP_WEBHOOK_SECRET || "refap_wh_2026_prod";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ============================================================
// Matching postal_code → centre le plus proche
// Même logique que le chatbot (département → centres du dept)
// ============================================================
async function findCentreByPostal(supabase, postalCode) {
  if (!postalCode || postalCode.length < 2) return null;

  const dept = postalCode.substring(0, 2);

  // 1. Chercher un EXPRESS dans le département
  const { data: express } = await supabase
    .from("centres")
    .select("id, name, centre_type, postal_code")
    .eq("department", dept)
    .eq("centre_type", "EXPRESS")
    .eq("status", "ACTIVE")
    .limit(1);

  if (express && express.length > 0) return { centre: express[0], reason: "express même département" };

  // 2. Chercher un STANDARD dans le département
  const { data: standard } = await supabase
    .from("centres")
    .select("id, name, centre_type, postal_code")
    .eq("department", dept)
    .eq("status", "ACTIVE")
    .limit(1);

  if (standard && standard.length > 0) return { centre: standard[0], reason: "standard même département" };

  // 3. EXPRESS le plus proche (IDF: 75/77/78/91/92/93/94/95)
  const idfDepts = ["75", "77", "78", "91", "92", "93", "94", "95"];
  if (idfDepts.includes(dept)) {
    const { data: idfExpress } = await supabase
      .from("centres")
      .select("id, name, centre_type, postal_code, department")
      .eq("centre_type", "EXPRESS")
      .eq("status", "ACTIVE")
      .in("department", idfDepts)
      .limit(1);

    if (idfExpress && idfExpress.length > 0) return { centre: idfExpress[0], reason: "express IDF" };
  }

  // 4. HdF: 59/60/62/80/02
  const hdfDepts = ["59", "60", "62", "80", "02"];
  if (hdfDepts.includes(dept)) {
    const { data: hdfExpress } = await supabase
      .from("centres")
      .select("id, name, centre_type, postal_code, department")
      .eq("centre_type", "EXPRESS")
      .eq("status", "ACTIVE")
      .in("department", hdfDepts)
      .limit(1);

    if (hdfExpress && hdfExpress.length > 0) return { centre: hdfExpress[0], reason: "express HdF" };
  }

  // 5. Fallback → STANDARD envoi national
  const { data: fallback } = await supabase
    .from("centres")
    .select("id, name")
    .eq("postal_code", "00000")
    .limit(1);

  if (fallback && fallback.length > 0) return { centre: fallback[0], reason: "envoi national (fallback)" };

  return null;
}

export default async function handler(req, res) {
  // CORS pour WordPress
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Vérifier la clé
  const secret = req.headers["x-webhook-secret"] || req.body?.webhook_secret;
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid secret" });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Config Supabase manquante" });

  try {
    const d = req.body;

    // Dédoublonnage par wp_lead_id
    if (d.wp_lead_id) {
      const { data: existing } = await supabase
        .from("crm_leads")
        .select("id")
        .eq("wp_lead_id", d.wp_lead_id)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(200).json({ status: "duplicate", crm_lead_id: existing[0].id });
      }
    }

    // Attribution centre par postal_code
    let assignedCentreId = null;
    let assignReason = null;
    const match = await findCentreByPostal(supabase, d.postal_code);
    if (match) {
      assignedCentreId = match.centre.id;
      assignReason = match.reason;
    }

    // INSERT crm_leads
    const { data: lead, error: leadErr } = await supabase
      .from("crm_leads")
      .insert({
        wp_lead_id: d.wp_lead_id ? parseInt(d.wp_lead_id) : null,
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
        status: "nouveau",
        assigned_centre_id: assignedCentreId,
        created_at: d.created_at || new Date().toISOString(),
      })
      .select("id")
      .single();

    if (leadErr) throw leadErr;

    // INSERT centre_assignments (assigned_by: FORM)
    if (assignedCentreId && lead) {
      const centreType = match?.centre?.centre_type === "EXPRESS" ? "EXPRESS" : "STANDARD";

      await supabase.from("centre_assignments").insert({
        conversation_id: d.chatbot_cid || null,
        session_id: null,
        assigned_centre_id: assignedCentreId,
        assigned_by: "FORM",
        reason: `form lead #${d.wp_lead_id || "?"} — ${assignReason}`,
        user_location_input: d.postal_code || null,
        user_dept: d.postal_code ? d.postal_code.substring(0, 2) : null,
        distance_km: null,
        centre_type_assigned: centreType,
        confidence: 70,
      });
    }

    return res.status(200).json({
      status: "ok",
      crm_lead_id: lead.id,
      assigned_centre: match ? match.centre.name : null,
      assign_reason: assignReason,
    });

  } catch (err) {
    console.error("Webhook lead error:", err);
    return res.status(500).json({ error: err.message });
  }
}
