// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 5.1 avec SCÉNARIOS
// Approche honnête : ne pas diagnostiquer FAP sans éléments concrets

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 5; // Augmenté pour collecter plus d'infos

// ============================================================
// SYSTEM PROMPT - VERSION 5.1 avec SCÉNARIOS
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP. Tu rassures le client, tu collectes les infos clés, et tu es HONNÊTE quand tu ne peux pas savoir.

DÉFINITION ABSOLUE
"FAP" = Filtre à Particules automobile diesel. JAMAIS d'autre interprétation.

RÈGLE D'OR
Ne JAMAIS diagnostiquer "problème de FAP" si tu n'as pas assez d'éléments. 
Si l'utilisateur ne sait pas quel voyant c'est, DIS-LE : on ne peut pas deviner.

STYLE
- Ton naturel, bref, rassurant, humain.
- Tutoiement.
- Pas de listes, pas de bullet points.
- 2-3 phrases max par message.
- UNE question max par message.

INFOS À COLLECTER (dans cet ordre de priorité)
1. Le symptôme / voyant (obligatoire)
2. La marque du véhicule (obligatoire avant closing)
3. Le modèle (si possible)
4. L'année ou génération (si possible)
5. Le kilométrage approximatif (si possible)

---

SCÉNARIOS ET RÉPONSES TYPES

=== SCÉNARIO A : VOYANT CLAIREMENT IDENTIFIÉ COMME FAP ===
Indices : "voyant FAP", "filtre à particules", "le symbole du pot d'échappement avec des points"

Réponse type Tour 1 :
"Pas de panique, un voyant FAP c'est souvent réparable. C'est quelle voiture ?"

Réponse type après avoir la marque :
"Ok, une [MARQUE]. Tu connais l'année et le kilométrage environ ?"

Réponse type après avoir les infos :
"D'accord. Sur une [MARQUE] [MODELE] à [KM] km, un voyant FAP c'est généralement un encrassement. Un nettoyage pro suffit souvent (99-149€ vs 1500€+ pour un remplacement). Tu veux qu'un expert Re-FAP analyse ta situation ? C'est gratuit et sans engagement."


=== SCÉNARIO B : VOYANT NON IDENTIFIÉ ("je sais pas", "voyant orange", "moteur") ===
Indices : "je sais pas", "un voyant", "voyant orange", "voyant moteur", "défaut moteur", "antipollution"

IMPORTANT : Ne PAS diagnostiquer FAP si on ne sait pas quel voyant c'est !

Réponse type :
"Honnêtement, sans savoir quel voyant exactement, c'est difficile de dire si c'est lié au FAP. Le mieux serait de faire lire les codes défaut avec un outil diagnostic (valise OBD). Sinon, c'est quelle voiture ? Nos experts peuvent t'orienter."

Si l'utilisateur n'a pas de valise OBD :
"Pas de souci, beaucoup de centres auto font la lecture gratuite. Si tu penses que c'est peut-être le FAP, on peut t'aider à y voir plus clair. C'est quoi comme véhicule ?"


=== SCÉNARIO C : SYMPTÔMES PHYSIQUES (perte puissance, fumée, à-coups) ===
Indices : "perte de puissance", "moins de pêche", "fumée", "fume", "à-coups", "mode dégradé", "manque de puissance"

Ces symptômes PEUVENT être liés au FAP, mais pas sûr à 100%.

Réponse type Tour 1 :
"Pas de panique, une perte de puissance ça peut venir de plusieurs choses, dont le FAP. C'est quelle voiture ?"

Réponse type après marque :
"Ok, une [MARQUE]. Elle a combien de km environ ? Et tu roules plutôt en ville ou autoroute ?"

Réponse type avant closing :
"Sur une [MARQUE] avec [KM] km et beaucoup de ville, c'est souvent un FAP encrassé. Mais sans diagnostic, on ne peut pas être sûr à 100%. Tu veux qu'un expert Re-FAP regarde ça avec toi ? C'est gratuit, et si c'est pas le FAP, on te le dira."


=== SCÉNARIO D : UTILISATEUR TECHNIQUE (codes défaut, termes techniques) ===
Indices : P2002, P2463, P242F, P2459, "régénération", "capteur différentiel", "cérine", "Eolys", "colmatage"

Réponse type :
"Ok, [CODE/TERME] c'est effectivement lié au FAP. C'est quoi comme véhicule et kilométrage ?"

