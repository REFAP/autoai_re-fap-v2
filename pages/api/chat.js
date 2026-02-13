// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 6.0 avec BASE METIER
// Bot d'orientation : qualifier → personnaliser → closer → capturer data marché

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 5;

// ============================================================
// SYSTEM PROMPT - VERSION 6.0
// Plus court : la connaissance est dans la BDD METIER, pas dans le prompt
// ============================================================
const SYSTEM_PROMPT = `Tu es FAPexpert, assistant Re-FAP spécialisé dans les problèmes de Filtre à Particules diesel.

MISSION
Rassurer le client, collecter les infos clés, orienter vers Re-FAP.

DÉFINITION ABSOLUE
"FAP" = Filtre à Particules automobile diesel. JAMAIS d'autre interprétation.

STYLE
- Ton naturel, bref, rassurant, humain.
- Tutoiement.
- 2-3 phrases max par message. UNE question max par message.
- Pas de listes, pas de bullet points, pas de markdown, pas de gras.

RÈGLES ABSOLUES
1. Ne JAMAIS diagnostiquer "FAP" sans éléments concrets.
2. Ne JAMAIS inventer un prix — utilise UNIQUEMENT les prix dans les FACTS ci-dessous.
3. Ne JAMAIS closer sans avoir au moins la marque du véhicule.
4. Ne JAMAIS conseiller suppression FAP, défapage ou reprogrammation.
5. Ne JAMAIS promettre un délai précis.
6. Ne JAMAIS demander le code postal.
7. Si l'utilisateur ne sait pas quel voyant c'est, dis-le honnêtement.

FACTS
Tu reçois des FACTS vérifiés avant chaque réponse. UTILISE-LES OBLIGATOIREMENT :
- Prix dans les FACTS → cite-le tel quel.
- Info technique dans les FACTS → utilise-la pour personnaliser ta réponse.
- Info véhicule dans les FACTS → montre que tu connais son modèle.
- Question suggérée dans les FACTS → pose-la (reformulée naturellement dans ton style).
- Aucun FACT pertinent → réponds avec ton expertise générale en restant prudent.

DATA (obligatoire, à la fin de chaque réponse, sur une seule ligne)
DATA: {"symptome":"<voyant_fap|voyant_inconnu|perte_puissance|fumee|mode_degrade|code_obd|odeur|ct_refuse|fap_bouche|autre|inconnu>","codes":[],"marque":null,"modele":null,"annee":null,"kilometrage":null,"type_trajets":"inconnu","certitude_fap":"<haute|moyenne|basse|inconnue>","intention":"<diagnostic|devis|rdv|question|inconnu>","previous_attempts":null,"roulable":null,"next_best_action":"<poser_question|demander_vehicule|demander_deja_essaye|demander_details|proposer_devis|clore>"}`;

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
// DEFAULT DATA - VERSION 6.0 (champs enrichis)
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
  previous_attempts: null,
  roulable: null,
  demontage: null,
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
  // Retirer tout ce qui est après DATA: (inclus)
  const dataIndex = text.indexOf("DATA:");
  if (dataIndex !== -1) {
    text = text.substring(0, dataIndex);
  }
  // Nettoyer aussi les éventuels résidus JSON
  text = text.replace(/\{[^{}]*"symptome"[^{}]*\}/g, "");
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
        previous_attempts: parsed.previous_attempts || null,
        roulable: parsed.roulable ?? null,
        demontage: parsed.demontage || null,
        next_best_action: parsed.next_best_action || "poser_question",
      };
    } catch {
      return null;
    }
  }
  return null;
}

function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify(DEFAULT_DATA);
  }
}

// ============================================================
// QUICK EXTRACT — Extraction déterministe AVANT les requêtes DB
// Pas besoin de Mistral pour détecter "voyant", "P2002" ou "Peugeot"
// ============================================================
function quickExtract(text) {
  const t = String(text || "").toLowerCase();

  const result = {
    symptome_key: null,
    codes: [],
    marque: null,
    intention: null,
    previous_attempts: [],
    urgency_signals: [],
    is_off_topic: false,
  };

  // --- SYMPTÔMES (ordre = priorité) ---
  
  // D'abord, détecter les SIGNAUX individuels (pas exclusifs)
  const hasVoyantFap = /voyant\s*(fap|filtre|dpf)|symbole.*(pot|echappement)|t[eé]moin\s*fap/i.test(t);
  const hasVoyantGeneric = /voyant.*(allum|fixe|orange|clignot|permanent)|voyant\s*(moteur|orange)|check\s*engine|engine\s*light|t[eé]moin\s*(moteur|allum)/i.test(t);
  const hasVoyantAny = hasVoyantFap || hasVoyantGeneric || /\bvoyant\b/i.test(t); // "voyant" seul = signal faible mais valide en combo
  const hasPuissance = /(perte|plus|manque|baisse|perd).*(puissance|p[eê]che|patate)|(tire|avance)\s*(plus|pas)|n.?avance\s*plus|plus\s*de\s*puissance/i.test(t);
  const hasModeDegrade = /mode\s*d[eé]grad[eé]|mode\s*limp|brid[eé]e?|limit[eé]e?\s*(à|a)\s*\d/i.test(t);
  const hasFumee = /fum[eé]e|fume\b|smoke/i.test(t);

  // COMBOS (prioritaires — couvrent les messages multi-symptômes)
  if ((hasVoyantAny) && hasPuissance) {
    result.symptome_key = "voyant_fap_puissance";
  } else if (hasVoyantFap && hasModeDegrade) {
    result.symptome_key = "voyant_fap_puissance"; // même routing : certitude haute
  }
  // SIMPLES (si pas de combo)
  else if (hasVoyantFap) {
    result.symptome_key = "voyant_fap";
  } else if (hasModeDegrade) {
    result.symptome_key = "mode_degrade";
  } else if (/fap\s*(bouch|colmat|encras|satur|block)/i.test(t) || /filtre.*(bouch|colmat)/i.test(t)) {
    result.symptome_key = "fap_bouche_declare";
  } else if (/ct\s*(refus|recal|pas\s*pass)|contre.?visite|controle\s*technique.*(refus|pollution)|opacit[eé]/i.test(t)) {
    result.symptome_key = "ct_refuse";
  } else if (/r[eé]g[eé]n[eé]ration.*(impossible|echou|rat|marche\s*pas)|valise.*(impossible|echou)/i.test(t)) {
    result.symptome_key = "regeneration_impossible";
  } else if (hasPuissance) {
    result.symptome_key = "perte_puissance";
  } else if (/fum[eé]e\s*noire|black\s*smoke/i.test(t)) {
    result.symptome_key = "fumee_noire";
  } else if (/fum[eé]e\s*blanche|white\s*smoke/i.test(t)) {
    result.symptome_key = "fumee_blanche";
  } else if (hasFumee) {
    result.symptome_key = "fumee";
  } else if (/odeur|sent\s*mauvais|[aâ]cre|pu(e|anteur)/i.test(t)) {
    result.symptome_key = "odeur_anormale";
  } else if (hasVoyantGeneric) {
    result.symptome_key = "voyant_moteur_seul";
  }

  // --- CODES OBD ---
  const codesFound = t.match(/[pP]\s*\d{4}[a-zA-Z]?\s*\d{0,2}/g);
  if (codesFound) {
    result.codes = codesFound.map((c) => c.toUpperCase().replace(/\s/g, ""));
    // Codes spécifiques → routing
    if (result.codes.some((c) => c.startsWith("P2002")) && !result.symptome_key) {
      result.symptome_key = "code_p2002";
    } else if (result.codes.some((c) => c.startsWith("P0420")) && !result.symptome_key) {
      result.symptome_key = "code_p0420";
    } else if (result.codes.some((c) => c.startsWith("P1490")) && !result.symptome_key) {
      result.symptome_key = "code_p1490";
    }
  }

  // --- MARQUE ---
  result.marque = extractVehicleFromMessage(text);

  // --- INTENTION ---
  if (/combien|quel\s*prix|tarif|co[uû]t|how\s*much|cost|price/i.test(t)) {
    result.intention = "prix";
    if (!result.symptome_key) result.symptome_key = "prix_direct";
  } else if (/rdv|rendez|devis|rappel|contact|formulaire/i.test(t)) {
    result.intention = "rdv";
  }

  // --- PREVIOUS ATTEMPTS (data marché) ---
  if (/additif|bardahl|w[uü]rth|liqui.?moly|nettoyant|produit\s*(fap|nettoy)/i.test(t)) {
    result.previous_attempts.push("additif");
  }
  if (/garage|m[eé]cano|m[eé]canicien|concessionnaire/i.test(t)) {
    result.previous_attempts.push("garage");
  }
  if (/karcher|nettoy.*(eau|pression)|jet\s*(d.eau|haute)/i.test(t)) {
    result.previous_attempts.push("karcher");
  }
  if (/d[eé]fap|supprim.*(fap|filtre)|fap\s*off|downpipe|reprog/i.test(t)) {
    result.previous_attempts.push("defapage");
  }
  if (/youtube|vid[eé]o|internet|forum|tuto/i.test(t)) {
    result.previous_attempts.push("youtube");
  }
  if (/c[eé]rine|eolys/i.test(t)) {
    result.previous_attempts.push("additif_cerine");
  }
  if (/remplac.*(fap|filtre)|fap\s*(neuf|neuve)/i.test(t)) {
    result.previous_attempts.push("remplacement_envisage");
  }
  if (/r[eé]g[eé]n[eé]?r|regen[eé]?r|roul[eé]?\s*(fort|autoroute|vite)|forc[eé]?\s*(la\s*)?r[eé]g[eé]n|tent[eé].*r[eé]gen/i.test(t)) {
    result.previous_attempts.push("regeneration_forcee");
  }
  if (/nettoy[eé]?\s*(fap|filtre)|d[eé]j[aà]\s*(fait\s*)?nettoy/i.test(t)) {
    result.previous_attempts.push("nettoyage_anterieur");
  }
  if (/acide|vinaigre|soude/i.test(t)) {
    result.previous_attempts.push("nettoyage_chimique");
  }

  // --- URGENCY ---
  if (/ne\s*(roule|d[eé]marre)\s*(plus|pas)|immobilis|panne|en\s*rade/i.test(t)) {
    result.urgency_signals.push("immobilise");
  }
  if (/mode\s*d[eé]grad/i.test(t)) {
    result.urgency_signals.push("mode_degrade");
  }
  if (/clignot/i.test(t)) {
    result.urgency_signals.push("voyant_clignotant");
  }
  if (/ct\s*(dans|bient[oô]t|prochain)|contre.?visite/i.test(t)) {
    result.urgency_signals.push("ct_bientot");
  }

  // --- OFF-TOPIC ---
  if (/recette|couscous|toilettes|m[eé]t[eé]o|foot|politique/i.test(t) && !result.symptome_key) {
    result.is_off_topic = true;
  }

  return result;
}

// ============================================================
// HELPERS : Intent Detection (kept from V5.1)
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

