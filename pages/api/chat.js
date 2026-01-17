// /pages/api/chat.js
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

function pickConvoMeta(meta = {}) {
  // ✅ WHITELIST STRICTE = UNIQUEMENT colonnes existantes dans conversations
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

async function callMistral(messages) {
  if (!MISTRAL_API_KEY) throw new Error("Missing MISTRAL_API_KEY");

  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages,
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Mistral error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("Mistral reply empty/invalid");
  return content;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const session_id = body.session_id ? String(body.session_id) : "";
    const userText = body.message ? String(body.message) : "";
    const meta = body.meta || {};

    // ✅ logs utiles (tu les enlèveras après)
    console.log("BODY_KEYS", Object.keys(body));
    console.log("SESSION_ID", session_id);

    if (!session_id) return res.status(400).json({ error: "Missing session_id" });
    if (!userText) return res.status(400).json({ error: "Missing message" });

    // 1) UPSERT conversation (ne JAMAIS passer id/created_at/first_seen_at)
    const convoPayload = {
      session_id,
      source: "chatbot",
      last_seen_at: new Date().toISOString(),
      ...pickConvoMeta(meta),
    };

    const { data: convo, error: upsertError } = await supabaseAdmin
      .from("conversations")
      .upsert(convoPayload, { onConflict: "session_id" })
      .select("id")
      .single();

    if (upsertError) {
      console.log("UPSERT_ERR", upsertError);
      return res.status(500).json({ error: "Conversation upsert failed", details: upsertError.message });
    }

    const conversation_id = convo?.id;
    if (!conversation_id) return res.status(500).json({ error: "Missing conversation_id after upsert" });

    // 2) INSERT user message
    const { error: userInsertError } = await supabaseAdmin.from("messages").insert({
      conversation_id,
      role: "user",
      content: userText,
    });

    if (userInsertError) {
      console.log("USER_INSERT_ERR", userInsertError);
      return res.status(500).json({ error: "Insert user message failed", details: userInsertError.message });
    }

    // 3) Load last 20 messages for context
    const { data: history, error: historyError } = await supabaseAdmin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (historyError) {
      console.log("HISTORY_ERR", historyError);
      return res.status(500).json({ error: "Load history failed", details: historyError.message });
    }

    // 4) Call Mistral
    const assistantReply = await callMistral(history || [{ role: "user", content: userText }]);

    // 5) INSERT bot message
    const { error: botInsertError } = await supabaseAdmin.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: assistantReply,
    });

    if (botInsertError) {
      console.log("BOT_INSERT_ERR", botInsertError);
      return res.status(500).json({ error: "Insert bot message failed", details: botInsertError.message });
    }

    // 6) update last_seen_at (propre)
    await supabaseAdmin
      .from("conversations")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return res.status(200).json({ reply: assistantReply, conversation_id });
  } catch (e) {
    console.log("API_ERROR", e);
    return res.status(500).json({ error: "Server error", details: e?.message || String(e) });
  }
}
