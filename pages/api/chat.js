// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 4.2
// Base v2.4 + closing auto + limite tours + action type

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 3;

// ============================================================
// SYSTEM PROMPT V2.1 (validé)
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP. Tu collectes les mots du client pour comprendre son problème de Filtre à Particules.

DÉFINITION
"FAP" = Filtre à Particules automobile. Aucune autre interprétation.

COMPORTEMENT
- Une seule question par message.
- Pars toujours de ce que le client vient de dire.
- Si l'entrée est courte ou ambiguë, pose une question factuelle sur ce qui s'est passé, pas sur le problème en général.
- Si la réponse est émotionnelle ou non factuelle, ramène calmement vers un fait observable (voyant, comportement, moment).
- Cherche la précision, pas l'explication.
- Accepte les réponses floues, incomplètes, contradictoires.
- Ne corrige jamais son vocabulaire.
- Ne reformule jamais en jargon technique.
- Ne conclus jamais sans qu'il valide.

STYLE
- Ton naturel, bref, rassurant.
- Pas de listes, pas de parenthèses explicatives, pas de tableaux.

INTERDITS
- Diagnostic avant d'avoir assez d'éléments.
- Résumés non demandés.
- Réponses longues.
- Ton professoral.
- Sujets hors automobile.
- Conseils de suppression FAP ou reprogrammation.
- Ne promets jamais de délai.
- Ne demande pas le code postal.

LONGUEUR
2 phrases max. 1 question max.

OBJECTIF
- Tour 1 : identifier le symptôme observable principal.
- Tour 2 : identifier le véhicule (marque + modèle + année si possible).
- Ensuite : ne pose plus de questions.

DATA
À la fin de chaque message, ajoute une seule ligne :
DATA: {"symptome":"<enum>","codes":[],"intention":"<enum>","urgence":"<enum>","vehicule":<string|null>,"next_best_action":"<enum>"}

La DATA est une structuration progressive des verbatims. Elle peut être partielle, évolutive, contradictoire. Ne force jamais une valeur pour "conclure".

Ne renseigne intention ou urgence que si l'utilisateur les exprime clairement. Sinon, conserve "inconnu" ou "inconnue".

next_best_action reste "poser_question" tant que le client n'a pas validé une attente.

Enums :
- symptome : "voyant_fap" | "perte_puissance" | "mode_degrade" | "fumee" | "odeur" | "regeneration_impossible" | "code_obd" | "autre" | "inconnu"
- codes : tableau de strings (ex: ["P2002"]) ou []
- intention : "diagnostic" | "devis" | "rdv" | "info_generale" | "comparaison" | "urgence" | "inconnu"
- urgence : "haute" | "moyenne" | "basse" | "inconnue"
- vehicule : string descriptif ou null
- next_best_action : "poser_question" | "proposer_diagnostic" | "proposer_rdv" | "proposer_devis" | "rediriger_garage" | "clore"`;

// ============================================================
// SUPABASE
// ============================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// CORS
// ============================================================
const ALLOWED_ORIGINS = [
  "https://autoai-re-fap-v2.vercel.app",
  "https://re-fap.fr",
  "https://www.re-fap.fr",
  "http://localhost:3000",
];

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
// HELPERS : Normalisation & Extraction DATA
// ============================================================
function normalizeDataPosition(reply) {
  if (!reply) return "";
  return reply.replace(/([^\n])\s*DATA:\s*\{/g, "$1\nDATA: {");
}

function cleanReplyForUI(fullReply) {
  if (!fullReply) return "";
  const normalized = normalizeDataPosition(fullReply);
  const match = normalized.match(/^([\s\S]*?)(?:\nDATA:\s*\{[\s\S]*\})\s*$/);
  if (match) return match[1].trim();
  const idx = normalized.indexOf("\nDATA:");
  return idx === -1 ? normalized.trim() : normalized.slice(0, idx).trim();
}

function extractDataFromReply(fullReply) {
  if (!fullReply) return null;
  const normalized = normalizeDataPosition(fullReply);
  const match = normalized.match(/\nDATA:\s*(\{[\s\S]*\})\s*$/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { return null; }
  }
  return null;
}

function safeJsonStringify(obj) {
  try { return JSON.stringify(obj); } catch { return JSON.stringify(DEFAULT_DATA); }
}

// ============================================================
// HELPERS : Intent Detection
// ============================================================
function userWantsFormNow(text) {
  const t = String(text || "").toLowerCase().trim();
  const triggers = ["rdv", "rendez", "rendez-vous", "devis", "contact", "rappel", "rappelez", "formulaire"];
  return triggers.some((k) => t.includes(k));
}

function userSaysYes(text) {
  const t = String(text || "").toLowerCase().trim();
  return ["oui", "ouais", "ok", "d'accord", "go", "yes", "yep", "ouep"].includes(t);
}

function lastAssistantProposedForm(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("coordonnées") || content.includes("on te rappelle") || content.includes("formulaire")) {
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

// ============================================================
// HELPERS : Closing Detection
// ============================================================
function hasEnoughToClose(extracted) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasVehicule = extracted.vehicule && String(extracted.vehicule).trim().length >= 4;
  return Boolean(hasSymptome && hasVehicule);
}

function buildClosingCTA(extracted) {
  const symptome = extracted?.symptome || "inconnu";
  const vehicule = extracted?.vehicule ? ` sur ta ${extracted.vehicule}` : "";
  
  const hints = {
    voyant_fap: "un souci FAP/anti-pollution",
    perte_puissance: "un souci d'anti-pollution possible",
    mode_degrade: "un souci d'anti-pollution probable",
    fumee: "un souci de combustion/anti-pollution",
    odeur: "un souci d'anti-pollution possible",
    regeneration_impossible: "un FAP saturé",
    code_obd: "un souci lié au FAP",
  };
  const hint = hints[symptome] || "un souci lié au FAP/anti-pollution";

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  const replyClean = `Au vu de ce que tu décris${vehicule}, ça ressemble à ${hint}. Tu as bien fait de nous contacter : laisse tes coordonnées ici et on te rappelle pour t'orienter vers la meilleure solution près de chez toi.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// AUTH : Cookie signé
// ============================================================
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const found = cookieHeader.split(";").find((c) => c.trim().startsWith(name + "="));
  if (!found) return null;
  return decodeURIComponent(found.split("=").slice(1).join("="));
}

