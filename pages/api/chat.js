// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 4.0 (CAPTURE -> FORM -> STOP)
// - 2-3 questions max, puis CTA vers auto.re-fap.fr/#devis
// - Pas de code postal dans le chat (dans le formulaire)
// - Si user dit "oui/ok/rdv/devis/rappel" => CTA immédiat
// - Stop après CTA (anti-boucle)
// - DATA stockée en DB (réponse FULL), UI reçoit CLEAN

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "auto.re-fap.fr/#devis";
const MAX_USER_TURNS_BEFORE_CTA = 3; // 2 ou 3 conseillé

// ============================================================
// SYSTEM PROMPT — LLM = collecteur, pas un solveur
// ============================================================
const SYSTEM_PROMPT = `
Tu es FAPexpert (Re-FAP). Ton rôle est de collecter rapidement des informations factuelles sur un problème de Filtre à Particules (FAP) et d’orienter ensuite vers une prise de contact humaine.

RÈGLES STRICTES
- 1 question maximum par message.
- 2 phrases maximum.
- Tu poses des questions factuelles, pas des explications.
- Tu ne promets jamais de délai (“24h”, “48h”… interdit).
- Tu ne dis jamais “conseiller”, “garage agréé/constructeur”, “SMS”.
- Tu ne proposes jamais de procédure (régénération forcée, etc.).
- Tu ne demandes pas le code postal.

OBJECTIF CONVERSATION
- Tour 1 : identifier le symptôme observable principal (voyant / perte de puissance / mode dégradé / fumée / autre).
- Tour 2 : identifier le véhicule (marque + modèle + année si possible).
- Ensuite : arrêter les questions.

DATA (OBLIGATOIRE)
Ajoute TOUJOURS en dernière ligne :
DATA: {"symptome":"<enum>","codes":[],"intention":"<enum>","urgence":"<enum>","vehicule":<string|null>,"next_best_action":"<enum>"}

Enums :
- symptome : "voyant_fap" | "perte_puissance" | "mode_degrade" | "fumee" | "autre" | "inconnu"
- codes : tableau de strings ou []
- intention : "diagnostic" | "devis" | "rdv" | "info_generale" | "urgence" | "inconnu"
- urgence : "haute" | "moyenne" | "basse" | "inconnue"
- vehicule : string descriptif ou null
- next_best_action : "poser_question" | "proposer_devis" | "clore"
`;