// ============================================================
// HELPERS : Flow State Detection
// Vérifie ce que le bot a déjà demandé dans l'historique
// ============================================================
function lastAssistantAskedClosingQuestion(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (
        (content.includes("expert re-fap") && (content.includes("gratuit") || content.includes("sans engagement") || content.includes("te rappelle"))) ||
        (content.includes("qu'on te rappelle")) ||
        (content.includes("tu veux qu'un expert"))
      ) {
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
      if (content.includes("quelle voiture") || content.includes("roules en quoi") || content.includes("comme véhicule") || content.includes("quoi comme voiture") || content.includes("c'est quelle voiture")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function everAskedPreviousAttempts(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("déjà essayé") || content.includes("déjà tenté") || content.includes("déjà fait quelque chose") || content.includes("avant de nous contacter") || content.includes("essayé quelque chose")) {
        return true;
      }
    }
  }
  return false;
}

function everAskedClosing(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("expert re-fap") && (content.includes("gratuit") || content.includes("sans engagement") || content.includes("te rappelle"))) {
        return true;
      }
    }
  }
  return false;
}

function lastAssistantAskedCity(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("quel coin") || content.includes("quelle ville") || content.includes("où tu habites") || content.includes("près de chez toi") || content.includes("carter-cash le plus proche")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function lastAssistantAskedDemontage(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("fap doit être démonté") && content.includes("garage s'occupe")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function lastAssistantAskedSolutionExplanation(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("que je te détaille") || content.includes("que je t'explique comment")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function everAskedDemontage(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("fap doit être démonté") && content.includes("garage s'occupe")) {
        return true;
      }
    }
  }
  return false;
}

function userSaysSelfRemoval(msg) {
  const t = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /je (le )?demonte|moi[- ]?meme|je m.?en occupe|je peux (le )?demonte|je (le )?fais|j.?ai (un )?pont|j.?ai les outils|deja demonte|fap (est )?demonte|il est demonte|c.?est demonte/.test(t);
}

function userNeedsGarage(msg) {
  const t = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /garage|j.?ai besoin|je (ne )?peux pas|pas (les )?outils|pas de pont|je sais pas demonte|faut un pro|un professionnel|prise en charge|tout faire|s.?en occupe/.test(t);
}

function everAskedCity(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("quel coin") || content.includes("quelle ville") || content.includes("meilleure option près")) {
        return true;
      }
    }
  }
  return false;
}

function everGaveExpertOrientation(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("cendres métalliques") || content.includes("que je te détaille") || content.includes("fap doit être démonté") || content.includes("carter-cash équipé")) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================
// HELPERS : Vehicle Detection (kept from V5.1)
// ============================================================
function extractVehicleFromMessage(text) {
  const t = String(text || "").toLowerCase();
  // Version sans accents pour le matching des modèles
  const tNorm = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Marques directes
  const marques = {
    peugeot: "Peugeot", renault: "Renault", citroen: "Citroën", "citroën": "Citroën",
    volkswagen: "Volkswagen", vw: "Volkswagen", audi: "Audi", bmw: "BMW",
    mercedes: "Mercedes", ford: "Ford", opel: "Opel", fiat: "Fiat",
    seat: "Seat", skoda: "Skoda", "škoda": "Skoda", toyota: "Toyota",
    nissan: "Nissan", hyundai: "Hyundai", kia: "Kia", dacia: "Dacia",
    ds: "DS", volvo: "Volvo", mini: "Mini", jeep: "Jeep",
    "land rover": "Land Rover", "range rover": "Range Rover",
    "alfa romeo": "Alfa Romeo", alfa: "Alfa Romeo", mazda: "Mazda",
    suzuki: "Suzuki", honda: "Honda", mitsubishi: "Mitsubishi",
  };
  for (const [key, value] of Object.entries(marques)) {
    if (t.includes(key)) return value;
  }

  // 2. Modèles → marque (quand l'user dit "Golf" sans dire "Volkswagen")
  const modeles = {
    // Volkswagen
    golf: "Volkswagen", polo: "Volkswagen", tiguan: "Volkswagen", passat: "Volkswagen",
    touran: "Volkswagen", touareg: "Volkswagen", "t-roc": "Volkswagen", caddy: "Volkswagen",
    transporter: "Volkswagen", "t5": "Volkswagen", "t6": "Volkswagen",
    // Peugeot (numéros)
    "108": "Peugeot", "208": "Peugeot", "308": "Peugeot", "408": "Peugeot",
    "508": "Peugeot", "2008": "Peugeot", "3008": "Peugeot", "5008": "Peugeot",
    "207": "Peugeot", "307": "Peugeot", "407": "Peugeot", "607": "Peugeot",
    "807": "Peugeot", "206": "Peugeot", "306": "Peugeot", partner: "Peugeot",
    expert: "Peugeot", boxer: "Peugeot", bipper: "Peugeot", rifter: "Peugeot",
    // Renault
    clio: "Renault", megane: "Renault", mégane: "Renault", scenic: "Renault",
    scénic: "Renault", captur: "Renault", kadjar: "Renault", koleos: "Renault",
    talisman: "Renault", laguna: "Renault", espace: "Renault", kangoo: "Renault",
    trafic: "Renault", master: "Renault", twingo: "Renault", arkana: "Renault",
    austral: "Renault",
    // Citroën
    "c1": "Citroën", "c2": "Citroën", "c3": "Citroën", "c4": "Citroën",
    "c5": "Citroën", "c6": "Citroën", "c8": "Citroën",
    picasso: "Citroën", spacetourer: "Citroën", berlingo: "Citroën",
    aircross: "Citroën", cactus: "Citroën", "ds3": "DS", "ds4": "DS",
    "ds5": "DS", "ds7": "DS",
    // Dacia
    duster: "Dacia", sandero: "Dacia", logan: "Dacia", jogger: "Dacia",
    dokker: "Dacia", lodgy: "Dacia", spring: "Dacia",
    // Audi
    "a1": "Audi", "a3": "Audi", "a4": "Audi", "a5": "Audi", "a6": "Audi",
    "a7": "Audi", "a8": "Audi", "q2": "Audi", "q3": "Audi", "q5": "Audi",
    "q7": "Audi", "q8": "Audi", "tt": "Audi",
    // BMW (séries)
    "serie 1": "BMW", "serie 2": "BMW", "serie 3": "BMW", "serie 4": "BMW",
    "serie 5": "BMW", "x1": "BMW", "x2": "BMW", "x3": "BMW", "x4": "BMW",
    "x5": "BMW", "x6": "BMW",
    // Ford
    focus: "Ford", fiesta: "Ford", kuga: "Ford", puma: "Ford", mondeo: "Ford",
    "c-max": "Ford", "s-max": "Ford", transit: "Ford", ranger: "Ford",
    // Opel
    corsa: "Opel", astra: "Opel", mokka: "Opel", grandland: "Opel",
    crossland: "Opel", insignia: "Opel", zafira: "Opel", vivaro: "Opel",
    // Skoda
    octavia: "Skoda", fabia: "Skoda", superb: "Skoda", kodiaq: "Skoda",
    karoq: "Skoda", yeti: "Skoda", scala: "Skoda", scout: "Skoda",
    // Fiat
    punto: "Fiat", tipo: "Fiat", "500x": "Fiat", "500l": "Fiat",
    panda: "Fiat", ducato: "Fiat", doblo: "Fiat", "500": "Fiat",
    // Toyota
    yaris: "Toyota", corolla: "Toyota", "rav4": "Toyota", "c-hr": "Toyota",
    auris: "Toyota", hilux: "Toyota", "land cruiser": "Toyota", proace: "Toyota",
    // Nissan
    qashqai: "Nissan", juke: "Nissan", "x-trail": "Nissan", micra: "Nissan",
    navara: "Nissan", leaf: "Nissan", note: "Nissan",
    // Hyundai
    tucson: "Hyundai", "i10": "Hyundai", "i20": "Hyundai", "i30": "Hyundai",
    kona: "Hyundai", "santa fe": "Hyundai", santafe: "Hyundai", "santafé": "Hyundai",
    "ix35": "Hyundai", "ix20": "Hyundai", "i40": "Hyundai",
    // Kia
    sportage: "Kia", ceed: "Kia", niro: "Kia", sorento: "Kia", stonic: "Kia",
    picanto: "Kia", venga: "Kia",
    // Seat
    leon: "Seat", ibiza: "Seat", ateca: "Seat", arona: "Seat", tarraco: "Seat",
    alhambra: "Seat",
    // Mercedes
    "classe a": "Mercedes", "classe b": "Mercedes", "classe c": "Mercedes",
    "classe e": "Mercedes", "classe v": "Mercedes", vito: "Mercedes",
    sprinter: "Mercedes", "glc": "Mercedes", "gla": "Mercedes", "glb": "Mercedes",
    // Volvo
    "xc40": "Volvo", "xc60": "Volvo", "xc90": "Volvo", "v40": "Volvo",
    "v60": "Volvo", "v90": "Volvo", "s60": "Volvo", "s90": "Volvo",
    // Mitsubishi
    outlander: "Mitsubishi", "l200": "Mitsubishi", "asx": "Mitsubishi",
    pajero: "Mitsubishi",
    // Suzuki
    vitara: "Suzuki", "sx4": "Suzuki", "s-cross": "Suzuki", jimny: "Suzuki",
    swift: "Suzuki",
    // Mazda
    "cx-5": "Mazda", "cx-3": "Mazda", "cx-30": "Mazda", "mazda3": "Mazda",
    "mazda6": "Mazda",
    // Honda
    "cr-v": "Honda", civic: "Honda", "hr-v": "Honda", jazz: "Honda",
    // Jeep
    compass: "Jeep", renegade: "Jeep", wrangler: "Jeep", cherokee: "Jeep",
  };

  // Modèles numériques ambigus (aussi des années courantes)
  // "2008", "2008" peut être Peugeot 2008 OU l'année 2008
  // On ne matche que si PAS précédé de "de ", "en ", "année ", "from " etc.
  const ambiguousNumeric = ["2008", "500"];

  for (const [key, value] of Object.entries(modeles)) {
    const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const escaped = keyNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (ambiguousNumeric.includes(key)) {
      const yearCtx = new RegExp(`(de|en|annee|from|since|fin|debut)\\s+${escaped}\\b`, "i");
      if (yearCtx.test(tNorm)) continue;
      const modelCtx = new RegExp(`(peugeot|fiat)\\s+${escaped}\\b`, "i");
      if (modelCtx.test(tNorm)) return value;
      continue;
    }

    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(tNorm)) return value;
  }

  return null;
}

function extractYearFromMessage(text) {
  const match = String(text || "").match(/\b(19[89]\d|20[0-2]\d)\b/);
  return match ? match[1] : null;
}

function extractKmFromMessage(text) {
  const t = String(text || "").toLowerCase().replace(/\s/g, "");
  let match = t.match(/(\d{2,3})000k?m?/);
  if (match) return match[1] + "000 km";
  match = t.match(/(\d{2,3})k/);
  if (match) return match[1] + "000 km";
  match = t.match(/\b(\d{5,6})\b/);
  if (match) return match[1] + " km";
  return null;
}

