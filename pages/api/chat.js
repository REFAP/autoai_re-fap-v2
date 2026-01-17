// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 4.5
// Flow ultra minimal : 1 question ouverte + 1 véhicule + closing affirmé

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 3; // ouverte + véhicule + confirmation = 3 max

// ============================================================
// SYSTEM PROMPT V4.5
// Ultra minimal : 1 question ouverte, 1 véhicule, c'est tout
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP, spécialiste du nettoyage de Filtre à Particules.

DÉFINITION
"FAP" = Filtre à Particules automobile. Aucune autre interprétation.

TON RÔLE
Collecter le verbatim brut du client et identifier son véhicule. C'est TOUT.
Tu n'es pas là pour diagnostiquer, expliquer ou éduquer.

FLOW STRICT (2 questions max)

TOUR 1 - QUESTION OUVERTE (obligatoire)
Pose UNE question ouverte pour laisser le client s'exprimer librement.
Exemples :
- "Qu'est-ce qui se passe avec votre voiture ?"
- "Racontez-moi ce qui vous arrive."
- "Décrivez-moi le problème."
NE POSE PAS de question fermée (oui/non, choix multiple).
NE DEMANDE PAS "c'est quel voyant" ou "depuis quand".
Laisse le client parler.

TOUR 2 - VÉHICULE (si pas encore donné)
Une seule question simple :
- "C'est quelle voiture ?"
- "Quel véhicule ?"

ENSUITE : STOP
Ne pose plus de questions. Attends que le système prenne le relais.

STYLE
- Ton naturel, court, direct.
- Jamais de liste, jamais de parenthèses, jamais de jargon.
- 1 phrase max. 1 question max.

INTERDITS ABSOLUS
- Poser plusieurs questions dans un message
- Demander kilométrage, année, code postal
- Expliquer ce qu'est un FAP
- Donner des conseils techniques
- Utiliser "mode dégradé", "régénération", "anti-pollution" en premier
- Diagnostiquer ou suggérer une cause

DATA
À la fin de chaque message, ajoute :
DATA: {"symptome":"<enum>","codes":[],"vehicule":<string|null>,"intention":"<enum>","urgence":"<enum>","next_best_action":"<enum>"}

