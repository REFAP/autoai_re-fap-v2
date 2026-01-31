// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 5.0 AMÉLIORÉE
// Basé sur l'analyse de ~1000 conversations réelles
// Améliorations : collecte véhicule obligatoire, questions fréquentes, data enrichi

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 4; // Augmenté de 3 à 4 pour collecter plus d'infos

// ============================================================
// SYSTEM PROMPT - VERSION 5.0
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP. Tu rassures le client et collectes les infos clés pour l'orienter vers un diagnostic gratuit.

DÉFINITION ABSOLUE (PRIORITÉ MAXIMALE)
"FAP" = Filtre à Particules automobile diesel. JAMAIS d'autre interprétation.
Même si l'utilisateur écrit "fap" en minuscules ou répète le mot, c'est TOUJOURS le filtre auto.
Tu es un assistant AUTOMOBILE, rien d'autre.

MESSAGE CLÉ (à distiller naturellement)
Dans la majorité des cas, un nettoyage professionnel suffit — bien moins cher qu'un remplacement (99-149€ vs 1500-2500€).

COMPORTEMENT
- Une seule question par message.
- Rassure dès le premier échange : "Pas de panique, c'est souvent réparable."
- Pars toujours de ce que le client vient de dire.
- Si l'entrée est courte ou ambiguë, pose une question factuelle.
- Accepte les réponses floues, incomplètes, contradictoires.
- Ne corrige jamais son vocabulaire.
- Ne reformule jamais en jargon technique.

STYLE
- Ton naturel, bref, rassurant, humain.
- Pas de listes, pas de parenthèses explicatives, pas de bullet points.
- Tutoiement.

