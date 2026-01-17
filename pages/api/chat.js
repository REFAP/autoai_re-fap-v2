// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 4.4
// Collecte DATA enrichie par inférence (verbatim, urgence, intent_stage)

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 4;

// ============================================================
// SYSTEM PROMPT V4.4
// Première question OUVERTE pour capter le verbatim brut
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP. Tu collectes les mots du client pour comprendre son problème de Filtre à Particules.

DÉFINITION
"FAP" = Filtre à Particules automobile. Aucune autre interprétation.

COMPORTEMENT
- Une seule question par message.
- Pars toujours de ce que le client vient de dire.
- PREMIER MESSAGE : pose une question OUVERTE pour laisser le client s'exprimer librement ("Qu'est-ce qui se passe exactement ?", "Raconte-moi ce qui t'arrive").
- Messages suivants : affine avec des questions factuelles courtes.
- Si la réponse est émotionnelle ou non factuelle, ramène calmement vers un fait observable.
- Cherche la précision, pas l'explication.
- Accepte les réponses floues, incomplètes, contradictoires.
- Ne corrige jamais son vocabulaire.
- Ne reformule jamais en jargon technique.

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
- Ne demande pas le code postal, le kilométrage, l'année précise.

LONGUEUR
2 phrases max. 1 question max.

OBJECTIF
- Tour 1 : question OUVERTE pour récupérer le verbatim brut.
- Tour 2 : identifier le symptôme si pas clair.
- Tour 3 : identifier le véhicule (marque + modèle).
- Ensuite : ne pose plus de questions.

DATA
À la fin de chaque message, ajoute une seule ligne :
DATA: {"symptome":"<enum>","codes":[],"vehicule":<string|null>,"intention":"<enum>","urgence":"<enum>","next_best_action":"<enum>"}

