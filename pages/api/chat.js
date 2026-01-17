// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 4.6
// Flow progressif : question ouverte → véhicule → closing doux → formulaire

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 4;

// ============================================================
// SYSTEM PROMPT V4.6
// Question ouverte obligatoire, pas de présupposition
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP. Tu collectes les mots du client pour comprendre son problème.

DÉFINITION
"FAP" = Filtre à Particules automobile uniquement.

RÈGLE ABSOLUE POUR LE PREMIER MESSAGE
Si c'est le premier échange (pas d'historique), pose UNE question 100% ouverte et neutre :
- "Qu'est-ce qui se passe avec votre voiture ?"
- "Racontez-moi ce qui vous arrive."
- "Décrivez-moi le souci."

NE PRÉSUPPOSE JAMAIS le problème. Ne dis pas "qu'est-ce qui vous fait dire que..." ou "pourquoi pensez-vous que...".

MESSAGES SUIVANTS
- Si tu n'as pas le véhicule : "C'est quelle voiture ?"
- Sinon : ne pose plus de questions, le système prend le relais.

STYLE
- 1 phrase max.
- 1 question max.
- Ton naturel, court, direct.
- Jamais de liste, jamais de jargon technique.
- Jamais de diagnostic ou d'explication.

INTERDITS
- Poser plusieurs questions
- Présupposer un diagnostic
- Utiliser des termes techniques (régénération, mode dégradé, etc.)
- Demander kilométrage, année, code postal

DATA
À la fin de chaque message :
DATA: {"symptome":"<enum>","codes":[],"vehicule":<string|null>,"intention":"<enum>","urgence":"<enum>","next_best_action":"<enum>"}

