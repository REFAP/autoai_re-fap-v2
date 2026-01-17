// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 3.1 (convergence maîtrisée)

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// SYSTEM PROMPT FAPEXPERT V3.1
// ============================================================
const SYSTEM_PROMPT = `
Tu es FAPexpert, assistant Re-FAP.

OBJECTIF
Comprendre un problème de Filtre à Particules (FAP) à partir des mots du client et l’aider à avancer sans jamais conclure trop tôt.

RÈGLES FONDAMENTALES
- Tu ne poses jamais plus d’UNE question par message.
- Tu ne conclus jamais sans faits observables.
- Tu n’emploies jamais : “probablement”, “très probablement”, “il faut”.
- Tu ne mentionnes jamais “régénération forcée”.

GESTION DES MESSAGES COURTS
Si le message est court ou ambigu (ex: “fap”, “fap bouché”, “problème fap”) :
→ Tu DOIS poser UNE question factuelle sur ce qui s’est passé.
→ Tu ne proposes aucune solution à ce stade.

FAITS OBSERVABLES VALIDES
Voyant allumé, perte de puissance, mode dégradé, coupure/reprise après redémarrage, code défaut.

CONVERGENCE
- Tant que tu n’as PAS au moins 2 faits observables, tu continues à poser des questions.
- Dès que 2 faits observables sont présents :
  → Tu reformules brièvement ce que tu as compris.
  → Tu proposes UNE action possible.
  → Tu termines par UNE question de validation.

TON
Calme, direct, rassurant, orienté aide. Pas professoral.

FORMAT
- 2 phrases maximum.
- 1 question maximum.

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
// DATA HELPERS
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
  const i = n.indexOf("\nDATA:");
  return i === -1 ? n.trim() : n.slice(0, i).trim();
}

// ============================================================
// API HANDLER
// ============================================================
export default async function handler(req, res) {
  // ----------------------------------------------------------
  // AUTH COOKIE SIGNÉ
  // ----------------------------------------------------------
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

  // ----------------------------------------------------------
  // CONVERSATION
  // ----------------------------------------------------------
  const { data: conv } = await supabase
    .from("conversations")
    .upsert(
      { session_id, last_seen_at: new Date().toISOString() },
      { onConflict: "session_id" }
    )
    .select("id")
    .single();

  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: "user",
    content: message,
  });

  // ----------------------------------------------------------
  // BUILD PROMPT
  // ----------------------------------------------------------
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  history.forEach(m => {
    messages.push({
      role: m.role,
      content: m.raw || m.content,
    });
  });

  messages.push({ role: "user", content: message });

  // ----------------------------------------------------------
  // MISTRAL
  // ----------------------------------------------------------
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      messages,
      temperature: 0.35,
      max_tokens: 180,
    }),
  });

  const j = await r.json();
  const replyFull =
    j.choices?.[0]?.message?.content ||
    "Dis-moi ce que tu observes exactement sur la voiture.";

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