function verifySignedCookie(value, secret) {
  if (!value || !secret) return false;
  const [nonce, sig] = value.split(".");
  if (!nonce || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  return sig === expected;
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req, res) {
  const origin = req.headers.origin;

  // AUTH
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  const secret = process.env.CHAT_API_TOKEN;
  const cookieValue = getCookie(req, cookieName);
  if (!verifySignedCookie(cookieValue, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // CORS
  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      return res.status(403).json({ error: "Origin non autorisée" });
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const { message, session_id, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message requis" });
    }
    if (!session_id || typeof session_id !== "string") {
      return res.status(400).json({ error: "session_id requis" });
    }

    // DB : upsert conversation
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .upsert({ session_id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id" })
      .select("id")
      .single();

    if (convError) {
      return res.status(500).json({ error: "Erreur DB conversation", details: convError.message });
    }
    const conversationId = convData.id;

    // DB : insert message user
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    // --------------------------------------------------------
    // OVERRIDE 1 : User demande explicitement formulaire/rdv
    // --------------------------------------------------------
    if (userWantsFormNow(message) || (userSaysYes(message) && lastAssistantProposedForm(history))) {
      const lastExtracted = extractLastExtractedData(history);
      const closing = buildClosingCTA(lastExtracted);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: closing.replyFull,
      });

      return res.status(200).json({
        reply: closing.replyClean,
        reply_full: closing.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: closing.extracted,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // OVERRIDE 2 : Trop de tours → CTA forcé
    // --------------------------------------------------------
    const userTurns = countUserTurns(history) + 1; // +1 pour le message actuel
    if (userTurns >= MAX_USER_TURNS) {
      const lastExtracted = extractLastExtractedData(history);
      const closing = buildClosingCTA(lastExtracted);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: closing.replyFull,
      });

      return res.status(200).json({
        reply: closing.replyClean,
        reply_full: closing.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: closing.extracted,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // LLM PATH
    // --------------------------------------------------------
    const messagesForMistral = [{ role: "system", content: SYSTEM_PROMPT }];
    if (Array.isArray(history)) {
      for (const msg of history) {
        if (msg.role === "user") {
          messagesForMistral.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          messagesForMistral.push({ role: "assistant", content: msg.raw || msg.content });
        }
      }
    }
    messagesForMistral.push({ role: "user", content: message });

    const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        messages: messagesForMistral,
        temperature: 0.4,
        max_tokens: 180,
      }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return res.status(500).json({ error: "Erreur Mistral API", details: errText });
    }

    const mistralData = await mistralResponse.json();
    const replyFull = mistralData.choices?.[0]?.message?.content || `OK.\nDATA: ${safeJsonStringify(DEFAULT_DATA)}`;

    const extracted = extractDataFromReply(replyFull) || DEFAULT_DATA;
    const replyClean = cleanReplyForUI(replyFull);

    // --------------------------------------------------------
    // AUTO-CLOSE : symptôme + véhicule → CTA
    // --------------------------------------------------------
    if (hasEnoughToClose(extracted)) {
      const closing = buildClosingCTA(extracted);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: closing.replyFull,
      });

      return res.status(200).json({
        reply: closing.replyClean,
        reply_full: closing.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: closing.extracted,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // RÉPONSE NORMALE
    // --------------------------------------------------------
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: replyFull,
    });

    return res.status(200).json({
      reply: replyClean,
      reply_full: replyFull,
      session_id,
      conversation_id: conversationId,
      extracted_data: extracted,
    });

  } catch (error) {
    console.error("❌ Erreur handler chat:", error);
    return res.status(500).json({ error: "Erreur serveur interne", details: error.message });
  }
}

// ============================================================
// HELPER : Récupérer la dernière DATA extraite de l'historique
// ============================================================
function extractLastExtractedData(history) {
  if (!Array.isArray(history)) return DEFAULT_DATA;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = history[i].raw || history[i].content || "";
      const extracted = extractDataFromReply(content);
      if (extracted) return extracted;
    }
  }
  return DEFAULT_DATA;
}
