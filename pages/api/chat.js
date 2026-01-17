// /pages/api/chat.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 🔥 Debug clair
    console.log("HAS_SUPABASE_URL", Boolean(supabaseUrl));
    console.log("HAS_SERVICE_KEY", Boolean(serviceKey));

    if (!supabaseUrl) return res.status(500).json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" });
    if (!serviceKey) return res.status(500).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = req.body || {};
    const session_id = body.session_id ? String(body.session_id) : "";
    const message = body.message ? String(body.message) : "";

    if (!session_id) return res.status(400).json({ error: "Missing session_id" });
    if (!message) return res.status(400).json({ error: "Missing message" });

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .upsert(
        {
          session_id,
          source: "chatbot",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "session_id" }
      )
      .select("id, session_id")
      .single();

    if (error) {
      console.log("UPSERT_ERR", error);
      return res.status(500).json({ error: "Upsert failed", details: error.message });
    }

    return res.status(200).json({
      ok: true,
      conversation_id: data.id,
      echo: message,
    });
  } catch (e) {
    console.log("API_ERROR", e);
    return res.status(500).json({ error: "Server error", details: e?.message || String(e) });
  }
}
