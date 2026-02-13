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
  if (/voyant\s*(fap|filtre|dpf)|symbole.*(pot|echappement)|t[eé]moin\s*fap/.test(t)) {
    result.symptome_key = "voyant_fap";
  } else if (/mode\s*d[eé]grad[eé]|mode\s*limp|brid[eé]e?|limit[eé]e?\s*(à|a)\s*\d/.test(t)) {
    result.symptome_key = "mode_degrade";
  } else if (/fap\s*(bouch|colmat|encras|satur|block)/i.test(t) || /filtre.*(bouch|colmat)/i.test(t)) {
    result.symptome_key = "fap_bouche_declare";
  } else if (/ct\s*(refus|recal|pas\s*pass)|contre.?visite|controle\s*technique.*(refus|pollution)|opacit[eé]/i.test(t)) {
    result.symptome_key = "ct_refuse";
  } else if (/r[eé]g[eé]n[eé]ration.*(impossible|echou|rat|marche\s*pas)|valise.*(impossible|echou)/i.test(t)) {
    result.symptome_key = "regeneration_impossible";
  } else if (/(perte|plus|manque|baisse|perd).*(puissance|p[eê]che|patate)|(tire|avance)\s*(plus|pas)|n.?avance\s*plus/i.test(t)) {
    result.symptome_key = "perte_puissance";
  } else if (/fum[eé]e\s*noire|black\s*smoke/i.test(t)) {
    result.symptome_key = "fumee_noire";
  } else if (/fum[eé]e\s*blanche|white\s*smoke/i.test(t)) {
    result.symptome_key = "fumee_blanche";
  } else if (/fum[eé]e|fume\b|smoke/i.test(t)) {
    result.symptome_key = "fumee";
  } else if (/odeur|sent\s*mauvais|[aâ]cre|pu(e|anteur)/i.test(t)) {
    result.symptome_key = "odeur_anormale";
  } else if (/voyant\s*(moteur|orange|allum)|check\s*engine|engine\s*light|t[eé]moin\s*moteur/i.test(t)) {
    result.symptome_key = "voyant_moteur_seul";
  }

  // Combo voyant + puissance → certitude haute
  if (result.symptome_key === "voyant_fap" && /(puissance|patate|tire\s*plus|avance\s*plus)/i.test(t)) {
    result.symptome_key = "voyant_fap_puissance";
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
  if (/r[eé]g[eé]n[eé]r|roul[eé]?\s*(fort|autoroute|vite)|forc[eé]?\s*(la\s*)?r[eé]g[eé]n/i.test(t)) {
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
      if (content.includes("expert re-fap") && (content.includes("gratuit") || content.includes("sans engagement"))) {
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
// MESSAGE BUILDERS
// ============================================================

// --- CLOSING (avec prix de la BDD) ---
function buildClosingQuestion(extracted, metier) {
  const marque = extracted?.marque;
  const modele = extracted?.modele;
  const annee = extracted?.annee;
  const kilometrage = extracted?.kilometrage;
  const certitude = extracted?.certitude_fap;

  let vehicleInfo = "";
  if (marque) {
    vehicleInfo = `ta ${marque}`;
    if (modele) vehicleInfo += ` ${modele}`;
    if (annee) vehicleInfo += ` de ${annee}`;
    if (kilometrage) vehicleInfo += ` à ${kilometrage}`;
  }

  // Prix depuis la BDD
  let prixText = "99-149€";
  if (metier?.vehicle?.pricing_hint && metier?.pricing?.length > 0) {
    const match = metier.pricing.find((p) => p.fap_type === metier.vehicle.pricing_hint && p.equipped_machine === true);
    if (match) prixText = `${match.price_ttc}€`;
  }

  const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "diagnostic",
    next_best_action: "proposer_devis",
  };

  let replyClean;
  if (certitude === "haute" && vehicleInfo) {
    replyClean = `Sur ${vehicleInfo}, c'est un cas qu'on connaît bien. Le nettoyage pro c'est ${prixText} au lieu de 1500€+ pour un remplacement, garanti 1 an. Tu veux qu'un expert Re-FAP regarde ta situation ? C'est gratuit et sans engagement.`;
  } else if (vehicleInfo) {
    replyClean = `D'après ce que tu décris sur ${vehicleInfo}, on peut t'aider. Le nettoyage pro c'est à partir de ${prixText}. Tu veux qu'un expert Re-FAP analyse ça ? C'est gratuit et sans engagement.`;
  } else {
    replyClean = `On est là pour t'aider sur toutes les problématiques FAP. Tu veux qu'un expert Re-FAP analyse ta situation ? C'est gratuit et sans engagement.`;
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
    // OVERRIDE 1 : Closing question + OUI → Formulaire
    // ========================================
    if (lastAssistantAskedClosingQuestion(history) && userSaysYes(message)) {
      return sendResponse(buildFormCTA(lastExtracted), { type: "OPEN_FORM", url: FORM_URL });
    }

    // ========================================
    // OVERRIDE 2 : Closing question + NON → Poli
    // ========================================
    if (lastAssistantAskedClosingQuestion(history) && userSaysNo(message)) {
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
    // OVERRIDE 7 : Assez d'infos pour closer (symptôme + véhicule + déjà essayé demandé)
    // ========================================
    if (
      hasEnoughToClose(lastExtracted, history) &&
      (everAskedPreviousAttempts(history) || lastExtracted.previous_attempts) &&
      !everAskedClosing(history) &&
      userTurns >= 3
    ) {
      return sendResponse(buildClosingQuestion(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 8 : Tour 5+ → closing forcé même sans "déjà essayé"
    // ========================================
    if (userTurns >= MAX_USER_TURNS && lastExtracted.marque && !everAskedClosing(history)) {
      return sendResponse(buildClosingQuestion(lastExtracted, metier));
    }

    // ========================================
    // LLM PATH : Appel Mistral avec FACTS
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
    // AUTO-CLOSE : assez d'infos → closer
    // ========================================
    if (
      hasEnoughToClose(extracted, history) &&
      userTurns >= 3 &&
      !everAskedClosing(history) &&
      (everAskedPreviousAttempts(history) || extracted.previous_attempts || userTurns >= 4)
    ) {
      return sendResponse(buildClosingQuestion(extracted, metier));
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