Enums :
- symptome : "voyant_fap" | "perte_puissance" | "mode_degrade" | "fumee" | "odeur" | "autre" | "inconnu"
- intention : "diagnostic" | "devis" | "rdv" | "info_generale" | "urgence" | "inconnu"
- urgence : "haute" | "moyenne" | "basse" | "inconnue"
- next_best_action : "poser_question" | "proposer_devis" | "clore"`;

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
// SCHÉMA DATA ENRICHI
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
// INFÉRENCE : Urgence perçue
// ============================================================
function inferUrgencePercue(text) {
  const t = String(text || "").toLowerCase();
  
  const highUrgency = [
    "bloqué", "bloquée", "immobilisé", "immobilisée", "plus rouler", "peux plus",
    "peut plus", "arrêté", "panne", "sos", "urgence", "urgent", "clignotant",
    "clignote", "danger", "fume beaucoup", "calé", "calée", "dépanneuse",
    "bord de la route", "autoroute", "sécurité"
  ];
  if (highUrgency.some(w => t.includes(w))) return "haute";
  
  const mediumUrgency = [
    "voyant", "allumé", "perte de puissance", "tire moins", "accélère mal",
    "fume", "fumée", "depuis quelques jours", "depuis hier", "ce matin",
    "mode dégradé", "dégradé"
  ];
  if (mediumUrgency.some(w => t.includes(w))) return "moyenne";
  
  const lowUrgency = [
    "question", "renseignement", "info", "savoir", "comprendre",
    "depuis longtemps", "depuis des mois", "de temps en temps"
  ];
  if (lowUrgency.some(w => t.includes(w))) return "basse";
  
  return "inconnue";
}

// ============================================================
// INFÉRENCE : Immobilisation
// ============================================================
function inferImmobilisation(text) {
  const t = String(text || "").toLowerCase();
  
  const immobilise = [
    "bloqué", "bloquée", "immobilisé", "immobilisée", "plus rouler",
    "peux plus rouler", "peut plus rouler", "ne roule plus", "roule plus",
    "en panne", "calé", "calée", "ne démarre plus", "démarre plus"
  ];
  if (immobilise.some(w => t.includes(w))) return "oui";
  
  const rouleEncore = [
    "roule encore", "je roule", "peux rouler", "peut rouler",
    "marche encore", "fonctionne encore", "ça roule"
  ];
  if (rouleEncore.some(w => t.includes(w))) return "non";
  
  return "inconnu";
}

// ============================================================
// INFÉRENCE : Stade du parcours
// ============================================================
function inferIntentStage(text, history, acceptedCTA) {
  const t = String(text || "").toLowerCase();
  
  const actionWords = [
    "rdv", "rendez-vous", "devis", "rappel", "rappelez", "contact",
    "combien", "prix", "tarif", "réserver", "où", "garage"
  ];
  if (actionWords.some(w => t.includes(w)) || acceptedCTA) return "action";
  
  const solutionWords = [
    "comment faire", "que faire", "quoi faire", "solution", "réparer",
    "nettoyer", "nettoyage", "changer", "remplacer", "résoudre"
  ];
  if (solutionWords.some(w => t.includes(w))) return "solution";
  
  if (Array.isArray(history) && history.filter(m => m.role === "user").length >= 2) {
    return "solution";
  }
  
  return "info";
}

// ============================================================
// INFÉRENCE : Extraction mots-clés SEO
// ============================================================
function extractMotsClesSEO(text, vehicule, symptome) {
  const keywords = [];
  const t = String(text || "").toLowerCase();
  
  const symptomesMap = {
    "voyant": "voyant fap allumé",
    "perte de puissance": "perte puissance fap",
    "fume": "fumée fap",
    "fumée": "fumée noire fap",
    "bouché": "fap bouché",
    "encrassé": "fap encrassé",
  };
  
  for (const [pattern, keyword] of Object.entries(symptomesMap)) {
    if (t.includes(pattern)) keywords.push(keyword);
  }
  
  const codeMatch = t.match(/p[0-9]{4}/gi);
  if (codeMatch) {
    codeMatch.forEach(code => keywords.push(`code ${code.toUpperCase()}`));
  }
  
  if (vehicule) {
    keywords.push(`${vehicule} fap`.toLowerCase());
    keywords.push(`nettoyage fap ${vehicule}`.toLowerCase());
  }
  
  return [...new Set(keywords)].slice(0, 10);
}

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
  const yesWords = ["oui", "ouais", "ok", "d'accord", "go", "yes", "yep", "ouep", "volontiers", "je veux bien", "avec plaisir", "carrément", "bien sûr", "pourquoi pas"];
  return yesWords.some((w) => t.includes(w)) || t === "o";
}

function userSaysNo(text) {
  const t = String(text || "").toLowerCase().trim();
  const noWords = ["non", "nan", "nope", "pas maintenant", "plus tard", "non merci"];
  return noWords.some((w) => t.includes(w));
}

function lastAssistantAskedClosingQuestion(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("on vous rappelle") || content.includes("laissez vos coordonnées") || content.includes("prise en charge")) {
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
  const hasVehicule = extracted.vehicule && String(extracted.vehicule).trim().length >= 3;
  return Boolean(hasSymptome && hasVehicule);
}

// ============================================================
// MESSAGE CLOSING : Positionnement Re-FAP fort
// ============================================================
function buildClosingQuestion(extracted, allUserMessages) {
  const symptome = extracted?.symptome || "inconnu";
  const vehicule = extracted?.vehicule || "";
  const verbatim = allUserMessages[0] || "";
  
  // Construire la synthèse basée sur le verbatim
  let synthese = "";
  const v = verbatim.toLowerCase();
  
  if (v.includes("voyant") && v.includes("puissance")) {
    synthese = "voyant allumé + perte de puissance";
  } else if (v.includes("voyant")) {
    synthese = "voyant allumé";
  } else if (v.includes("puissance") || v.includes("tire")) {
    synthese = "perte de puissance";
  } else if (v.includes("fume") || v.includes("fumée")) {
    synthese = "fumée";
  } else if (v.includes("bloqué") || v.includes("panne")) {
    synthese = "véhicule bloqué";
  } else {
    synthese = "problème FAP/antipollution";
  }

  const vehiculeStr = vehicule ? ` sur ${vehicule}` : "";

  const data = {
    ...extracted,
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  // MESSAGE REPOSITIONNÉ : Re-FAP = LA solution, pas un annuaire
  const replyClean = `D'après ce que vous décrivez (${synthese}${vehiculeStr}), il s'agit très probablement d'un encrassement FAP. Chez Re-FAP, on traite ce type de problème sans remplacement et sans suppression. Vous voulez qu'on vérifie si votre cas est pris en charge ?`;
  
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE FORMULAIRE : Après accord
// ============================================================
function buildFormCTA(extracted) {
  const data = {
    ...extracted,
    intention: "rdv",
    intent_stage: "action",
    next_best_action: "clore",
  };

  const replyClean = `Parfait. Laissez vos coordonnées ici, on vous rappelle rapidement pour confirmer la prise en charge et vous donner une estimation.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE SI USER DIT NON
