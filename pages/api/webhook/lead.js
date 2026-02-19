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
// Attribution centre : uniquement par source_page ou chatbot_cid
// PAS par code postal (un CP ne signifie pas une orientation)
// ============================================================
async function findCentreFromLead(supabase, data) {
  // 1. Source page = "centre-thiais", "centre-lambres", etc.
  if (data.source_page && data.source_page.startsWith("centre-")) {
    const slug = "centre-re-fap-" + data.source_page.replace("centre-", "");
    const { data: match } = await supabase
      .from("centres")
      .select("id, name, centre_type")
      .eq("page_slug", slug)
      .eq("status", "ACTIVE")
      .limit(1);

    if (match && match.length > 0) {
      return { centre: match[0], reason: `page centre: ${data.source_page}` };
    }

    // Fallback: chercher par ville dans le slug
    const cityPart = data.source_page.replace("centre-", "").replace(/-/g, " ");
    const { data: cityMatch } = await supabase
      .from("centres")
      .select("id, name, centre_type")
      .ilike("city", `%${cityPart}%`)
      .eq("status", "ACTIVE")
      .limit(1);

    if (cityMatch && cityMatch.length > 0) {
      return { centre: cityMatch[0], reason: `page centre (city match): ${data.source_page}` };
    }
  }

  // 2. Chatbot CID → chercher l'attribution existante du chatbot
  if (data.chatbot_cid) {
    const { data: botAssign } = await supabase
      .from("centre_assignments")
      .select("assigned_centre_id, reason")
      .eq("conversation_id", data.chatbot_cid)
      .eq("assigned_by", "CHATBOT")
      .order("created_at", { ascending: false })
      .limit(1);

    if (botAssign && botAssign.length > 0 && botAssign[0].assigned_centre_id) {
      const { data: c } = await supabase
        .from("centres")
        .select("id, name, centre_type")
        .eq("id", botAssign[0].assigned_centre_id)
        .limit(1);

      if (c && c.length > 0) {
        return { centre: c[0], reason: `via chatbot cid: ${data.chatbot_cid}` };
      }
    }
  }

  // 3. Pas d'attribution = lead général (pas d'orientation magasin)
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

    // Attribution centre (source_page ou chatbot_cid uniquement)
    let assignedCentreId = null;
    let assignReason = null;
    const match = await findCentreFromLead(supabase, d);
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

    // PAS d'insert centre_assignments pour les FORM
    // Un formulaire rempli ≠ une orientation chatbot
    // L'attribution est tracée uniquement dans crm_leads.assigned_centre_id

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