Enums :
- symptome : "voyant_fap" | "perte_puissance" | "mode_degrade" | "fumee" | "odeur" | "regeneration_impossible" | "code_obd" | "autre" | "inconnu"
- codes : tableau de strings ou []
- intention : "diagnostic" | "devis" | "rdv" | "info_generale" | "urgence" | "inconnu"
- urgence : "haute" | "moyenne" | "basse" | "inconnue"
- vehicule : string descriptif ou null
- next_best_action : "poser_question" | "proposer_diagnostic" | "proposer_rdv" | "proposer_devis" | "clore"`;

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
  // Données LLM
  symptome: "inconnu",
  codes: [],
  vehicule: null,
  intention: "inconnu",
  urgence: "inconnue",
  next_best_action: "poser_question",
  // Données inférées (ajoutées côté serveur)
  verbatim_brut: null,
  urgence_percue: "inconnue",
  immobilise: "inconnu",
  intent_stage: "info",
  mots_cles_seo: [],
};

// ============================================================
// INFÉRENCE : Urgence perçue (basée sur les mots)
// ============================================================
function inferUrgencePercue(text) {
  const t = String(text || "").toLowerCase();
  
  // Urgence HAUTE
  const highUrgency = [
    "bloqué", "bloquée", "immobilisé", "immobilisée", "plus rouler", "peux plus",
    "peut plus", "arrêté", "arrêtée", "panne", "sos", "urgence", "urgent",
    "clignotant", "clignote", "danger", "fume beaucoup", "calé", "calée",
    "remorquage", "dépanneuse", "garage fermé"
  ];
  if (highUrgency.some(w => t.includes(w))) return "haute";
  
  // Urgence MOYENNE
  const mediumUrgency = [
    "mode dégradé", "dégradé", "perte de puissance", "tire moins", "accélère mal",
    "voyant allumé", "voyant orange", "voyant fap", "anti pollution",
    "depuis quelques jours", "depuis hier", "ce matin"
  ];
  if (mediumUrgency.some(w => t.includes(w))) return "moyenne";
  
  // Urgence BASSE
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
// INFÉRENCE : Stade du parcours (info → solution → action)
// ============================================================
function inferIntentStage(text, history, acceptedCTA) {
  const t = String(text || "").toLowerCase();
  
  // ACTION : veut agir maintenant
  const actionWords = [
    "rdv", "rendez-vous", "devis", "rappel", "rappelez", "contact",
    "combien", "prix", "tarif", "réserver", "prendre rdv", "où", "garage"
  ];
  if (actionWords.some(w => t.includes(w)) || acceptedCTA) return "action";
  
  // SOLUTION : cherche une solution
  const solutionWords = [
    "comment faire", "que faire", "quoi faire", "solution", "réparer",
    "nettoyer", "nettoyage", "changer", "remplacer", "résoudre"
  ];
  if (solutionWords.some(w => t.includes(w))) return "solution";
  
  // INFO par défaut ou si questions générales
  const infoWords = [
    "c'est quoi", "qu'est-ce", "pourquoi", "est-ce que", "normal",
    "grave", "dangereux", "comprendre", "savoir", "expliquer"
  ];
  if (infoWords.some(w => t.includes(w))) return "info";
  
  // Si on a déjà plusieurs tours → probablement solution
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
  
  // Symptômes SEO
  const symptomesMap = {
    "voyant fap": "voyant fap allumé",
    "voyant orange": "voyant fap orange",
    "voyant anti pollution": "voyant antipollution",
    "perte de puissance": "perte puissance fap",
    "mode dégradé": "mode dégradé fap",
    "fap bouché": "fap bouché",
    "régénération": "régénération fap",
    "fumée": "fumée noire fap",
  };
  
  for (const [pattern, keyword] of Object.entries(symptomesMap)) {
    if (t.includes(pattern)) keywords.push(keyword);
  }
  
  // Codes OBD
  const codeMatch = t.match(/p[0-9]{4}/gi);
  if (codeMatch) {
    codeMatch.forEach(code => keywords.push(`code ${code.toUpperCase()}`));
  }
  
  // Véhicule + FAP
  if (vehicule) {
    keywords.push(`${vehicule} fap`.toLowerCase());
    keywords.push(`nettoyage fap ${vehicule}`.toLowerCase());
  }
  
  // Symptôme + action
  if (symptome && symptome !== "inconnu") {
    keywords.push(`${symptome.replace("_", " ")} solution`);
  }
  
  // Dédupe
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
      if (content.includes("trouver le bon pro") || content.includes("t'aider à trouver")) {
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

function getFirstUserMessage(history, currentMessage) {
  if (!Array.isArray(history)) return currentMessage;
  const firstUser = history.find(m => m.role === "user");
  return firstUser ? firstUser.content : currentMessage;
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

// ============================================================
// MESSAGE CLOSING : Question (sans ouvrir le formulaire)
// ============================================================
function buildClosingQuestion(extracted) {
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
    ...extracted,
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  const replyClean = `Au vu de ce que tu décris${vehicule}, ça ressemble à ${hint}. On connaît les meilleurs pros partout en France pour ce type de problème. Tu veux qu'on t'aide à trouver le bon pro près de chez toi ?`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE FORMULAIRE : Après accord utilisateur
// ============================================================
function buildFormCTA(extracted) {
  const data = {
    ...extracted,
    intention: "rdv",
    intent_stage: "action",
    next_best_action: "clore",
  };

  const replyClean = `Super ! Laisse tes coordonnées ici et on te rappelle rapidement pour t'orienter vers la meilleure solution près de chez toi.`;
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

  const replyClean = `Pas de souci ! Si tu changes d'avis ou si tu as d'autres questions, je suis là. Bonne route 👋`;
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
// HELPER : Récupérer la dernière DATA extraite de l'historique
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

    // Collecter tous les messages user (historique + actuel)
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
    // OVERRIDE 1 : User a reçu la question closing et répond OUI
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
    // OVERRIDE 2 : User a reçu la question closing et répond NON
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
    // OVERRIDE 3 : User demande explicitement formulaire/rdv
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
    // OVERRIDE 4 : Trop de tours → question closing forcée
    // --------------------------------------------------------
    const userTurns = countUserTurns(history) + 1;
    if (userTurns >= MAX_USER_TURNS && !lastAssistantAskedClosingQuestion(history)) {
      const enrichedData = enrichDataWithInferences(lastExtracted, allUserMessages, history, false);
      const closing = buildClosingQuestion(enrichedData);

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

    const llmExtracted = extractDataFromReply(replyFull) || DEFAULT_DATA;
    const replyClean = cleanReplyForUI(replyFull);

    // Enrichir avec inférences
    const enrichedData = enrichDataWithInferences(llmExtracted, allUserMessages, history, false);

    // --------------------------------------------------------
    // AUTO-CLOSE : symptôme + véhicule → question closing
    // --------------------------------------------------------
    if (hasEnoughToClose(enrichedData)) {
      const closing = buildClosingQuestion(enrichedData);

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
    // Reconstruire le replyFull avec DATA enrichie
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