INTERDITS ABSOLUS
- Diagnostic définitif avant d'avoir assez d'éléments.
- Résumés non demandés.
- Réponses longues (plus de 3 phrases).
- Ton professoral ou alarmiste.
- Sujets hors automobile.
- Conseils de suppression FAP ou reprogrammation.
- Ne promets jamais de délai précis.
- Ne demande pas le code postal (le formulaire s'en charge).
- NE JAMAIS interpréter "FAP" autrement que comme Filtre à Particules.

LONGUEUR
2-3 phrases max. 1 question max.

OBJECTIF (4 tours max)
- Tour 1 : identifier le symptôme principal + rassurer
- Tour 2 : demander le véhicule (marque au minimum) SI pas encore connu
- Tour 3 : question complémentaire OU closing si assez d'infos
- Tour 4 : closing avec argument prix

COLLECTE OBLIGATOIRE (avant closing)
Tu DOIS avoir au minimum :
1. Le symptôme (voyant, perte puissance, fumée, etc.)
2. Le véhicule (au moins la marque)

Si tu n'as pas le véhicule après avoir identifié le symptôme, demande-le :
→ "C'est quelle voiture ?" ou "Tu roules en quoi ?"

QUESTIONS BONUS (si l'occasion se présente, pas obligatoire)
- Kilométrage approximatif : "Elle a combien de km environ ?"
- Type trajets : "Tu roules plutôt en ville ou autoroute ?"

RÉPONSES AUX QUESTIONS FRÉQUENTES
Réponds naturellement à ces questions courantes SANS ignorer la question :

Q: "Vous faites aussi l'EGR / vanne EGR ?"
R: "Oui, on traite aussi l'EGR, c'est souvent lié au FAP. Tu as un souci en ce moment ?"

Q: "C'est combien ?" / "Quels sont les tarifs ?" / "Quel prix ?"
R: "Le nettoyage pro c'est entre 99 et 149€ selon le niveau d'encrassement. Bien moins cher qu'un remplacement à 1500€+."

Q: "Vous êtes où ?" / "Quel garage ?" / "C'est où ?"
R: "On a des partenaires partout en France. Dis-moi ta voiture et ton souci, on te trouve le plus proche."

Q: "La cérine ?" / "L'additif ?" / "L'Eolys ?" / "La poche de cérine ?"
R: "Si ta voiture utilise de l'additif (Peugeot, Citroën, DS), on vérifie ça aussi lors du diagnostic."

Q: "Comment ça marche ?" / "C'est quoi le process ?"
R: "Un expert analyse ton cas, te conseille, et si besoin te met en contact avec un pro près de chez toi. Gratuit et sans engagement."

Q: "Quelles sont les formules ?" / "Les différentes options ?"
R: "On a deux formules : nettoyage standard (99€) pour encrassement léger, et premium (149€) pour les cas plus avancés."

DÉTECTION DU NIVEAU TECHNIQUE
Si l'utilisateur mentionne : cérine, Eolys, P2002, P2463, régénération, capteur différentiel, mode dégradé forcé, valise OBD, code défaut...
→ C'est un utilisateur technique, tu peux être légèrement plus précis
→ Sinon, reste simple et rassurant

ARGUMENTS DE CLOSING
- "Gratuit et sans engagement"
- "Un expert Re-FAP analyse ta situation"
- "On te rappelle rapidement"
- "Nettoyage pro = 99-149€ vs remplacement 1500€+"
- "On a des partenaires partout en France"

DATA (ajouter à CHAQUE réponse, sur une seule ligne à la fin)
DATA: {"symptome":"<voyant_fap|perte_puissance|fumee|mode_degrade|acoups|bruit|autre|inconnu>","codes":[],"marque":"<string|null>","modele":"<string|null>","kilometrage":"<moins_50k|50k_100k|100k_150k|plus_150k|inconnu>","urgence":"<basse|moyenne|haute>","intention":"<diagnostic|devis|rdv|question|inconnu>","next_best_action":"<poser_question|demander_vehicule|proposer_devis|clore>"}`;

// ============================================================
// SUPABASE - Variables
// ============================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Variables Supabase manquantes:", { url: !!supabaseUrl, key: !!supabaseServiceKey });
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================
// CORS
// ============================================================
const ALLOWED_ORIGINS = [
  "https://autoai-re-fap-v2.vercel.app",
  "https://re-fap.fr",
  "https://www.re-fap.fr",
  "https://auto.re-fap.fr",
  "http://localhost:3000",
];

// ============================================================
// DEFAULT DATA - VERSION 5.0
// ============================================================
const DEFAULT_DATA = {
  symptome: "inconnu",
  codes: [],
  marque: null,
  modele: null,
  kilometrage: "inconnu",
  urgence: "inconnue",
  intention: "inconnu",
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
  
  let text = String(fullReply);
  
  const dataIndex = text.indexOf("DATA:");
  if (dataIndex !== -1) {
    text = text.substring(0, dataIndex);
  }
  
  text = text.trim();
  
  return text;
}

function extractDataFromReply(fullReply) {
  if (!fullReply) return null;
  const normalized = normalizeDataPosition(fullReply);
  const match = normalized.match(/\nDATA:\s*(\{[\s\S]*\})\s*$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        symptome: parsed.symptome || "inconnu",
        codes: parsed.codes || [],
        marque: parsed.marque || null,
        modele: parsed.modele || null,
        kilometrage: parsed.kilometrage || "inconnu",
        urgence: parsed.urgence || "inconnue",
        intention: parsed.intention || "inconnu",
        next_best_action: parsed.next_best_action || "poser_question",
      };
    } catch {
      return null;
    }
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
  const yesWords = ["oui", "ouais", "ok", "d'accord", "go", "yes", "yep", "ouep", "volontiers", "je veux bien", "avec plaisir", "carrément", "bien sûr", "pourquoi pas", "allons-y", "vas-y"];
  return yesWords.some((w) => t.includes(w)) || t === "o";
}

function userSaysNo(text) {
  const t = String(text || "").toLowerCase().trim();
  const noWords = ["non", "nan", "nope", "pas maintenant", "plus tard", "non merci", "pas pour l'instant"];
  return noWords.some((w) => t.includes(w));
}

function lastAssistantAskedClosingQuestion(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("expert re-fap analyse") || content.includes("gratuit et sans engagement") || content.includes("qu'un expert")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function lastAssistantAskedVehicle(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("quelle voiture") || content.includes("roules en quoi") || content.includes("comme véhicule")) {
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
// HELPERS : Véhicule Detection (NOUVEAU v5)
// ============================================================
function extractVehicleFromMessage(text) {
  const t = String(text || "").toLowerCase();
  
  const marques = {
    "peugeot": "Peugeot",
    "renault": "Renault",
    "citroen": "Citroën",
    "citroën": "Citroën",
    "volkswagen": "Volkswagen",
    "vw": "Volkswagen",
    "audi": "Audi",
    "bmw": "BMW",
    "mercedes": "Mercedes",
    "ford": "Ford",
    "opel": "Opel",
    "fiat": "Fiat",
    "seat": "Seat",
    "skoda": "Skoda",
    "škoda": "Skoda",
    "toyota": "Toyota",
    "nissan": "Nissan",
    "hyundai": "Hyundai",
    "kia": "Kia",
    "dacia": "Dacia",
    "ds": "DS",
    "volvo": "Volvo",
    "mini": "Mini",
    "jeep": "Jeep",
    "land rover": "Land Rover",
    "range rover": "Range Rover",
    "alfa romeo": "Alfa Romeo",
    "alfa": "Alfa Romeo",
    "mazda": "Mazda",
    "suzuki": "Suzuki",
    "honda": "Honda",
    "mitsubishi": "Mitsubishi",
  };
  
  for (const [key, value] of Object.entries(marques)) {
    if (t.includes(key)) {
      return value;
    }
  }
  
  return null;
}

// ============================================================
// HELPERS : Closing Detection (MODIFIÉ v5)
// ============================================================
function hasEnoughToClose(extracted) {
  if (!extracted) return false;
  
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasMarque = extracted.marque && extracted.marque !== null;
  
  return Boolean(hasSymptome && hasMarque);
}

function hasSymptomeButNoVehicle(extracted) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasMarque = extracted.marque && extracted.marque !== null;
  return hasSymptome && !hasMarque;
}

// ============================================================
// MESSAGE CLOSING (version 5.0)
// ============================================================
function buildClosingQuestion(extracted) {
  const symptome = extracted?.symptome || "inconnu";
  const marque = extracted?.marque;
  const modele = extracted?.modele;
  
  let vehicleInfo = "";
  if (marque) {
    vehicleInfo = modele ? ` pour ta ${marque} ${modele}` : ` pour ta ${marque}`;
  }
  
  const hints = {
    voyant_fap: "un souci de FAP",
    perte_puissance: "un FAP probablement encrassé",
    mode_degrade: "un FAP saturé",
    fumee: "un problème de combustion lié au FAP",
    acoups: "un encrassement du FAP",
    bruit: "un souci lié au FAP",
    autre: "un souci lié au FAP",
  };
  const hint = hints[symptome] || "un souci lié au FAP";

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  const replyClean = `D'après ce que tu décris, ça ressemble à ${hint}. Bonne nouvelle : un nettoyage pro suffit souvent (99-149€ au lieu de 1500€+ pour un remplacement). Tu veux qu'un expert Re-FAP analyse ta situation${vehicleInfo} ? C'est gratuit et sans engagement.`;
  
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE DEMANDE VÉHICULE (NOUVEAU v5)
// ============================================================
function buildVehicleQuestion(extracted) {
  const data = {
    ...(extracted || DEFAULT_DATA),
    next_best_action: "demander_vehicule",
  };

  const variants = [
    "D'accord, je comprends. C'est quelle voiture ?",
    "Ok, on va regarder ça. Tu roules en quoi ?",
    "Compris. C'est quoi comme véhicule ?",
  ];
  const replyClean = variants[Math.floor(Math.random() * variants.length)];
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE FORMULAIRE
// ============================================================
function buildFormCTA(extracted) {
  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "rdv",
    next_best_action: "clore",
  };

  const replyClean = `Parfait ! Laisse tes coordonnées et un expert Re-FAP te rappelle rapidement pour t'orienter vers la meilleure solution près de chez toi.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE SI USER DIT NON
// ============================================================
function buildDeclinedResponse(extracted) {
  const data = {
    ...(extracted || DEFAULT_DATA),
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
      if (extracted) return extracted;
    }
  }
  return { ...DEFAULT_DATA };
}

// ============================================================
// HELPER : Merge les données extraites (NOUVEAU v5)
// ============================================================
function mergeExtractedData(previous, current, userMessage) {
  const merged = { ...DEFAULT_DATA };
  
  merged.symptome = (current?.symptome && current.symptome !== "inconnu") ? current.symptome : previous?.symptome || "inconnu";
  merged.codes = (current?.codes?.length > 0) ? current.codes : previous?.codes || [];
  merged.marque = current?.marque || previous?.marque || null;
  merged.modele = current?.modele || previous?.modele || null;
  merged.kilometrage = (current?.kilometrage && current.kilometrage !== "inconnu") ? current.kilometrage : previous?.kilometrage || "inconnu";
  merged.urgence = (current?.urgence && current.urgence !== "inconnue") ? current.urgence : previous?.urgence || "inconnue";
  merged.intention = (current?.intention && current.intention !== "inconnu") ? current.intention : previous?.intention || "inconnu";
  merged.next_best_action = current?.next_best_action || "poser_question";
  
  if (!merged.marque) {
    const detectedMarque = extractVehicleFromMessage(userMessage);
    if (detectedMarque) {
      merged.marque = detectedMarque;
    }
  }
  
  return merged;
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

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: "Configuration Supabase manquante" });
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

    // Récupérer les données précédentes
    let lastExtracted = extractLastExtractedData(history);
    
    // Détecter la marque dans le message actuel
    const detectedMarque = extractVehicleFromMessage(message);
    if (detectedMarque && !lastExtracted.marque) {
      lastExtracted = { ...lastExtracted, marque: detectedMarque };
    }

    // --------------------------------------------------------
    // OVERRIDE 1 : User a reçu la question closing et répond OUI
    // --------------------------------------------------------
    if (lastAssistantAskedClosingQuestion(history) && userSaysYes(message)) {
      const formResponse = buildFormCTA(lastExtracted);

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
      const declinedResponse = buildDeclinedResponse(lastExtracted);

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
      const formResponse = buildFormCTA(lastExtracted);

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

    const userTurns = countUserTurns(history) + 1;

    // --------------------------------------------------------
    // OVERRIDE 4 : Tour 3+ sans véhicule → FORCER la question véhicule
    // C'est CRITIQUE : on ne veut JAMAIS closer sans le véhicule
    // --------------------------------------------------------
    if (userTurns >= 3 && !lastExtracted.marque && !lastAssistantAskedVehicle(history) && !lastAssistantAskedClosingQuestion(history)) {
      const vehicleQ = buildVehicleQuestion(lastExtracted);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: vehicleQ.replyFull,
      });

      return res.status(200).json({
        reply: vehicleQ.replyClean,
        reply_full: vehicleQ.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: vehicleQ.extracted,
      });
    }
    
    // --------------------------------------------------------
    // OVERRIDE 5 : Trop de tours → closing forcé (mais seulement si on a le véhicule)
    // --------------------------------------------------------
    if (userTurns >= MAX_USER_TURNS && lastExtracted.marque && !lastAssistantAskedClosingQuestion(history)) {
      const closing = buildClosingQuestion(lastExtracted);

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
        max_tokens: 200,
      }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return res.status(500).json({ error: "Erreur Mistral API", details: errText });
    }

    const mistralData = await mistralResponse.json();
    let replyFull = mistralData.choices?.[0]?.message?.content || "";
    
    // Extraire DATA et merger
    const rawExtracted = extractDataFromReply(replyFull) || DEFAULT_DATA;
    const extracted = mergeExtractedData(lastExtracted, rawExtracted, message);
    
    // Nettoyer pour l'UI
    let replyClean = cleanReplyForUI(replyFull);
    
    // FALLBACK
    if (!replyClean || replyClean.length < 5) {
      if (!extracted.marque) {
        replyClean = "D'accord. C'est quelle voiture ?";
        extracted.next_best_action = "demander_vehicule";
      } else if (extracted.symptome === "inconnu") {
        replyClean = "Ok. Qu'est-ce qui se passe exactement avec ta voiture ?";
      } else {
        replyClean = "Je comprends. Autre chose à signaler ?";
      }
    }
    
    // Reconstruire replyFull
    replyFull = `${replyClean}\nDATA: ${safeJsonStringify(extracted)}`;

    // --------------------------------------------------------
    // AUTO-CLOSE si symptôme + véhicule
    // SÉCURITÉ : on ne close JAMAIS sans le véhicule !
    // --------------------------------------------------------
    if (hasEnoughToClose(extracted) && !lastAssistantAskedClosingQuestion(history)) {
      const closing = buildClosingQuestion(extracted);

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
    // SÉCURITÉ : Si le LLM a généré un closing mais sans véhicule → forcer question véhicule
    // --------------------------------------------------------
    const looksLikeClosing = replyClean.toLowerCase().includes("expert re-fap") || replyClean.toLowerCase().includes("gratuit et sans engagement");
    if (looksLikeClosing && !extracted.marque) {
      const vehicleQ = buildVehicleQuestion(extracted);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: vehicleQ.replyFull,
      });

      return res.status(200).json({
        reply: vehicleQ.replyClean,
        reply_full: vehicleQ.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: vehicleQ.extracted,
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