Enums symptome : voyant_fap | perte_puissance | mode_degrade | fumee | odeur | autre | inconnu
Enums intention : diagnostic | devis | rdv | info_generale | urgence | inconnu
Enums urgence : haute | moyenne | basse | inconnue
Enums next_best_action : poser_question | proposer_devis | clore`;

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
  vehicule: null,
  intention: "inconnu",
  urgence: "inconnue",
  next_best_action: "poser_question",
  verbatim_brut: null,
  urgence_percue: "inconnue",
  immobilise: "inconnu",
  intent_stage: "info",
  mots_cles_seo: [],
};

// ============================================================
// INFÉRENCES (identiques à v4.5)
// ============================================================
function inferUrgencePercue(text) {
  const t = String(text || "").toLowerCase();
  const high = ["bloqué", "bloquée", "immobilisé", "plus rouler", "peux plus", "panne", "urgent", "clignotant", "calé", "dépanneuse", "autoroute"];
  if (high.some(w => t.includes(w))) return "haute";
  const medium = ["voyant", "allumé", "perte de puissance", "tire moins", "fume", "fumée", "mode dégradé"];
  if (medium.some(w => t.includes(w))) return "moyenne";
  const low = ["question", "renseignement", "info", "savoir", "comprendre"];
  if (low.some(w => t.includes(w))) return "basse";
  return "inconnue";
}

function inferImmobilisation(text) {
  const t = String(text || "").toLowerCase();
  const oui = ["bloqué", "bloquée", "immobilisé", "plus rouler", "peux plus rouler", "en panne", "calé", "démarre plus"];
  if (oui.some(w => t.includes(w))) return "oui";
  const non = ["roule encore", "je roule", "marche encore", "fonctionne"];
  if (non.some(w => t.includes(w))) return "non";
  return "inconnu";
}

function inferIntentStage(text, history, acceptedCTA) {
  const t = String(text || "").toLowerCase();
  const action = ["rdv", "devis", "rappel", "combien", "prix", "tarif", "garage"];
  if (action.some(w => t.includes(w)) || acceptedCTA) return "action";
  const solution = ["comment faire", "que faire", "solution", "réparer", "nettoyer"];
  if (solution.some(w => t.includes(w))) return "solution";
  if (Array.isArray(history) && history.filter(m => m.role === "user").length >= 2) return "solution";
  return "info";
}

function extractMotsClesSEO(text, vehicule) {
  const keywords = [];
  const t = String(text || "").toLowerCase();
  if (t.includes("voyant")) keywords.push("voyant fap allumé");
  if (t.includes("puissance") || t.includes("tire")) keywords.push("perte puissance fap");
  if (t.includes("fume") || t.includes("fumée")) keywords.push("fumée fap");
  if (t.includes("bouché")) keywords.push("fap bouché");
  const codes = t.match(/p[0-9]{4}/gi);
  if (codes) codes.forEach(c => keywords.push(`code ${c.toUpperCase()}`));
  if (vehicule) {
    keywords.push(`${vehicule} fap`.toLowerCase());
    keywords.push(`nettoyage fap ${vehicule}`.toLowerCase());
  }
  return [...new Set(keywords)].slice(0, 10);
}

// ============================================================
// HELPERS DATA
// ============================================================
function normalizeDataPosition(reply) {
  if (!reply) return "";
  return reply.replace(/([^\n])\s*DATA:\s*\{/g, "$1\nDATA: {");
}

function cleanReplyForUI(fullReply) {
  if (!fullReply) return "";
  const n = normalizeDataPosition(fullReply);
  const m = n.match(/^([\s\S]*?)(?:\nDATA:\s*\{[\s\S]*\})\s*$/);
  if (m) return m[1].trim();
  const i = n.indexOf("\nDATA:");
  return i === -1 ? n.trim() : n.slice(0, i).trim();
}

function extractDataFromReply(fullReply) {
  if (!fullReply) return null;
  const n = normalizeDataPosition(fullReply);
  const m = n.match(/\nDATA:\s*(\{[\s\S]*\})\s*$/);
  if (m) { try { return JSON.parse(m[1]); } catch { return null; } }
  return null;
}

function safeJson(obj) {
  try { return JSON.stringify(obj); } catch { return JSON.stringify(DEFAULT_DATA); }
}

// ============================================================
// HELPERS INTENT
// ============================================================
function userWantsFormNow(text) {
  const t = String(text || "").toLowerCase();
  return ["rdv", "rendez-vous", "devis", "contact", "rappel", "formulaire"].some(k => t.includes(k));
}

function userSaysYes(text) {
  const t = String(text || "").toLowerCase().trim();
  const yes = ["oui", "ouais", "ok", "d'accord", "go", "yes", "yep", "volontiers", "je veux bien", "avec plaisir", "carrément", "bien sûr", "pourquoi pas"];
  return yes.some(w => t.includes(w)) || t === "o";
}

function userSaysNo(text) {
  const t = String(text || "").toLowerCase().trim();
  return ["non", "nan", "nope", "pas maintenant", "plus tard", "non merci"].some(w => t.includes(w));
}

// ============================================================
// DÉTECTION : Le bot a-t-il posé la question closing ?
// ============================================================
function lastAssistantAskedClosingQuestion(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const c = String(history[i].raw || history[i].content || "").toLowerCase();
      // Marqueurs de la question closing
      if (
        c.includes("t'aider à trouver") ||
        c.includes("vous aider à trouver") ||
        c.includes("qu'on t'aide") ||
        c.includes("qu'on vous aide") ||
        c.includes("trouver le bon pro")
      ) {
        return true;
      }
      return false;
    }
  }
  return false;
}

// ============================================================
// DÉTECTION : Le bot a-t-il déjà envoyé le CTA formulaire ?
// ============================================================
function lastAssistantSentFormCTA(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const c = String(history[i].raw || history[i].content || "").toLowerCase();
      if (c.includes("laisse tes coordonnées") || c.includes("laissez vos coordonnées")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function countUserTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter(m => m?.role === "user").length;
}

// ============================================================
// CLOSING : Assez d'infos ?
// ============================================================
function hasEnoughToClose(extracted) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasVehicule = extracted.vehicule && String(extracted.vehicule).trim().length >= 3;
  return Boolean(hasSymptome && hasVehicule);
}

// ============================================================
// MESSAGES CLOSING (flow progressif)
// ============================================================
function buildClosingQuestion(extracted, allUserMessages) {
  const vehicule = extracted?.vehicule ? ` sur ta ${extracted.vehicule}` : "";
  const verbatim = (allUserMessages[0] || "").toLowerCase();
  
  // Synthèse basée sur le verbatim (sans jargon)
  let synthese = "un souci";
  if (verbatim.includes("voyant") && (verbatim.includes("puissance") || verbatim.includes("tire"))) {
    synthese = "voyant + manque de puissance";
  } else if (verbatim.includes("voyant")) {
    synthese = "voyant allumé";
  } else if (verbatim.includes("puissance") || verbatim.includes("tire") || verbatim.includes("avance")) {
    synthese = "manque de puissance";
  } else if (verbatim.includes("fume") || verbatim.includes("fumée")) {
    synthese = "fumée";
  } else if (verbatim.includes("bloqué") || verbatim.includes("panne")) {
    synthese = "véhicule bloqué";
  }

  const data = { ...extracted, intention: "diagnostic", next_best_action: "proposer_devis" };

  // Message DOUX et PROGRESSIF (pas de saut brutal vers le formulaire)
  const replyClean = `Au vu de ce que tu décris (${synthese}${vehicule}), ça ressemble à un problème de FAP encrassé. Chez Re-FAP, on traite ce type de souci sans remplacement et sans suppression. Tu veux qu'on t'aide à trouver le bon pro près de chez toi ?`;
  const replyFull = `${replyClean}\nDATA: ${safeJson(data)}`;

  return { replyClean, replyFull, extracted: data };
}

function buildFormCTA(extracted) {
  const data = { ...extracted, intention: "rdv", intent_stage: "action", next_best_action: "clore" };
  const replyClean = `Super ! Laisse tes coordonnées ici et on te rappelle rapidement pour t'orienter vers la meilleure solution.`;
  const replyFull = `${replyClean}\nDATA: ${safeJson(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildDeclinedResponse(extracted) {
  const data = { ...extracted, next_best_action: "clore" };
  const replyClean = `Pas de souci ! Si tu changes d'avis, je suis là. Bonne route 👋`;
  const replyFull = `${replyClean}\nDATA: ${safeJson(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// AUTH
// ============================================================
function getCookie(req, name) {
  const h = req.headers.cookie || "";
  const f = h.split(";").find(c => c.trim().startsWith(name + "="));
  if (!f) return null;
  return decodeURIComponent(f.split("=").slice(1).join("="));
}

function verifySignedCookie(value, secret) {
  if (!value || !secret) return false;
  const [nonce, sig] = value.split(".");
  if (!nonce || !sig) return false;
  return sig === crypto.createHmac("sha256", secret).update(nonce).digest("hex");
}

// ============================================================
// HELPERS
// ============================================================
function extractLastExtractedData(history) {
  if (!Array.isArray(history)) return { ...DEFAULT_DATA };
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const extracted = extractDataFromReply(history[i].raw || history[i].content || "");
      if (extracted) return { ...DEFAULT_DATA, ...extracted };
    }
  }
  return { ...DEFAULT_DATA };
}

function enrichData(baseData, allUserMessages, history, acceptedCTA = false) {
  const all = allUserMessages.join(" ");
  const first = allUserMessages[0] || "";
  return {
    ...baseData,
    verbatim_brut: first,
    urgence_percue: inferUrgencePercue(all),
    immobilise: inferImmobilisation(all),
    intent_stage: inferIntentStage(all, history, acceptedCTA),
    mots_cles_seo: extractMotsClesSEO(all, baseData.vehicule),
  };
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req, res) {
  // AUTH
  const cookieName = process.env.CHAT_COOKIE_NAME || "re_fap_chat";
  const secret = process.env.CHAT_API_TOKEN;
  if (!verifySignedCookie(getCookie(req, cookieName), secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // CORS
  const origin = req.headers.origin;
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
    if (!message || typeof message !== "string") return res.status(400).json({ error: "Message requis" });
    if (!session_id || typeof session_id !== "string") return res.status(400).json({ error: "session_id requis" });

    const allUserMessages = [...history.filter(m => m.role === "user").map(m => m.content), message];

    // DB
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .upsert({ session_id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id" })
      .select("id").single();
    if (convErr) return res.status(500).json({ error: "Erreur DB", details: convErr.message });

    await supabase.from("messages").insert({ conversation_id: conv.id, role: "user", content: message });

    const lastExtracted = extractLastExtractedData(history);

    // --------------------------------------------------------
    // OVERRIDE 1 : User dit OUI après question closing
    // --------------------------------------------------------
    if (lastAssistantAskedClosingQuestion(history) && userSaysYes(message)) {
      const enriched = enrichData(lastExtracted, allUserMessages, history, true);
      const formCTA = buildFormCTA(enriched);
      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: formCTA.replyFull });
      return res.status(200).json({
        reply: formCTA.replyClean,
        reply_full: formCTA.replyFull,
        session_id,
        conversation_id: conv.id,
        extracted_data: formCTA.extracted,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // OVERRIDE 2 : User dit NON après question closing
    // --------------------------------------------------------
    if (lastAssistantAskedClosingQuestion(history) && userSaysNo(message)) {
      const enriched = enrichData(lastExtracted, allUserMessages, history, false);
      const declined = buildDeclinedResponse(enriched);
      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: declined.replyFull });
      return res.status(200).json({
        reply: declined.replyClean,
        reply_full: declined.replyFull,
        session_id,
        conversation_id: conv.id,
        extracted_data: declined.extracted,
      });
    }

    // --------------------------------------------------------
    // OVERRIDE 3 : User demande explicitement rdv/devis
    // --------------------------------------------------------
    if (userWantsFormNow(message)) {
      const enriched = enrichData(lastExtracted, allUserMessages, history, true);
      const formCTA = buildFormCTA(enriched);
      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: formCTA.replyFull });
      return res.status(200).json({
        reply: formCTA.replyClean,
        reply_full: formCTA.replyFull,
        session_id,
        conversation_id: conv.id,
        extracted_data: formCTA.extracted,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // OVERRIDE 4 : Trop de tours → question closing
    // --------------------------------------------------------
    const userTurns = countUserTurns(history) + 1;
    if (userTurns >= MAX_USER_TURNS && !lastAssistantAskedClosingQuestion(history) && !lastAssistantSentFormCTA(history)) {
      const enriched = enrichData(lastExtracted, allUserMessages, history, false);
      const closing = buildClosingQuestion(enriched, allUserMessages);
      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: closing.replyFull });
      return res.status(200).json({
        reply: closing.replyClean,
        reply_full: closing.replyFull,
        session_id,
        conversation_id: conv.id,
        extracted_data: closing.extracted,
      });
    }

    // --------------------------------------------------------
    // LLM PATH
    // --------------------------------------------------------
    const msgs = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of history) {
      msgs.push({ role: m.role, content: m.raw || m.content });
    }
    msgs.push({ role: "user", content: message });

    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        messages: msgs,
        temperature: 0.3,
        max_tokens: 100,
      }),
    });

    if (!r.ok) return res.status(500).json({ error: "Erreur Mistral", details: await r.text() });

    const j = await r.json();
    const replyFull = j.choices?.[0]?.message?.content || `OK.\nDATA: ${safeJson(DEFAULT_DATA)}`;
    const llmData = extractDataFromReply(replyFull) || DEFAULT_DATA;
    const replyClean = cleanReplyForUI(replyFull);
    const enriched = enrichData(llmData, allUserMessages, history, false);

    // --------------------------------------------------------
    // AUTO-CLOSE : symptôme + véhicule → question closing (PAS le formulaire direct)
    // --------------------------------------------------------
    if (hasEnoughToClose(enriched) && !lastAssistantAskedClosingQuestion(history) && !lastAssistantSentFormCTA(history)) {
      const closing = buildClosingQuestion(enriched, allUserMessages);
      await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: closing.replyFull });
      return res.status(200).json({
        reply: closing.replyClean,
        reply_full: closing.replyFull,
        session_id,
        conversation_id: conv.id,
        extracted_data: closing.extracted,
      });
    }

    // --------------------------------------------------------
    // RÉPONSE NORMALE
    // --------------------------------------------------------
    const enrichedFull = `${replyClean}\nDATA: ${safeJson(enriched)}`;
    await supabase.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: enrichedFull });

    return res.status(200).json({
      reply: replyClean,
      reply_full: enrichedFull,
      session_id,
      conversation_id: conv.id,
      extracted_data: enriched,
    });

  } catch (e) {
    console.error("❌ Erreur:", e);
    return res.status(500).json({ error: "Erreur serveur", details: e.message });
  }
}