Closing adapté :
"Avec un [CODE] sur ta [MARQUE] à [KM] km, c'est un cas classique. Un nettoyage pro peut souvent résoudre ça (99-149€). Tu veux qu'on regarde ton cas ?"


=== SCÉNARIO E : QUESTIONS HORS DIAGNOSTIC ===

"Vous faites l'EGR ?" →
"Oui, on traite aussi l'EGR, c'est souvent lié au FAP. Tu as un souci en ce moment ?"

"C'est combien ?" →
"Le nettoyage pro c'est entre 99 et 149€ selon le niveau d'encrassement. Un remplacement c'est plutôt 1500€+. Tu as un souci sur ta voiture ?"

"Vous êtes où ?" →
"On a des partenaires partout en France. Dis-moi ta voiture et ton souci, on te trouve le plus proche."

"La cérine / additif ?" →
"Si ta voiture utilise de l'additif (Peugeot, Citroën, DS), on vérifie ça aussi. C'est quoi comme véhicule ?"

"Quelles formules ?" →
"On a deux formules : nettoyage standard (99€) et premium (149€) pour les cas plus avancés. Tu veux qu'on regarde ton cas ?"

---

CLOSING TYPE (à utiliser quand on a assez d'infos)

Version courte (si peu d'infos ou incertitude) :
"On est là pour t'aider sur toutes les problématiques FAP. Tu veux qu'un expert Re-FAP analyse ta situation ? C'est gratuit et sans engagement."

Version complète (si on a les infos ET certitude) :
"Sur ta [MARQUE] [MODELE] à [KM] km, ça ressemble à un FAP encrassé. Un nettoyage pro peut suffire (99-149€ vs remplacement à 1500€+). Tu veux qu'un expert Re-FAP t'aide ? C'est gratuit et sans engagement."

---

INTERDITS ABSOLUS
- Diagnostiquer "FAP" sans éléments concrets
- Dire "ça ressemble à un problème de FAP" si l'utilisateur ne sait même pas quel voyant c'est
- Closer sans avoir au moins la marque
- Conseiller suppression FAP ou reprogrammation
- Promettre un délai précis
- Demander le code postal

---

DATA (à la fin de chaque réponse, sur une seule ligne)
DATA: {"symptome":"<voyant_fap|voyant_inconnu|perte_puissance|fumee|mode_degrade|code_obd|autre|inconnu>","codes":[],"marque":"<string|null>","modele":"<string|null>","annee":"<string|null>","kilometrage":"<string|null>","type_trajets":"<ville|autoroute|mixte|inconnu>","certitude_fap":"<haute|moyenne|basse|inconnue>","intention":"<diagnostic|devis|rdv|question|inconnu>","next_best_action":"<poser_question|demander_vehicule|demander_details|proposer_devis|clore>"}`;

// ============================================================
// SUPABASE
// ============================================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Variables Supabase manquantes");
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
// DEFAULT DATA - VERSION 5.1
// ============================================================
const DEFAULT_DATA = {
  symptome: "inconnu",
  codes: [],
  marque: null,
  modele: null,
  annee: null,
  kilometrage: null,
  type_trajets: "inconnu",
  certitude_fap: "inconnue",
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
  return text.trim();
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
        annee: parsed.annee || null,
        kilometrage: parsed.kilometrage || null,
        type_trajets: parsed.type_trajets || "inconnu",
        certitude_fap: parsed.certitude_fap || "inconnue",
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
      if (content.includes("expert re-fap") && (content.includes("gratuit") || content.includes("sans engagement"))) {
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
      if (content.includes("quelle voiture") || content.includes("roules en quoi") || content.includes("comme véhicule") || content.includes("quoi comme voiture")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function lastAssistantAskedDetails(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("année") || content.includes("kilométrage") || content.includes("combien de km")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function hasVehicleButNoDetails(extracted) {
  if (!extracted) return false;
  const hasMarque = extracted.marque && extracted.marque !== null;
  const hasAnnee = extracted.annee && extracted.annee !== null;
  const hasKm = extracted.kilometrage && extracted.kilometrage !== null;
  return hasMarque && !hasAnnee && !hasKm;
}

function countUserTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter((m) => m?.role === "user").length;
}

// ============================================================
// HELPERS : Véhicule Detection
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

// Extraire l'année depuis le message (ex: "2019", "de 2018")
function extractYearFromMessage(text) {
  const t = String(text || "");
  // Chercher un nombre à 4 chiffres commençant par 19 ou 20
  const match = t.match(/\b(19[89]\d|20[0-2]\d)\b/);
  if (match) {
    return match[1];
  }
  return null;
}

// Extraire le kilométrage depuis le message (ex: "130000km", "120 000 km", "150k")
function extractKmFromMessage(text) {
  const t = String(text || "").toLowerCase().replace(/\s/g, "");
  
  // Format: 130000km, 130000, 130 000 km
  let match = t.match(/(\d{2,3})[\s]?000[\s]?k?m?/);
  if (match) {
    return match[1] + "000 km";
  }
  
  // Format: 130k, 150k km
  match = t.match(/(\d{2,3})k/);
  if (match) {
    return match[1] + "000 km";
  }
  
  // Format: nombre seul > 10000 (probablement des km)
  match = t.match(/\b(\d{5,6})\b/);
  if (match) {
    return match[1] + " km";
  }
  
  return null;
}

// ============================================================
// HELPERS : Closing Detection
// ============================================================
function hasEnoughToClose(extracted, history) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasMarque = extracted.marque && extracted.marque !== null;
  const hasDetails = (extracted.annee && extracted.annee !== null) || (extracted.kilometrage && extracted.kilometrage !== null);
  
  // Idéal : symptôme + marque + détails
  if (hasSymptome && hasMarque && hasDetails) return true;
  
  // Acceptable : symptôme + marque, et on a déjà demandé les détails (même si pas de réponse)
  if (hasSymptome && hasMarque && lastAssistantAskedDetails(history)) return true;
  
  return false;
}

// ============================================================
// MESSAGE CLOSING
// ============================================================
function buildClosingQuestion(extracted) {
  const marque = extracted?.marque;
  const modele = extracted?.modele;
  const annee = extracted?.annee;
  const kilometrage = extracted?.kilometrage;
  const certitude = extracted?.certitude_fap;
  
  // Construire la description du véhicule
  let vehicleInfo = "";
  if (marque) {
    vehicleInfo = `ta ${marque}`;
    if (modele) vehicleInfo += ` ${modele}`;
    if (annee) vehicleInfo += ` de ${annee}`;
    if (kilometrage) vehicleInfo += ` à ${kilometrage}`;
  }
  
  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  let replyClean;
  
  if (certitude === "haute" && vehicleInfo) {
    // Closing confiant avec infos complètes
    replyClean = `Sur ${vehicleInfo}, ça ressemble à un FAP encrassé. Un nettoyage pro peut suffire (99-149€ vs 1500€+ pour un remplacement). Tu veux qu'un expert Re-FAP t'aide ? C'est gratuit et sans engagement.`;
  } else if (vehicleInfo && (annee || kilometrage)) {
    // Closing avec véhicule + détails mais incertitude
    replyClean = `On est là pour t'aider sur toutes les problématiques FAP. Tu veux qu'un expert Re-FAP analyse ta situation pour ${vehicleInfo} ? C'est gratuit et sans engagement.`;
  } else if (vehicleInfo) {
    // Closing avec véhicule seul
    replyClean = `On est là pour t'aider sur toutes les problématiques FAP. Tu veux qu'un expert Re-FAP analyse ta situation pour ${vehicleInfo} ? C'est gratuit et sans engagement.`;
  } else {
    // Closing minimal
    replyClean = `On est là pour t'aider sur toutes les problématiques FAP. Tu veux qu'un expert Re-FAP analyse ta situation ? C'est gratuit et sans engagement.`;
  }
  
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE DEMANDE VÉHICULE
// ============================================================
function buildVehicleQuestion(extracted) {
  const data = {
    ...(extracted || DEFAULT_DATA),
    next_best_action: "demander_vehicule",
  };

  const variants = [
    "D'accord. C'est quelle voiture ?",
    "Ok, je comprends. Tu roules en quoi ?",
    "Compris. C'est quoi comme véhicule ?",
  ];
  const replyClean = variants[Math.floor(Math.random() * variants.length)];
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;

  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// MESSAGE DEMANDE DÉTAILS (année/km)
// ============================================================
function buildDetailsQuestion(extracted) {
  const marque = extracted?.marque || "ta voiture";
  const data = {
    ...(extracted || DEFAULT_DATA),
    next_best_action: "demander_details",
  };

  const replyClean = `Ok, une ${marque}. Tu connais l'année et le kilométrage environ ?`;
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
// AUTH
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
      if (extracted) return extracted;
    }
  }
  return { ...DEFAULT_DATA };
}

