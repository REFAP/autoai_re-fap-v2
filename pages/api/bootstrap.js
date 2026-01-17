// /pages/api/bootstrap.js
// Génère un cookie signé httpOnly pour authentifier les appels à /api/chat

import crypto from "crypto";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const token = process.env.CHAT_API_TOKEN;
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  const ttl = parseInt(process.env.CHAT_COOKIE_TTL_SECONDS || "86400", 10);

  if (!token) return res.status(500).json({ error: "Server misconfigured" });

  const nonce = crypto.randomBytes(16).toString("hex");
  const sig = crypto.createHmac("sha256", token).update(nonce).digest("hex");
  const value = `${nonce}.${sig}`;

  const isProd = process.env.NODE_ENV === "production";

  // Secure en prod (https), pas en local
  const cookie = [
    `${cookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${ttl}`,
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ ok: true });
}