// ============================================================
// HELPERS : Closing Detection (updated V6)
// ============================================================
function hasEnoughToClose(extracted, history) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasMarque = extracted.marque && extracted.marque !== null;
  return hasSymptome && hasMarque;
}

function countUserTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.filter((m) => m?.role === "user").length;
}

// ============================================================
// HELPERS : Récupérer & Merger les données extraites
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

function mergeExtractedData(previous, current, userMessage, quickData) {
  const merged = { ...DEFAULT_DATA };

  merged.symptome = (current?.symptome && current.symptome !== "inconnu") ? current.symptome : (quickData?.symptome_key || previous?.symptome || "inconnu");
  merged.codes = (current?.codes?.length > 0) ? current.codes : (quickData?.codes?.length > 0 ? quickData.codes : previous?.codes || []);
  merged.marque = current?.marque || quickData?.marque || previous?.marque || null;
  merged.modele = current?.modele || previous?.modele || null;
  merged.annee = current?.annee || previous?.annee || extractYearFromMessage(userMessage) || null;
  merged.kilometrage = current?.kilometrage || previous?.kilometrage || extractKmFromMessage(userMessage) || null;
  merged.type_trajets = (current?.type_trajets && current.type_trajets !== "inconnu") ? current.type_trajets : previous?.type_trajets || "inconnu";
  merged.certitude_fap = (current?.certitude_fap && current.certitude_fap !== "inconnue") ? current.certitude_fap : previous?.certitude_fap || "inconnue";
  merged.intention = (current?.intention && current.intention !== "inconnu") ? current.intention : (quickData?.intention || previous?.intention || "inconnu");
  merged.previous_attempts = current?.previous_attempts || (quickData?.previous_attempts?.length > 0 ? quickData.previous_attempts.join(", ") : null) || previous?.previous_attempts || null;
  merged.roulable = current?.roulable ?? previous?.roulable ?? null;
  merged.next_best_action = current?.next_best_action || "poser_question";
  merged.demontage = current?.demontage || previous?.demontage || null;

  // Si quickExtract a trouvé une marque que Mistral n'a pas vue
  if (!merged.marque) {
    const detected = extractVehicleFromMessage(userMessage);
    if (detected) merged.marque = detected;
  }

  return merged;
}

// ============================================================
// BASE METIER : Requêtes Supabase
// Récupère routing, pricing, snippets et vehicle patterns
// ============================================================
async function fetchMetierData(supabase, quickData, extracted) {
  const metier = { routing: null, pricing: [], snippets: [], vehicle: null };

  try {
    const promises = [];

    // 1. Routing rule
    if (quickData.symptome_key) {
      promises.push(
        supabase
          .from("routing_rules")
          .select("*")
          .eq("symptome_key", quickData.symptome_key)
          .eq("active", true)
          .order("priority")
          .limit(1)
          .then(({ data }) => { metier.routing = data?.[0] || null; })
          .catch(() => {})
      );
    } else {
      promises.push(Promise.resolve());
    }

    // 2. Knowledge snippets
    const tags = [quickData.symptome_key, ...(quickData.codes || [])].filter(Boolean);
    if (tags.length > 0) {
      promises.push(
        supabase
          .from("knowledge_snippets")
          .select("*")
          .overlaps("tags", tags)
          .eq("active", true)
          .order("priority")
          .limit(2)
          .then(({ data }) => { metier.snippets = data || []; })
          .catch(() => {})
      );
    } else {
      promises.push(Promise.resolve());
    }

    // 3. Vehicle pattern
    const marque = quickData.marque || extracted?.marque;
    if (marque) {
      promises.push(
        supabase
          .from("vehicle_patterns")
          .select("*")
          .ilike("marque", `%${marque}%`)
          .eq("active", true)
          .limit(1)
          .then(({ data }) => { metier.vehicle = data?.[0] || null; })
          .catch(() => {})
      );
    } else {
      promises.push(Promise.resolve());
    }

    // 4. Pricing (toujours charger — seulement 7 lignes)
    promises.push(
      supabase
        .from("pricing_rules")
        .select("*")
        .eq("active", true)
        .then(({ data }) => { metier.pricing = data || []; })
        .catch(() => {})
    );

    await Promise.all(promises);
  } catch (err) {
    // Tables METIER pas encore créées → on continue sans
    console.warn("⚠️ Requêtes METIER échouées (tables absentes ?):", err.message);
  }

  return metier;
}

