// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 4.1 (CAPTURE -> HUMAN CLOSING -> FORM -> STOP)

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const FORM_URL = "auto.re-fap.fr/#devis";
const MAX_USER_TURNS_BEFORE_CTA = 3;

// ===================== SYSTEM PROMPT ======================
const SYSTEM_PROMPT = `
Tu es FAPexpert (Re-FAP). Ton rôle est de collecter rapidement des informations factuelles sur un problème de Filtre à Particules (FAP) et d’orienter vers une aide humaine.

STYLE
- Ton naturel, bref, rassurant.
- Interdit : listes, parenthèses explicatives, tableaux, checklists.

RÈGLES STRICTES
- 1 question maximum par message.
- 2 phrases maximum.
- Questions factuelles (observables), pas d’explications.
- Ne promets jamais de délai.
- Interdit : “conseiller”, “garage agréé/constructeur”, “SMS”.
- Ne propose jamais de procédure (régénération forcée, etc.).
- Ne demande pas le code postal.

OBJECTIF
- Tour 1 : identifier le symptôme observable principal.
- Tour 2 : identifier le véhicule (marque + modèle + année si possible).
- Ensuite : plus de questions.

DATA (OBLIGATOIRE, dernière ligne)
DATA: {"symptome":"<enum>","codes":[],"intention":"<enum>","urgence":"<enum>","vehicule":<string|null>,"next_best_action":"<enum>"}

Enums :
symptome : voyant_fap | perte_puissance | mode_degrade | fumee | autre | inconnu
intention : diagnostic | devis | rdv | info_generale | urgence | inconnu
urgence : haute | moyenne | basse | inconnue
next_best_action : poser_question | proposer_devis | clore
`;

// ===================== SUPABASE ======================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_DATA = {
  symptome: "inconnu",
  codes: [],
  intention: "inconnu",
  urgence: "inconnue",
  vehicule: null,
  next_best_action: "poser_question",
};

// ===================== DATA helpers ======================
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

// ===================== intent helpers ======================
function userWantsFormNow(text) {
  const t = String(text || "").trim().toLowerCase();
  const triggers = ["rdv", "rendez", "rendez-vous", "devis", "contact", "rappel", "rappelez", "je veux", "ok"];
  return triggers.some((k) => t.includes(k));
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
      if (c.includes("laisse tes coordonnées") || c.includes("on te rappelle")) return true;
      return false;
    }
  }
  return false;
}

function countUserTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter((m) => m?.role === "user").length;
}

function hasEnoughToClose(extracted) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasVehicule = extracted.vehicule && String(extracted.vehicule).trim().length >= 3;
  return Boolean(hasSymptome && hasVehicule);
}

// ===================== Human closing CTA ======================
function buildHumanClosingCTA(extracted) {
  const sympt = extracted?.symptome || "inconnu";
  const veh = extracted?.vehicule ? ` sur ${extracted.vehicule}` : "";
  const hint =
    sympt === "voyant_fap" ? "un souci FAP/anti-pollution" :
    sympt === "perte_puissance" ? "un souci anti-pollution possible" :
    sympt === "mode_degrade" ? "un souci anti-pollution probable" :
    sympt === "fumee" ? "un souci de combustion/anti-pollution possible" :
    "un souci lié au FAP/anti-pollution";

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  const ui =
    `Au vu de ce que tu décris${veh}, ça ressemble à ${hint}. Tu as bien fait de nous contacter : laisse tes coordonnées ici : ${FORM_URL} et on te rappelle pour t’orienter vers la meilleure solution près de chez toi.`;

  return { replyClean: ui, replyFull: `${ui}\nDATA: ${safeJson(data)}`, extracted: data };
}

// ===================== AUTH cookie signé ======================
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

// ===================== HANDLER ======================
export default async function handler(req, res) {
  if (!requireSignedCookie(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const { message, session_id, history = [] } = req.body;
    if (!message || typeof message !== "string") return res.status(400).json({ error: "Message requis" });
    if (!session_id || typeof session_id !== "string") return res.status(400).json({ error: "session_id requis" });

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .upsert({ session_id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id" })
      .select("id")
      .single();

    if (convErr) return res.status(500).json({ error: "Erreur DB conversation", details: convErr.message });

    await supabase.from("messages").insert({ conversation_id: conv.id, role: "user", content: message });

    // OVERRIDE: passage formulaire immédiat
    if (userWantsFormNow(message) || (userSaysYes(message) && lastAssistantAskedForContact(history))) {
      const forced = buildHumanClosingCTA(DEFAULT_DATA);

      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: forced.replyFull });

      return res.status(200).json({
        reply: forced.replyClean,
        reply_full: forced.replyFull,
        extracted_data: forced.extracted,
        session_id,
        conversation_id: conv.id,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // OVERRIDE: si ça traîne -> CTA
    if (countUserTurns(history) >= MAX_USER_TURNS_BEFORE_CTA) {
      const forced = buildHumanClosingCTA(DEFAULT_DATA);

      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: forced.replyFull });

      return res.status(200).json({
        reply: forced.replyClean,
        reply_full: forced.replyFull,
        extracted_data: forced.extracted,
        session_id,
        conversation_id: conv.id,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // LLM path
    const messagesForLLM = [{ role: "system", content: SYSTEM_PROMPT }];
    if (Array.isArray(history)) {
      for (const m of history) messagesForLLM.push({ role: m.role, content: m.raw || m.content });
    }
    messagesForLLM.push({ role: "user", content: message });

    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        messages: messagesForLLM,
        temperature: 0.25,
        max_tokens: 160,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(500).json({ error: "Erreur Mistral API", details: errText });
    }

    const j = await r.json();
    const replyFullRaw = j.choices?.[0]?.message?.content || `OK.\nDATA: ${safeJson(DEFAULT_DATA)}`;

    const extracted = extractData(replyFullRaw) || DEFAULT_DATA;
    const replyClean = cleanForUI(replyFullRaw);

    // auto-close dès qu’on a symptôme + véhicule
    if (hasEnoughToClose(extracted)) {
      const forced = buildHumanClosingCTA(extracted);

      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: forced.replyFull });

      return res.status(200).json({
        reply: forced.replyClean,
        reply_full: forced.replyFull,
        extracted_data: forced.extracted,
        session_id,
        conversation_id: conv.id,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: replyFullRaw });

    return res.status(200).json({
      reply: replyClean,
      reply_full: replyFullRaw,
      extracted_data: extracted,
      session_id,
      conversation_id: conv.id,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur interne", details: e.message });
  }
}