// ============================================================
function buildDeclinedResponse(extracted) {
  const data = {
    ...extracted,
    next_best_action: "clore",
  };

  const replyClean = `Pas de souci. Si vous changez d'avis ou si vous avez d'autres questions, je suis là. Bonne route 👋`;
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
// HELPER : Récupérer la dernière DATA extraite
// ============================================================
function extractLastExtractedData(history) {
  if (!Array.isArray(history)) return { ...DEFAULT_DATA };
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = history[i].raw || history[i].content || "";
      const extracted = extractDataFromReply(content);
      if (extracted) return { ...DEFAULT_DATA, ...extracted };
    }
  }
  return { ...DEFAULT_DATA };
}

// ============================================================
// ENRICHIR DATA avec inférences
// ============================================================
function enrichDataWithInferences(baseData, allUserMessages, history, acceptedCTA = false) {
  const concatenatedText = allUserMessages.join(" ");
  const firstMessage = allUserMessages[0] || "";
  
  return {
    ...baseData,
    verbatim_brut: firstMessage,
    urgence_percue: inferUrgencePercue(concatenatedText),
    immobilise: inferImmobilisation(concatenatedText),
    intent_stage: inferIntentStage(concatenatedText, history, acceptedCTA),
    mots_cles_seo: extractMotsClesSEO(concatenatedText, baseData.vehicule, baseData.symptome),
  };
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

    // Collecter tous les messages user
    const allUserMessages = [
      ...history.filter(m => m.role === "user").map(m => m.content),
      message
    ];

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

    const lastExtracted = extractLastExtractedData(history);

    // --------------------------------------------------------
    // OVERRIDE 1 : User répond OUI au closing
    // --------------------------------------------------------
    if (lastAssistantAskedClosingQuestion(history) && userSaysYes(message)) {
      const enrichedData = enrichDataWithInferences(lastExtracted, allUserMessages, history, true);
      const formResponse = buildFormCTA(enrichedData);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: formResponse.replyFull,
      });

      return res.status(200).json({
        reply: formResponse.replyClean,
        reply_full: formResponse.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: formResponse.extracted,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // OVERRIDE 2 : User répond NON au closing
    // --------------------------------------------------------
    if (lastAssistantAskedClosingQuestion(history) && userSaysNo(message)) {
      const enrichedData = enrichDataWithInferences(lastExtracted, allUserMessages, history, false);
      const declinedResponse = buildDeclinedResponse(enrichedData);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: declinedResponse.replyFull,
      });

      return res.status(200).json({
        reply: declinedResponse.replyClean,
        reply_full: declinedResponse.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: declinedResponse.extracted,
      });
    }

    // --------------------------------------------------------
    // OVERRIDE 3 : User demande explicitement rdv/devis
    // --------------------------------------------------------
    if (userWantsFormNow(message)) {
      const enrichedData = enrichDataWithInferences(lastExtracted, allUserMessages, history, true);
      const formResponse = buildFormCTA(enrichedData);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: formResponse.replyFull,
      });

      return res.status(200).json({
        reply: formResponse.replyClean,
        reply_full: formResponse.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: formResponse.extracted,
        action: { type: "OPEN_FORM", url: FORM_URL },
      });
    }

    // --------------------------------------------------------
    // OVERRIDE 4 : Trop de tours → closing forcé
    // --------------------------------------------------------
    const userTurns = countUserTurns(history) + 1;
    if (userTurns >= MAX_USER_TURNS && !lastAssistantAskedClosingQuestion(history)) {
      const enrichedData = enrichDataWithInferences(lastExtracted, allUserMessages, history, false);
      const closing = buildClosingQuestion(enrichedData, allUserMessages);

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
        temperature: 0.3,
        max_tokens: 120,
      }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return res.status(500).json({ error: "Erreur Mistral API", details: errText });
    }

    const mistralData = await mistralResponse.json();
    const replyFull = mistralData.choices?.[0]?.message?.content || `OK.\nDATA: ${safeJsonStringify(DEFAULT_DATA)}`;

    const llmExtracted = extractDataFromReply(replyFull) || DEFAULT_DATA;
    const replyClean = cleanReplyForUI(replyFull);

    // Enrichir avec inférences
    const enrichedData = enrichDataWithInferences(llmExtracted, allUserMessages, history, false);

    // --------------------------------------------------------
    // AUTO-CLOSE : symptôme + véhicule → question closing
    // --------------------------------------------------------
    if (hasEnoughToClose(enrichedData)) {
      const closing = buildClosingQuestion(enrichedData, allUserMessages);

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
      });
    }

    // --------------------------------------------------------
    // RÉPONSE NORMALE
    // --------------------------------------------------------
    const enrichedReplyFull = `${replyClean}\nDATA: ${safeJsonStringify(enrichedData)}`;

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: enrichedReplyFull,
    });

    return res.status(200).json({
      reply: replyClean,
      reply_full: enrichedReplyFull,
      session_id,
      conversation_id: conversationId,
      extracted_data: enrichedData,
    });

  } catch (error) {
    console.error("❌ Erreur handler chat:", error);
    return res.status(500).json({ error: "Erreur serveur interne", details: error.message });
  }
}