// ============================================================
// BUILD FACTS — Construit le bloc FACTS injecté dans le prompt
// ============================================================
function buildFacts(metier, quickData, extracted, flowHint) {
  const lines = [];

  // Routing
  if (metier.routing) {
    const r = metier.routing;
    lines.push(`DIAGNOSTIC: ${r.symptome_label}. Certitude FAP: ${r.certitude_fap}. Action recommandée: ${r.action}.`);
    if (r.reponse_type === "alerter") {
      lines.push(`ALERTE: Situation sérieuse. Conseiller de ne pas forcer la voiture.`);
    }
  }

  // Vehicle
  if (metier.vehicle) {
    const v = metier.vehicle;
    lines.push(`VÉHICULE: ${v.marque} ${v.modele || ""} ${v.moteur || ""} — ${v.problemes_frequents || ""}`);
    if (v.systeme_additif && v.systeme_additif !== "aucun") {
      lines.push(`SPÉCIFICITÉ: Système additif ${v.systeme_additif}. À vérifier.`);
    }
  }

  // Pricing
  if (metier.pricing.length > 0) {
    const vehicleHint = metier.vehicle?.pricing_hint || "vl_standard";
    const ccEquipped = metier.pricing.find((p) => p.network === "Carter-Cash" && p.equipped_machine === true && p.fap_type === vehicleHint);
    const ccSend = metier.pricing.find((p) => p.network === "Carter-Cash" && p.equipped_machine === false);
    const generic = metier.pricing.find((p) => p.fap_type === vehicleHint && p.equipped_machine === true) || metier.pricing[0];

    if (ccEquipped) {
      lines.push(`PRIX CARTER-CASH MACHINE: ${ccEquipped.price_ttc}€ TTC. ${ccEquipped.conditions}.`);
    }
    if (ccSend) {
      lines.push(`PRIX CARTER-CASH ENVOI: ${ccSend.price_ttc}€ TTC port inclus (48-72h). ${ccSend.conditions}.`);
    }
    if (!ccEquipped && generic) {
      lines.push(`PRIX NETTOYAGE: entre 99€ et 149€ chez Carter-Cash (machine sur place), 199€ en envoi ou garage partenaire.`);
    }
    lines.push(`COMPARAISON: Remplacement FAP neuf = 1500-2500€. Nettoyage Re-FAP = à partir de 99€.`);
  }

  // Snippets
  for (const s of metier.snippets) {
    lines.push(`INFO (${s.title}): ${s.body}`);
  }

  // Question suivante suggérée par le flow
  if (flowHint) {
    lines.push(`QUESTION_SUIVANTE: ${flowHint}`);
  } else if (metier.routing?.question_suivante) {
    lines.push(`QUESTION_SUIVANTE: ${metier.routing.question_suivante}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return "\n\n---FACTS (données vérifiées)---\n" + lines.join("\n") + "\n---FIN FACTS---";
}

// ============================================================
// ENRICHMENT : Sauvegarde data marché dans conversation_enrichments
// Fire-and-forget — ne bloque pas la réponse
// ============================================================
function upsertEnrichment(supabase, conversationId, extracted, quickData, metier) {
  if (!supabase || !conversationId) return;

  const urgencyLevel = quickData.urgency_signals?.includes("immobilise") ? "critique"
    : quickData.urgency_signals?.includes("mode_degrade") ? "haute"
    : quickData.urgency_signals?.includes("voyant_clignotant") ? "haute"
    : quickData.urgency_signals?.includes("ct_bientot") ? "haute"
    : extracted?.certitude_fap === "haute" ? "moyenne"
    : "inconnue";

  const enrichment = {
    conversation_id: conversationId,
    symptome_principal: extracted?.symptome || quickData?.symptome_key || null,
    codes_obd: (extracted?.codes?.length > 0) ? extracted.codes : (quickData?.codes?.length > 0 ? quickData.codes : null),
    marque: extracted?.marque || quickData?.marque || null,
    modele: extracted?.modele || null,
    annee: extracted?.annee ? parseInt(extracted.annee) : null,
    km: extracted?.kilometrage ? parseInt(String(extracted.kilometrage).replace(/\D/g, "")) : null,
    previous_attempts: quickData?.previous_attempts?.length > 0 ? quickData.previous_attempts : null,
    previous_attempt_details: typeof extracted?.previous_attempts === "string" ? extracted.previous_attempts : null,
    trigger_event: quickData?.symptome_key || null,
    urgency_level: urgencyLevel,
    roulable: extracted?.roulable ?? (quickData.urgency_signals?.includes("immobilise") ? false : null),
    a_demande_prix: quickData?.intention === "prix" || false,
    outcome: extracted?.next_best_action === "clore" ? "cta_clicked" : null,
    updated_at: new Date().toISOString(),
  };

  // Upsert (fire-and-forget)
  supabase
    .from("conversation_enrichments")
    .upsert(enrichment, { onConflict: "conversation_id" })
    .then(({ error }) => {
      if (error) console.warn("⚠️ Enrichment upsert failed:", error.message);
    })
    .catch((err) => {
      console.warn("⚠️ Enrichment upsert error:", err.message);
    });
}

// ============================================================
// BUILD METIER RESPONSE — Réponse 100% BDD, zéro LLM
// Couvre les cas connus (~95% du volume). Mistral = fallback.
// ============================================================
function buildMetierResponse(quickData, extracted, metier, userTurns, history) {
  // Pas de routing rule → on ne peut pas répondre depuis la BDD
  if (!metier.routing && !extracted.marque) return null;

  let replyClean = null;
  const data = { ...(extracted || DEFAULT_DATA) };

  // ── CAS 1 : On a un symptôme reconnu MAIS pas encore le véhicule ──
  if (metier.routing && !extracted.marque) {
    const r = metier.routing;

    // Adapter le ton selon reponse_type
    if (r.reponse_type === "rassurer") {
      const rassurances = [
        "Pas de panique, c'est un cas qu'on voit souvent et c'est généralement réparable.",
        "OK, pas d'inquiétude, c'est un problème classique et ça se traite bien.",
        "D'accord, c'est un souci fréquent et dans la plupart des cas ça se répare.",
      ];
      replyClean = rassurances[Math.floor(Math.random() * rassurances.length)] + " C'est quelle voiture ?";
    } else if (r.reponse_type === "alerter") {
      replyClean = "OK, c'est un signal sérieux. Ne force pas la voiture en attendant. C'est quoi comme véhicule ?";
    } else if (r.reponse_type === "qualifier") {
      // On a besoin de plus d'infos avant d'orienter
      replyClean = r.question_suivante || "D'accord. Tu peux m'en dire un peu plus ? C'est quelle voiture ?";
    } else if (r.reponse_type === "closer") {
      // Symptôme très clair (fap_bouche_declare, ct_refuse, prix_direct)
      // Mais on a besoin du véhicule pour closer proprement
      replyClean = r.question_suivante || "OK, on peut t'aider là-dessus. C'est quoi comme véhicule ?";
    }

    data.symptome = quickData.symptome_key || extracted.symptome;
    data.certitude_fap = r.certitude_fap || extracted.certitude_fap;
    data.next_best_action = "demander_vehicule";
  }

  // ── CAS 2 : On a le symptôme + véhicule, le bot vient de recevoir le véhicule ──
  // → Personnaliser avec vehicle_patterns + demander "déjà essayé"
  // (ce cas est déjà géré par les overrides, mais on le couvre si un override a été skippé)
  if (metier.routing && extracted.marque && !extracted.previous_attempts && !everAskedPreviousAttempts(history) && !everAskedClosing(history)) {
    // Personnalisation véhicule
    let vehicleNote = "";
    if (metier.vehicle) {
      const v = metier.vehicle;
      if (v.systeme_additif && v.systeme_additif !== "aucun") {
        vehicleNote = `Sur une ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""} avec le système ${v.systeme_additif}, c'est un souci qu'on connaît bien.`;
      } else {
        vehicleNote = `Ok, sur une ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""} c'est un souci qu'on voit régulièrement.`;
      }
    } else {
      vehicleNote = `Ok, sur une ${extracted.marque} c'est un souci qu'on voit souvent.`;
    }

    replyClean = `${vehicleNote} Avant de t'orienter, tu as déjà essayé quelque chose pour régler ça ? Additif, passage garage, ou rien du tout ?`;
    data.next_best_action = "demander_deja_essaye";
  }

  // ── CAS 3 : On a le symptôme + véhicule + previous_attempts → explication expert ──
  if (extracted.marque && extracted.symptome !== "inconnu" && (extracted.previous_attempts || everAskedPreviousAttempts(history)) && !everGaveExpertOrientation(history) && !everAskedClosing(history)) {
    return buildExpertOrientation(extracted, metier);
  }

  if (!replyClean) return null;

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// BUILD SNIPPET RESPONSE — Quand un code OBD ou un sujet technique est détecté
// Répond avec le knowledge_snippet, pas avec Mistral
// ============================================================
function buildSnippetResponse(quickData, extracted, metier) {
  if (!metier.snippets || metier.snippets.length === 0) return null;
  if (extracted.marque) return null; // On a déjà le véhicule, les overrides gèrent

  const snippet = metier.snippets[0];
  const data = { ...(extracted || DEFAULT_DATA) };

  // Résumer le snippet en 2 phrases max + demander véhicule
  let intro = snippet.body;
  // Prendre les 2 premières phrases
  const sentences = intro.match(/[^.!?]+[.!?]+/g) || [intro];
  intro = sentences.slice(0, 2).join(" ").trim();

  const replyClean = `${intro} C'est quelle voiture ?`;
  data.next_best_action = "demander_vehicule";

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- CLOSING (avec prix de la BDD) ---
// ============================================
// CARTER-CASH DATABASE (94 magasins)
// ============================================
const CARTER_CASH_LIST = [
  // EQUIPPED (4 machines)
  {name:"Carter-Cash Thiais",city:"Thiais",postal:"94320",dept:"94",equipped:true},
  {name:"Carter-Cash Sarcelles",city:"Sarcelles",postal:"95200",dept:"95",equipped:true},
  {name:"Carter-Cash Lambres-lez-Douai",city:"Lambres-lez-Douai",postal:"59552",dept:"59",equipped:true},
  {name:"Carter-Cash Villeneuve-d'Ascq",city:"Villeneuve-d'Ascq",postal:"59650",dept:"59",equipped:true},
  // DEPOT (90)
  {name:"Carter-Cash Viriat",city:"Viriat",postal:"01440",dept:"01",equipped:false},
  {name:"Carter-Cash Barberey-Saint-Sulpice",city:"Barberey-Saint-Sulpice",postal:"10600",dept:"10",equipped:false},
  {name:"Carter-Cash Narbonne",city:"Narbonne",postal:"11100",dept:"11",equipped:false},
  {name:"Carter-Cash Marseille La Valentine",city:"Marseille",postal:"13011",dept:"13",equipped:false},
  {name:"Carter-Cash Marseille",city:"Marseille",postal:"13014",dept:"13",equipped:false},
  {name:"Carter-Cash Les Pennes-Mirabeau",city:"Les Pennes-Mirabeau",postal:"13170",dept:"13",equipped:false},
  {name:"Carter-Cash Saint-Mitre-les-Remparts",city:"Saint-Mitre-les-Remparts",postal:"13920",dept:"13",equipped:false},
  {name:"Carter-Cash Mondeville",city:"Mondeville",postal:"14120",dept:"14",equipped:false},
  {name:"Carter-Cash Champniers",city:"Champniers",postal:"16430",dept:"16",equipped:false},
  {name:"Carter-Cash Saint-Germain-du-Puy",city:"Saint-Germain-du-Puy",postal:"18390",dept:"18",equipped:false},
  {name:"Carter-Cash Quetigny",city:"Quetigny",postal:"21800",dept:"21",equipped:false},
  {name:"Carter-Cash Tregueux",city:"Tregueux",postal:"22950",dept:"22",equipped:false},
  {name:"Carter-Cash Bethoncourt",city:"Bethoncourt",postal:"25200",dept:"25",equipped:false},
  {name:"Carter-Cash Chalezeule",city:"Chalezeule",postal:"25220",dept:"25",equipped:false},
  {name:"Carter-Cash Valence",city:"Valence",postal:"26000",dept:"26",equipped:false},
  {name:"Carter-Cash Evreux",city:"Evreux",postal:"27000",dept:"27",equipped:false},
  {name:"Carter-Cash Quimper",city:"Quimper",postal:"29000",dept:"29",equipped:false},
  {name:"Carter-Cash Brest",city:"Brest",postal:"29200",dept:"29",equipped:false},
  {name:"Carter-Cash Nimes",city:"Nimes",postal:"30000",dept:"30",equipped:false},
  {name:"Carter-Cash Ales",city:"Ales",postal:"30100",dept:"30",equipped:false},
  {name:"Carter-Cash Portet-sur-Garonne",city:"Portet-sur-Garonne",postal:"31120",dept:"31",equipped:false},
  {name:"Carter-Cash Aucamville",city:"Aucamville",postal:"31140",dept:"31",equipped:false},
  {name:"Carter-Cash L'Union",city:"L'Union",postal:"31240",dept:"31",equipped:false},
  {name:"Carter-Cash Toulouse",city:"Toulouse",postal:"31300",dept:"31",equipped:false},
  {name:"Carter-Cash Le Haillan",city:"Le Haillan",postal:"33185",dept:"33",equipped:false},
  {name:"Carter-Cash Artigues-pres-Bordeaux",city:"Artigues-pres-Bordeaux",postal:"33370",dept:"33",equipped:false},
  {name:"Carter-Cash Mauguio",city:"Mauguio",postal:"34130",dept:"34",equipped:false},
  {name:"Carter-Cash Castelnau-le-Lez",city:"Castelnau-le-Lez",postal:"34170",dept:"34",equipped:false},
  {name:"Carter-Cash Beziers",city:"Beziers",postal:"34500",dept:"34",equipped:false},
  {name:"Carter-Cash Rennes",city:"Rennes",postal:"35000",dept:"35",equipped:false},
  {name:"Carter-Cash Tours",city:"Tours",postal:"37100",dept:"37",equipped:false},
  {name:"Carter-Cash Echirolles",city:"Echirolles",postal:"38130",dept:"38",equipped:false},
  {name:"Carter-Cash Saint-Martin-d'Heres",city:"Saint-Martin-d'Heres",postal:"38400",dept:"38",equipped:false},
  {name:"Carter-Cash Saint-Etienne",city:"Saint-Etienne",postal:"42000",dept:"42",equipped:false},
  {name:"Carter-Cash La Ricamarie",city:"La Ricamarie",postal:"42150",dept:"42",equipped:false},
  {name:"Carter-Cash Orvault",city:"Orvault",postal:"44700",dept:"44",equipped:false},
  {name:"Carter-Cash Sainte-Luce-sur-Loire",city:"Sainte-Luce-sur-Loire",postal:"44980",dept:"44",equipped:false},
  {name:"Carter-Cash Saran",city:"Saran",postal:"45770",dept:"45",equipped:false},
  {name:"Carter-Cash Beaucouze",city:"Beaucouze",postal:"49070",dept:"49",equipped:false},
  {name:"Carter-Cash Reims",city:"Reims",postal:"51100",dept:"51",equipped:false},
  {name:"Carter-Cash Essey-les-Nancy",city:"Essey-les-Nancy",postal:"54270",dept:"54",equipped:false},
  {name:"Carter-Cash Woippy",city:"Woippy",postal:"57140",dept:"57",equipped:false},
  {name:"Carter-Cash Prouvy",city:"Prouvy",postal:"59121",dept:"59",equipped:false},
  {name:"Carter-Cash Wattignies",city:"Wattignies",postal:"59139",dept:"59",equipped:false},
  {name:"Carter-Cash Wattrelos",city:"Wattrelos",postal:"59150",dept:"59",equipped:false},
  {name:"Carter-Cash Capinghem",city:"Capinghem",postal:"59160",dept:"59",equipped:false},
  {name:"Carter-Cash Tourcoing",city:"Tourcoing",postal:"59200",dept:"59",equipped:false},
  {name:"Carter-Cash Dunkerque",city:"Dunkerque",postal:"59640",dept:"59",equipped:false},
  {name:"Carter-Cash Marcq-en-Baroeul",city:"Marcq-en-Baroeul",postal:"59700",dept:"59",equipped:false},
  {name:"Carter-Cash Feignies",city:"Feignies",postal:"59750",dept:"59",equipped:false},
  {name:"Carter-Cash Nogent-sur-Oise",city:"Nogent-sur-Oise",postal:"60180",dept:"60",equipped:false},
  {name:"Carter-Cash Compiegne",city:"Compiegne",postal:"60200",dept:"60",equipped:false},
  {name:"Carter-Cash Arras",city:"Arras",postal:"62000",dept:"62",equipped:false},
  {name:"Carter-Cash Calais",city:"Calais",postal:"62100",dept:"62",equipped:false},
  {name:"Carter-Cash Bruay-la-Buissiere",city:"Bruay-la-Buissiere",postal:"62700",dept:"62",equipped:false},
  {name:"Carter-Cash Fouquieres-les-Lens",city:"Fouquieres-les-Lens",postal:"62740",dept:"62",equipped:false},
  {name:"Carter-Cash Clermont-Ferrand",city:"Clermont-Ferrand",postal:"63000",dept:"63",equipped:false},
  {name:"Carter-Cash Serres-Castet",city:"Serres-Castet",postal:"64121",dept:"64",equipped:false},
  {name:"Carter-Cash Perpignan",city:"Perpignan",postal:"66000",dept:"66",equipped:false},
  {name:"Carter-Cash Souffelweyersheim",city:"Souffelweyersheim",postal:"67460",dept:"67",equipped:false},
  {name:"Carter-Cash Fegersheim",city:"Fegersheim",postal:"67640",dept:"67",equipped:false},
  {name:"Carter-Cash Pfastatt",city:"Pfastatt",postal:"68120",dept:"68",equipped:false},
  {name:"Carter-Cash Saint-Priest",city:"Saint-Priest",postal:"69800",dept:"69",equipped:false},
  {name:"Carter-Cash Vinzelles",city:"Vinzelles",postal:"71680",dept:"71",equipped:false},
  {name:"Carter-Cash Arnage-le-Mans",city:"Arnage",postal:"72230",dept:"72",equipped:false},
  {name:"Carter-Cash La Ravoire",city:"La Ravoire",postal:"73490",dept:"73",equipped:false},
  {name:"Carter-Cash Sotteville-les-Rouen",city:"Sotteville-les-Rouen",postal:"76300",dept:"76",equipped:false},
  {name:"Carter-Cash Gonfreville l'Orcher",city:"Gonfreville l'Orcher",postal:"76700",dept:"76",equipped:false},
  {name:"Carter-Cash Meaux",city:"Meaux",postal:"77100",dept:"77",equipped:false},
  {name:"Carter-Cash Brie-Comte-Robert",city:"Brie-Comte-Robert",postal:"77170",dept:"77",equipped:false},
  {name:"Carter-Cash Savigny-le-Temple",city:"Savigny-le-Temple",postal:"77176",dept:"77",equipped:false},
  {name:"Carter-Cash Pontault-Combault",city:"Pontault-Combault",postal:"77340",dept:"77",equipped:false},
  {name:"Carter-Cash Lagny-sur-Marne",city:"Lagny-sur-Marne",postal:"77400",dept:"77",equipped:false},
  {name:"Carter-Cash Claye-Souilly",city:"Claye-Souilly",postal:"77410",dept:"77",equipped:false},
  {name:"Carter-Cash Buchelay",city:"Buchelay",postal:"78200",dept:"78",equipped:false},
  {name:"Carter-Cash Coignieres",city:"Coignieres",postal:"78310",dept:"78",equipped:false},
  {name:"Carter-Cash Chauray",city:"Chauray",postal:"79180",dept:"79",equipped:false},
  {name:"Carter-Cash Longueau",city:"Longueau",postal:"80330",dept:"80",equipped:false},
  {name:"Carter-Cash Lescure-d'Albigeois",city:"Lescure-d'Albigeois",postal:"81380",dept:"81",equipped:false},
  {name:"Carter-Cash La-Valette-du-Var",city:"La-Valette-du-Var",postal:"83160",dept:"83",equipped:false},
  {name:"Carter-Cash La Seyne-sur-Mer",city:"La Seyne-sur-Mer",postal:"83500",dept:"83",equipped:false},
  {name:"Carter-Cash Avignon",city:"Avignon",postal:"84000",dept:"84",equipped:false},
  {name:"Carter-Cash Chasseneuil-du-Poitou",city:"Chasseneuil-du-Poitou",postal:"86360",dept:"86",equipped:false},
  {name:"Carter-Cash Limoges",city:"Limoges",postal:"87000",dept:"87",equipped:false},
  {name:"Carter-Cash Corbeil-Essonnes",city:"Corbeil-Essonnes",postal:"91100",dept:"91",equipped:false},
  {name:"Carter-Cash Ris-Orangis",city:"Ris-Orangis",postal:"91130",dept:"91",equipped:false},
  {name:"Carter-Cash Ballainvilliers",city:"Ballainvilliers",postal:"91160",dept:"91",equipped:false},
  {name:"Carter-Cash Sainte-Genevieve-des-Bois",city:"Sainte-Genevieve-des-Bois",postal:"91700",dept:"91",equipped:false},
  {name:"Carter-Cash Aulnay-sous-Bois",city:"Aulnay-sous-Bois",postal:"93600",dept:"93",equipped:false},
  {name:"Carter-Cash Saint-Ouen-l'Aumone",city:"Saint-Ouen-l'Aumone",postal:"95310",dept:"95",equipped:false},
];

// Villes connues → département (pour matcher quand pas de CC direct)
const CITY_TO_DEPT = {
  "paris":"75","lyon":"69","marseille":"13","toulouse":"31","nice":"06","nantes":"44",
  "strasbourg":"67","montpellier":"34","bordeaux":"33","lille":"59","rennes":"35",
  "reims":"51","toulon":"83","saint-etienne":"42","le havre":"76","grenoble":"38",
  "dijon":"21","angers":"49","nimes":"30","villeurbanne":"69","clermont-ferrand":"63",
  "le mans":"72","aix-en-provence":"13","brest":"29","tours":"37","amiens":"80",
  "limoges":"87","perpignan":"66","metz":"57","besancon":"25","orleans":"45",
  "rouen":"76","mulhouse":"68","caen":"14","nancy":"54","avignon":"84",
  "valence":"26","calais":"62","dunkerque":"59","troyes":"10","la rochelle":"17",
  "lorient":"56","pau":"64","bayonne":"64","poitiers":"86","chambery":"73",
  "colmar":"68","boulogne-billancourt":"92","montreuil":"93","saint-denis":"93",
  "argenteuil":"95","vitry-sur-seine":"94","creteil":"94","aubervilliers":"93",
  "aulnay-sous-bois":"93","colombes":"92","courbevoie":"92","nanterre":"92",
  "bobigny":"93","pantin":"93","bondy":"93","sevran":"93","drancy":"93",
  "noisy-le-grand":"93","epinay-sur-seine":"93","villepinte":"93","tremblay":"93",
  "livry-gargan":"93","le blanc-mesnil":"93","rosny-sous-bois":"93","gagny":"93",
  "stains":"93","la courneuve":"93","clichy-sous-bois":"93","montfermeil":"93",
  "neuilly-sur-marne":"93","neuilly-sur-seine":"92","bagneux":"92","suresnes":"92",
  "thiais":"94","choisy-le-roi":"94","orly":"94","ivry-sur-seine":"94",
  "villejuif":"94","maisons-alfort":"94","champigny-sur-marne":"94",
  "saint-maur-des-fosses":"94","fontenay-sous-bois":"94","nogent-sur-marne":"94",
  "vincennes":"94","alfortville":"94","cachan":"94","fresnes":"94","rungis":"94",
  "evry":"91","corbeil-essonnes":"91","massy":"91","savigny-sur-orge":"91",
  "palaiseau":"91","longjumeau":"91","sainte-genevieve-des-bois":"91",
  "sarcelles":"95","cergy":"95","pontoise":"95","garges-les-gonesse":"95",
  "goussainville":"95","bezons":"95","ermont":"95","franconville":"95",
  "meaux":"77","melun":"77","chelles":"77","pontault-combault":"77",
  "savigny-le-temple":"77","torcy":"77","lognes":"77","bussy-saint-georges":"77",
  "versailles":"78","saint-germain-en-laye":"78","poissy":"78","mantes-la-jolie":"78",
  "sartrouville":"78","chatou":"78","houilles":"78","conflans":"78",
  "douai":"59","valenciennes":"59","cambrai":"59","maubeuge":"59",
  "roubaix":"59","tourcoing":"59","wattrelos":"59","arras":"62","lens":"62",
  "bethune":"62","boulogne-sur-mer":"62","henin-beaumont":"62",
};

// Départements proches des CC équipés (pour recommander le plus proche)
const NEARBY_EQUIPPED = {
  "94": [{dept:"94",name:"Carter-Cash Thiais",city:"Thiais"}],
  "75": [{dept:"94",name:"Carter-Cash Thiais",city:"Thiais"}],
  "92": [{dept:"94",name:"Carter-Cash Thiais",city:"Thiais"}],
  "93": [{dept:"94",name:"Carter-Cash Thiais",city:"Thiais"},{dept:"95",name:"Carter-Cash Sarcelles",city:"Sarcelles"}],
  "91": [{dept:"94",name:"Carter-Cash Thiais",city:"Thiais"}],
  "77": [{dept:"94",name:"Carter-Cash Thiais",city:"Thiais"}],
  "78": [{dept:"95",name:"Carter-Cash Sarcelles",city:"Sarcelles"},{dept:"94",name:"Carter-Cash Thiais",city:"Thiais"}],
  "95": [{dept:"95",name:"Carter-Cash Sarcelles",city:"Sarcelles"}],
  "60": [{dept:"95",name:"Carter-Cash Sarcelles",city:"Sarcelles"}],
  "59": [{dept:"59",name:"Carter-Cash Lambres-lez-Douai",city:"Lambres-lez-Douai"},{dept:"59",name:"Carter-Cash Villeneuve-d'Ascq",city:"Villeneuve-d'Ascq"}],
  "62": [{dept:"59",name:"Carter-Cash Lambres-lez-Douai",city:"Lambres-lez-Douai"}],
  "80": [{dept:"59",name:"Carter-Cash Lambres-lez-Douai",city:"Lambres-lez-Douai"}],
  "02": [{dept:"59",name:"Carter-Cash Lambres-lez-Douai",city:"Lambres-lez-Douai"},{dept:"95",name:"Carter-Cash Sarcelles",city:"Sarcelles"}],
};

// --- MATCHING : ville/département → Carter-Cash ---
function extractDeptFromInput(input) {
  const t = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  // 1. Code postal complet (5 chiffres)
  const postalMatch = t.match(/\b(\d{5})\b/);
  if (postalMatch) return postalMatch[1].substring(0, 2);
  
  // 2. Numéro de département (le 93, dans le 59, département 94)
  const deptMatch = t.match(/(?:le |dans le |departement |dept |dpt )?(\d{2})\b/);
  if (deptMatch) {
    const num = deptMatch[1];
    if (parseInt(num) >= 1 && parseInt(num) <= 95) return num.padStart(2, "0");
  }
  
  // 3. Ville connue dans la base CC (exact ou partial match)
  for (const cc of CARTER_CASH_LIST) {
    const ccCity = cc.city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes(ccCity) || ccCity.includes(t)) return cc.dept;
    // Partial match: "aulnay" → "aulnay-sous-bois"
    const ccFirst = ccCity.split(/[- ]/)[0]; // Premier mot de la ville CC
    if (ccFirst.length >= 4 && t.includes(ccFirst)) return cc.dept;
  }
  
  // 4. Ville connue dans le mapping (exact ou partial)
  for (const [city, dept] of Object.entries(CITY_TO_DEPT)) {
    const cityNorm = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes(cityNorm)) return dept;
    const cityFirst = cityNorm.split(/[- ]/)[0];
    if (cityFirst.length >= 4 && t.includes(cityFirst)) return dept;
  }
  
  return null;
}

