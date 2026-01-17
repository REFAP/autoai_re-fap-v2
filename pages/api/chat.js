// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 3.3
// - Convergence maîtrisée
// - Override RDV/Devis -> formulaire Re-FAP
// - Anti-boucle : si l'utilisateur donne le CP, on confirme + on stoppe la question

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG : URL formulaire (destination business)
// ============================================================
const FORM_URL = "auto.re-fap.fr/#devis";

// ============================================================
// SYSTEM PROMPT FAPEXPERT V3.3 (triage + pas de renvoi constructeur)
// ============================================================
const SYSTEM_PROMPT = `
Tu es FAPexpert, assistant Re-FAP.

OBJECTIF
Comprendre un problème de Filtre à Particules (FAP) à partir des mots du client et l’aider à avancer sans conclure trop tôt.

RÈGLES FONDAMENTALES
- Tu ne poses jamais plus d’UNE question par message.
- Tu ne conclus jamais sans faits observables.
- Tu n’emploies jamais : “probablement”, “très probablement”, “il faut”.
- Tu ne mentionnes jamais “régénération forcée”.

INTERDICTIONS BUSINESS (TRÈS IMPORTANT)
- Tu n’orientes JAMAIS vers un garage constructeur (Skoda, Peugeot, etc.), ni “garage agréé”, ni promesse “sous 48h”.
- Tu ne proposes JAMAIS d’envoi de coordonnées par SMS.
- Tu ne proposes pas “trouver un garage proche” hors parcours Re-FAP.

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
  → Tu proposes UNE étape suivante (prise de contact / rappel).
  → Tu termines par UNE question de validation.

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
next_best_action : poser_question | proposer_diagnostic | proposer_rdv | proposer_devis | clore
`;

// ============================================================
// SUPABASE
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// DATA DEFAULT
// ============================================================
const DEFAULT_DATA = {
  symptome: "inconnu",
  codes: [],
  intention: "inconnu",
  urgence: "inconnue",
  vehicule: null,
  next_best_action: "poser_question",
};

// ============================================================
// HELPERS : DATA parsing/clean
// ============================================================
function normalize(reply) {
  if (!reply) return "";
  return String(reply).replace(/([^\n])\s*DATA:\s*\{/g, "$1\nDATA: {");
}

function extractData(reply) {
  const n = normalize(reply);
  const m = n.match(/\nDATA:\s*(\{[\s\S]*\})$/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function cleanForUI(reply) {
  const n = normalize(reply);
  const i = n.indexOf("\nDATA:");
  return i === -1 ? n.trim() : n.slice(0, i).trim();
}

function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify(DEFAULT_DATA);
  }
}

// ============================================================
// HELPERS : intent + flow
// ============================================================
function userWantsContact(userText) {
  const t = (userText || "").toLowerCase();
  const triggers = [
    "rdv",
    "rendez",
    "rendez-vous",
    "rendez vous",
    "devis",
    "prix",
    "tarif",
    "contact",
    "rappel",
    "rappelez",
    "on me rappelle",
    "etre rappelé",
    "être rappelé",
    "prendre rendez",
    "prendre rdv",
  ];
  return triggers.some((k) => t.includes(k));
}

function looksLikePostalCode(text) {
  return /^\s*\d{5}\s*$/.test(String(text || ""));
}

function lastAssistantAskedPostal(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === "assistant") {
      const content = String(msg.raw || msg.content || "");
      return content.includes(FORM_URL) && /code postal/i.test(content);
    }
  }
  return false;
}

function historyAlreadyContainsPostal(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === "user" && looksLikePostalCode(msg.content)) {
      return String(msg.content).trim();
    }
  }
  return null;
}

// ============================================================
// OVERRIDE REPLY BUILDERS
// ============================================================
function buildFormAskPostalReply(extractedDataMaybe) {
  const data = {
    ...(extractedDataMaybe || DEFAULT_DATA),
    intention: (extractedDataMaybe?.intention === "devis" ? "devis" : "rdv"),
    next_best_action:
      extractedDataMaybe?.intention === "devis" ? "proposer_devis" : "proposer_rdv",
  };

  // 2 phrases max, 1 question max
  const ui =
    `OK. Laisse tes coordonnées ici : ${FORM_URL}, on te rappelle pour t’orienter au plus près.\n` +
    `Tu es dans quel code postal ?`;

  const full = `${ui}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean: ui, replyFull: full, extracted: data };
}

function buildFormConfirmPostalReply(extractedDataMaybe, postalCode) {
  const data = {
    ...(extractedDataMaybe || DEFAULT_DATA),
    intention: (extractedDataMaybe?.intention === "devis" ? "devis" : "rdv"),
    // On stocke le CP dans vehicule (temporaire) pour ne pas casser le schema DATA.
    // Exemple: "Skoda 2.0 TDI 2008 | CP 63000"
    vehicule:
      extractedDataMaybe?.vehicule
        ? `${extractedDataMaybe.vehicule} | CP ${postalCode}`
        : `CP ${postalCode}`,
    next_best_action: "clore",
  };

  // 2 phrases max, 0 question (sinon risque de boucle)
  const ui =
    `Merci, noté pour ${postalCode}. Laisse tes coordonnées ici : ${FORM_URL} et on te rappelle pour te guider.`;

  const full = `${ui}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean: ui, replyFull: full, extracted: data };
}

