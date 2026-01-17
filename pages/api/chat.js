// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 3.0 (convergence forcée)

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// SYSTEM PROMPT FAPEXPERT V3 — CONVERGENT
// ============================================================
const SYSTEM_PROMPT = `
Tu es FAPexpert, assistant Re-FAP.

OBJECTIF
Comprendre rapidement un problème de Filtre à Particules (FAP) et guider l'utilisateur vers une solution concrète.

RÈGLE MAJEURE
Tu ne poses PAS de questions indéfiniment.
Dès que les éléments clés sont présents, tu DOIS proposer une action claire.

COMPORTEMENT
- Maximum 2 questions consécutives sans proposition.
- Dès que voyant + perte de puissance OU répétition de symptômes → convergence.
- Tu peux reformuler brièvement ce que tu as compris AVANT de proposer une action.
- Ton ton est direct, rassurant, orienté solution.

INTERDITS
- Interrogatoire sans fin.
- Jargon technique inutile.
- Listes longues.
- Diagnostic flou sans action.

FORMAT DE RÉPONSE
- 2 phrases max.
- 1 question max OU 1 proposition claire (diagnostic / RDV / centre).

DATA (OBLIGATOIRE)
Ajoute TOUJOURS en dernière ligne :
DATA: {"symptome":"<enum>","codes":[],"intention":"<enum>","urgence":"<enum>","vehicule":<string|null>,"next_best_action":"<enum>"}

Enums :
symptome : voyant_fap | perte_puissance | mode_degrade | regeneration_impossible | autre | inconnu
intention : diagnostic | devis | rdv | info_generale | urgence | inconnu
urgence : haute | moyenne | basse | inconnue
next_best_action : poser_question | proposer_diagnostic | proposer_rdv | clore
`;

// ============================================================
// SUPABASE
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// HELPERS DATA
// ============================================================
const DEFAULT_DATA = {
  symptome: "inconnu",
  codes: [],
  intention: "inconnu",
  urgence: "inconnue",
  vehicule: null,
  next_best_action: "poser_question",
};

function normalize(reply) {
  return reply.replace(/([^\n])\s*DATA:\s*\{/g, "$1\nDATA: {");
}

function extractData(reply) {
  const n = normalize(reply);
  const m = n.match(/\nDATA:\s*(\{[\s\S]*\})$/);
  if (!m) return DEFAULT_DATA;
  try {
    return JSON.parse(m[1]);
  } catch {
    return DEFAULT_DATA;
  }
}

function cleanForUI(reply) {
  const n = normalize(reply);
  const idx = n.indexOf("\nDATA:");
  return idx === -1 ? n.trim() : n.slice(0, idx).trim();
}

// ============================================================
// API HANDLER
// ============================================================
export default async function handler(req, res) {
  // --- Auth cookie ---
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  const secret = process.env.CHAT_API_TOKEN;
  const cookie = req.headers.cookie || "";
  const found = cookie.split(";").find(c => c.trim().startsWith(cookieName + "="));
  if (!found) return res.status(401).json({ error: "Unauthorized" });

  const value = decodeURIComponent(found.split("=")[1]);
  const [nonce, sig] = value.split(".");
  const expected = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  if (sig !== expected) return res.status(401).json({ error: "Unauthorized" });

  if (req.method !== "POST") return res.status(405).end();

  const { message, session_id, history = [] } = req.body;
  if (!message || !session_id) return res.status(400).end();

  // --- Conversation ---
  const { data: conv } = await supabase
    .from("conversations")
    .upsert({ session_id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id" })
    .select("id")
    .single();

  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: "user",
    content: message,
  });

  // --- Build prompt ---
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  history.forEach(m => {
    messages.push({
      role: m.role,
      content: m.raw || m.content,
    });
  });

  messages.push({ role: "user", content: message });

  // --- Mistral ---
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      messages,
      temperature: 0.3,
      max_tokens: 160,
    }),
  });

  const j = await r.json();
  const replyFull = j.choices?.[0]?.message?.content || "Je te propose un diagnostic FAP pour avancer.";
  const replyClean = cleanForUI(replyFull);
  const extracted = extractData(replyFull);

  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: "assistant",
    content: replyFull,
  });

  return res.status(200).json({
    reply: replyClean,
    reply_full: replyFull,
    extracted_data: extracted,
  });
}