function findCCForDept(dept) {
  if (!dept) return { equipped: [], depot: [], nearbyEquipped: [] };
  const equipped = CARTER_CASH_LIST.filter(c => c.dept === dept && c.equipped);
  const depot = CARTER_CASH_LIST.filter(c => c.dept === dept && !c.equipped);
  const nearbyEquipped = NEARBY_EQUIPPED[dept] || [];
  return { equipped, depot, nearbyEquipped };
}

// ============================================
// EXPERT ORIENTATION + QUESTION DÉMONTAGE
// ============================================

function buildExpertOrientation(extracted, metier) {
  const marque = extracted?.marque;
  const modele = extracted?.modele;
  const certitude = extracted?.certitude_fap;
  const attempts = extracted?.previous_attempts || "";

  // --- PARTIE 1 : Réponse à CHAQUE tentative (multi-attempt) ---
  const attemptResponses = [];

  if (attempts.includes("regeneration_forcee")) {
    attemptResponses.push("Pour la régénération : elle brûle les suies à ~600°C, mais elle ne peut rien contre les cendres métalliques qui se sont accumulées dans le filtre. Si le FAP est trop chargé en cendres, même une régénération réussie ne suffit plus — le filtre reste partiellement bouché.");
  }
  if (attempts.includes("additif") || attempts.includes("additif_cerine")) {
    attemptResponses.push("Pour les produits nettoyants/additifs : ils agissent uniquement sur les suies (particules de combustion). Mais dans un FAP, il y a aussi des cendres métalliques — résidus d'huile moteur — qui s'accumulent et que ces produits ne dissolvent pas.");
  }
  if (attempts.includes("garage")) {
    attemptResponses.push("Le garage t'a probablement proposé un remplacement. C'est souvent la solution la plus simple pour eux, mais un FAP encrassé ne veut pas dire FAP mort — dans la majorité des cas, il peut être remis en état.");
  }
  if (attempts.includes("karcher")) {
    attemptResponses.push("Le jet haute pression risque d'endommager la structure céramique interne du FAP (le substrat en nid d'abeille). Et l'eau seule ne dissout pas les cendres métalliques.");
  }
  if (attempts.includes("nettoyage_anterieur")) {
    attemptResponses.push("Si le voyant revient après un nettoyage, il faut chercher la cause en amont : capteur de pression différentielle, système d'additif (Eolys/cérine), injecteurs, ou conditions d'utilisation (trop de petits trajets urbains). Le nettoyage seul ne suffit pas si la cause racine persiste.");
  }
  if (attempts.includes("nettoyage_chimique")) {
    attemptResponses.push("L'acide ou le vinaigre peuvent attaquer la céramique du FAP et créer des micro-fissures irréversibles. C'est un risque réel d'endommager définitivement le filtre.");
  }
  if (attempts.includes("defapage")) {
    attemptResponses.push("La suppression du FAP rend le véhicule non conforme au contrôle technique et c'est interdit par la loi (Art. L318-3). En cas d'accident, l'expertise peut aussi poser problème.");
  }

  // Assembler les réponses aux tentatives
  let techExplanation = "";
  if (attemptResponses.length > 0) {
    techExplanation = attemptResponses.join("\n\n");
  } else {
    if (certitude === "haute") {
      techExplanation = "Ce que tu décris, c'est typiquement un FAP qui est arrivé à saturation. Les suies et les cendres se sont accumulées au point où le filtre ne laisse plus passer assez de gaz d'échappement — d'où le voyant et la perte de puissance.";
    } else {
      techExplanation = "D'après ce que tu décris, il y a de bonnes chances que ce soit lié au FAP.";
    }
  }

  // --- PARTIE 2 : DIAGNOSTIC — expliquer le problème de fond ---
  let diagnosisBlock = "";
  if (attemptResponses.length > 0) {
    diagnosisBlock = "Le problème de fond, c'est l'accumulation de cendres métalliques dans le filtre. C'est un phénomène normal avec le temps et le kilométrage — aucune solution \"maison\" (régénération, additifs, roulage autoroute) ne peut les retirer.";
  }

  // Note système additif (information pure, pas claim de service)
  let additifNote = "";
  if (metier?.vehicle?.systeme_additif && metier.vehicle.systeme_additif !== "aucun") {
    additifNote = `À savoir aussi : ta ${marque || "voiture"} utilise un système d'additif (${metier.vehicle.systeme_additif}) pour faciliter les régénérations. Si le niveau du réservoir d'additif est bas, ça peut aggraver le problème. C'est un point à vérifier de ton côté ou avec ton garagiste.`;
  }

  // --- PARTIE 3 : QUESTION OUVERTE (pas de solution encore) ---
  const openQuestion = "Il existe une solution pour retirer ces cendres, mais je préfère d'abord t'expliquer comment ça fonctionne plutôt que de te balancer un devis. Tu veux que je te détaille ça ?";

  // --- ASSEMBLAGE ---
  const parts = [techExplanation];
  if (diagnosisBlock) parts.push(diagnosisBlock);
  if (additifNote) parts.push(additifNote);
  parts.push(openQuestion);

  const replyClean = parts.join("\n\n");

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "demander_explication_solution",
  };

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// ============================================
// PHASE 2 : EXPLICATION SOLUTION + DÉMONTAGE
// (déclenchée quand user dit "oui" après le diagnostic)
// ============================================
function buildSolutionExplanation(extracted, metier) {
  const marque = extracted?.marque;

  const solutionBlock = "Le nettoyage en machine professionnelle est la seule façon de retirer les cendres métalliques. Concrètement, le FAP est nettoyé sous pression contrôlée avec un procédé qui retire les suies ET les cendres sans abîmer la céramique. L'état du filtre est vérifié avant et après pour s'assurer que le résultat est bon.";

  const demontageQuestion = "Pour faire ce nettoyage, le FAP doit être démonté du véhicule. Est-ce que tu as la possibilité de le démonter toi-même (ou de le faire démonter par quelqu'un), ou est-ce que tu préfères qu'un garage s'occupe de tout ?";

  const replyClean = `${solutionBlock}\n\n${demontageQuestion}`;

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "demander_demontage",
  };

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// ============================================
// HELPER PRICING — Prix selon le véhicule
// Règle : on n'affiche un prix spécifique que si on a le MODÈLE.
// Sans modèle (juste la marque), on affiche la fourchette.
// Ex: "Peugeot" → "99-149€" (on ne sait pas si DV6 ou BlueHDI)
//     "Peugeot 308 1.6 HDI" → "99€" (DV6 sans cata confirmé)
//     "Peugeot 3008 BlueHDI" → "149€" (FAP+cata confirmé)
// ============================================
function getPricing(extracted, metier) {
  const defaults = { prixCC: "99-149€", prixEnvoi: "199€", prixText: "entre 99€ et 149€" };

  // Sans modèle → on ne peut pas déterminer le type de FAP → fourchette
  if (!extracted?.modele) return defaults;

  // Avec modèle + pricing BDD → prix spécifique
  if (metier?.vehicle?.pricing_hint && metier?.pricing?.length > 0) {
    const matchCC = metier.pricing.find((p) => p.fap_type === metier.vehicle.pricing_hint && p.equipped_machine === true);
    const matchEnvoi = metier.pricing.find((p) => p.equipped_machine === false);
    return {
      prixCC: matchCC ? `${matchCC.price_ttc}€` : defaults.prixCC,
      prixEnvoi: matchEnvoi ? `${matchEnvoi.price_ttc}€` : defaults.prixEnvoi,
      prixText: matchCC ? `${matchCC.price_ttc}€` : defaults.prixText,
    };
  }

  return defaults;
}

