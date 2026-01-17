// /pages/api/chat.js
import { createClient } from "@supabase/supabase-js";

function pickMeta(meta = {}) {
  // ✅ whitelist : uniquement des champs "safe" (pas d'id, pas de created_at)
  return {
    page_url: meta.page_url ?? null,
    page_slug: meta.page_slug ?? null,
    page_type: meta.page_type ?? null,

    utm_source: meta.utm_source ?? null,
    utm_medium: meta.utm_medium ?? null,
    utm_campaign: meta.utm_campaign ?? null,
    utm_content: meta.utm_content ?? null,
    utm_term: meta.utm_term ?? null,

    referrer: meta.referrer ?? null,
    user_agent: meta.user_agent ?? null,
    ip_hash: meta.ip_hash ?? null,
  };
}

async function callMistral({ apiKey, model, messages }) {
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Mistral ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral returned empty content");
  return String(content);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    // ✅ Vars EXACTES (comme sur ton screenshot Vercel)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const mistralKey = process.env.MISTRAL_API_KEY;
    const mistralModel = process.env.MISTRAL_MODEL || "mistral-large-latest";

    if (!supabaseUrl) return res.status(500).json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" });
    if (!serviceKey) return res.status(500).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    if (!mistralKey) return res.status(500).json({ error: "Missing MISTRAL_API_KEY" });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = req.body || {};
    const session_id = body.session_id ? String(body.session_id) : "";
    const message = body.message ? String(body.message) : "";
    const meta = body.meta || {};

    if (!session_id) return res.status(400).json({ error: "Missing session_id" });
    if (!message.trim()) return res.status(400).json({ error: "Missing message" });

    // 1) Upsert conversation
    const convoPayload = {
      session_id,
      source: "chatbot",
      last_seen_at: new Date().toISOString(),
      ...pickMeta(meta),
    };

    const { data: convo, error: convoErr } = await supabaseAdmin
      .from("conversations")
      .upsert(convoPayload, { onConflict: "session_id" })
      .select("id")
      .single();

    if (convoErr) {
      console.log("CONVO_UPSERT_ERR", convoErr);
      return res.status(500).json({ error: "Conversation upsert failed", details: convoErr.message });
    }

    const conversation_id = convo?.id;
    if (!conversation_id) return res.status(500).json({ error: "Missing conversation_id after upsert" });

    // 2) Insert message user (role = "user")
    const { error: userMsgErr } = await supabaseAdmin.from("messages").insert({
      conversation_id,
      role: "user",
      content: message,
    });

    if (userMsgErr) {
      console.log("USER_MSG_ERR", userMsgErr);
      return res.status(500).json({ error: "Insert user message failed", details: userMsgErr.message });
    }

    // 3) Load last 20 messages
    const { data: history, error: historyErr } = await supabaseAdmin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (historyErr) {
      console.log("HISTORY_ERR", historyErr);
      return res.status(500).json({ error: "Load history failed", details: historyErr.message });
    }

    // 4) Mistral
    const mistralMessages = (history || []).map((m) => ({
      role: m.role, // IMPORTANT : "user" / "assistant"
      content: m.content,
    }));

    const reply = await callMistral({
      apiKey: mistralKey,
      model: mistralModel,
      messages: mistralMessages,
    });

    // 5) Insert message assistant (role = "assistant")  ✅ (évite ton ancien 23514)
    const { error: botMsgErr } = await supabaseAdmin.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: reply,
    });

    if (botMsgErr) {
      console.log("BOT_MSG_ERR", botMsgErr);
      return res.status(500).json({ error: "Insert assistant message failed", details: botMsgErr.message });
    }

    // 6) Update last_seen_at
    await supabaseAdmin
      .from("conversations")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return res.status(200).json({ reply, conversation_id });
  } catch (e) {
    console.log("API_ERROR", e);
    return res.status(500).json({ error: "Server error", details: e?.message || String(e) });
  }
}