// ============================================================
// SUPABASE
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// DEFAULT DATA
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
// HELPERS — DATA handling
// ============================================================
function normalize(text) {
  if (!text) return "";
  return String(text).replace(/([^\n])\s*DATA:\s*\{/g, "$1\nDATA: {");
}

function extractData(text) {
  const n = normalize(text);
  const m = n.match(/\nDATA:\s*(\{[\s\S]*\})$/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function cleanForUI(text) {
  const n = normalize(text);
  const i = n.indexOf("\nDATA:");
  return i === -1 ? n.trim() : n.slice(0, i).trim();
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify(DEFAULT_DATA);
  }
}

// ============================================================
// HELPERS — intent detection
// ============================================================
function userWantsFormNow(text) {
  const t = String(text || "").trim().toLowerCase();
  // "oui" doit déclencher CTA seulement si le bot vient de proposer contact
  const hard = ["rdv", "rendez", "rendez-vous", "devis", "contact", "rappel", "rappelez", "ok je veux", "ok", "je veux"];
  return hard.some((k) => t.includes(k));
}

function userSaysYes(text) {
  const t = String(text || "").trim().toLowerCase();
  return ["oui", "ouais", "ok", "d'accord", "go", "yes"].includes(t);
}

function lastAssistantAskedForContact(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === "assistant") {
      const c = String(msg.raw || msg.content || "").toLowerCase();
      // si le bot a demandé "tu veux qu'on t'aide / laisser tes coordonnées / être rappelé"
      if (c.includes("laisser tes coordonnées") || c.includes("etre rappel") || c.includes("être rappel") || c.includes("on te rappelle")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function countUserTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter((m) => m?.role === "user").length;
}

function buildCTA(extracted) {
  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: extracted?.intention === "devis" ? "devis" : "diagnostic",
    next_best_action: "proposer_devis",
  };

  // 2 phrases max, 0 question (on stop)
  const ui =
    `OK. Laisse tes coordonnées ici : ${FORM_URL} et on te rappelle pour t’orienter vers la meilleure solution.`;

  return { replyClean: ui, replyFull: `${ui}\nDATA: ${safeJson(data)}`, extracted: data };
}

// Condition CTA auto : on a déjà symptôme + véhicule
function hasEnoughToCTA(extracted) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasVehicule = extracted.vehicule && String(extracted.vehicule).trim().length >= 3;
  return Boolean(hasSymptome && hasVehicule);
}

// ============================================================
// AUTH COOKIE SIGNÉ (httpOnly)
// ============================================================
function requireSignedCookie(req) {
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  const secret = process.env.CHAT_API_TOKEN;

  const cookie = req.headers.cookie || "";
  const found = cookie.split(";").find((c) => c.trim().startsWith(cookieName + "="));
  if (!found) return false;

  const value = decodeURIComponent(found.split("=").slice(1).join("="));
  const [nonce, sig] = value.split(".");
  if (!nonce || !sig) return false;

  const expected = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  return sig === expected;
}

// ============================================================
// API HANDLER
// ============================================================
export default async function handler(req, res) {
  if (!requireSignedCookie(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { message, session_id, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message requis" });
    }
    if (!session_id || typeof session_id !== "string") {
      return res.status(400).json({ error: "session_id requis" });
    }

    // --------------------------------------------------------
    // DB: upsert conversation
    // --------------------------------------------------------
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .upsert(
        { session_id, last_seen_at: new Date().toISOString() },
        { onConflict: "session_id" }
      )
      .select("id")
      .single();

    if (convErr) {
      return res.status(500).json({ error: "Erreur DB conversation", details: convErr.message });
    }

    // Log user message
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "user",
      content: message,
    });

    // --------------------------------------------------------
    // OVERRIDE: si user veut passer au formulaire maintenant
    // - soit il le dit directement (rdv/devis/contact)
    // - soit il répond "oui" après une question de contact
    // --------------------------------------------------------
    if (userWantsFormNow(message) || (userSaysYes(message) && lastAssistantAskedForContact(history))) {
      const forced = buildCTA(DEFAULT_DATA);

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
        action: { type: "OPEN_FORM", url: FORM_URL }, // futur modal côté front
      });
    }

    // --------------------------------------------------------
    // OVERRIDE: si ça traîne -> CTA
    // --------------------------------------------------------
    if (countUserTurns(history) >= MAX_USER_TURNS_BEFORE_CTA) {
      const forced = buildCTA(DEFAULT_DATA);

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
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // LLM path: collecter 1 info à la fois
    // --------------------------------------------------------
    const messagesForLLM = [{ role: "system", content: SYSTEM_PROMPT }];

    if (Array.isArray(history)) {
      for (const m of history) {
        messagesForLLM.push({ role: m.role, content: m.raw || m.content });
      }
    }
    messagesForLLM.push({ role: "user", content: message });

    const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        messages: messagesForLLM,
        temperature: 0.3,
        max_tokens: 160,
      }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return res.status(500).json({ error: "Erreur Mistral API", details: errText });
    }

    const mistralData = await mistralResponse.json();
    const replyFullRaw =
      mistralData.choices?.[0]?.message?.content ||
      `OK.\nDATA: ${safeJson(DEFAULT_DATA)}`;

    const extracted = extractData(replyFullRaw) || DEFAULT_DATA;
    const replyClean = cleanForUI(replyFullRaw);

    // --------------------------------------------------------
    // AUTO-CTA si on a déjà assez d'infos
    // --------------------------------------------------------
    if (hasEnoughToCTA(extracted)) {
      const forced = buildCTA(extracted);

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
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // Log assistant normal + return
    // --------------------------------------------------------
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "assistant",
      content: replyFullRaw,
    });

    return res.status(200).json({
      reply: replyClean,
      reply_full: replyFullRaw,
      extracted_data: extracted,
      session_id,
      conversation_id: conv.id,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur interne", details: error.message });
  }
}
