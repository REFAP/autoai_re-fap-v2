// pages/api/chat.js
import { askModel } from "../../services/mistral.js";
import { extractBotPayload } from "../../lib/fallbacks.js";

export default async function handler(req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || await req.json?.());
    const messages = body?.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages manquants" });
    }
    const raw = await askModel(messages);
    const json = extractBotPayload(raw);
    return res.status(200).json(json);
  } catch (e) {
    console.error("API /chat error:", e);
    return res.status(500).json({ error: "server_error", detail: String(e?.message || e) });
  }
}