// ============================================================
// API HANDLER
// ============================================================
export default async function handler(req, res) {
  // ----------------------------------------------------------
  // AUTH COOKIE SIGNÉ (httpOnly)
  // ----------------------------------------------------------
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  const secret = process.env.CHAT_API_TOKEN;

  const cookie = req.headers.cookie || "";
  const found = cookie
    .split(";")
    .find((c) => c.trim().startsWith(cookieName + "="));
  if (!found) return res.status(401).json({ error: "Unauthorized" });

  const value = decodeURIComponent(found.split("=").slice(1).join("="));
  const [nonce, sig] = value.split(".");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(nonce)
    .digest("hex");
  if (sig !== expected) return res.status(401).json({ error: "Unauthorized" });

  if (req.method !== "POST") return res.status(405).end();

  const { message, session_id, history = [] } = req.body;
  if (!message || !session_id)
    return res.status(400).json({ error: "Bad request" });

  // ----------------------------------------------------------
  // CONVERSATION DB
  // ----------------------------------------------------------
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .upsert(
      { session_id, last_seen_at: new Date().toISOString() },
      { onConflict: "session_id" }
    )
    .select("id")
    .single();

  if (convErr) {
    return res.status(500).json({ error: "DB conversation", details: convErr.message });
  }

  // Log user message
  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: "user",
    content: message,
  });

  // ----------------------------------------------------------
  // ANTI-LOOP : si on vient de demander le CP et user répond "63000"
  // → on confirme + on stoppe (pas de nouvelle question)
  // ----------------------------------------------------------
  if (lastAssistantAskedPostal(history) && looksLikePostalCode(message)) {
    const postal = String(message).trim();
    const forced = buildFormConfirmPostalReply(DEFAULT_DATA, postal);

    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "assistant",
      content: forced.replyFull,
    });

    return res.status(200).json({
      reply: forced.replyClean,
      reply_full: forced.replyFull,
      extracted_data: forced.extracted,
      session_id,
      conversation_id: conv.id,
    });
  }

  // Si CP déjà présent dans l'historique, ne jamais redemander
  const priorPostal = historyAlreadyContainsPostal(history);
  if (priorPostal && userWantsContact(message)) {
    const forced = buildFormConfirmPostalReply(DEFAULT_DATA, priorPostal);

    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "assistant",
      content: forced.replyFull,
    });

    return res.status(200).json({
      reply: forced.replyClean,
      reply_full: forced.replyFull,
      extracted_data: forced.extracted,
      session_id,
      conversation_id: conv.id,
    });
  }

  // ----------------------------------------------------------
  // BUILD MISTRAL MESSAGES
  // ----------------------------------------------------------
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  if (Array.isArray(history)) {
    for (const m of history) {
      messages.push({
        role: m.role,
        content: m.raw || m.content,
      });
    }
  }
  messages.push({ role: "user", content: message });

  // ----------------------------------------------------------
  // MISTRAL CALL
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
      max_tokens: 190,
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    return res.status(500).json({ error: "Mistral error", details: errText });
  }

  const j = await r.json();
  const replyFullRaw =
    j.choices?.[0]?.message?.content ||
    `OK. Tu peux laisser tes coordonnées ici : ${FORM_URL}.\nDATA: ${safeJsonStringify(DEFAULT_DATA)}`;

  const extractedFromModel = extractData(replyFullRaw) || DEFAULT_DATA;

  // ----------------------------------------------------------
  // OVERRIDE BUSINESS : si user veut RDV/DEVIS/RAPPEL → formulaire
  // ----------------------------------------------------------
  if (
    userWantsContact(message) ||
    extractedFromModel.intention === "rdv" ||
    extractedFromModel.intention === "devis"
  ) {
    // Si l'utilisateur a déjà donné le CP dans CE message
    if (looksLikePostalCode(message)) {
      const forced = buildFormConfirmPostalReply(extractedFromModel, String(message).trim());

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        role: "assistant",
        content: forced.replyFull,
      });

      return res.status(200).json({
        reply: forced.replyClean,
        reply_full: forced.replyFull,
        extracted_data: forced.extracted,
        session_id,
        conversation_id: conv.id,
      });
    }

    // Sinon on demande le CP une seule fois
    const forced = buildFormAskPostalReply(extractedFromModel);

    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "assistant",
      content: forced.replyFull,
    });

    return res.status(200).json({
      reply: forced.replyClean,
      reply_full: forced.replyFull,
      extracted_data: forced.extracted,
      session_id,
      conversation_id: conv.id,
    });
  }

  // ----------------------------------------------------------
  // NORMAL PATH
  // ----------------------------------------------------------
  const replyClean = cleanForUI(replyFullRaw);

  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: "assistant",
    content: replyFullRaw,
  });

  return res.status(200).json({
    reply: replyClean,
    reply_full: replyFullRaw,
    extracted_data: extractedFromModel,
    session_id,
    conversation_id: conv.id,
  });
}