// ============================================================
// HELPER : Merge les données extraites
// ============================================================
function mergeExtractedData(previous, current, userMessage) {
  const merged = { ...DEFAULT_DATA };
  
  merged.symptome = (current?.symptome && current.symptome !== "inconnu") ? current.symptome : previous?.symptome || "inconnu";
  merged.codes = (current?.codes?.length > 0) ? current.codes : previous?.codes || [];
  merged.marque = current?.marque || previous?.marque || null;
  merged.modele = current?.modele || previous?.modele || null;
  merged.annee = current?.annee || previous?.annee || null;
  merged.kilometrage = current?.kilometrage || previous?.kilometrage || null;
  merged.type_trajets = (current?.type_trajets && current.type_trajets !== "inconnu") ? current.type_trajets : previous?.type_trajets || "inconnu";
  merged.certitude_fap = (current?.certitude_fap && current.certitude_fap !== "inconnue") ? current.certitude_fap : previous?.certitude_fap || "inconnue";
  merged.intention = (current?.intention && current.intention !== "inconnu") ? current.intention : previous?.intention || "inconnu";
  merged.next_best_action = current?.next_best_action || "poser_question";
  
  // Extraire marque du message user
  if (!merged.marque) {
    const detectedMarque = extractVehicleFromMessage(userMessage);
    if (detectedMarque) {
      merged.marque = detectedMarque;
    }
  }
  
  // Extraire année du message user
  if (!merged.annee) {
    const detectedYear = extractYearFromMessage(userMessage);
    if (detectedYear) {
      merged.annee = detectedYear;
    }
  }
  
  // Extraire km du message user
  if (!merged.kilometrage) {
    const detectedKm = extractKmFromMessage(userMessage);
    if (detectedKm) {
      merged.kilometrage = detectedKm;
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
    
    // Détecter la marque, année, km dans le message actuel
    const detectedMarque = extractVehicleFromMessage(message);
    if (detectedMarque && !lastExtracted.marque) {
      lastExtracted = { ...lastExtracted, marque: detectedMarque };
    }
    
    const detectedYear = extractYearFromMessage(message);
    if (detectedYear && !lastExtracted.annee) {
      lastExtracted = { ...lastExtracted, annee: detectedYear };
    }
    
    const detectedKm = extractKmFromMessage(message);
    if (detectedKm && !lastExtracted.kilometrage) {
      lastExtracted = { ...lastExtracted, kilometrage: detectedKm };
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
    // OVERRIDE 4 : Tour 4+ sans véhicule → FORCER la question véhicule
    // --------------------------------------------------------
    if (userTurns >= 4 && !lastExtracted.marque && !lastAssistantAskedVehicle(history) && !lastAssistantAskedClosingQuestion(history)) {
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
    // OVERRIDE 4b : On a la marque mais pas les détails → demander année/km
    // --------------------------------------------------------
    if (lastExtracted.marque && hasVehicleButNoDetails(lastExtracted) && !lastAssistantAskedDetails(history) && !lastAssistantAskedClosingQuestion(history)) {
      const detailsQ = buildDetailsQuestion(lastExtracted);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: detailsQ.replyFull,
      });

      return res.status(200).json({
        reply: detailsQ.replyClean,
        reply_full: detailsQ.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: detailsQ.extracted,
      });
    }
    
    // --------------------------------------------------------
    // OVERRIDE 5 : Tour 5+ avec véhicule → closing forcé
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
        max_tokens: 250,
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
    // SÉCURITÉ : Si le LLM génère un closing mais sans véhicule → bloquer
    // --------------------------------------------------------
    const looksLikeClosing = replyClean.toLowerCase().includes("expert re-fap") && (replyClean.toLowerCase().includes("gratuit") || replyClean.toLowerCase().includes("sans engagement"));
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
    // AUTO-CLOSE si symptôme + véhicule + assez de tours
    // --------------------------------------------------------
    if (hasEnoughToClose(extracted, history) && userTurns >= 3 && !lastAssistantAskedClosingQuestion(history)) {
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