// ============================================
// RÉPONSE DÉMONTAGE : SELF → ask ville
// ============================================
function buildSelfRemovalResponse(extracted, metier) {
  const { prixCC, prixEnvoi } = getPricing(extracted, metier);

  const replyClean = `C'est la solution la plus économique. Une fois le FAP démonté, tu as deux options :\n\n→ Le déposer dans un Carter-Cash équipé d'une machine : nettoyage sur place en ~4h, ${prixCC}.\n→ Le déposer dans n'importe quel Carter-Cash (point dépôt) : envoi au centre Re-FAP, retour en 48-72h, ${prixEnvoi} port inclus.\n\nTu es dans quel coin ? Je regarde le Carter-Cash le plus proche de chez toi.`;

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    demontage: "self",
    next_best_action: "demander_ville",
  };

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// ============================================
// RÉPONSE DÉMONTAGE : GARAGE → ask ville
// ============================================
function buildGarageNeededResponse(extracted, metier) {
  const { prixCC: prixNettoyage } = getPricing(extracted, metier);

  const replyClean = `Pas de souci, c'est le cas le plus courant. Voilà comment ça se passe :\n\nLe garage s'occupe de tout : démontage du FAP, envoi au centre Re-FAP pour le nettoyage, remontage et réinitialisation du système.\n\nCôté tarif, le nettoyage Re-FAP c'est ${prixNettoyage}, et le garage facture en plus sa main d'œuvre pour le démontage/remontage. Le total dépend du véhicule (l'accès au FAP est plus ou moins facile selon les modèles), mais dans tous les cas ça reste bien en dessous d'un remplacement de FAP (1 500€ à 3 000€+).\n\nOn travaille avec plus de 800 garages partenaires en France. Tu es dans quel coin ? Et si tu as déjà un garage de confiance, on peut aussi travailler directement avec lui.`;

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    demontage: "garage",
    next_best_action: "demander_ville",
  };

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// ============================================
// ORIENTATION CONCRÈTE APRÈS VILLE (avec matching CC)
// ============================================

// Fallback: détecter demontage depuis les messages user dans l'historique
function detectDemontageFromHistory(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "user") {
      const msg = String(history[i].content || "");
      if (userSaysSelfRemoval(msg)) return "self";
      if (userNeedsGarage(msg)) return "garage";
    }
    // On cherche aussi dans les réponses bot un indice
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("la solution la plus économique") && content.includes("fap démonté")) return "self";
      if (content.includes("le garage s'occupe de tout") && content.includes("main d'œuvre")) return "garage";
    }
  }
  return null;
}

