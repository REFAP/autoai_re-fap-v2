// /pages/api/webhook/orientation.js
// Reçoit les orientations depuis le CRM WordPress (appels, SMS, emails)
// Crée un centre_assignment avec le bon canal

import { createClient } from "@supabase/supabase-js";

const WEBHOOK_SECRET = process.env.REFAP_WEBHOOK_SECRET || "refap_wh_2026_prod";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secret = req.headers["x-webhook-secret"] || req.body?.webhook_secret;
  if (secret !== WEBHOOK_SECRET) return res.status(401).json({ error: "Invalid secret" });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Config manquante" });

  try {
    const d = req.body;

    // canal: PHONE, SMS, EMAIL
    const validChannels = ["PHONE", "SMS", "EMAIL", "HUMAN"];
    const channel = validChannels.includes(d.channel) ? d.channel : "HUMAN";

    // Résoudre centre_code → centre_id
    // Le CRM envoie "cc_thiais", "cc_lambres", etc.
    let centreId = null;
    let centreName = null;
    let centreType = null;

    if (d.oriented_center_code) {
      // D'abord chercher dans centre_code_map
      const { data: mapped } = await supabase
        .from("centre_code_map")
        .select("centre_id")
        .eq("crm_code", d.oriented_center_code)
        .limit(1);

      if (mapped && mapped.length > 0) {
        centreId = mapped[0].centre_id;
      } else {
        // Fallback: extraire la ville du code et chercher
        const cityPart = d.oriented_center_code
          .replace("cc_", "")
          .replace(/_/g, " ");

        const { data: cityMatch } = await supabase
          .from("centres")
          .select("id, name, centre_type")
          .ilike("city", `%${cityPart}%`)
          .eq("status", "ACTIVE")
          .limit(1);

        if (cityMatch && cityMatch.length > 0) {
          centreId = cityMatch[0].id;
          centreName = cityMatch[0].name;
          centreType = cityMatch[0].centre_type;

          // Auto-seed le mapping pour la prochaine fois
          await supabase.from("centre_code_map").upsert({
            crm_code: d.oriented_center_code,
            centre_id: centreId,
          });
        }
      }

      // Récupérer le nom si on a l'ID
      if (centreId && !centreName) {
        const { data: c } = await supabase
          .from("centres")
          .select("name, centre_type")
          .eq("id", centreId)
          .limit(1);
        if (c && c.length > 0) {
          centreName = c[0].name;
          centreType = c[0].centre_type;
        }
      }
    }

    // Pas de centre = pas d'orientation à logger
    if (!centreId) {
      return res.status(200).json({
        status: "skipped",
        reason: "no matching centre for: " + (d.oriented_center_code || "none"),
      });
    }

    // Mapper oriented_type → centre_type
    const assignedType = d.oriented_type === "cc_equipped" ? "EXPRESS"
      : d.oriented_type === "cc_48h" ? "STANDARD"
      : centreType || "STANDARD";

    // Construire la raison
    let reason = `${channel.toLowerCase()}`;
    if (d.lead_id) reason += ` lead #${d.lead_id}`;
    if (d.oriented_type) reason += ` — ${d.oriented_type}`;
    if (d.notes) reason += ` — ${d.notes.substring(0, 60)}`;

    // INSERT centre_assignments
    const { data: assignment, error } = await supabase
      .from("centre_assignments")
      .insert({
        conversation_id: d.lead_id ? `wp_lead_${d.lead_id}` : null,
        session_id: null,
        assigned_centre_id: centreId,
        assigned_by: channel,
        reason: reason.substring(0, 255),
        user_location_input: d.postal_code || d.phone || null,
        user_dept: d.postal_code ? d.postal_code.substring(0, 2) : null,
        distance_km: null,
        centre_type_assigned: assignedType,
        confidence: 90,
      })
      .select("id")
      .single();

    if (error) throw error;

    return res.status(200).json({
      status: "ok",
      assignment_id: assignment.id,
      channel,
      centre: centreName,
      centre_type: assignedType,
    });

  } catch (err) {
    console.error("Webhook orientation error:", err);
    return res.status(500).json({ error: err.message });
  }
}
