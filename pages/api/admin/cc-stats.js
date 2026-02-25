// /pages/api/admin/cc-stats.js
// Carter-Cash ventes & marges — API endpoint dédié

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_DASHBOARD_TOKEN || "re-fap-2026-dash";

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim() || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token invalide" });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase non configuré" });

  try {
    const [ventes, marges, exercice, snapshots, centres] = await Promise.all([
      supabase.from("cc_ventes_mensuelles").select("*").order("mois"),
      supabase.from("cc_marges_mensuelles").select("*").order("mois"),
      supabase.from("cc_marges_exercice").select("*").eq("exercice", "oct25-fev26"),
      supabase.from("cc_snapshots_journaliers").select("*").order("date_snapshot"),
      supabase.from("cc_centres").select("*").eq("actif", true),
    ]);

    if (ventes.error) throw ventes.error;
    if (marges.error) throw marges.error;
    if (exercice.error) throw exercice.error;
    if (snapshots.error) throw snapshots.error;
    if (centres.error) throw centres.error;

    return res.status(200).json({
      ventes: ventes.data,
      marges: marges.data,
      exercice: exercice.data,
      snapshots: snapshots.data,
      centres: centres.data,
    });
  } catch (err) {
    console.error("CC stats error:", err);
    return res.status(500).json({ error: err.message });
  }
}