// Capitaliser la ville proprement
function capitalizeVille(ville) {
  if (!ville) return ville;
  return ville.replace(/\b[a-zàâäéèêëïîôùûüÿç]+/gi, (word) => {
    // Ne pas capitaliser les petits mots (le, la, les, de, du, sur, en, sous)
    if (/^(le|la|les|de|du|des|sur|en|sous|d|l)$/i.test(word) && word !== ville.split(/\s/)[0]) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function buildLocationOrientationResponse(extracted, metier, ville, history) {
  const dept = extractDeptFromInput(ville);
  const cc = dept ? findCCForDept(dept) : { equipped: [], depot: [], nearbyEquipped: [] };
  const vehicleInfo = extracted?.marque ? `ta ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""}` : "ton véhicule";
  
  // Demontage: d'abord dans extracted, sinon fallback depuis l'historique
  let demontage = extracted?.demontage || null;
  if (!demontage && history) {
    demontage = detectDemontageFromHistory(history);
  }
  if (!demontage) demontage = "unknown";

  // Capitaliser la ville pour l'affichage
  const villeDisplay = capitalizeVille(ville);

  const { prixCC, prixEnvoi } = getPricing(extracted, metier);

  let replyClean = "";

  if (demontage === "self") {
    // ── SELF REMOVAL : orienter vers le CC le plus adapté ──
    if (cc.equipped.length > 0) {
      // CC ÉQUIPÉ dans le département → jackpot
      const best = cc.equipped[0];
      replyClean = `Bonne nouvelle ! Il y a un Carter-Cash équipé d'une machine Re-FAP près de chez toi : ${best.name} (${best.postal} ${best.city}). Tu y déposes ton FAP démonté, nettoyage sur place en ~4h, ${prixCC}. Tu veux qu'un expert Re-FAP te confirme les détails et prépare ta venue ?`;
    } else if (cc.depot.length > 0) {
      // CC DÉPÔT dans le département
      const depotCC = cc.depot[0];
      let equippedHint = "";
      if (cc.nearbyEquipped.length > 0) {
        const nearest = cc.nearbyEquipped[0];
        equippedHint = `\n\nSinon, le Carter-Cash équipé le plus proche de toi c'est ${nearest.name} (${nearest.city}) — là-bas c'est nettoyage sur place en 4h à ${prixCC}.`;
      }
      replyClean = `OK, près de chez toi il y a le ${depotCC.name} (${depotCC.postal} ${depotCC.city}). C'est un point dépôt : tu y laisses ton FAP démonté, il est envoyé au centre Re-FAP et te revient en 48-72h pour ${prixEnvoi} port inclus.${equippedHint}\n\nTu veux qu'un expert Re-FAP t'oriente sur la meilleure option ?`;
    } else if (cc.nearbyEquipped.length > 0) {
      // Pas de CC dans le dept, mais un équipé pas trop loin
      const nearest = cc.nearbyEquipped[0];
      replyClean = `Il n'y a pas de Carter-Cash directement dans ton secteur, mais le plus proche équipé d'une machine c'est ${nearest.name} (${nearest.city}). Sinon, tu peux envoyer ton FAP directement par transporteur : ${prixEnvoi} port inclus, retour en 48-72h.\n\nTu veux qu'un expert Re-FAP regarde la meilleure option pour toi ?`;
    } else {
      // Aucun CC trouvé → envoi direct
      replyClean = `Pour ton secteur, la solution la plus simple c'est l'envoi direct : tu nous envoies ton FAP démonté par transporteur, on le nettoie et on te le retourne en 48-72h, ${prixEnvoi} port inclus. Tu veux qu'un expert Re-FAP t'envoie les détails ?`;
    }
  } else if (demontage === "garage") {
    // ── GARAGE : orienter vers partenaire + mentionner CC si pertinent ──
    if (cc.equipped.length > 0) {
      const best = cc.equipped[0];
      replyClean = `OK, ${villeDisplay}. Bonne nouvelle, il y a un Carter-Cash équipé d'une machine près de chez toi (${best.name}). Certains garages travaillent directement avec ce centre. On a aussi des garages partenaires dans ton secteur qui gèrent tout de A à Z.\n\nLe mieux c'est qu'un expert Re-FAP te trouve le garage le plus adapté pour ${vehicleInfo} et te donne un chiffre précis. Tu veux qu'on te rappelle ?`;
    } else if (cc.nearbyEquipped.length > 0) {
      const nearest = cc.nearbyEquipped[0];
      replyClean = `OK, ${villeDisplay}. Le Carter-Cash équipé le plus proche c'est ${nearest.name} (${nearest.city}). Certains garages de ton secteur travaillent avec ce centre. On a aussi plus de 800 garages partenaires qui gèrent tout de A à Z : démontage, envoi Re-FAP, remontage.\n\nLe mieux c'est qu'un expert Re-FAP te trouve le garage le plus adapté pour ${vehicleInfo} et te donne un chiffre précis. Tu veux qu'on te rappelle ?`;
    } else {
      replyClean = `OK, ${villeDisplay}. On a des garages partenaires dans ton secteur qui s'occupent de tout : démontage, envoi au centre Re-FAP, remontage et réinitialisation. Le nettoyage c'est ${prixCC}, et le garage te chiffrera la main d'œuvre selon ${vehicleInfo}.\n\nLe mieux c'est qu'un expert Re-FAP te mette en contact avec le bon garage. Tu veux qu'on te rappelle ?`;
    }
  } else {
    // ── DEMONTAGE INCONNU (fallback) ──
    if (dept && (cc.equipped.length > 0 || cc.depot.length > 0)) {
      const anyCC = cc.equipped[0] || cc.depot[0];
      const typeCC = anyCC.equipped ? `équipé d'une machine (nettoyage sur place en 4h, ${prixCC})` : `point dépôt (envoi 48-72h, ${prixEnvoi})`;
      replyClean = `OK, ${villeDisplay}. Il y a le ${anyCC.name} (${anyCC.postal}) qui est un ${typeCC}. On a aussi des garages partenaires dans ton secteur pour la prise en charge complète.\n\nLe mieux c'est qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo}. Tu veux qu'on te rappelle ?`;
    } else if (dept && cc.nearbyEquipped.length > 0) {
      const nearest = cc.nearbyEquipped[0];
      replyClean = `OK, ${villeDisplay}. Le Carter-Cash équipé le plus proche c'est ${nearest.name} (${nearest.city}) — nettoyage sur place en 4h à ${prixCC} si tu déposes ton FAP démonté. On a aussi des garages partenaires dans ton secteur pour la prise en charge complète.\n\nLe mieux c'est qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo}. Tu veux qu'on te rappelle ?`;
    } else {
      replyClean = `OK, ${villeDisplay}. On a des centres Carter-Cash et plus de 800 garages partenaires en France. Pour ${vehicleInfo}, le mieux c'est qu'un expert Re-FAP vérifie le centre le plus adapté près de chez toi et te confirme le prix exact. Tu veux qu'on te rappelle ?`;
    }
  }

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "rdv",
    next_best_action: "proposer_devis",
  };

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- CLOSING FORCÉ (fallback quand on a pas pu faire le parcours expert complet) ---
function buildClosingQuestion(extracted, metier) {
  const { prixText } = getPricing(extracted, metier);

  let vehicleInfo = "";
  if (extracted?.marque) {
    vehicleInfo = `ta ${extracted.marque}`;
    if (extracted?.modele) vehicleInfo += ` ${extracted.modele}`;
  }

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  let replyClean;
  if (vehicleInfo) {
    replyClean = `Sur ${vehicleInfo}, le nettoyage professionnel du FAP c'est ${prixText} au lieu de 1500€+ pour un remplacement. Tu veux qu'un expert Re-FAP regarde ta situation ? C'est gratuit, on te rappelle pour t'orienter.`;
  } else {
    replyClean = `Le nettoyage professionnel du FAP c'est ${prixText} au lieu de 1500€+ pour un remplacement. Tu veux qu'un expert Re-FAP regarde ta situation ?`;
  }

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- DEMANDE VÉHICULE ---
function buildVehicleQuestion(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_vehicule" };
  const variants = [
    "Pas de panique, c'est souvent réparable. C'est quelle voiture ?",
    "D'accord, on va regarder ça. Tu roules en quoi ?",
    "Compris. C'est quoi comme véhicule ?",
  ];
  const replyClean = variants[Math.floor(Math.random() * variants.length)];
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- DEMANDE "DÉJÀ ESSAYÉ" (NOUVEAU V6) ---
function buildPreviousAttemptsQuestion(extracted, metier) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_deja_essaye" };

  let replyClean;
  if (metier?.vehicle) {
    // Personnalisé avec le véhicule
    replyClean = `Ok, sur une ${extracted?.marque || "ta voiture"} c'est un souci qu'on voit souvent. Avant de t'orienter, tu as déjà essayé quelque chose pour régler ça ? Additif, passage garage, ou rien du tout ?`;
  } else {
    replyClean = `D'accord. Tu as déjà essayé quelque chose pour régler ça ? Additif, passage garage, ou rien du tout ?`;
  }

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- FORMULAIRE CTA ---
function buildFormCTA(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), intention: "rdv", next_best_action: "clore" };
  const replyClean = `Parfait ! Laisse tes coordonnées et un expert Re-FAP te rappelle rapidement pour t'orienter vers la meilleure solution près de chez toi.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- REFUS POLI ---
function buildDeclinedResponse(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "clore" };
  const replyClean = `Pas de souci ! Si tu changes d'avis ou si tu as d'autres questions, je suis là.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- OFF-TOPIC ---
function buildOffTopicResponse() {
  const data = { ...DEFAULT_DATA };
  const replyClean = `Je suis FAPexpert, spécialisé dans les problèmes de filtre à particules diesel. Si tu as un souci de voyant, perte de puissance, fumée ou contrôle technique sur ton véhicule, je peux t'aider !`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// --- RÉPONSE PRIX DIRECTE (quand l'user demande le prix d'entrée) ---
function buildPriceDirectResponse(extracted, metier) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_vehicule" };

  let prixText = "entre 99€ et 149€ chez Carter-Cash selon le modèle, 199€ en envoi";
  // Si on a des prix en BDD, utiliser les vrais
  if (metier?.pricing?.length > 0) {
    const ccLow = metier.pricing.find((p) => p.equipped_machine === true && p.fap_type === "dv6_sans_cata");
    const ccHigh = metier.pricing.find((p) => p.equipped_machine === true && p.fap_type === "avec_cata");
    const ccSend = metier.pricing.find((p) => p.equipped_machine === false);
    if (ccLow && ccHigh) {
      prixText = `${ccLow.price_ttc}€ à ${ccHigh.price_ttc}€ chez Carter-Cash, ${ccSend?.price_ttc || 199}€ en envoi`;
    }
  }

  let replyClean;
  if (extracted?.marque) {
    replyClean = `Le nettoyage FAP c'est ${prixText}. Sur ta ${extracted.marque}, tu as quel souci exactement ?`;
  } else {
    replyClean = `Le nettoyage FAP c'est ${prixText}. Pour te donner le prix exact, c'est quoi ta voiture ?`;
  }

  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

// ============================================================
// AUTH (kept from V5.1)
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
// HANDLER — VERSION 6.0
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

    // ========================================
    // DB : conversation + message user
    // ========================================
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .upsert({ session_id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id" })
      .select("id")
      .single();

    if (convError) {
      return res.status(500).json({ error: "Erreur DB conversation", details: convError.message });
    }
    const conversationId = convData.id;

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    // ========================================
    // EXTRACTION : quickExtract + données précédentes
    // ========================================
    const quickData = quickExtract(message);
    let lastExtracted = extractLastExtractedData(history);

    // Merger quickExtract dans lastExtracted
    if (quickData.marque && !lastExtracted.marque) lastExtracted.marque = quickData.marque;
    if (quickData.symptome_key && lastExtracted.symptome === "inconnu") lastExtracted.symptome = quickData.symptome_key;
    if (quickData.codes.length > 0 && lastExtracted.codes.length === 0) lastExtracted.codes = quickData.codes;
    if (quickData.previous_attempts.length > 0 && !lastExtracted.previous_attempts) {
      lastExtracted.previous_attempts = quickData.previous_attempts.join(", ");
    }
    const detectedYear = extractYearFromMessage(message);
    if (detectedYear && !lastExtracted.annee) lastExtracted.annee = detectedYear;
    const detectedKm = extractKmFromMessage(message);
    if (detectedKm && !lastExtracted.kilometrage) lastExtracted.kilometrage = detectedKm;

    // Certitude FAP depuis routing
    if (quickData.symptome_key && lastExtracted.certitude_fap === "inconnue") {
      const hauteCertitude = ["voyant_fap", "voyant_fap_puissance", "code_p2002", "fap_bouche_declare", "mode_degrade", "ct_refuse"];
      const moyenneCertitude = ["perte_puissance", "code_p0420", "voyant_moteur_seul", "fumee", "fumee_noire"];
      if (hauteCertitude.includes(quickData.symptome_key)) lastExtracted.certitude_fap = "haute";
      else if (moyenneCertitude.includes(quickData.symptome_key)) lastExtracted.certitude_fap = "moyenne";
      else lastExtracted.certitude_fap = "basse";
    }

    const userTurns = countUserTurns(history) + 1;

    // ========================================
    // REQUÊTES METIER (parallèles, non bloquantes si tables absentes)
    // ========================================
    const metier = await fetchMetierData(supabase, quickData, lastExtracted);

    // ========================================
    // HELPER : envoyer une réponse + save + enrichment
    // ========================================
    async function sendResponse(response, action = null) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: response.replyFull,
      });

      // Enrichment fire-and-forget
      upsertEnrichment(supabase, conversationId, response.extracted, quickData, metier);

      const result = {
        reply: response.replyClean,
        reply_full: response.replyFull,
        session_id,
        conversation_id: conversationId,
        extracted_data: response.extracted,
      };
      if (action) result.action = action;
      return res.status(200).json(result);
    }

    // ========================================
    // OVERRIDE 0 : OFF-TOPIC
    // ========================================
    if (quickData.is_off_topic && userTurns <= 2) {
      return sendResponse(buildOffTopicResponse());
    }

    // ========================================
    // OVERRIDE 1 : Closing/orientation question + OUI → Formulaire
    // ========================================
    if ((lastAssistantAskedClosingQuestion(history) || lastAssistantAskedCity(history)) && userSaysYes(message)) {
      return sendResponse(buildFormCTA(lastExtracted), { type: "OPEN_FORM", url: FORM_URL });
    }

    // ========================================
    // OVERRIDE 1a : Bot a posé la question diagnostic ("tu veux que je te détaille ?") + OUI → solution + démontage
    // ========================================
    if (lastAssistantAskedSolutionExplanation(history) && userSaysYes(message)) {
      return sendResponse(buildSolutionExplanation(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 1b : Bot a demandé le démontage → détecter self/garage
    // ========================================
    if (lastAssistantAskedDemontage(history)) {
      if (userSaysSelfRemoval(message)) {
        return sendResponse(buildSelfRemovalResponse(lastExtracted, metier));
      } else if (userNeedsGarage(message) || userSaysNo(message)) {
        return sendResponse(buildGarageNeededResponse(lastExtracted, metier));
      }
      // Si ni self ni garage détecté, on essaie comme ville (l'user a peut-être skip la question et donné directement sa ville)
      const deptTest = extractDeptFromInput(message);
      if (deptTest) {
        let ville = message.trim()
          .replace(/^(je suis |j'habite |j'suis |jsuis |je vis |on est |nous sommes |moi c'est |c'est )(à |a |au |en |sur |dans le |près de |pres de |vers )?/i, "")
          .replace(/^(à |a |au |en |sur |dans le |près de |pres de |vers )/i, "")
          .replace(/[.!?]+$/, "")
          .trim();
        if (!ville) ville = message.trim();
        return sendResponse(buildLocationOrientationResponse(lastExtracted, metier, ville, history));
      }
      // Sinon fallback: on considère que c'est "garage" (cas le plus courant)
      return sendResponse(buildGarageNeededResponse(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 1c : Bot a demandé la ville, user répond avec une ville → orientation concrète
    // ========================================
    if (lastAssistantAskedCity(history) && !userSaysYes(message) && !userSaysNo(message) && message.length > 1) {
      let ville = message.trim()
        .replace(/^(je suis |j'habite |j'suis |jsuis |je vis |on est |nous sommes |moi c'est |c'est )(à |a |au |en |sur |dans le |près de |pres de |vers )?/i, "")
        .replace(/^(à |a |au |en |sur |dans le |près de |pres de |vers )/i, "")
        .replace(/[.!?]+$/, "")
        .trim();
      if (!ville) ville = message.trim();
      return sendResponse(buildLocationOrientationResponse(lastExtracted, metier, ville, history));
    }

    // ========================================
    // OVERRIDE 2 : Closing/orientation/solution question + NON → Poli
    // ========================================
    if ((lastAssistantAskedClosingQuestion(history) || lastAssistantAskedCity(history) || lastAssistantAskedSolutionExplanation(history)) && userSaysNo(message)) {
      return sendResponse(buildDeclinedResponse(lastExtracted));
    }

    // ========================================
    // OVERRIDE 3 : Demande explicite de RDV/devis
    // ========================================
    if (userWantsFormNow(message)) {
      return sendResponse(buildFormCTA(lastExtracted), { type: "OPEN_FORM", url: FORM_URL });
    }

    // ========================================
    // OVERRIDE 4 : Prix direct → répondre au prix IMMÉDIATEMENT
    // ========================================
    if (quickData.intention === "prix" && !everAskedClosing(history)) {
      return sendResponse(buildPriceDirectResponse(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 5 : A le symptôme + véhicule, pas encore demandé "déjà essayé"
    // Sauf si l'user a déjà mentionné des tentatives ou si on a déjà demandé
    // ========================================
    if (
      lastExtracted.marque &&
      lastExtracted.symptome !== "inconnu" &&
      !lastExtracted.previous_attempts &&
      !everAskedPreviousAttempts(history) &&
      !everAskedClosing(history) &&
      userTurns >= 2
    ) {
      return sendResponse(buildPreviousAttemptsQuestion(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 6 : Tour 3+ sans véhicule → forcer la question
    // ========================================
    if (userTurns >= 3 && !lastExtracted.marque && !lastAssistantAskedVehicle(history) && !everAskedClosing(history)) {
      return sendResponse(buildVehicleQuestion(lastExtracted));
    }

    // ========================================
    // OVERRIDE 7 : Assez d'infos → EXPLICATION EXPERT + demande ville
    // (au lieu de l'ancien closing commercial)
    // ========================================
    if (
      hasEnoughToClose(lastExtracted, history) &&
      (everAskedPreviousAttempts(history) || lastExtracted.previous_attempts) &&
      !everGaveExpertOrientation(history) &&
      !everAskedClosing(history) &&
      userTurns >= 3
    ) {
      return sendResponse(buildExpertOrientation(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 8 : Tour 5+ → closing forcé même sans "déjà essayé"
    // ========================================
    if (userTurns >= MAX_USER_TURNS && lastExtracted.marque && !everAskedClosing(history)) {
      return sendResponse(buildClosingQuestion(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 9 : RÉPONSE BDD MÉTIER (couvre ~95% des cas)
    // Si la BDD peut répondre → on répond sans appeler Mistral
    // ========================================
    const metierResponse = buildMetierResponse(quickData, lastExtracted, metier, userTurns, history);
    if (metierResponse) {
      return sendResponse(metierResponse);
    }

    // ========================================
    // OVERRIDE 10 : SNIPPET TECHNIQUE (codes OBD, sujets techniques)
    // Si un knowledge_snippet matche → on l'utilise
    // ========================================
    const snippetResponse = buildSnippetResponse(quickData, lastExtracted, metier);
    if (snippetResponse) {
      return sendResponse(snippetResponse);
    }

    // ========================================
    // LLM PATH : Appel Mistral — FALLBACK UNIQUEMENT
    // Arrive ici seulement si :
    // - Aucun symptôme reconnu par quickExtract
    // - Aucune routing_rule matchée
    // - Aucun override déclenché
    // Cas typiques : messages ambigus, questions inattendues, conversations complexes
    // ========================================

    // Déterminer la question suivante suggérée
    let flowHint = null;
    if (!lastExtracted.marque) {
      flowHint = "Demande la marque et le modèle du véhicule.";
    } else if (!lastExtracted.previous_attempts && !everAskedPreviousAttempts(history)) {
      flowHint = "Demande si l'utilisateur a déjà essayé quelque chose (additif, garage, etc.)";
    }

    // Construire les FACTS
    const facts = buildFacts(metier, quickData, lastExtracted, flowHint);

    // Assembler les messages pour Mistral
    const messagesForMistral = [
      { role: "system", content: SYSTEM_PROMPT + facts },
    ];

    if (Array.isArray(history)) {
      for (const msg of history) {
        if (msg.role === "user") {
          messagesForMistral.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          // Envoyer la version clean à Mistral (pas le DATA:)
          const clean = cleanReplyForUI(msg.raw || msg.content);
          if (clean) messagesForMistral.push({ role: "assistant", content: clean });
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

    // Extraire DATA du LLM et merger
    const rawExtracted = extractDataFromReply(replyFull) || DEFAULT_DATA;
    const extracted = mergeExtractedData(lastExtracted, rawExtracted, message, quickData);

    // Appliquer certitude depuis routing si Mistral ne l'a pas fait
    if (metier.routing && extracted.certitude_fap === "inconnue") {
      extracted.certitude_fap = metier.routing.certitude_fap;
    }

    // Nettoyer pour l'UI
    let replyClean = cleanReplyForUI(replyFull);

    // FALLBACK si réponse vide
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

    replyFull = `${replyClean}\nDATA: ${safeJsonStringify(extracted)}`;

    // ========================================
    // SÉCURITÉ : Si le LLM génère un closing sans véhicule → bloquer
    // ========================================
    const looksLikeClosing = replyClean.toLowerCase().includes("expert re-fap") && (replyClean.toLowerCase().includes("gratuit") || replyClean.toLowerCase().includes("sans engagement"));
    if (looksLikeClosing && !extracted.marque) {
      return sendResponse(buildVehicleQuestion(extracted));
    }

    // ========================================
    // AUTO-CLOSE : assez d'infos → expert orientation ou closing
    // ========================================
    if (
      hasEnoughToClose(extracted, history) &&
      userTurns >= 3 &&
      !everAskedClosing(history) &&
      (everAskedPreviousAttempts(history) || extracted.previous_attempts || userTurns >= 4)
    ) {
      if (!everGaveExpertOrientation(history)) {
        return sendResponse(buildExpertOrientation(extracted, metier));
      } else {
        return sendResponse(buildClosingQuestion(extracted, metier));
      }
    }

    // ========================================
    // RÉPONSE NORMALE
    // ========================================
    const response = { replyClean, replyFull, extracted };
    return sendResponse(response);

  } catch (error) {
    console.error("❌ Erreur handler chat:", error);
    return res.status(500).json({ error: "Erreur serveur interne", details: error.message });
  }
}
