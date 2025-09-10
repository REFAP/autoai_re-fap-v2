import { askModel } from "../../services/mistral.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    // GET /api/chat?q=...
    if (req.method === "GET") {
      const q = req.query?.q ?? "";
      const payload = await askModel([{ role: "user", content: String(q) }]);
      return res.status(200).json(payload);
    }

    // Lire le body brut (pas de bodyParser)
    let raw = "";
    await new Promise((r) => { req.on("data", c => raw += c); req.on("end", r); });

    // Parser selon le content-type
    const ct = String(req.headers["content-type"] || "");
    let data = null;
    if (ct.includes("application/json")) {
      try { data = JSON.parse(raw || "{}"); } catch { data = {}; }
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(raw); data = Object.fromEntries(params);
    } else {
      // text/plain ou autre -> message = texte brut
      data = { message: raw };
    }

    // Clés tolérées
    const KEYS = ["message","msg","prompt","q","text","input","content","question"];

    // 1) Si on nous donne directement un historique
    if (Array.isArray(data?.messages)) {
      const payload = await askModel(data.messages);
      return res.status(200).json(payload);
    }

    // 2) Sinon on prend la 1re clé disponible comme message simple
    let message = "";
    for (const k of KEYS) { if (data && data[k]) { message = String(data[k]); break; } }

    const payload = await askModel([{ role: "user", content: message }]);
    return res.status(200).json(payload);
  } catch (e) {
    console.error("[api/chat] error:", e);
    return res.status(500).json({ error: "server_error" });
  }
}