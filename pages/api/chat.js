// /pages/api/chat.js
// FAPexpert Re-FAP — VERSION 6.3 (geo patch février 2026)
// Bot d'orientation : qualifier → personnaliser → closer → capturer data marché
// CHANGELOG v6.2:
//   - GPS Haversine : 94 CC avec lat/lng, calcul distance réelle
//   - 457 villes → département (toutes préfectures + sous-préfectures)
//   - 96 centroïdes départementaux pour fallback
//   - Suppression NEARBY_EQUIPPED (remplacé par calcul dynamique)
//   - Distances affichées dans les réponses (~XX km)
//   - Résout : Saint-Flour → Marseille → maintenant Clermont-Ferrand (89 km)
// CHANGELOG v6.1:
//   - System prompt renforcé (règles 8, 11, 12, 13)
//   - Interception closing prématuré Mistral
//   - Override 4c : question qualifier confirmée → upgrade symptôme
//   - Garde non-diesel (essence/GPL)
//   - Nettoyage violations règle 8 (1500€)
//   - Interception question multi (moteur+année+km en 1)

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// CONFIG
// ============================================================
const FORM_URL = "https://auto.re-fap.fr/#devis";
const MAX_USER_TURNS = 5;

// ============================================================
// SYSTEM PROMPT - VERSION 6.1
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
8. Ne JAMAIS mentionner "1500€", "remplacement FAP", "prix du remplacement", ni comparer nos tarifs à un remplacement constructeur. Les clients n'y pensent pas.
   INTERDIT : "99-149€ vs 1500€+ pour un remplacement"
   INTERDIT : "Un nettoyage pro peut suffire (99-149€ vs 1500€+ pour un remplacement)"
   CORRECT : "Le nettoyage c'est 99€ à 149€ chez Carter-Cash"
   Nos vrais concurrents : défapage (illégal), additif (temporaire, suies seules), karcher (risque céramique), FAP adaptable (qualité incertaine).
9. Ne JAMAIS re-demander une information que l'utilisateur a DÉJÀ donnée dans la conversation. Lis l'historique.
10. VÉRIFIE les FACTS ci-dessous pour les données déjà collectées (DONNÉES_COLLECTÉES). Ne demande pas ce qui est déjà renseigné.
11. UNE SEULE question par message. Ne combine JAMAIS plusieurs questions.
   INTERDIT : "Tu peux me dire le moteur, l'année et le kilométrage ?"
   CORRECT : "C'est quel modèle exactement ?"
12. Ne JAMAIS générer de message de closing (orientation expert, rappel, formulaire). Les closings sont gérés par le système automatiquement. Contente-toi de poser la question suggérée dans les FACTS ou de répondre à la question de l'utilisateur.
   INTERDIT : "On est là pour t'aider sur toutes les problématiques FAP. Tu veux qu'un expert Re-FAP..."
   INTERDIT : "Tu veux qu'un expert Re-FAP analyse ta situation ?"
13. Si le véhicule est clairement essence ou GPL (pas diesel), dis honnêtement que le FAP concerne les diesels et que Re-FAP ne peut probablement pas aider sur ce sujet.

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
// DEFAULT DATA - VERSION 7.0 (data collection enrichie)
// ============================================================
const DEFAULT_DATA = {
  symptome: "inconnu",
  symptomes_secondaires: [],
  codes: [],
  certitude_fap: "inconnue",
  marque: null,
  modele: null,
  motorisation: null,
  annee: null,
  kilometrage: null,
  type_fap: null,
  systeme_additif: null,
  anciennete_probleme: null,
  frequence: null,
  previous_attempts: null,
  previous_attempt_details: [],
  type_trajets: "inconnu",
  usage: null,
  urgence: null,
  budget_evoque: null,
  intention: "inconnu",
  demontage: null,
  ville: null,
  departement: null,
  garage_confiance: null,
  source: null,
  roulable: null,
  engagement_score: null,
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
        symptomes_secondaires: parsed.symptomes_secondaires || [],
        codes: parsed.codes || [],
        certitude_fap: parsed.certitude_fap || "inconnue",
        marque: parsed.marque || null,
        modele: parsed.modele || null,
        motorisation: parsed.motorisation || null,
        annee: parsed.annee || null,
        kilometrage: parsed.kilometrage || null,
        type_fap: parsed.type_fap || null,
        systeme_additif: parsed.systeme_additif || null,
        anciennete_probleme: parsed.anciennete_probleme || null,
        frequence: parsed.frequence || null,
        previous_attempts: parsed.previous_attempts || null,
        previous_attempt_details: parsed.previous_attempt_details || [],
        type_trajets: parsed.type_trajets || "inconnu",
        usage: parsed.usage || null,
        urgence: parsed.urgence || null,
        budget_evoque: parsed.budget_evoque || null,
        intention: parsed.intention || "inconnu",
        demontage: parsed.demontage || null,
        ville: parsed.ville || null,
        departement: parsed.departement || null,
        garage_confiance: parsed.garage_confiance ?? null,
        source: parsed.source || null,
        roulable: parsed.roulable ?? null,
        engagement_score: parsed.engagement_score || null,
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
// ============================================================
function quickExtract(text) {
  const t = String(text || "").toLowerCase();

  const result = {
    symptome_key: null,
    codes: [],
    marque: null,
    modele: null,
    motorisation: null,
    intention: null,
    previous_attempts: [],
    urgency_signals: [],
    anciennete: null,
    frequence: null,
    type_trajets: null,
    source: null,
    budget_evoque: null,
    garage_confiance: null,
    is_off_topic: false,
    is_non_diesel: false,
  };

  // --- SYMPTÔMES (ordre = priorité) ---
  const hasVoyantFap = /voyant\s*(fap|filtre|dpf)|symbole.*(pot|echappement)|t[eé]moin\s*fap/i.test(t);
  const hasVoyantGeneric = /voyant.*(allum|fixe|orange|clignot|permanent)|voyant\s*(moteur|orange)|check\s*engine|engine\s*light|t[eé]moin\s*(moteur|allum)/i.test(t);
  const hasVoyantAny = hasVoyantFap || hasVoyantGeneric || /\bvoyant\b/i.test(t);
  const hasPuissance = /(perte|plus|manque|baisse|perd).*(puissance|p[eê]che|patate)|(tire|avance)\s*(plus|pas)|n.?avance\s*plus|plus\s*de\s*puissance/i.test(t);
  const hasModeDegrade = /mode\s*d[eé]grad[eé]|mode\s*limp|brid[eé]e?|limit[eé]e?\s*(à|a)\s*\d/i.test(t);
  const hasFumee = /fum[eé]e|fume\b|smoke/i.test(t);

  // COMBOS
  if ((hasVoyantAny) && hasPuissance) {
    result.symptome_key = "voyant_fap_puissance";
  } else if (hasVoyantFap && hasModeDegrade) {
    result.symptome_key = "voyant_fap_puissance";
  }
  else if (hasVoyantFap) {
    result.symptome_key = "voyant_fap";
  } else if (hasModeDegrade) {
    result.symptome_key = "mode_degrade";
  } else if (/fap\b.*?(bouch|colmat|encras|satur|block)/i.test(t) || /filtre.*(bouch|colmat)/i.test(t)) {
    result.symptome_key = "fap_bouche_declare";
  } else if (/ct\s*(refus|recal|pas\s*pass)|contre.?visite|controle\s*technique.*(refus|pollution)|recal[eé].*contr[oô]le|recal[eé].*ct\b|opacit[eé]/i.test(t)) {
    result.symptome_key = "ct_refuse";
  } else if (/r[eé]g[eé]n[eé]?(ration)?.*(impossible|[eé]chou|rat[eé]|marche\s*pas|foir)|valise.*(impossible|[eé]chou)/i.test(t)) {
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
  const codesFound = t.match(/[pPcCbBuU]\s*[\dA-Fa-f]{4}/g);
  if (codesFound) {
    result.codes = codesFound.map((c) => c.toUpperCase().replace(/\s/g, ""));
    const weakSymptoms = [null, "perte_puissance", "fumee", "fumee_noire", "fumee_blanche", "voyant_moteur_seul", "odeur_anormale"];
    if (result.codes.some((c) => c.startsWith("P2002")) && weakSymptoms.includes(result.symptome_key)) {
      result.symptome_key = "code_p2002";
    } else if (result.codes.some((c) => c.startsWith("P0420")) && weakSymptoms.includes(result.symptome_key)) {
      result.symptome_key = "code_p0420";
    } else if (result.codes.some((c) => c.startsWith("P1490")) && weakSymptoms.includes(result.symptome_key)) {
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

  // --- PREVIOUS ATTEMPTS ---
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
  if (result.previous_attempts.length === 0) {
    if (/tout\s*(tent|essay|fait|test)|plein\s*de\s*(truc|chose)|plusieurs\s*(truc|chose|solution)/i.test(t)) {
      result.previous_attempts.push("divers");
    }
    if (/rien\s*(essay|tent|fait|du\s*tout)|pas\s*encore|non\s*rien|jamais\s*rien/i.test(t)) {
      result.previous_attempts.push("aucun");
    }
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

  // --- MODÈLE ---
  result.modele = extractModelFromMessage(text);

  // --- MOTORISATION ---
  result.motorisation = extractMotorisationFromMessage(text);

  // --- ANCIENNETÉ ---
  if (/depuis\s*(hier|aujourd|ce\s*matin|quelques?\s*jours?|[23]\s*jours)/i.test(t)) {
    result.anciennete = "quelques_jours";
  } else if (/depuis\s*(une|[12]|deux|quelques?|cette)\s*semaine/i.test(t)) {
    result.anciennete = "quelques_semaines";
  } else if (/depuis\s*(un|[1-9]|deux|trois|quelques?|plusieurs|des)\s*mois/i.test(t)) {
    result.anciennete = "plusieurs_mois";
  } else if (/depuis\s*(longtemps|toujours|des\s*ann[eé]es|plus\s*d.un\s*an|\d+\s*ans?)/i.test(t)) {
    result.anciennete = "longtemps";
  } else if (/[cç]a\s*(vient\s*d|vient\s*juste)|tout\s*[aà]\s*l.heure|ce\s*matin|aujourd/i.test(t)) {
    result.anciennete = "tres_recent";
  }

  // --- FRÉQUENCE ---
  if (/tout\s*le\s*temps|permanent|toujours\s*(allum|l[aà])|en\s*continu|non\s*stop|sans\s*arr[eê]t/i.test(t)) {
    result.frequence = "permanent";
  } else if (/de\s*temps\s*en\s*temps|parfois|intermittent|des\s*fois|pas\s*toujours/i.test(t)) {
    result.frequence = "intermittent";
  } else if (/[aà]\s*froid|au\s*d[eé]marrage|le\s*matin|quand\s*(c.est|il\s*fait)\s*froid/i.test(t)) {
    result.frequence = "a_froid";
  } else if (/[aà]\s*chaud|apr[eè]s\s*\d+\s*km|quand\s*c.est\s*chaud/i.test(t)) {
    result.frequence = "a_chaud";
  } else if (/en\s*acc[eé]l[eé]r|[aà]\s*l.acc[eé]l[eé]r|quand\s*j.acc[eé]l[eè]re/i.test(t)) {
    result.frequence = "acceleration";
  }

  // --- TYPE TRAJETS ---
  if (/mix|les\s*deux|un\s*peu\s*de\s*tout|mixte|ville\s*(et|\/)\s*(route|autoroute)|autoroute\s*(et|\/)\s*ville/i.test(t)) {
    result.type_trajets = "mixte";
  } else if (/\bville\b|urbain|petit(s)?\s*trajet|bouchon|embouteillage/i.test(t) && !/quelle\s*ville/i.test(t)) {
    result.type_trajets = "urbain";
  } else if (/autoroute|long(s)?\s*trajet|route|national/i.test(t)) {
    result.type_trajets = "autoroute";
  }

  // --- SOURCE ---
  if (/google|cherch[eé]\s*sur\s*internet/i.test(t)) {
    result.source = "google";
  } else if (/forum|facebook|groupe/i.test(t)) {
    result.source = "forum_social";
  } else if (/on\s*m.a\s*(dit|conseill|recommand)|bouche\s*[aà]\s*oreille/i.test(t)) {
    result.source = "bouche_a_oreille";
  } else if (/mon\s*garage|mon\s*m[eé]cano|garagiste\s*m.a/i.test(t)) {
    result.source = "garage";
  }

  // --- BUDGET ---
  const budgetMatch = t.match(/(?:pay[eé]|co[uû]t[eé]|factur[eé]|devis\s*(?:de|[aà])|pour|[aà])\s*(\d{2,4})\s*(?:€|euro)/i)
    || t.match(/(\d{3,4})\s*(?:€|euro)\s*(?:le|pour|de|la)\s/i)
    || t.match(/(\d{3,4})\s*(?:€|euros?)\b/i);
  if (budgetMatch) result.budget_evoque = budgetMatch[1] + "€";

  // --- GARAGE DE CONFIANCE ---
  if (/mon\s*garage|mon\s*m[eé]cano|j.?ai\s*un\s*garage|garage\s*de\s*confiance|garage\s*habituel/i.test(t)) {
    result.garage_confiance = true;
  } else if (/je\s*(connais|cherche)\s*(pas|aucun)\s*garage|pas\s*de\s*garage/i.test(t)) {
    result.garage_confiance = false;
  }

  // --- OFF-TOPIC ---
  if (/recette|couscous|toilettes|m[eé]t[eé]o|foot|politique/i.test(t) && !result.symptome_key) {
    result.is_off_topic = true;
  }

  // --- NON-DIESEL DETECTION (V6.1) ---
  const hasDieselKeyword = /diesel|hdi|tdi|dci|tdci|bluehdi|cdti|crdi|cdi|multijet|d-?4d|skyactiv/i.test(t);
  if (!hasDieselKeyword) {
    if (/\bessence\b/i.test(t) || /\bgpl\b/i.test(t) || /\btsi\b/i.test(t) || /\btfsi\b/i.test(t) || /\bvtec\b/i.test(t) || /\bvvti\b/i.test(t) || /\bmpi\b/i.test(t)) {
      result.is_non_diesel = true;
    }
    if (/\b\d[.,]\d\s*16v\b/i.test(t) && !hasDieselKeyword) {
      result.is_non_diesel = true;
    }
  }

  return result;
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
  const t = String(text || "").toLowerCase().replace(/['']/g, " ").trim();
  const yesWords = ["oui", "ouais", "ok", "d accord", "go", "yes", "yep", "ouep", "volontiers", "je veux bien", "avec plaisir", "carrément", "bien sûr", "pourquoi pas", "allons-y", "vas-y", "ça marche", "ca marche", "c est parti", "banco", "parfait", "super"];
  return yesWords.some((w) => t.includes(w)) || t === "o";
}

function userSaysNo(text) {
  const t = String(text || "").toLowerCase().replace(/['']/g, " ").trim();
  const noPhrases = ["pas maintenant", "plus tard", "non merci", "pas pour l instant", "c est bon", "pas la peine", "pas besoin", "je gère", "ça ira", "ca ira", "laisse tomber", "pas intéressé", "pas interesse", "sans façon", "je passe"];
  if (noPhrases.some((w) => t.includes(w))) return true;
  const noWords = ["non", "nan", "nope"];
  return noWords.some((w) => new RegExp(`\\b${w}\\b`).test(t));
}

// ============================================================
// HELPERS : Flow State Detection
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
      if (content.includes("quelle voiture") || content.includes("roules en quoi") || content.includes("comme véhicule") || content.includes("quoi comme voiture") || content.includes("c'est quelle voiture") || content.includes("quelle marque")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function lastAssistantAskedModel(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("quel modèle") || content.includes("quel mod\u00e8le") || content.includes("modèle exact")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function everAskedModel(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("quel modèle") || content.includes("modèle exact")) {
        return true;
      }
    }
  }
  return false;
}

function lastAssistantAskedKm(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("combien de km") || content.includes("kilom")) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function everAskedKm(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("combien de km") || content.includes("kilom")) {
        return true;
      }
    }
  }
  return false;
}

function lastAssistantAskedQualifyingQuestion(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (
        (content.includes("perte de puissance") && content.includes("?")) ||
        (content.includes("fumée") && content.includes("?")) ||
        (content.includes("voyant") && content.includes("allumé") && content.includes("?")) ||
        (content.includes("quel voyant") && content.includes("?")) ||
        (content.includes("mode dégradé") && content.includes("?")) ||
        (content.includes("pot d'échappement") && content.includes("?")) ||
        (content.includes("pot d\u2019échappement") && content.includes("?")) ||
        (content.includes("petits points") && content.includes("?")) ||
        (content.includes("autre symbole") && content.includes("?")) ||
        (content.includes("fumée noire") && content.includes("blanche") && content.includes("?")) ||
        (content.includes("liquide de refroidissement") && content.includes("?")) ||
        (content.includes("quel genre de voyant") && content.includes("?")) ||
        (content.includes("décrire le voyant") && content.includes("?"))
      ) {
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
      if (content.includes("démonter le fap toi-même") && content.includes("garage s'occupe")) {
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

// 🆕 Détecte si le dernier message assistant est un CTA formulaire
function lastAssistantSentFormCTA(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      return content.includes("laisse tes coordonnées") || content.includes("expert re-fap te rappelle rapidement");
    }
  }
  return false;
}

// 🆕 Détecte si le dernier message assistant est une fermeture de conversation
function lastAssistantIsClosing(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      return content.includes("autre chose") || content.includes("si tu changes d'avis") || content.includes("je suis là");
    }
  }
  return false;
}

function everAskedDemontage(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("fap doit être démonté") && content.includes("garage s'occupe")) return true;
      if (content.includes("démonter le fap toi-même") && content.includes("garage s'occupe")) return true;
    }
  }
  return false;
}

function userSaysSelfRemoval(msg) {
  const t = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, " ");
  return /je (le )?demonte|moi[- ]?meme|je m.?en occupe|je peux (le |l ?)?(demonte|enleve|retire)|je (le )?fais|j ai (un )?pont|j ai les outils|deja (demonte|enleve|retire|fait|sorti)|fap (est )?(demonte|enleve|retire|sorti)|il est (demonte|enleve|retire|sorti)|c est (demonte|fait)|je l ai (demonte|enleve|retire|sorti|fait)|on l a (demonte|enleve|retire)|mecanicien|mecano|je suis meca/.test(t);
}

function userNeedsGarage(msg) {
  const t = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, " ");
  return /garage|j ai besoin|je (ne )?peux pas|pas (les )?outils|pas de pont|je (ne )?sais pas demonte|faut un pro|un professionnel|prise en charge|tout faire|s en occupe|pas equipe|j ai pas de garage|pas capable|pas les competence/.test(t);
}

// 🆕 Détecte les insultes
function userIsInsulting(text) {
  const t = String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(con|conne|connard|connasse|enculer?|putain|merde|salaud|salope|idiot|idiote|abruti|abrutie|nul|nulle|incompetent|incompetente|batard|batarde|fdp|ntm|ta gueule|ferme la|va te faire|casse.?toi|je m.en fous|c.est nul|c.est con|rien a foutre)\b/i.test(t);
}

// 🆕 Détecte un numéro de téléphone ou email donné par l'utilisateur
function userGivesPhoneOrEmail(text) {
  const t = String(text || "");
  return /\b0[67]\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}\b/.test(t)
    || /\b0\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b/.test(t)
    || /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(t);
}

function lastAssistantAskedGarageType(history) {
  if (!Array.isArray(history)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("garage partenaire") && content.includes("garage de confiance")) return true;
      return false;
    }
  }
  return false;
}

function userWantsPartnerGarage(msg) {
  const t = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, " ");
  return /cherche|trouve|partenaire|pas de garage|j en ai pas|j ai pas de|connais pas|aucun garage|non j ai pas|non pas de/.test(t);
}

function userHasOwnGarage(msg) {
  const t = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, " ");
  return /mon garage|j ai (un |mon |deja )(un )?garage|garage (de confiance|habituel|attit)|garagiste|mon meca|j en ai un|oui j ai|deja un garage/.test(t);
}

function everAskedCity(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("quel coin") || content.includes("quelle ville") || content.includes("meilleure option près")) return true;
    }
  }
  return false;
}

function everGaveExpertOrientation(history) {
  if (!Array.isArray(history)) return false;
  for (let i = 0; i < history.length; i++) {
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("cendres métalliques") || content.includes("que je te détaille") || content.includes("fap doit être démonté") || content.includes("carter-cash équipé")) return true;
    }
  }
  return false;
}
// ============================================================
// HELPERS : Vehicle Detection
// ============================================================
function extractVehicleFromMessage(text) {
  const t = String(text || "").toLowerCase();
  const tNorm = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
    subaru: "Subaru", jaguar: "Jaguar", ssangyong: "SsangYong",
    isuzu: "Isuzu", porsche: "Porsche", lexus: "Lexus",
    infiniti: "Infiniti", chrysler: "Chrysler", dodge: "Dodge",
    lancia: "Lancia", rover: "Rover", "mg": "MG", cupra: "Cupra",
    tesla: "Tesla", polestar: "Polestar",
    chevrolet: "Chevrolet", saab: "Saab", smart: "Smart",
    iveco: "Iveco", "great wall": "Great Wall", dfsk: "DFSK",
    piaggio: "Piaggio", man: "MAN", citroenDS: "DS",
  };
  for (const [key, value] of Object.entries(marques)) {
    if (key.length <= 3) {
      if (new RegExp("\\b" + key + "\\b", "i").test(t)) return value;
    } else {
      if (t.includes(key)) return value;
    }
  }

  const modeles = {
    golf: "Volkswagen", polo: "Volkswagen", tiguan: "Volkswagen", passat: "Volkswagen",
    touran: "Volkswagen", touareg: "Volkswagen", "t-roc": "Volkswagen", caddy: "Volkswagen",
    transporter: "Volkswagen", "t5": "Volkswagen", "t6": "Volkswagen",
    "108": "Peugeot", "208": "Peugeot", "308": "Peugeot", "408": "Peugeot",
    "508": "Peugeot", "2008": "Peugeot", "3008": "Peugeot", "5008": "Peugeot",
    "207": "Peugeot", "307": "Peugeot", "407": "Peugeot", "607": "Peugeot",
    "807": "Peugeot", "206": "Peugeot", "306": "Peugeot", partner: "Peugeot",
    expert: "Peugeot", boxer: "Peugeot", bipper: "Peugeot", rifter: "Peugeot",
    clio: "Renault", megane: "Renault", mégane: "Renault", scenic: "Renault",
    scénic: "Renault", captur: "Renault", kadjar: "Renault", koleos: "Renault",
    talisman: "Renault", laguna: "Renault", espace: "Renault", kangoo: "Renault",
    trafic: "Renault", master: "Renault", twingo: "Renault", arkana: "Renault",
    austral: "Renault",
    "c1": "Citroën", "c2": "Citroën", "c3": "Citroën", "c4": "Citroën",
    "c5": "Citroën", "c6": "Citroën", "c8": "Citroën",
    picasso: "Citroën", spacetourer: "Citroën", berlingo: "Citroën",
    aircross: "Citroën", cactus: "Citroën", "ds3": "DS", "ds4": "DS",
    "ds5": "DS", "ds7": "DS",
    duster: "Dacia", sandero: "Dacia", logan: "Dacia", jogger: "Dacia",
    dokker: "Dacia", lodgy: "Dacia", spring: "Dacia",
    "a1": "Audi", "a3": "Audi", "a4": "Audi", "a5": "Audi", "a6": "Audi",
    "a7": "Audi", "a8": "Audi", "q2": "Audi", "q3": "Audi", "q5": "Audi",
    "q7": "Audi", "q8": "Audi", "tt": "Audi",
    "serie 1": "BMW", "serie 2": "BMW", "serie 3": "BMW", "serie 4": "BMW",
    "serie 5": "BMW", "x1": "BMW", "x2": "BMW", "x3": "BMW", "x4": "BMW",
    "x5": "BMW", "x6": "BMW",
    focus: "Ford", fiesta: "Ford", kuga: "Ford", puma: "Ford", mondeo: "Ford",
    "c-max": "Ford", "s-max": "Ford", transit: "Ford", ranger: "Ford",
    corsa: "Opel", astra: "Opel", mokka: "Opel", grandland: "Opel",
    crossland: "Opel", insignia: "Opel", zafira: "Opel", vivaro: "Opel",
    octavia: "Skoda", fabia: "Skoda", superb: "Skoda", kodiaq: "Skoda",
    karoq: "Skoda", yeti: "Skoda", scala: "Skoda", scout: "Skoda",
    punto: "Fiat", tipo: "Fiat", "500x": "Fiat", "500l": "Fiat",
    panda: "Fiat", ducato: "Fiat", doblo: "Fiat", "500": "Fiat",
    yaris: "Toyota", corolla: "Toyota", "rav4": "Toyota", "c-hr": "Toyota",
    auris: "Toyota", hilux: "Toyota", "land cruiser": "Toyota", proace: "Toyota",
    qashqai: "Nissan", juke: "Nissan", "x-trail": "Nissan", micra: "Nissan",
    navara: "Nissan", leaf: "Nissan", note: "Nissan",
    tucson: "Hyundai", "i10": "Hyundai", "i20": "Hyundai", "i30": "Hyundai",
    kona: "Hyundai", "santa fe": "Hyundai", santafe: "Hyundai", "santafé": "Hyundai",
    "ix35": "Hyundai", "ix20": "Hyundai", "i40": "Hyundai",
    sportage: "Kia", ceed: "Kia", niro: "Kia", sorento: "Kia", stonic: "Kia",
    picanto: "Kia", venga: "Kia",
    leon: "Seat", ibiza: "Seat", ateca: "Seat", arona: "Seat", tarraco: "Seat",
    alhambra: "Seat",
    "classe a": "Mercedes", "classe b": "Mercedes", "classe c": "Mercedes",
    "classe e": "Mercedes", "classe v": "Mercedes", vito: "Mercedes",
    sprinter: "Mercedes", "glc": "Mercedes", "gla": "Mercedes", "glb": "Mercedes",
    "xc40": "Volvo", "xc60": "Volvo", "xc90": "Volvo", "v40": "Volvo",
    "v60": "Volvo", "v90": "Volvo", "s60": "Volvo", "s90": "Volvo",
    outlander: "Mitsubishi", "l200": "Mitsubishi", "asx": "Mitsubishi",
    pajero: "Mitsubishi",
    vitara: "Suzuki", "sx4": "Suzuki", "s-cross": "Suzuki", jimny: "Suzuki",
    swift: "Suzuki",
    "cx-5": "Mazda", "cx-3": "Mazda", "cx-30": "Mazda", "mazda3": "Mazda",
    "mazda6": "Mazda",
    "cr-v": "Honda", civic: "Honda", "hr-v": "Honda", jazz: "Honda",
    compass: "Jeep", renegade: "Jeep", wrangler: "Jeep", cherokee: "Jeep",
    forester: "Subaru", impreza: "Subaru", outback: "Subaru", legacy: "Subaru",
    "xv": "Subaru", levorg: "Subaru",
    "xe": "Jaguar", "xf": "Jaguar", "xj": "Jaguar", "f-pace": "Jaguar",
    "e-pace": "Jaguar",
    tivoli: "SsangYong", korando: "SsangYong", rexton: "SsangYong",
    "d-max": "Isuzu",
    formentor: "Cupra", born: "Cupra",
    orlando: "Chevrolet", captiva: "Chevrolet", cruze: "Chevrolet", aveo: "Chevrolet",
    spark: "Chevrolet", trax: "Chevrolet", lacetti: "Chevrolet", nubira: "Chevrolet",
    "9-3": "Saab", "9-5": "Saab",
    fortwo: "Smart", forfour: "Smart",
    delta: "Lancia", musa: "Lancia", ypsilon: "Lancia", voyager: "Lancia",
    freelander: "Land Rover", defender: "Land Rover", discovery: "Land Rover", evoque: "Land Rover",
    countryman: "Mini", clubman: "Mini", cooper: "Mini", paceman: "Mini",
    giulietta: "Alfa Romeo", giulia: "Alfa Romeo", stelvio: "Alfa Romeo", mito: "Alfa Romeo",
    "159": "Alfa Romeo",
    daily: "Iveco",
  };

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

function extractModelFromMessage(text) {
  const t = String(text || "").toLowerCase();
  const tNorm = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const namedModels = [
    "golf","polo","tiguan","passat","touran","touareg","t-roc","caddy","transporter","arteon","sharan",
    "clio","megane","scenic","captur","kadjar","koleos","talisman","laguna","espace","kangoo","trafic","master","arkana","austral",
    "berlingo","spacetourer","cactus","aircross","picasso",
    "focus","fiesta","kuga","puma","mondeo","c-max","s-max","transit","ranger",
    "corsa","astra","mokka","grandland","crossland","insignia","zafira","vivaro",
    "octavia","fabia","superb","kodiaq","karoq","yeti","scala",
    "punto","tipo","panda","ducato","doblo",
    "duster","sandero","logan","jogger",
    "yaris","corolla","auris","hilux","proace",
    "qashqai","juke","x-trail","navara","note",
    "tucson","kona",
    "sportage","ceed","niro","sorento",
    "leon","ibiza","ateca","arona",
    "sprinter","vito",
    "cx-5","cx-3",
    "cr-v","civic",
    "compass","renegade","cherokee",
    "xc60","xc90",
    "vitara","swift",
  ];
  const citMatch = tNorm.match(/\b(c[1-8])\b/i);
  if (citMatch) return citMatch[1].toUpperCase();
  const dsMatch = tNorm.match(/\b(ds[3-7])\b/i);
  if (dsMatch) return dsMatch[1].toUpperCase();
  for (const m of namedModels) {
    const mNorm = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const escaped = mNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(tNorm)) return m.charAt(0).toUpperCase() + m.slice(1);
  }
  const mercMatch = tNorm.match(/\bclass?e?\s*([a-egsv])\b/i);
  if (mercMatch) return "Classe " + mercMatch[1].toUpperCase();
  const mercModelMatch = tNorm.match(/\b(gl[abc]|gle|gls|cla|clk)\b/i);
  if (mercModelMatch) return mercModelMatch[1].toUpperCase();
  const peugeotMatch = tNorm.match(/\b(1008|108|2008|208|3008|308|408|5008|508|206|207|306|307|407|607|807)\b/);
  if (peugeotMatch) {
    const val = peugeotMatch[1];
    if (val === "2008") {
      const yearCtx = /(?:de|en|ann[eé]e|depuis|fin|d[eé]but)\s+2008\b/i.test(tNorm);
      const hasOtherModel = citMatch || /golf|clio|duster|focus/i.test(tNorm);
      if (!yearCtx && !hasOtherModel) return val;
    } else {
      return val;
    }
  }
  const audiMatch = tNorm.match(/\b(a[1-8]|q[2-8]|tt|rs[3-7])\b/i);
  if (audiMatch) return audiMatch[1].toUpperCase();
  const bmwMatch = tNorm.match(/\b(x[1-6]|[1-8][1-5]\d[di])\b/i);
  if (bmwMatch) return bmwMatch[1].toUpperCase();
  const hyundaiMatch = tNorm.match(/\b(i[12340]{2}|ix[23]5|santa\s*fe)\b/i);
  if (hyundaiMatch) return hyundaiMatch[1].charAt(0).toUpperCase() + hyundaiMatch[1].slice(1);
  const fiatMatch = tNorm.match(/\b(500[xlc]?)\b/i);
  if (fiatMatch) return fiatMatch[1];
  return null;
}

function extractMotorisationFromMessage(text) {
  const t = String(text || "").toLowerCase();
  const motorMatch = t.match(/(\d[.,]\d)\s*(?:l\s*)?(bluehdi|blue\s*hdi|e-?hdi|hdi|tdci|tdi|blue\s*dci|dci|ecoblue|eco\s*blue|cdti|crdi|jtd|multijet|d-?4d|skyactiv[- ]?d|cdi|diesel)/i);
  if (motorMatch) {
    const disp = motorMatch[1].replace(",", ".");
    let type = motorMatch[2].replace(/\s+/g, "");
    if (/bluehdi|blue\s*hdi/i.test(type)) type = "BlueHDI";
    else if (/^e-?hdi$/i.test(type)) type = "e-HDI";
    else if (/hdi/i.test(type)) type = "HDI";
    else if (/tdci/i.test(type)) type = "TDCi";
    else if (/tdi/i.test(type)) type = "TDI";
    else if (/bluedci|blue\s*dci/i.test(type)) type = "Blue dCi";
    else if (/dci/i.test(type)) type = "dCi";
    else if (/ecoblue|eco\s*blue/i.test(type)) type = "EcoBlue";
    else if (/cdti/i.test(type)) type = "CDTi";
    else if (/crdi/i.test(type)) type = "CRDi";
    else if (/multijet/i.test(type)) type = "MultiJet";
    else if (/d-?4d/i.test(type)) type = "D-4D";
    else if (/skyactiv/i.test(type)) type = "SkyActiv-D";
    else if (/cdi/i.test(type)) type = "CDI";
    else type = type.toUpperCase();
    return `${disp} ${type}`;
  }
  if (/\bdv6\b/i.test(t)) return "1.6 HDI (DV6)";
  if (/\bdw10\b/i.test(t)) return "2.0 HDI (DW10)";
  if (/\bdv5\b/i.test(t)) return "1.5 BlueHDI (DV5)";
  if (/\bn47\b/i.test(t)) return "2.0d (N47)";
  if (/\bb47\b/i.test(t)) return "2.0d (B47)";
  if (/\bk9k\b/i.test(t)) return "1.5 dCi (K9K)";
  if (/\bom651\b/i.test(t)) return "2.1 CDI (OM651)";
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
// HELPERS : Closing Detection
// ============================================================
function hasEnoughToClose(extracted, history) {
  if (!extracted) return false;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasMarque = extracted.marque && extracted.marque !== null;
  return hasSymptome && hasMarque;
}

function hasEnoughForExpertOrientation(extracted) {
  if (!extracted) return false;
  const hasMarque = !!extracted.marque;
  const hasSymptome = extracted.symptome && extracted.symptome !== "inconnu";
  const hasAttempts = !!extracted.previous_attempts;
  return hasMarque && hasSymptome && hasAttempts;
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
  merged.symptomes_secondaires = current?.symptomes_secondaires?.length > 0 ? current.symptomes_secondaires : previous?.symptomes_secondaires || [];
  merged.codes = (current?.codes?.length > 0) ? current.codes : (quickData?.codes?.length > 0 ? quickData.codes : previous?.codes || []);
  merged.certitude_fap = (current?.certitude_fap && current.certitude_fap !== "inconnue") ? current.certitude_fap : previous?.certitude_fap || "inconnue";
  merged.marque = current?.marque || quickData?.marque || previous?.marque || null;
  merged.modele = current?.modele || quickData?.modele || previous?.modele || null;
  merged.motorisation = current?.motorisation || quickData?.motorisation || previous?.motorisation || null;
  merged.annee = current?.annee || previous?.annee || extractYearFromMessage(userMessage) || null;
  merged.kilometrage = current?.kilometrage || previous?.kilometrage || extractKmFromMessage(userMessage) || null;
  merged.type_fap = current?.type_fap || previous?.type_fap || null;
  merged.systeme_additif = current?.systeme_additif || previous?.systeme_additif || null;
  merged.anciennete_probleme = current?.anciennete_probleme || quickData?.anciennete || previous?.anciennete_probleme || null;
  merged.frequence = current?.frequence || quickData?.frequence || previous?.frequence || null;
  merged.previous_attempts = current?.previous_attempts || (quickData?.previous_attempts?.length > 0 ? quickData.previous_attempts.join(", ") : null) || previous?.previous_attempts || null;
  merged.previous_attempt_details = current?.previous_attempt_details?.length > 0 ? current.previous_attempt_details : previous?.previous_attempt_details || [];
  merged.type_trajets = (current?.type_trajets && current.type_trajets !== "inconnu") ? current.type_trajets : (quickData?.type_trajets || previous?.type_trajets || "inconnu");
  merged.usage = current?.usage || previous?.usage || null;
  merged.urgence = current?.urgence || previous?.urgence || null;
  merged.budget_evoque = current?.budget_evoque || quickData?.budget_evoque || previous?.budget_evoque || null;
  merged.intention = (current?.intention && current.intention !== "inconnu") ? current.intention : (quickData?.intention || previous?.intention || "inconnu");
  merged.demontage = current?.demontage || previous?.demontage || null;
  merged.ville = current?.ville || previous?.ville || null;
  merged.departement = current?.departement || previous?.departement || null;
  merged.garage_confiance = current?.garage_confiance ?? quickData?.garage_confiance ?? previous?.garage_confiance ?? null;
  merged.source = current?.source || quickData?.source || previous?.source || null;
  merged.roulable = current?.roulable ?? previous?.roulable ?? null;
  merged.next_best_action = current?.next_best_action || "poser_question";
  if (!merged.marque) {
    const detected = extractVehicleFromMessage(userMessage);
    if (detected) merged.marque = detected;
  }
  if (!merged.modele) {
    const detected = extractModelFromMessage(userMessage);
    if (detected) merged.modele = detected;
  }
  if (!merged.motorisation) {
    const detected = extractMotorisationFromMessage(userMessage);
    if (detected) merged.motorisation = detected;
  }
  return merged;
}

// ============================================================
// BASE METIER : Requêtes Supabase
// ============================================================
async function fetchMetierData(supabase, quickData, extracted) {
  const metier = { routing: null, pricing: [], snippets: [], vehicle: null };
  try {
    const promises = [];
    if (quickData.symptome_key) {
      promises.push(
        supabase.from("routing_rules").select("*").eq("symptome_key", quickData.symptome_key).eq("active", true).order("priority").limit(1)
          .then(({ data }) => { metier.routing = data?.[0] || null; }).catch(() => {})
      );
    } else {
      promises.push(Promise.resolve());
    }
    const tags = [quickData.symptome_key, ...(quickData.codes || [])].filter(Boolean);
    if (tags.length > 0) {
      promises.push(
        supabase.from("knowledge_snippets").select("*").overlaps("tags", tags).eq("active", true).order("priority").limit(2)
          .then(({ data }) => { metier.snippets = data || []; }).catch(() => {})
      );
    } else {
      promises.push(Promise.resolve());
    }
    const marque = quickData.marque || extracted?.marque;
    if (marque) {
      promises.push(
        supabase.from("vehicle_patterns").select("*").ilike("marque", `%${marque}%`).eq("active", true).limit(1)
          .then(({ data }) => { metier.vehicle = data?.[0] || null; }).catch(() => {})
      );
    } else {
      promises.push(Promise.resolve());
    }
    promises.push(
      supabase.from("pricing_rules").select("*").eq("active", true)
        .then(({ data }) => { metier.pricing = data || []; }).catch(() => {})
    );
    await Promise.all(promises);
  } catch (err) {
    console.warn("⚠️ Requêtes METIER échouées:", err.message);
  }
  return metier;
}

// ============================================================
// BUILD FACTS
// ============================================================
function buildFacts(metier, quickData, extracted, flowHint) {
  const lines = [];
  if (metier.routing) {
    const r = metier.routing;
    lines.push(`DIAGNOSTIC: ${r.symptome_label}. Certitude FAP: ${r.certitude_fap}. Action recommandée: ${r.action}.`);
    if (r.reponse_type === "alerter") {
      lines.push(`ALERTE: Situation sérieuse. Conseiller de ne pas forcer la voiture.`);
    }
  }
  if (metier.vehicle) {
    const v = metier.vehicle;
    lines.push(`VÉHICULE: ${v.marque} ${v.modele || ""} ${v.moteur || ""} — ${v.problemes_frequents || ""}`);
    if (v.systeme_additif && v.systeme_additif !== "aucun") {
      lines.push(`SPÉCIFICITÉ: Système additif ${v.systeme_additif}. À vérifier.`);
    }
  }
  if (metier.pricing.length > 0) {
    const vehicleHint = metier.vehicle?.pricing_hint || "vl_standard";
    const ccEquipped = metier.pricing.find((p) => p.network === "Carter-Cash" && p.equipped_machine === true && p.fap_type === vehicleHint);
    const ccSend = metier.pricing.find((p) => p.network === "Carter-Cash" && p.equipped_machine === false);
    const generic = metier.pricing.find((p) => p.fap_type === vehicleHint && p.equipped_machine === true) || metier.pricing[0];
    if (ccEquipped) lines.push(`PRIX CARTER-CASH MACHINE: ${ccEquipped.price_ttc}€ TTC. ${ccEquipped.conditions}.`);
    if (ccSend) lines.push(`PRIX CARTER-CASH ENVOI: ${ccSend.price_ttc}€ TTC port inclus (48-72h). ${ccSend.conditions}.`);
    if (!ccEquipped && generic) lines.push(`PRIX NETTOYAGE: entre 99€ et 149€ chez Carter-Cash (machine sur place), 199€ en envoi ou garage partenaire.`);
    lines.push(`COMPARAISON: Additif = 15-30€ mais ne retire que les suies (temporaire). FAP adaptable = 300-400€ qualité aléatoire. Défapage = illégal. Nettoyage Re-FAP = à partir de 99€, retire suies + cendres, garanti 1 an.`);
  }
  for (const s of metier.snippets) {
    lines.push(`INFO (${s.title}): ${s.body}`);
  }
  if (flowHint) {
    lines.push(`QUESTION_SUIVANTE: ${flowHint}`);
  } else if (metier.routing?.question_suivante) {
    lines.push(`QUESTION_SUIVANTE: ${metier.routing.question_suivante}`);
  }
  const collectedParts = [];
  if (extracted?.marque) collectedParts.push(`Marque: ${extracted.marque}`);
  if (extracted?.modele) collectedParts.push(`Modèle: ${extracted.modele}`);
  if (extracted?.motorisation) collectedParts.push(`Moteur: ${extracted.motorisation}`);
  if (extracted?.annee) collectedParts.push(`Année: ${extracted.annee}`);
  if (extracted?.kilometrage) collectedParts.push(`Km: ${extracted.kilometrage}`);
  if (extracted?.previous_attempts) collectedParts.push(`Déjà essayé: ${Array.isArray(extracted.previous_attempts) ? extracted.previous_attempts.join(", ") : extracted.previous_attempts}`);
  if (extracted?.symptome && extracted.symptome !== "inconnu") collectedParts.push(`Symptôme: ${extracted.symptome}`);
  if (collectedParts.length > 0) {
    lines.unshift(`DONNÉES_COLLECTÉES (NE PAS RE-DEMANDER): ${collectedParts.join(" | ")}`);
  }
  if (lines.length === 0) return "";
  return "\n\n---FACTS (données vérifiées)---\n" + lines.join("\n") + "\n---FIN FACTS---";
}

// ============================================================
// ENRICHMENT
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
    symptomes_secondaires: extracted?.symptomes_secondaires?.length > 0 ? extracted.symptomes_secondaires : null,
    codes_obd: (extracted?.codes?.length > 0) ? extracted.codes : (quickData?.codes?.length > 0 ? quickData.codes : null),
    marque: extracted?.marque || quickData?.marque || null,
    modele: extracted?.modele || quickData?.modele || null,
    motorisation: extracted?.motorisation || quickData?.motorisation || null,
    annee: extracted?.annee ? parseInt(extracted.annee) : null,
    km: extracted?.kilometrage ? parseInt(String(extracted.kilometrage).replace(/\D/g, "")) : null,
    type_fap: extracted?.type_fap || null,
    systeme_additif: extracted?.systeme_additif || null,
    anciennete_probleme: extracted?.anciennete_probleme || quickData?.anciennete || null,
    frequence: extracted?.frequence || quickData?.frequence || null,
    previous_attempts: quickData?.previous_attempts?.length > 0 ? quickData.previous_attempts : null,
    previous_attempt_details: extracted?.previous_attempt_details?.length > 0 ? extracted.previous_attempt_details : (typeof extracted?.previous_attempts === "string" ? extracted.previous_attempts : null),
    type_trajets: (extracted?.type_trajets && extracted.type_trajets !== "inconnu") ? extracted.type_trajets : (quickData?.type_trajets || null),
    usage_vehicule: extracted?.usage || null,
    budget_evoque: extracted?.budget_evoque || quickData?.budget_evoque || null,
    demontage: extracted?.demontage || null,
    ville: extracted?.ville || null,
    departement: extracted?.departement || null,
    garage_confiance: extracted?.garage_confiance ?? quickData?.garage_confiance ?? null,
    source_decouverte: extracted?.source || quickData?.source || null,
    trigger_event: quickData?.symptome_key || null,
    urgency_level: urgencyLevel,
    roulable: extracted?.roulable ?? (quickData.urgency_signals?.includes("immobilise") ? false : null),
    engagement_score: extracted?.engagement_score || null,
    a_demande_prix: quickData?.intention === "prix" || false,
    outcome: extracted?.next_best_action === "clore" ? "cta_clicked" : null,
    updated_at: new Date().toISOString(),
  };
  supabase.from("conversation_enrichments").upsert(enrichment, { onConflict: "conversation_id" })
    .then(({ error }) => { if (error) console.warn("⚠️ Enrichment upsert failed:", error.message); })
    .catch((err) => { console.warn("⚠️ Enrichment upsert error:", err.message); });
}

// ============================================================
// LOG CENTRE ASSIGNMENT — Insert dans centre_assignments + update conversations
// ============================================================
// v6.3 : logCentreAssignment avec support garage partenaire
async function logCentreAssignment(supabase, conversationId, sessionId, assignment, garageAssignment) {
  if (!supabase || !conversationId) return;

  try {
    let centreId = null;
    let centreType = "STANDARD";

    if (assignment?.postal_code) {
      const { data: centre } = await supabase
        .from("centres")
        .select("id, centre_type")
        .eq("postal_code", assignment.postal_code)
        .eq("status", "ACTIVE")
        .limit(1)
        .single();

      centreId = centre?.id || null;
      centreType = assignment.centre_type || centre?.centre_type || "STANDARD";
    }

    // Si garage assigné mais pas de CC, type = GARAGE
    if (garageAssignment && !centreId) {
      centreType = "GARAGE";
    }

    const insertData = {
      conversation_id: conversationId,
      session_id: sessionId,
      assigned_centre_id: centreId,
      assigned_by: "CHATBOT",
      reason: assignment?.reason || "plus proche",
      user_location_input: assignment?.user_location_input || null,
      user_dept: assignment?.user_dept || null,
      distance_km: assignment?.distance_km || null,
      centre_type_assigned: centreType,
      confidence: assignment?.distance_km && assignment.distance_km <= 50 ? 90 : 75,
    };

    // 🆕 v6.3 : colonnes garage
    if (garageAssignment) {
      insertData.garage_partenaire_id = garageAssignment.garage_partenaire_id;
      insertData.garage_name = garageAssignment.garage_name;
    }

    const { error: insertError } = await supabase.from("centre_assignments").insert(insertData);
    if (insertError) console.warn("⚠️ Centre assignment insert failed:", insertError.message);

    if (centreId) {
      await supabase.from("conversations").update({ assigned_centre_id: centreId }).eq("id", conversationId);
    }
  } catch (err) {
    console.error("❌ logCentreAssignment error:", err.message);
  }
}

// ============================================================
// BUILD METIER RESPONSE
// ============================================================
function buildMetierResponse(quickData, extracted, metier, userTurns, history) {
  if (!metier.routing && !extracted.marque) return null;
  let replyClean = null;
  const data = { ...(extracted || DEFAULT_DATA) };

  if (metier.routing && !extracted.marque) {
    const r = metier.routing;
    const alreadyHighCertainty = extracted.certitude_fap === "haute";
    const botJustQualified = lastAssistantAskedQualifyingQuestion(history);
    if (alreadyHighCertainty || botJustQualified) {
      const rassurances = [
        "Pas de panique, c'est un cas qu'on voit souvent et c'est généralement réparable.",
        "OK, pas d'inquiétude, c'est un problème classique et ça se traite bien.",
        "D'accord, c'est un souci fréquent et dans la plupart des cas ça se répare.",
      ];
      replyClean = rassurances[Math.floor(Math.random() * rassurances.length)] + " C'est quelle voiture ?";
    } else if (r.reponse_type === "rassurer") {
      const rassurances = [
        "Pas de panique, c'est un cas qu'on voit souvent et c'est généralement réparable.",
        "OK, pas d'inquiétude, c'est un problème classique et ça se traite bien.",
        "D'accord, c'est un souci fréquent et dans la plupart des cas ça se répare.",
      ];
      replyClean = rassurances[Math.floor(Math.random() * rassurances.length)] + " C'est quelle voiture ?";
    } else if (r.reponse_type === "alerter") {
      replyClean = "OK, c'est un signal sérieux. Ne force pas la voiture en attendant. C'est quoi comme véhicule ?";
    } else if (r.reponse_type === "qualifier") {
      replyClean = r.question_suivante || "D'accord. Tu peux m'en dire un peu plus ? C'est quelle voiture ?";
    } else if (r.reponse_type === "closer") {
      replyClean = r.question_suivante || "OK, on peut t'aider là-dessus. C'est quoi comme véhicule ?";
    }
    data.symptome = quickData.symptome_key || extracted.symptome;
    data.certitude_fap = r.certitude_fap || extracted.certitude_fap;
    data.next_best_action = "demander_vehicule";
  }

  if (metier.routing && extracted.marque && !extracted.previous_attempts && !everAskedPreviousAttempts(history) && !everAskedClosing(history)) {
    return null;
  }

  if (extracted.marque && extracted.symptome !== "inconnu" && (extracted.previous_attempts || everAskedPreviousAttempts(history)) && hasEnoughForExpertOrientation(extracted) && !everGaveExpertOrientation(history) && !everAskedClosing(history)) {
    return buildExpertOrientation(extracted, metier);
  }

  if (!replyClean) return null;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildSnippetResponse(quickData, extracted, metier) {
  if (!metier.snippets || metier.snippets.length === 0) return null;
  if (extracted.marque) return null;
  const snippet = metier.snippets[0];
  const data = { ...(extracted || DEFAULT_DATA) };
  let intro = snippet.body;
  const sentences = intro.match(/[^.!?]+[.!?]+/g) || [intro];
  intro = sentences.slice(0, 2).join(" ").trim();
  const replyClean = `${intro} C'est quelle voiture ?`;
  data.next_best_action = "demander_vehicule";
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}
// CARTER_CASH_LIST — 94 centres avec coordonnées GPS
// ============================================================
const CARTER_CASH_LIST = [
  // EQUIPPED (4 machines)
  {name:"Carter-Cash Thiais",city:"Thiais",postal:"94320",dept:"94",equipped:true,lat:48.765,lng:2.396},
  {name:"Carter-Cash Sarcelles",city:"Sarcelles",postal:"95200",dept:"95",equipped:true,lat:49.005,lng:2.380},
  {name:"Carter-Cash Lambres-lez-Douai",city:"Lambres-lez-Douai",postal:"59552",dept:"59",equipped:true,lat:50.345,lng:3.080},
  {name:"Carter-Cash Villeneuve-d'Ascq",city:"Villeneuve-d'Ascq",postal:"59650",dept:"59",equipped:true,lat:50.627,lng:3.146},
  // DEPOT (90)
  {name:"Carter-Cash Viriat",city:"Viriat",postal:"01440",dept:"01",equipped:false,lat:46.253,lng:5.228},
  {name:"Carter-Cash Barberey-Saint-Sulpice",city:"Barberey-Saint-Sulpice",postal:"10600",dept:"10",equipped:false,lat:48.325,lng:4.033},
  {name:"Carter-Cash Narbonne",city:"Narbonne",postal:"11100",dept:"11",equipped:false,lat:43.184,lng:3.004},
  {name:"Carter-Cash Marseille La Valentine",city:"Marseille",postal:"13011",dept:"13",equipped:false,lat:43.305,lng:5.480},
  {name:"Carter-Cash Marseille",city:"Marseille",postal:"13014",dept:"13",equipped:false,lat:43.338,lng:5.375},
  {name:"Carter-Cash Les Pennes-Mirabeau",city:"Les Pennes-Mirabeau",postal:"13170",dept:"13",equipped:false,lat:43.410,lng:5.308},
  {name:"Carter-Cash Saint-Mitre-les-Remparts",city:"Saint-Mitre-les-Remparts",postal:"13920",dept:"13",equipped:false,lat:43.455,lng:5.012},
  {name:"Carter-Cash Mondeville",city:"Mondeville",postal:"14120",dept:"14",equipped:false,lat:49.163,lng:-0.323},
  {name:"Carter-Cash Champniers",city:"Champniers",postal:"16430",dept:"16",equipped:false,lat:45.699,lng:0.194},
  {name:"Carter-Cash Saint-Germain-du-Puy",city:"Saint-Germain-du-Puy",postal:"18390",dept:"18",equipped:false,lat:47.063,lng:2.430},
  {name:"Carter-Cash Quetigny",city:"Quetigny",postal:"21800",dept:"21",equipped:false,lat:47.310,lng:5.102},
  {name:"Carter-Cash Tregueux",city:"Tregueux",postal:"22950",dept:"22",equipped:false,lat:48.487,lng:-2.777},
  {name:"Carter-Cash Bethoncourt",city:"Bethoncourt",postal:"25200",dept:"25",equipped:false,lat:47.533,lng:6.855},
  {name:"Carter-Cash Chalezeule",city:"Chalezeule",postal:"25220",dept:"25",equipped:false,lat:47.252,lng:6.069},
  {name:"Carter-Cash Valence",city:"Valence",postal:"26000",dept:"26",equipped:false,lat:44.934,lng:4.892},
  {name:"Carter-Cash Evreux",city:"Evreux",postal:"27000",dept:"27",equipped:false,lat:49.025,lng:1.151},
  {name:"Carter-Cash Quimper",city:"Quimper",postal:"29000",dept:"29",equipped:false,lat:47.997,lng:-4.100},
  {name:"Carter-Cash Brest",city:"Brest",postal:"29200",dept:"29",equipped:false,lat:48.391,lng:-4.486},
  {name:"Carter-Cash Nimes",city:"Nimes",postal:"30000",dept:"30",equipped:false,lat:43.837,lng:4.360},
  {name:"Carter-Cash Ales",city:"Ales",postal:"30100",dept:"30",equipped:false,lat:44.124,lng:4.084},
  {name:"Carter-Cash Portet-sur-Garonne",city:"Portet-sur-Garonne",postal:"31120",dept:"31",equipped:false,lat:43.523,lng:1.406},
  {name:"Carter-Cash Aucamville",city:"Aucamville",postal:"31140",dept:"31",equipped:false,lat:43.669,lng:1.431},
  {name:"Carter-Cash L'Union",city:"L'Union",postal:"31240",dept:"31",equipped:false,lat:43.655,lng:1.493},
  {name:"Carter-Cash Toulouse",city:"Toulouse",postal:"31300",dept:"31",equipped:false,lat:43.605,lng:1.444},
  {name:"Carter-Cash Le Haillan",city:"Le Haillan",postal:"33185",dept:"33",equipped:false,lat:44.869,lng:-0.676},
  {name:"Carter-Cash Artigues-pres-Bordeaux",city:"Artigues-pres-Bordeaux",postal:"33370",dept:"33",equipped:false,lat:44.860,lng:-0.488},
  {name:"Carter-Cash Mauguio",city:"Mauguio",postal:"34130",dept:"34",equipped:false,lat:43.617,lng:3.988},
  {name:"Carter-Cash Castelnau-le-Lez",city:"Castelnau-le-Lez",postal:"34170",dept:"34",equipped:false,lat:43.632,lng:3.896},
  {name:"Carter-Cash Beziers",city:"Beziers",postal:"34500",dept:"34",equipped:false,lat:43.344,lng:3.216},
  {name:"Carter-Cash Rennes",city:"Rennes",postal:"35000",dept:"35",equipped:false,lat:48.113,lng:-1.676},
  {name:"Carter-Cash Tours",city:"Tours",postal:"37100",dept:"37",equipped:false,lat:47.390,lng:0.689},
  {name:"Carter-Cash Echirolles",city:"Echirolles",postal:"38130",dept:"38",equipped:false,lat:45.143,lng:5.726},
  {name:"Carter-Cash Saint-Martin-d'Heres",city:"Saint-Martin-d'Heres",postal:"38400",dept:"38",equipped:false,lat:45.167,lng:5.767},
  {name:"Carter-Cash Saint-Etienne",city:"Saint-Etienne",postal:"42000",dept:"42",equipped:false,lat:45.439,lng:4.387},
  {name:"Carter-Cash La Ricamarie",city:"La Ricamarie",postal:"42150",dept:"42",equipped:false,lat:45.395,lng:4.370},
  {name:"Carter-Cash Orvault",city:"Orvault",postal:"44700",dept:"44",equipped:false,lat:47.272,lng:-1.623},
  {name:"Carter-Cash Sainte-Luce-sur-Loire",city:"Sainte-Luce-sur-Loire",postal:"44980",dept:"44",equipped:false,lat:47.249,lng:-1.478},
  {name:"Carter-Cash Saran",city:"Saran",postal:"45770",dept:"45",equipped:false,lat:47.948,lng:1.875},
  {name:"Carter-Cash Beaucouze",city:"Beaucouze",postal:"49070",dept:"49",equipped:false,lat:47.472,lng:-0.616},
  {name:"Carter-Cash Reims",city:"Reims",postal:"51100",dept:"51",equipped:false,lat:49.253,lng:3.960},
  {name:"Carter-Cash Essey-les-Nancy",city:"Essey-les-Nancy",postal:"54270",dept:"54",equipped:false,lat:48.707,lng:6.220},
  {name:"Carter-Cash Woippy",city:"Woippy",postal:"57140",dept:"57",equipped:false,lat:49.149,lng:6.147},
  {name:"Carter-Cash Prouvy",city:"Prouvy",postal:"59121",dept:"59",equipped:false,lat:50.317,lng:3.442},
  {name:"Carter-Cash Wattignies",city:"Wattignies",postal:"59139",dept:"59",equipped:false,lat:50.587,lng:3.043},
  {name:"Carter-Cash Wattrelos",city:"Wattrelos",postal:"59150",dept:"59",equipped:false,lat:50.700,lng:3.220},
  {name:"Carter-Cash Capinghem",city:"Capinghem",postal:"59160",dept:"59",equipped:false,lat:50.637,lng:2.938},
  {name:"Carter-Cash Tourcoing",city:"Tourcoing",postal:"59200",dept:"59",equipped:false,lat:50.722,lng:3.161},
  {name:"Carter-Cash Dunkerque",city:"Dunkerque",postal:"59640",dept:"59",equipped:false,lat:51.035,lng:2.377},
  {name:"Carter-Cash Marcq-en-Baroeul",city:"Marcq-en-Baroeul",postal:"59700",dept:"59",equipped:false,lat:50.667,lng:3.100},
  {name:"Carter-Cash Feignies",city:"Feignies",postal:"59750",dept:"59",equipped:false,lat:50.310,lng:3.920},
  {name:"Carter-Cash Nogent-sur-Oise",city:"Nogent-sur-Oise",postal:"60180",dept:"60",equipped:false,lat:49.273,lng:2.470},
  {name:"Carter-Cash Compiegne",city:"Compiegne",postal:"60200",dept:"60",equipped:false,lat:49.418,lng:2.826},
  {name:"Carter-Cash Arras",city:"Arras",postal:"62000",dept:"62",equipped:false,lat:50.292,lng:2.780},
  {name:"Carter-Cash Calais",city:"Calais",postal:"62100",dept:"62",equipped:false,lat:50.948,lng:1.853},
  {name:"Carter-Cash Bruay-la-Buissiere",city:"Bruay-la-Buissiere",postal:"62700",dept:"62",equipped:false,lat:50.483,lng:2.550},
  {name:"Carter-Cash Fouquieres-les-Lens",city:"Fouquieres-les-Lens",postal:"62740",dept:"62",equipped:false,lat:50.423,lng:2.893},
 {name:"Re-FAP Clermont-Ferrand",city:"Clermont-Ferrand",postal:"63000",dept:"63",equipped:true,isRefapCenter:true,address:"27 Rue Desaymard, 63000 Clermont-Ferrand",phone:"04 73 37 88 21",website:"https://re-fap.fr/re-fap-clermont-ferrand/",lat:45.778,lng:3.087},
  {name:"Carter-Cash Serres-Castet",city:"Serres-Castet",postal:"64121",dept:"64",equipped:false,lat:43.380,lng:-0.350},
  {name:"Carter-Cash Perpignan",city:"Perpignan",postal:"66000",dept:"66",equipped:false,lat:42.699,lng:2.895},
  {name:"Carter-Cash Souffelweyersheim",city:"Souffelweyersheim",postal:"67460",dept:"67",equipped:false,lat:48.630,lng:7.737},
  {name:"Carter-Cash Fegersheim",city:"Fegersheim",postal:"67640",dept:"67",equipped:false,lat:48.488,lng:7.687},
  {name:"Carter-Cash Pfastatt",city:"Pfastatt",postal:"68120",dept:"68",equipped:false,lat:47.766,lng:7.292},
  {name:"Carter-Cash Saint-Priest",city:"Saint-Priest",postal:"69800",dept:"69",equipped:false,lat:45.696,lng:4.944},
  {name:"Carter-Cash Vinzelles",city:"Vinzelles",postal:"71680",dept:"71",equipped:false,lat:46.270,lng:4.780},
  {name:"Carter-Cash Arnage-le-Mans",city:"Arnage",postal:"72230",dept:"72",equipped:false,lat:47.934,lng:0.184},
  {name:"Carter-Cash La Ravoire",city:"La Ravoire",postal:"73490",dept:"73",equipped:false,lat:45.559,lng:5.956},
  {name:"Carter-Cash Sotteville-les-Rouen",city:"Sotteville-les-Rouen",postal:"76300",dept:"76",equipped:false,lat:49.416,lng:1.087},
  {name:"Carter-Cash Gonfreville l'Orcher",city:"Gonfreville l'Orcher",postal:"76700",dept:"76",equipped:false,lat:49.505,lng:0.230},
  {name:"Carter-Cash Meaux",city:"Meaux",postal:"77100",dept:"77",equipped:false,lat:48.960,lng:2.879},
  {name:"Carter-Cash Brie-Comte-Robert",city:"Brie-Comte-Robert",postal:"77170",dept:"77",equipped:false,lat:48.693,lng:2.612},
  {name:"Carter-Cash Savigny-le-Temple",city:"Savigny-le-Temple",postal:"77176",dept:"77",equipped:false,lat:48.585,lng:2.582},
  {name:"Carter-Cash Pontault-Combault",city:"Pontault-Combault",postal:"77340",dept:"77",equipped:false,lat:48.800,lng:2.604},
  {name:"Carter-Cash Lagny-sur-Marne",city:"Lagny-sur-Marne",postal:"77400",dept:"77",equipped:false,lat:48.872,lng:2.714},
  {name:"Carter-Cash Claye-Souilly",city:"Claye-Souilly",postal:"77410",dept:"77",equipped:false,lat:48.945,lng:2.695},
  {name:"Carter-Cash Buchelay",city:"Buchelay",postal:"78200",dept:"78",equipped:false,lat:48.988,lng:1.670},
  {name:"Carter-Cash Coignieres",city:"Coignieres",postal:"78310",dept:"78",equipped:false,lat:48.748,lng:1.917},
  {name:"Carter-Cash Chauray",city:"Chauray",postal:"79180",dept:"79",equipped:false,lat:46.342,lng:-0.396},
  {name:"Carter-Cash Longueau",city:"Longueau",postal:"80330",dept:"80",equipped:false,lat:49.873,lng:2.365},
  {name:"Carter-Cash Lescure-d'Albigeois",city:"Lescure-d'Albigeois",postal:"81380",dept:"81",equipped:false,lat:43.945,lng:2.128},
  {name:"Carter-Cash La-Valette-du-Var",city:"La-Valette-du-Var",postal:"83160",dept:"83",equipped:false,lat:43.137,lng:6.037},
  {name:"Carter-Cash La Seyne-sur-Mer",city:"La Seyne-sur-Mer",postal:"83500",dept:"83",equipped:false,lat:43.101,lng:5.879},
  {name:"Carter-Cash Avignon",city:"Avignon",postal:"84000",dept:"84",equipped:false,lat:43.949,lng:4.806},
  {name:"Carter-Cash Chasseneuil-du-Poitou",city:"Chasseneuil-du-Poitou",postal:"86360",dept:"86",equipped:false,lat:46.655,lng:0.344},
  {name:"Carter-Cash Limoges",city:"Limoges",postal:"87000",dept:"87",equipped:false,lat:45.832,lng:1.262},
  {name:"Carter-Cash Corbeil-Essonnes",city:"Corbeil-Essonnes",postal:"91100",dept:"91",equipped:false,lat:48.613,lng:2.483},
  {name:"Carter-Cash Ris-Orangis",city:"Ris-Orangis",postal:"91130",dept:"91",equipped:false,lat:48.653,lng:2.416},
  {name:"Carter-Cash Ballainvilliers",city:"Ballainvilliers",postal:"91160",dept:"91",equipped:false,lat:48.672,lng:2.299},
  {name:"Carter-Cash Sainte-Genevieve-des-Bois",city:"Sainte-Genevieve-des-Bois",postal:"91700",dept:"91",equipped:false,lat:48.637,lng:2.332},
  {name:"Carter-Cash Aulnay-sous-Bois",city:"Aulnay-sous-Bois",postal:"93600",dept:"93",equipped:false,lat:48.938,lng:2.497},
  {name:"Carter-Cash Saint-Ouen-l'Aumone",city:"Saint-Ouen-l'Aumone",postal:"95310",dept:"95",equipped:false,lat:49.053,lng:2.122},
];

// CITY_TO_DEPT — 457 villes françaises → code département
// Préfectures + sous-préfectures + villes courantes
// ============================================================
const CITY_TO_DEPT = {
  // ===== PRÉFECTURES (96) =====
  "bourg-en-bresse":"01","laon":"02","moulins":"03","digne-les-bains":"04","digne":"04",
  "gap":"05","nice":"06","privas":"07","charleville-mezieres":"08","charleville":"08",
  "foix":"09","troyes":"10","carcassonne":"11","rodez":"12","marseille":"13",
  "caen":"14","aurillac":"15","angouleme":"16","la rochelle":"17","bourges":"18",
  "tulle":"19","ajaccio":"2A","dijon":"21","saint-brieuc":"22","gueret":"23",
  "perigueux":"24","besancon":"25","valence":"26","evreux":"27","chartres":"28",
  "quimper":"29","nimes":"30","toulouse":"31","auch":"32","bordeaux":"33",
  "montpellier":"34","rennes":"35","chateauroux":"36","tours":"37","grenoble":"38",
  "lons-le-saunier":"39","mont-de-marsan":"40","blois":"41","saint-etienne":"42",
  "le puy-en-velay":"43","le puy":"43","nantes":"44","orleans":"45","cahors":"46",
  "agen":"47","mende":"48","angers":"49","saint-lo":"50","reims":"51",
  "chalons-en-champagne":"51","chaumont":"52","laval":"53","nancy":"54",
  "bar-le-duc":"55","vannes":"56","metz":"57","nevers":"58","lille":"59",
  "beauvais":"60","alencon":"61","arras":"62","clermont-ferrand":"63","pau":"64",
  "tarbes":"65","perpignan":"66","strasbourg":"67","colmar":"68","lyon":"69",
  "vesoul":"70","macon":"71","le mans":"72","chambery":"73","annecy":"74",
  "paris":"75","rouen":"76","melun":"77","versailles":"78","niort":"79",
  "amiens":"80","albi":"81","montauban":"82","toulon":"83","avignon":"84",
  "la roche-sur-yon":"85","poitiers":"86","limoges":"87","epinal":"88",
  "auxerre":"89","belfort":"90","evry":"91","nanterre":"92","bobigny":"93",
  "creteil":"94","pontoise":"95","cergy":"95",
  // ===== SOUS-PRÉFECTURES & VILLES MOYENNES =====
  // 01
  "oyonnax":"01","belley":"01","gex":"01","ambérieu":"01","amberieu":"01",
  // 02
  "soissons":"02","saint-quentin":"02","chateau-thierry":"02",
  // 03
  "vichy":"03","montlucon":"03",
  // 04
  "manosque":"04","forcalquier":"04",
  // 05
  "briancon":"05","embrun":"05",
  // 06
  "cannes":"06","antibes":"06","grasse":"06","menton":"06","cagnes-sur-mer":"06",
  // 07
  "annonay":"07","aubenas":"07","tournon":"07",
  // 08
  "sedan":"08","rethel":"08",
  // 09
  "pamiers":"09","saint-girons":"09",
  // 10
  "bar-sur-aube":"10","nogent-sur-seine":"10",
  // 11
  "narbonne":"11","limoux":"11","castelnaudary":"11",
  // 12
  "millau":"12","villefranche-de-rouergue":"12","decazeville":"12",
  // 13
  "aix-en-provence":"13","arles":"13","istres":"13","salon-de-provence":"13","martigues":"13","aubagne":"13","la ciotat":"13",
  // 14
  "lisieux":"14","bayeux":"14","vire":"14","honfleur":"14",
  // 15
  "saint-flour":"15","mauriac":"15",
  // 16
  "cognac":"16","confolens":"16",
  // 17
  "saintes":"17","rochefort":"17","royan":"17","jonzac":"17",
  // 18
  "vierzon":"18","saint-amand-montrond":"18",
  // 19
  "brive-la-gaillarde":"19","brive":"19","ussel":"19",
  // 2A/2B
  "bastia":"2B","porto-vecchio":"2A","calvi":"2B","corte":"2B",
  // 21
  "beaune":"21","montbard":"21",
  // 22
  "lannion":"22","guingamp":"22","dinan":"22","lamballe":"22",
  // 23
  "aubusson":"23",
  // 24
  "bergerac":"24","sarlat":"24","sarlat-la-caneda":"24","nontron":"24",
  // 25
  "montbeliard":"25","pontarlier":"25",
  // 26
  "montelimar":"26","romans-sur-isere":"26","romans":"26","die":"26",
  // 27
  "bernay":"27","les andelys":"27","vernon":"27",
  // 28
  "dreux":"28","nogent-le-rotrou":"28",
  // 29
  "morlaix":"29","chateaulin":"29","concarneau":"29","douarnenez":"29",
  // 30
  "ales":"30","bagnols-sur-ceze":"30","le vigan":"30",
  // 31
  "muret":"31","saint-gaudens":"31",
  // 32
  "condom":"32","mirande":"32",
  // 33
  "libourne":"33","arcachon":"33","langon":"33","lesparre-medoc":"33",
  // 34
  "beziers":"34","sete":"34","lodeve":"34","lunel":"34",
  // 35
  "saint-malo":"35","fougeres":"35","vitre":"35","redon":"35",
  // 36
  "issoudun":"36","le blanc":"36",
  // 37
  "chinon":"37","loches":"37","amboise":"37",
  // 38
  "vienne":"38","bourgoin-jallieu":"38","la tour-du-pin":"38","voiron":"38",
  // 39
  "dole":"39","saint-claude":"39",
  // 40
  "dax":"40","aire-sur-l'adour":"40",
  // 41
  "romorantin":"41","vendome":"41",
  // 42
  "roanne":"42","montbrison":"42",
  // 43
  "brioude":"43","yssingeaux":"43",
  // 44
  "saint-nazaire":"44","chateaubriant":"44","ancenis":"44",
  // 45
  "montargis":"45","pithiviers":"45","gien":"45",
  // 46
  "figeac":"46","gourdon":"46",
  // 47
  "villeneuve-sur-lot":"47","marmande":"47","nerac":"47",
  // 48
  "florac":"48",
  // 49
  "cholet":"49","saumur":"49","segre":"49",
  // 50
  "cherbourg":"50","avranches":"50","granville":"50","coutances":"50",
  // 51
  "epernay":"51","vitry-le-francois":"51","sainte-menehould":"51",
  // 52
  "langres":"52","saint-dizier":"52",
  // 53
  "mayenne":"53","chateau-gontier":"53",
  // 54
  "luneville":"54","toul":"54","briey":"54",
  // 55
  "verdun":"55","commercy":"55",
  // 56
  "lorient":"56","pontivy":"56","ploermel":"56","auray":"56",
  // 57
  "thionville":"57","sarreguemines":"57","forbach":"57","sarrebourg":"57",
  // 58
  "cosne-cours-sur-loire":"58","clamecy":"58",
  // 59
  "douai":"59","valenciennes":"59","cambrai":"59","maubeuge":"59",
  "roubaix":"59","tourcoing":"59","wattrelos":"59","denain":"59","anzin":"59",
  "fourmies":"59","avesnes-sur-helpe":"59","conde-sur-l'escaut":"59",
  // 60
  "senlis":"60","clermont":"60","compiegne":"60","creil":"60","noyon":"60",
  // 61
  "flers":"61","argentan":"61","mortagne-au-perche":"61",
  // 62
  "lens":"62","bethune":"62","boulogne-sur-mer":"62","henin-beaumont":"62",
  "saint-omer":"62","montreuil-sur-mer":"62",
  // 63
  "issoire":"63","riom":"63","thiers":"63","ambert":"63",
  // 64
  "bayonne":"64","oloron-sainte-marie":"64","biarritz":"64","anglet":"64",
  // 65
  "lourdes":"65","bagneres-de-bigorre":"65","argeles-gazost":"65",
  // 66
  "ceret":"66","prades":"66",
  // 67
  "haguenau":"67","molsheim":"67","saverne":"67","selestat":"67","wissembourg":"67",
  // 68
  "mulhouse":"68","altkirch":"68","guebwiller":"68","ribeauville":"68","thann":"68",
  // 69
  "villeurbanne":"69","villefranche-sur-saone":"69","givors":"69","tarare":"69",
  // 70
  "lure":"70","gray":"70",
  // 71
  "chalon-sur-saone":"71","le creusot":"71","autun":"71","montceau-les-mines":"71","louhans":"71",
  // 72
  "la fleche":"72","mamers":"72","sable-sur-sarthe":"72",
  // 73
  "albertville":"73","saint-jean-de-maurienne":"73","moutiers":"73",
  // 74
  "thonon-les-bains":"74","bonneville":"74","saint-julien-en-genevois":"74","cluses":"74",
  // 75-95 IDF
  "boulogne-billancourt":"92","montreuil":"93","saint-denis":"93",
  "argenteuil":"95","vitry-sur-seine":"94","aubervilliers":"93",
  "aulnay-sous-bois":"93","colombes":"92","courbevoie":"92",
  "nanterre":"92","pantin":"93","bondy":"93","sevran":"93","drancy":"93",
  "noisy-le-grand":"93","epinay-sur-seine":"93","villepinte":"93",
  "tremblay":"93","livry-gargan":"93","le blanc-mesnil":"93",
  "rosny-sous-bois":"93","gagny":"93","stains":"93","la courneuve":"93",
  "clichy-sous-bois":"93","montfermeil":"93","neuilly-sur-marne":"93",
  "neuilly-sur-seine":"92","bagneux":"92","suresnes":"92",
  "thiais":"94","choisy-le-roi":"94","orly":"94","ivry-sur-seine":"94",
  "villejuif":"94","maisons-alfort":"94","champigny-sur-marne":"94",
  "saint-maur-des-fosses":"94","fontenay-sous-bois":"94","nogent-sur-marne":"94",
  "vincennes":"94","alfortville":"94","cachan":"94","fresnes":"94","rungis":"94",
  "corbeil-essonnes":"91","massy":"91","savigny-sur-orge":"91",
  "palaiseau":"91","longjumeau":"91","sainte-genevieve-des-bois":"91","les ulis":"91",
  "sarcelles":"95","garges-les-gonesse":"95","goussainville":"95",
  "bezons":"95","ermont":"95","franconville":"95","taverny":"95",
  "meaux":"77","chelles":"77","pontault-combault":"77",
  "savigny-le-temple":"77","torcy":"77","lognes":"77","bussy-saint-georges":"77",
  "saint-germain-en-laye":"78","poissy":"78","mantes-la-jolie":"78",
  "sartrouville":"78","chatou":"78","houilles":"78","conflans":"78",
  // ===== VILLES SUPPLÉMENTAIRES =====
  "chamalières":"63","chamalieres":"63","cournon":"63","riom":"63",
  "le puy en velay":"43",
  "brive la gaillarde":"19",
  "mont de marsan":"40",
  "la roche sur yon":"85",
  "saint flour":"15",
  "aix en provence":"13",
  "salon de provence":"13",
  "boulogne sur mer":"62",
  "chalon sur saone":"71",
  "chalons en champagne":"51",
  "villefranche sur saone":"69",
  "villeneuve sur lot":"47",
  "saint germain en laye":"78",
  "bourgoin jallieu":"38",
  "romans sur isere":"26",
  // 76-83 compléments
  "le havre":"76","dieppe":"76","fecamp":"76","elbeuf":"76",
  "draguignan":"83","frejus":"83","hyeres":"83","saint-raphael":"83","brignoles":"83",
  // 84-89 compléments
  "orange":"84","carpentras":"84","cavaillon":"84","apt":"84",
  "sens":"89","joigny":"89","tonnerre":"89",
  // 82
  "castelsarrasin":"82","moissac":"82",
  // 85
  "les sables-d'olonne":"85","fontenay-le-comte":"85","challans":"85",
  // 86
  "chatellerault":"86",
  // 87
  "saint-junien":"87","bellac":"87",
  // 88
  "saint-die":"88","remiremont":"88","gerardmer":"88",
  // 90
  "delle":"90",
};

// DEPT_CENTROIDS — Centre géographique de chaque département
// Pour calcul de distance quand seul le département est connu
// ============================================================
const DEPT_CENTROIDS = {
  "01":{lat:46.20,lng:5.30},"02":{lat:49.50,lng:3.60},"03":{lat:46.34,lng:3.20},
  "04":{lat:44.09,lng:6.24},"05":{lat:44.66,lng:6.26},"06":{lat:43.84,lng:7.15},
  "07":{lat:44.75,lng:4.50},"08":{lat:49.62,lng:4.63},"09":{lat:42.92,lng:1.50},
  "10":{lat:48.30,lng:4.08},"11":{lat:43.10,lng:2.45},"12":{lat:44.28,lng:2.67},
  "13":{lat:43.49,lng:5.15},"14":{lat:49.09,lng:-0.37},"15":{lat:45.03,lng:2.67},
  "16":{lat:45.72,lng:0.17},"17":{lat:45.87,lng:-0.80},"18":{lat:47.02,lng:2.50},
  "19":{lat:45.37,lng:1.87},"2A":{lat:41.93,lng:8.95},"2B":{lat:42.45,lng:9.15},
  "21":{lat:47.32,lng:4.77},"22":{lat:48.45,lng:-3.00},"23":{lat:46.17,lng:2.07},
  "24":{lat:45.15,lng:0.72},"25":{lat:47.15,lng:6.35},"26":{lat:44.68,lng:5.15},
  "27":{lat:49.07,lng:1.17},"28":{lat:48.30,lng:1.35},"29":{lat:48.30,lng:-4.20},
  "30":{lat:44.00,lng:4.10},"31":{lat:43.40,lng:1.25},"32":{lat:43.65,lng:0.58},
  "33":{lat:44.83,lng:-0.57},"34":{lat:43.60,lng:3.55},"35":{lat:48.10,lng:-1.68},
  "36":{lat:46.78,lng:1.70},"37":{lat:47.25,lng:0.70},"38":{lat:45.28,lng:5.58},
  "39":{lat:46.72,lng:5.72},"40":{lat:43.90,lng:-0.77},"41":{lat:47.58,lng:1.33},
  "42":{lat:45.60,lng:4.15},"43":{lat:45.15,lng:3.60},"44":{lat:47.28,lng:-1.75},
  "45":{lat:47.92,lng:2.15},"46":{lat:44.62,lng:1.62},"47":{lat:44.35,lng:0.52},
  "48":{lat:44.52,lng:3.50},"49":{lat:47.42,lng:-0.55},"50":{lat:48.97,lng:-1.35},
  "51":{lat:48.95,lng:3.90},"52":{lat:48.12,lng:5.15},"53":{lat:48.10,lng:-0.77},
  "54":{lat:48.77,lng:6.15},"55":{lat:48.98,lng:5.37},"56":{lat:47.75,lng:-2.80},
  "57":{lat:49.05,lng:6.58},"58":{lat:47.10,lng:3.45},"59":{lat:50.45,lng:3.22},
  "60":{lat:49.35,lng:2.55},"61":{lat:48.57,lng:0.15},"62":{lat:50.50,lng:2.35},
  "63":{lat:45.72,lng:3.15},"64":{lat:43.27,lng:-0.77},"65":{lat:43.07,lng:0.15},
  "66":{lat:42.60,lng:2.55},"67":{lat:48.58,lng:7.45},"68":{lat:47.85,lng:7.20},
  "69":{lat:45.76,lng:4.83},"70":{lat:47.62,lng:6.15},"71":{lat:46.58,lng:4.45},
  "72":{lat:47.95,lng:0.20},"73":{lat:45.45,lng:6.35},"74":{lat:46.00,lng:6.35},
  "75":{lat:48.86,lng:2.35},"76":{lat:49.58,lng:1.00},"77":{lat:48.62,lng:2.80},
  "78":{lat:48.82,lng:1.85},"79":{lat:46.42,lng:-0.42},"80":{lat:49.90,lng:2.30},
  "81":{lat:43.80,lng:2.15},"82":{lat:44.02,lng:1.30},"83":{lat:43.42,lng:6.22},
  "84":{lat:44.00,lng:5.15},"85":{lat:46.67,lng:-1.43},"86":{lat:46.58,lng:0.35},
  "87":{lat:45.87,lng:1.25},"88":{lat:48.17,lng:6.45},"89":{lat:47.80,lng:3.57},
  "90":{lat:47.63,lng:6.87},"91":{lat:48.52,lng:2.25},"92":{lat:48.84,lng:2.25},
  "93":{lat:48.91,lng:2.48},"94":{lat:48.77,lng:2.47},"95":{lat:49.08,lng:2.17},
};

// ============================================================
// Fonctions GPS : Haversine + Recherche par proximité
// ============================================================
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// CITY_GPS — Coordonnées GPS des villes principales
// Utilisé pour calculer les distances réelles (au lieu du centroïde dept)
// ============================================================
const CITY_GPS = {
  // Préfectures
  "bourg-en-bresse":{lat:46.21,lng:5.23},"laon":{lat:49.56,lng:3.62},"moulins":{lat:46.57,lng:3.33},
  "digne":{lat:44.09,lng:6.24},"digne-les-bains":{lat:44.09,lng:6.24},"gap":{lat:44.56,lng:6.08},
  "nice":{lat:43.70,lng:7.27},"privas":{lat:44.74,lng:4.60},"charleville-mezieres":{lat:49.77,lng:4.72},
  "foix":{lat:42.97,lng:1.61},"troyes":{lat:48.30,lng:4.07},"carcassonne":{lat:43.21,lng:2.35},
  "rodez":{lat:44.35,lng:2.57},"marseille":{lat:43.30,lng:5.37},"caen":{lat:49.18,lng:-0.37},
  "aurillac":{lat:44.93,lng:2.44},"angouleme":{lat:45.65,lng:0.16},"la rochelle":{lat:46.16,lng:-1.15},
  "bourges":{lat:47.08,lng:2.40},"tulle":{lat:45.27,lng:1.77},"ajaccio":{lat:41.93,lng:8.74},
  "bastia":{lat:42.70,lng:9.45},"dijon":{lat:47.32,lng:5.04},"saint-brieuc":{lat:48.51,lng:-2.76},
  "gueret":{lat:46.17,lng:1.87},"perigueux":{lat:45.19,lng:0.72},"besancon":{lat:47.24,lng:6.02},
  "valence":{lat:44.93,lng:4.89},"evreux":{lat:49.02,lng:1.15},"chartres":{lat:48.45,lng:1.48},
  "quimper":{lat:48.00,lng:-4.10},"nimes":{lat:43.84,lng:4.36},"toulouse":{lat:43.60,lng:1.44},
  "auch":{lat:43.65,lng:0.59},"bordeaux":{lat:44.84,lng:-0.58},"montpellier":{lat:43.61,lng:3.88},
  "rennes":{lat:48.11,lng:-1.68},"chateauroux":{lat:46.81,lng:1.69},"tours":{lat:47.39,lng:0.69},
  "grenoble":{lat:45.19,lng:5.72},"lons-le-saunier":{lat:46.67,lng:5.55},"mont-de-marsan":{lat:43.89,lng:-0.50},
  "blois":{lat:47.59,lng:1.33},"saint-etienne":{lat:45.44,lng:4.39},"le puy-en-velay":{lat:45.04,lng:3.89},
  "le puy":{lat:45.04,lng:3.89},"nantes":{lat:47.22,lng:-1.55},"orleans":{lat:47.90,lng:1.90},
  "cahors":{lat:44.45,lng:1.44},"agen":{lat:44.20,lng:0.62},"mende":{lat:44.52,lng:3.50},
  "angers":{lat:47.47,lng:-0.56},"saint-lo":{lat:49.12,lng:-1.09},"reims":{lat:49.25,lng:3.88},
  "chalons-en-champagne":{lat:48.96,lng:4.36},"chaumont":{lat:48.11,lng:5.14},"laval":{lat:48.07,lng:-0.77},
  "nancy":{lat:48.69,lng:6.18},"bar-le-duc":{lat:48.77,lng:5.16},"vannes":{lat:47.66,lng:-2.76},
  "metz":{lat:49.12,lng:6.18},"nevers":{lat:46.99,lng:3.16},"lille":{lat:50.63,lng:3.06},
  "beauvais":{lat:49.43,lng:2.08},"alencon":{lat:48.43,lng:0.09},"arras":{lat:50.29,lng:2.78},
  "clermont-ferrand":{lat:45.78,lng:3.09},"pau":{lat:43.30,lng:-0.37},"tarbes":{lat:43.23,lng:0.07},
  "perpignan":{lat:42.70,lng:2.90},"strasbourg":{lat:48.57,lng:7.75},"colmar":{lat:48.08,lng:7.36},
  "lyon":{lat:45.76,lng:4.84},"vesoul":{lat:47.62,lng:6.16},"macon":{lat:46.31,lng:4.83},
  "le mans":{lat:48.00,lng:0.20},"chambery":{lat:45.57,lng:5.92},"annecy":{lat:45.90,lng:6.13},
  "paris":{lat:48.86,lng:2.35},"rouen":{lat:49.44,lng:1.10},"melun":{lat:48.54,lng:2.66},
  "versailles":{lat:48.80,lng:2.13},"niort":{lat:46.32,lng:-0.46},"amiens":{lat:49.89,lng:2.30},
  "albi":{lat:43.93,lng:2.15},"montauban":{lat:44.02,lng:1.35},"toulon":{lat:43.12,lng:5.93},
  "avignon":{lat:43.95,lng:4.81},"la roche-sur-yon":{lat:46.67,lng:-1.43},"poitiers":{lat:46.58,lng:0.34},
  "limoges":{lat:45.83,lng:1.26},"epinal":{lat:48.17,lng:6.45},"auxerre":{lat:47.80,lng:3.57},
  "belfort":{lat:47.64,lng:6.86},"evry":{lat:48.63,lng:2.44},"nanterre":{lat:48.89,lng:2.21},
  "bobigny":{lat:48.91,lng:2.44},"creteil":{lat:48.79,lng:2.46},"pontoise":{lat:49.05,lng:2.10},
  "cergy":{lat:49.04,lng:2.08},"nogent-sur-marne":{lat:48.84,lng:2.48},"nogent sur marne":{lat:48.84,lng:2.48},
  // Sous-préfectures & villes moyennes clés
  "ambert":{lat:45.55,lng:3.74},"issoire":{lat:45.54,lng:3.25},"riom":{lat:45.89,lng:3.11},
  "thiers":{lat:45.86,lng:3.55},"vichy":{lat:46.13,lng:3.43},"montlucon":{lat:46.34,lng:2.60},
  "saint-flour":{lat:45.03,lng:3.09},"saint flour":{lat:45.03,lng:3.09},"mauriac":{lat:45.22,lng:2.33},
  "millau":{lat:44.10,lng:3.08},"villefranche-de-rouergue":{lat:44.35,lng:2.04},
  "brive-la-gaillarde":{lat:45.16,lng:1.53},"brive":{lat:45.16,lng:1.53},"ussel":{lat:45.55,lng:2.31},
  "figeac":{lat:44.61,lng:2.03},"florac":{lat:44.33,lng:3.59},
  "brioude":{lat:45.30,lng:3.38},"yssingeaux":{lat:45.14,lng:4.12},
  "le puy en velay":{lat:45.04,lng:3.89},
  "bayonne":{lat:43.49,lng:-1.47},"biarritz":{lat:43.48,lng:-1.56},"oloron-sainte-marie":{lat:43.19,lng:-0.61},
  "lourdes":{lat:43.09,lng:-0.05},"bagneres-de-bigorre":{lat:43.06,lng:0.15},
  "dax":{lat:43.71,lng:-1.05},"mont de marsan":{lat:43.89,lng:-0.50},
  "cannes":{lat:43.55,lng:7.01},"antibes":{lat:43.58,lng:7.12},"grasse":{lat:43.66,lng:6.92},"menton":{lat:43.78,lng:7.50},
  "aix-en-provence":{lat:43.53,lng:5.45},"arles":{lat:43.68,lng:4.63},"salon-de-provence":{lat:43.64,lng:5.10},
  "beziers":{lat:43.34,lng:3.22},"sete":{lat:43.41,lng:3.70},"lunel":{lat:43.67,lng:4.14},
  "narbonne":{lat:43.18,lng:3.00},"castelnaudary":{lat:43.32,lng:1.95},
  "ales":{lat:44.12,lng:4.08},"bagnols-sur-ceze":{lat:44.16,lng:4.62},
  "montelimar":{lat:44.56,lng:4.75},"romans":{lat:45.04,lng:5.05},"romans-sur-isere":{lat:45.04,lng:5.05},
  "vienne":{lat:45.52,lng:4.88},"bourgoin-jallieu":{lat:45.59,lng:5.27},"voiron":{lat:45.36,lng:5.59},
  "roanne":{lat:46.04,lng:4.07},"montbrison":{lat:45.61,lng:4.07},
  "albertville":{lat:45.68,lng:6.39},"saint-jean-de-maurienne":{lat:45.28,lng:6.35},
  "thonon-les-bains":{lat:46.37,lng:6.48},"bonneville":{lat:46.08,lng:6.40},"cluses":{lat:46.06,lng:6.58},
  "villeurbanne":{lat:45.77,lng:4.88},"villefranche-sur-saone":{lat:45.99,lng:4.72},
  "chalon-sur-saone":{lat:46.78,lng:4.85},"le creusot":{lat:46.80,lng:4.44},"autun":{lat:46.95,lng:4.30},
  "beaune":{lat:47.02,lng:4.84},"montbard":{lat:47.63,lng:4.34},
  "mulhouse":{lat:47.75,lng:7.34},"haguenau":{lat:48.81,lng:7.79},"saverne":{lat:48.74,lng:7.36},
  "selestat":{lat:48.26,lng:7.45},
  "thionville":{lat:49.36,lng:6.17},"sarreguemines":{lat:49.11,lng:7.07},"forbach":{lat:49.19,lng:6.90},
  "douai":{lat:50.37,lng:3.08},"valenciennes":{lat:50.36,lng:3.52},"cambrai":{lat:50.18,lng:3.24},
  "maubeuge":{lat:50.28,lng:3.97},"dunkerque":{lat:51.03,lng:2.38},"roubaix":{lat:50.69,lng:3.17},
  "tourcoing":{lat:50.72,lng:3.16},
  "lens":{lat:50.43,lng:2.83},"bethune":{lat:50.53,lng:2.64},"boulogne-sur-mer":{lat:50.73,lng:1.61},
  "calais":{lat:50.95,lng:1.86},"saint-omer":{lat:50.75,lng:2.25},
  "senlis":{lat:49.21,lng:2.59},"compiegne":{lat:49.42,lng:2.83},"creil":{lat:49.26,lng:2.47},
  "le havre":{lat:49.49,lng:0.11},"dieppe":{lat:49.92,lng:1.08},
  "meaux":{lat:48.96,lng:2.88},"fontainebleau":{lat:48.40,lng:2.70},"provins":{lat:48.56,lng:3.30},
  "saint-germain-en-laye":{lat:48.90,lng:2.09},"mantes-la-jolie":{lat:48.99,lng:1.72},
  "corbeil-essonnes":{lat:48.61,lng:2.48},"palaiseau":{lat:48.72,lng:2.25},
  "sarcelles":{lat:49.00,lng:2.38},"argenteuil":{lat:48.95,lng:2.25},
  "boulogne-billancourt":{lat:48.83,lng:2.24},"saint-denis":{lat:48.94,lng:2.36},
  "cognac":{lat:45.70,lng:-0.33},"saintes":{lat:45.75,lng:-0.63},"rochefort":{lat:45.94,lng:-0.96},
  "bergerac":{lat:44.85,lng:0.48},"sarlat":{lat:44.89,lng:1.22},
  "chatellerault":{lat:46.82,lng:0.55},
  "montargis":{lat:47.99,lng:2.73},"pithiviers":{lat:48.17,lng:2.25},
  "cholet":{lat:47.06,lng:-0.88},"saumur":{lat:47.26,lng:-0.07},
  "cherbourg":{lat:49.64,lng:-1.62},"avranches":{lat:48.68,lng:-1.36},
  "saint-malo":{lat:48.65,lng:-2.00},"fougeres":{lat:48.35,lng:-1.20},
  "lorient":{lat:47.75,lng:-3.37},"pontivy":{lat:48.07,lng:-2.96},
  "lannion":{lat:48.73,lng:-3.46},"guingamp":{lat:48.56,lng:-3.15},
  "morlaix":{lat:48.58,lng:-3.83},"brest":{lat:48.39,lng:-4.49},
  "draguignan":{lat:43.54,lng:6.46},"frejus":{lat:43.43,lng:6.74},"hyeres":{lat:43.12,lng:6.13},
  "orange":{lat:44.14,lng:4.81},"carpentras":{lat:44.06,lng:5.05},"cavaillon":{lat:43.84,lng:5.04},
  "lisieux":{lat:49.15,lng:0.23},"bayeux":{lat:49.28,lng:-0.70},
  "epernay":{lat:49.04,lng:3.95},"vitry-le-francois":{lat:48.73,lng:4.58},
  "saint-dizier":{lat:48.64,lng:4.95},"langres":{lat:47.86,lng:5.33},
  "luneville":{lat:48.59,lng:6.50},"toul":{lat:48.68,lng:5.89},
  "verdun":{lat:49.16,lng:5.38},
  "sens":{lat:48.20,lng:3.28},"joigny":{lat:47.98,lng:3.40},
  "montbeliard":{lat:47.51,lng:6.80},"pontarlier":{lat:46.91,lng:6.35},
  "dole":{lat:47.10,lng:5.49},"saint-claude":{lat:46.39,lng:5.86},
  "dreux":{lat:48.74,lng:1.37},
  "manosque":{lat:43.83,lng:5.79},"briancon":{lat:44.90,lng:6.64},"embrun":{lat:44.57,lng:6.50},
  "annonay":{lat:45.24,lng:4.67},"aubenas":{lat:44.62,lng:4.39},
  "sedan":{lat:49.70,lng:4.94},
  "pamiers":{lat:43.12,lng:1.61},
  "libourne":{lat:44.92,lng:-0.24},"arcachon":{lat:44.66,lng:-1.17},
  "villeneuve-sur-lot":{lat:44.41,lng:0.70},"marmande":{lat:44.50,lng:0.17},
  "castelsarrasin":{lat:44.04,lng:1.11},"moissac":{lat:44.11,lng:1.09},
  "chinon":{lat:47.17,lng:0.24},"loches":{lat:47.13,lng:0.99},"amboise":{lat:47.41,lng:0.98},
  "issoudun":{lat:46.95,lng:1.99},
  "vendome":{lat:47.79,lng:1.07},
  "saint-nazaire":{lat:47.27,lng:-2.21},
  "perpignan":{lat:42.70,lng:2.90},"ceret":{lat:42.49,lng:2.75},
};

function findNearestCCs(dept, maxKm = 200, cityLat = null, cityLng = null) {
  // Utiliser les coords de la ville si disponibles, sinon le centroïde
  let refLat, refLng;
  if (cityLat !== null && cityLng !== null) {
    refLat = cityLat;
    refLng = cityLng;
  } else {
    const centroid = DEPT_CENTROIDS[dept];
    if (!centroid) {
      return {
        equipped: CARTER_CASH_LIST.filter(c => c.dept === dept && c.equipped),
        depot: CARTER_CASH_LIST.filter(c => c.dept === dept && !c.equipped),
        nearbyEquipped: [],
      };
    }
    refLat = centroid.lat;
    refLng = centroid.lng;
  }

  const allWithDist = CARTER_CASH_LIST.map(cc => ({
    ...cc,
    distance: Math.round(haversineKm(refLat, refLng, cc.lat, cc.lng)),
  })).sort((a, b) => a.distance - b.distance);

  const equipped = allWithDist.filter(cc => cc.equipped && cc.distance <= maxKm);
  const depot = allWithDist.filter(cc => !cc.equipped && cc.distance <= maxKm).slice(0, 5);
  const localEquipped = equipped.filter(cc => cc.dept === dept);
  const localDepot = allWithDist.filter(cc => !cc.equipped && cc.dept === dept);
  // Toujours trouver le CC équipé le plus proche, même au-delà de maxKm
  const absoluteClosestEquipped = allWithDist.find(cc => cc.equipped) || null;

  return {
    equipped: localEquipped.length > 0 ? localEquipped : [],
    depot: localDepot.length > 0 ? localDepot : depot.slice(0, 3),
    nearbyEquipped: equipped.slice(0, 3),
    closestCC: allWithDist[0] || null,
    closestEquipped: equipped[0] || absoluteClosestEquipped,
    closestDepot: depot[0] || null,
  };
}

// findCCForDept — Wrapper rétro-compatible vers findNearestCCs
// ============================================================
function findCCForDept(dept) {
  return findNearestCCs(dept);
}
// ============================================================
// findNearestGarages — Requête Supabase RPC (v6.3)
// Trouve les garages partenaires les plus proches d'un point GPS
// ============================================================
async function findNearestGarages(supabase, refLat, refLng, maxKm = 80, maxResults = 3) {
  if (!supabase || !refLat || !refLng) return [];
  try {
    const { data, error } = await supabase.rpc("find_nearest_garages", {
      ref_lat: refLat,
      ref_lng: refLng,
      max_km: maxKm,
      max_results: maxResults,
    });
    if (error) {
      console.warn("⚠️ findNearestGarages RPC error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("⚠️ findNearestGarages error:", err.message);
    return [];
  }
}
// ============================================================
// extractDeptFromInput — Détection département depuis input utilisateur
// ============================================================
function extractDeptFromInput(input) {
  const t = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/^\d{6,}$/.test(t)) return null;
  if (/^\d{5}$/.test(t) && parseInt(t) >= 99000) return null;
  const postalMatch = t.match(/\b(\d{5})\b/);
  if (postalMatch) {
    const cp = postalMatch[1];
    if (cp.startsWith("97")) return cp.substring(0, 3);
    if (cp.startsWith("20")) return parseInt(cp) < 20200 ? "2A" : "2B";
    return cp.substring(0, 2);
  }
  const corseMatch = t.match(/\b(2[ab])\b/i);
  if (corseMatch) return corseMatch[1].toUpperCase();
  const domMatch = t.match(/\b(97[1-6])\b/);
  if (domMatch) return domMatch[1];
  const deptMatch = t.match(/(?:le |dans le |departement |dept |dpt )(?<!\d)(\d{2})(?!\d)/);
  if (deptMatch) {
    const num = deptMatch[1];
    if (parseInt(num) >= 1 && parseInt(num) <= 95) return num.padStart(2, "0");
  }
  const bareDeptMatch = t.match(/^(\d{2})$/);
  if (bareDeptMatch) {
    const num = bareDeptMatch[1];
    if (parseInt(num) >= 1 && parseInt(num) <= 95) return num.padStart(2, "0");
  }
  const NOT_CITIES = ["oui", "ouais", "ouep", "yep", "yes", "non", "nan", "nope", "ok", "merci", "bonjour", "salut", "rien", "pas", "moi", "toi", "lui", "elle", "tout", "bien", "bon", "mal", "car", "les", "des", "une", "par", "sur", "dans", "avec", "pour", "qui", "que", "comment", "quoi", "mais", "donc", "aussi", "encore", "tres", "plus", "garage", "additif", "fap", "voyant", "moteur", "super", "genial", "parfait", "cool", "allez", "allons"];
  if (NOT_CITIES.includes(t)) return null;
  // Normaliser tirets↔espaces pour matcher "nogent sur marne" = "nogent-sur-marne"
  const tSpaced = t.replace(/-/g, " ");
  // CITY_TO_DEPT en premier (457 villes, match exact = plus fiable)
  for (const [city, dept] of Object.entries(CITY_TO_DEPT)) {
    const cityNorm = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ");
    if (tSpaced.includes(cityNorm)) return dept;
  }
  // Puis CARTER_CASH_LIST (match exact sur nom de ville uniquement)
  const COMMON_PREFIXES = ["saint", "sainte", "la", "le", "les", "mont", "pont", "bois", "port", "font"];
  for (const cc of CARTER_CASH_LIST) {
    const ccCity = cc.city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ");
    if (tSpaced.includes(ccCity)) return cc.dept;
    if (tSpaced.length >= 5 && ccCity.includes(tSpaced)) return cc.dept;
    // Prefix match uniquement si le premier mot n'est pas un préfixe courant
    const ccFirst = ccCity.split(/[- ]/)[0];
    if (ccFirst.length >= 5 && !COMMON_PREFIXES.includes(ccFirst) && tSpaced.includes(ccFirst)) return cc.dept;
  }
  // Dernier recours : prefix match sur CITY_TO_DEPT (même règle stricte)
  for (const [city, dept] of Object.entries(CITY_TO_DEPT)) {
    const cityNorm = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cityFirst = cityNorm.split(/[- ]/)[0];
    if (cityFirst.length >= 5 && !COMMON_PREFIXES.includes(cityFirst) && t.length >= 5 && t.includes(cityFirst)) return dept;
  }
  return null;
}

function capitalizeVille(ville) {
  if (!ville) return ville;
  return ville.replace(/\b[a-zàâäéèêëïîôùûüÿç]+/gi, (word) => {
    if (/^(le|la|les|de|du|des|sur|en|sous|d|l)$/i.test(word) && word !== ville.split(/\s/)[0]) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function looksLikeCityAnswer(message) {
  const t = String(message || "").trim();

  // Rejet immédiat : trop long (phrase, explication, question)
  if (t.length > 30) return false;

  // Rejet : insultes
  if (userIsInsulting(t)) return false;

  // Rejet : mots de confirmation/négation courants (réponses OUI/NON)
  if (/^(ok|oui|ouais|ouep|yep|yes|non|nan|nope|merci|super|parfait|cool|allez|bien|bof|voila|voilà|pas|rien|jamais)$/i.test(t)) return false;

  // Rejet : contient un verbe conjugué → phrase, pas une ville
  if (/\b(suis|habite|vis|trouve|peux|veux|vais|fait|faut|sait|connais|cherche|comprends|ai|as|est|sont|ont)\b/i.test(t)) return false;

  // Rejet : question
  if (t.includes("?")) return false;

  // Rejet : négation
  if (/\b(non|nan|pas|jamais|rien|ne )\b/i.test(t)) return false;

  // Accepté : code postal seul ou avec ville
  if (/\b\d{5}\b/.test(t)) return true;

  // Accepté : département seul (2 chiffres)
  if (/^\d{2}$/.test(t)) return true;

  // Accepté : ressemble à un nom de ville (lettres, tirets, espaces)
  if (/^[a-zA-ZÀ-ÿ\-]{2,}(\s+[a-zA-ZÀ-ÿ\-]+)*(\s+\d{5})?$/.test(t)) return true;

  return false;
}

function cleanVilleInput(message) {
  let ville = String(message || "").trim();

  ville = ville
    .replace(/^(je suis |j'habite |j'suis |jsuis |je vis |je me trouve |on est |nous sommes |moi c'est |c'est |ici c'est )/i, "")
    .replace(/^(à |a |au |en |sur |dans le |dans |près de |pres de |vers |du côté de |du cote de |secteur |région |region )/i, "")
    .replace(/[.!?]+$/, "")
    .trim();

  if (ville.length > 30) {
    const postalMatch = ville.match(/\b([a-zA-ZÀ-ÿ\-]+(?:\s+[a-zA-ZÀ-ÿ\-]+)*)\s+(\d{5})\b/);
    if (postalMatch) return postalMatch[1] + " " + postalMatch[2];
    return ville.split(/\s+/).slice(0, 3).join(" ");
  }

  return ville || message.trim();
}
// ============================================================
// EXPERT ORIENTATION + RESPONSES
// ============================================================

// 🆕 Réponse calme aux insultes
function buildInsultResponse(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_ville" };
  const responses = [
    "Je comprends que la situation soit frustrante. Je suis là pour t'aider à régler le problème du FAP. Tu es dans quel coin ?",
    "C'est clairement embêtant comme situation. On va trouver une solution. Tu es dans quelle ville ?",
    "Je t'entends. Pour t'orienter vers le bon garage, j'ai juste besoin de savoir où tu es.",
  ];
  const replyClean = responses[Math.floor(Math.random() * responses.length)];
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildExpertOrientation(extracted, metier) {
  const marque = extracted?.marque;
  const modele = extracted?.modele;
  const certitude = extracted?.certitude_fap;
  const attempts = extracted?.previous_attempts || "";
  const km = extracted?.kilometrage;
  const anciennete = extracted?.anciennete_probleme;
  const codes = extracted?.codes || [];
  const vehicleStr = marque ? `${marque}${modele ? " " + modele : ""}` : "ton véhicule";

  // --- Réponses aux tentatives précédentes ---
  const attemptResponses = [];
  if (attempts.includes("regeneration_forcee")) {
    attemptResponses.push("Pour la régénération : elle brûle les suies à ~600°C, mais elle ne peut rien contre les cendres métalliques qui se sont accumulées dans le filtre. Si le FAP est trop chargé en cendres, même une régénération réussie ne suffit plus — le filtre reste partiellement bouché.");
  }
  if (attempts.includes("additif") || attempts.includes("additif_cerine")) {
    attemptResponses.push("Pour les produits nettoyants/additifs : ils agissent uniquement sur les suies (particules de combustion). Mais dans un FAP, il y a aussi des cendres métalliques — résidus d'huile moteur — qui s'accumulent et que ces produits ne dissolvent pas.");
  }
  if (attempts.includes("garage")) {
    attemptResponses.push("Le garage a pu proposer une regen, un additif ou un remplacement. Mais un FAP encrassé ne veut pas dire FAP mort — dans la majorité des cas, il peut être remis en état par un nettoyage en machine qui retire les cendres, ce que les autres solutions ne font pas.");
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
  if (attempts.includes("remplacement_envisage")) {
    attemptResponses.push("Avant de remplacer, sache que dans la grande majorité des cas un FAP encrassé peut être remis en état. Le remplacement est la solution la plus radicale — mais rarement nécessaire si le nid d'abeille n'est pas fissuré.");
  }
  if (attempts.includes("divers")) {
    attemptResponses.push("Si les solutions que tu as essayées n'ont pas fonctionné, c'est probablement parce qu'elles agissent uniquement sur les suies. Les cendres métalliques, elles, s'accumulent et ne se dissolvent ni ne se brûlent — c'est souvent le vrai problème.");
  }

  // --- Intro contextuelle (mesurée, pas catégorique) ---
  let techExplanation = "";
  const kmNum = km ? parseInt(String(km).replace(/\D/g, "")) : 0;
  const hasHighKm = kmNum >= 120000;
  const hasMediumKm = kmNum >= 80000 && kmNum < 120000;
  const hasLowKm = kmNum > 0 && kmNum < 80000;
  const hasFapCode = codes.some(c => /^P2002|^P2463|^P244[0-9]|^P2458/i.test(c));
  const isLongterm = anciennete === "plusieurs_mois" || anciennete === "longtemps";

  if (attemptResponses.length > 0) {
    techExplanation = attemptResponses.join("\n\n");
  } else if (hasFapCode && hasHighKm) {
    techExplanation = `Sur une ${vehicleStr} à ${km}, avec un code FAP, c'est très probablement un filtre qui arrive à saturation. Les suies et surtout les cendres métalliques se sont accumulées au fil du temps — c'est un phénomène normal à ce kilométrage.`;
  } else if (hasHighKm) {
    techExplanation = `Sur une ${vehicleStr} à ${km}, ce type de symptôme est souvent lié à un FAP qui commence à saturer. Avec le kilométrage, les cendres métalliques — résidus de l'huile moteur — s'accumulent dans le filtre et finissent par le colmater.`;
  } else if (hasFapCode) {
    techExplanation = `Le code ${codes[0]} pointe directement vers le FAP. Sur une ${vehicleStr}, ça signifie généralement que le filtre est trop chargé pour se régénérer correctement. Ça peut venir d'un encrassement progressif (suies + cendres) ou d'un problème en amont.`;
  } else if (hasMediumKm) {
    techExplanation = `Sur une ${vehicleStr} à ${km}, le voyant peut avoir plusieurs causes : un besoin de régénération, un capteur de pression différentielle fatigué, ou un début d'encrassement du FAP. Le plus probable sur ce type de moteur, c'est une accumulation progressive de suies et de cendres dans le filtre.`;
  } else if (isLongterm) {
    techExplanation = `Si le problème dure depuis un moment sur ta ${vehicleStr}, c'est souvent le signe d'un encrassement progressif du FAP. Les régénérations automatiques n'arrivent plus à compenser l'accumulation de suies et surtout de cendres métalliques dans le filtre.`;
  } else if (hasLowKm) {
    techExplanation = `Sur une ${vehicleStr} à ${km}, un problème de FAP à ce kilométrage c'est moins fréquent mais ça arrive — surtout si la voiture fait beaucoup de petits trajets en ville. Ça peut être un encrassement prématuré, un problème de capteur, ou un souci sur le système de régénération. Un diagnostic plus poussé permettrait de confirmer.`;
  } else {
    techExplanation = `D'après ce que tu décris sur ta ${vehicleStr}, il y a de bonnes chances que ce soit lié au FAP. Le voyant s'allume quand le filtre n'arrive plus à se régénérer correctement — ça peut venir d'un encrassement (suies + cendres accumulées), d'un capteur défaillant, ou de conditions de roulage qui ne permettent pas la régénération.`;
  }

  // --- Bloc diagnostic ---
  let diagnosisBlock = "";
  if (attemptResponses.length > 0) {
    diagnosisBlock = "Le problème de fond, c'est l'accumulation de cendres métalliques dans le filtre. C'est un phénomène normal avec le temps et le kilométrage — aucune solution \"maison\" (régénération, additifs, roulage autoroute) ne peut les retirer.";
  } else if (hasHighKm || hasFapCode) {
    diagnosisBlock = "Ce qu'il faut savoir : dans un FAP, il y a deux types de particules. Les suies, que le filtre brûle normalement lors des régénérations. Et les cendres métalliques (résidus d'huile moteur), qui elles ne brûlent jamais et s'accumulent au fil du temps. C'est souvent ces cendres qui posent problème à terme.";
  }

  let additifNote = "";
  if (metier?.vehicle?.systeme_additif && metier.vehicle.systeme_additif !== "aucun") {
    additifNote = `À savoir aussi : ta ${marque || "voiture"} utilise un système d'additif (${metier.vehicle.systeme_additif}) pour faciliter les régénérations. Si le niveau du réservoir d'additif est bas, ça peut aggraver le problème. C'est un point à vérifier de ton côté ou avec ton garagiste.`;
  }

  let openQuestion;
  if (hasHighKm || hasFapCode || attemptResponses.length > 0) {
    openQuestion = "Il existe une solution pour retirer ces cendres, mais je préfère d'abord t'expliquer comment ça fonctionne plutôt que de te balancer un devis. Tu veux que je te détaille ça ?";
  } else {
    openQuestion = "Si c'est bien un encrassement du FAP, il existe une solution. Tu veux que je t'explique comment ça fonctionne ?";
  }

  const parts = [techExplanation];
  if (diagnosisBlock) parts.push(diagnosisBlock);
  if (additifNote) parts.push(additifNote);
  parts.push(openQuestion);

  const replyClean = parts.join("\n\n");
  const data = { ...(extracted || DEFAULT_DATA), intention: "diagnostic", next_best_action: "demander_explication_solution" };
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return {
    replyClean, replyFull, extracted: data,
    suggested_replies: [
      { label: "Oui, explique-moi", value: "oui" },
      { label: "Non merci", value: "non merci" },
    ],
  };
}

function buildSolutionExplanation(extracted, metier) {
  const solutionBlock = "Le nettoyage en machine professionnelle est la seule façon de retirer les cendres métalliques. Concrètement, le FAP est nettoyé sous pression contrôlée avec un procédé qui retire les suies ET les cendres sans abîmer la céramique. L'état du filtre est vérifié avant et après pour s'assurer que le résultat est bon.";
  const demontageQuestion = "Pour faire ce nettoyage, le FAP doit être démonté du véhicule. Est-ce que tu as la possibilité de le démonter toi-même (ou de le faire démonter par quelqu'un), ou est-ce que tu préfères qu'un garage s'occupe de tout ?";
  const replyClean = `${solutionBlock}\n\n${demontageQuestion}`;
  const data = { ...(extracted || DEFAULT_DATA), intention: "diagnostic", next_best_action: "demander_demontage" };
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return {
    replyClean, replyFull, extracted: data,
    suggested_replies: [
      { label: "🔧 Je peux le démonter", value: "je le demonte moi-meme" },
      { label: "🏭 j'ai besoin d'un garage", value: "j'ai besoin d'un garage" },
      { label: "📦 Il est déjà démonté", value: "il est deja demonte" },
    ],
  };
}

function getPricing(extracted, metier) {
  const defaults = {
    prixCC: "99-149€",
    prixEnvoi: "199€",
    prixText: "entre 99€ et 149€",
    prixCCDetail: "99€ (FAP seul type DV6) ou 149€ (FAP combiné avec catalyseur)",
    prixEnvoiDetail: "199€ port A/R inclus, tous types de FAP VL",
  };
  if (!extracted?.modele) return defaults;
  if (metier?.vehicle?.pricing_hint && metier?.pricing?.length > 0) {
    const matchCC = metier.pricing.find((p) => p.fap_type === metier.vehicle.pricing_hint && p.equipped_machine === true);
    const matchEnvoi = metier.pricing.find((p) => p.equipped_machine === false);
    return {
      prixCC: matchCC ? `${matchCC.price_ttc}€` : defaults.prixCC,
      prixEnvoi: matchEnvoi ? `${matchEnvoi.price_ttc}€` : defaults.prixEnvoi,
      prixText: matchCC ? `${matchCC.price_ttc}€` : defaults.prixText,
      prixCCDetail: defaults.prixCCDetail,
      prixEnvoiDetail: defaults.prixEnvoiDetail,
    };
  }
  return defaults;
}

function buildSelfRemovalResponse(extracted, metier) {
  const { prixCCDetail, prixEnvoiDetail } = getPricing(extracted, metier);
  const replyClean = `C'est la solution la plus économique. Une fois le FAP démonté, tu as deux options :\n\n→ Le déposer dans un Carter-Cash équipé d'une machine : nettoyage sur place en ~4h, ${prixCCDetail}.\n→ Le déposer dans n'importe quel Carter-Cash (point dépôt) : envoi au centre Re-FAP, retour en 48-72h, ${prixEnvoiDetail}.\n\nTu es dans quel coin ? Je regarde le Carter-Cash le plus proche de chez toi.`;
  const data = { ...(extracted || DEFAULT_DATA), intention: "diagnostic", demontage: "self", next_best_action: "demander_ville" };
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildGarageTypeQuestion(extracted, metier) {
  const replyClean = `Pas de souci, c'est le cas le plus courant. Le FAP doit être démonté pour le nettoyage, et un garage peut s'en charger.\n\nDeux possibilités :\n→ On te met en relation avec un garage partenaire Re-FAP qui connaît déjà le process\n→ Si tu as déjà un garage de confiance, on peut travailler directement avec lui\n\nTu as déjà un garagiste, ou tu préfères qu'on te trouve un partenaire ?`;
  const data = { ...(extracted || DEFAULT_DATA), intention: "diagnostic", demontage: "garage", next_best_action: "demander_type_garage" };
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return {
    replyClean, replyFull, extracted: data,
    suggested_replies: [
      { label: "🔍 Trouvez-moi un garage", value: "je cherche un garage partenaire" },
      { label: "🔧 J'ai mon garagiste", value: "j'ai déjà un garage de confiance" },
    ],
  };
}

function buildPartnerGarageResponse(extracted, metier) {
  const { prixEnvoi } = getPricing(extracted, metier);
  const replyClean = `Parfait. On travaille avec plus de 800 garages partenaires en France qui connaissent le process Re-FAP.\n\nLe garage s'occupe de tout : démontage du FAP, envoi au centre Re-FAP, remontage et réinitialisation. Côté budget : le nettoyage c'est ${prixEnvoi} TTC port A/R inclus, auquel s'ajoute la main d'œuvre du garage pour le démontage/remontage. C'est la seule solution qui retire les suies ET les cendres métalliques, ce qui permet au filtre de retrouver ses performances d'origine.\n\nTu es dans quel coin ? Je regarde quel garage partenaire est le plus proche de chez toi.`;
  const data = { ...(extracted || DEFAULT_DATA), intention: "diagnostic", demontage: "garage_partner", next_best_action: "demander_ville" };
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildOwnGarageResponse(extracted, metier) {
  const { prixEnvoi } = getPricing(extracted, metier);
  const replyClean = `Super, c'est encore plus simple. Voilà comment ça se passe avec ton garage :\n\n1. Ton garagiste démonte le FAP comme il le ferait pour un remplacement\n2. Il envoie le FAP au centre Re-FAP (on fournit l'étiquette de transport)\n3. On le nettoie et on le retourne sous 48-72h\n4. Ton garagiste le remonte et réinitialise le système\n\nCôté budget : le nettoyage c'est ${prixEnvoi} TTC port A/R inclus, auquel s'ajoute la main d'œuvre de ton garagiste pour le démontage/remontage. C'est la seule solution qui retire les suies ET les cendres métalliques, ce qui permet au filtre de retrouver ses performances d'origine.\n\nSi ton garagiste ne connaît pas encore Re-FAP, pas de souci — un expert peut l'appeler pour tout lui expliquer et le rassurer sur le process. On fait ça régulièrement.\n\nTu es dans quel coin ? Ça me permet de préparer le dossier.`;
  const data = { ...(extracted || DEFAULT_DATA), intention: "diagnostic", demontage: "garage_own", next_best_action: "demander_ville" };
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function detectDemontageFromHistory(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "user") {
      const msg = String(history[i].content || "");
      if (userSaysSelfRemoval(msg)) return "self";
      if (userHasOwnGarage(msg)) return "garage_own";
      if (userWantsPartnerGarage(msg)) return "garage_partner";
      if (userNeedsGarage(msg)) return "garage";
    }
    if (history[i]?.role === "assistant") {
      const content = String(history[i].raw || history[i].content || "").toLowerCase();
      if (content.includes("la solution la plus économique") && content.includes("fap démonté")) return "self";
      if (content.includes("ton garagiste démonte")) return "garage_own";
      if (content.includes("800 garages partenaires") && content.includes("process re-fap")) return "garage_partner";
      if (content.includes("le garage s'occupe de tout") && content.includes("main d'œuvre")) return "garage";
    }
  }
  return null;
}

// ============================================================
// buildLocationOrientationResponse — v6.3 + Re-FAP Clermont
// ============================================================
async function buildLocationOrientationResponse(supabase, extracted, metier, ville, history) {
  const dept = extractDeptFromInput(ville);
  const villeNorm = (ville || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const cityGps = CITY_GPS[villeNorm] || CITY_GPS[villeNorm.replace(/ /g, "-")] || CITY_GPS[villeNorm.replace(/-/g, " ")] || null;

  const refLat = cityGps?.lat || (dept && DEPT_CENTROIDS[dept]?.lat) || null;
  const refLng = cityGps?.lng || (dept && DEPT_CENTROIDS[dept]?.lng) || null;

  const cc = dept ? findNearestCCs(dept, 200, cityGps?.lat || null, cityGps?.lng || null) : { equipped: [], depot: [], nearbyEquipped: [], closestCC: null, closestEquipped: null, closestDepot: null };
  const vehicleInfo = extracted?.marque ? `ta ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""}` : "ton véhicule";
  let demontage = extracted?.demontage || null;
  if (!demontage && history) demontage = detectDemontageFromHistory(history);
  if (!demontage) demontage = "unknown";
  const villeDisplay = capitalizeVille(ville);
  const { prixCC, prixEnvoi, prixCCDetail, prixEnvoiDetail } = getPricing(extracted, metier);
  let replyClean = "";
  let assignedCC = null;
  let assignedGarage = null;

  const distLabel = (cc) => cc.distance ? ` (~${cc.distance} km)` : "";
  const MAX_EQUIPPED_MENTION_KM = 150;

  // 🆕 Bloc texte Re-FAP Clermont-Ferrand
  const buildRefapCenterBlock = (center, demontageType) => {
    const prixFAP = demontageType === "self"
      ? "99€ (FAP type DV6 PSA) ou 149€ (FAP combiné avec catalyseur), FAP déjà démonté"
      : "99€ (FAP type DV6 PSA) ou 149€ (FAP combiné avec catalyseur) + main d'œuvre démontage/remontage/réinitialisation selon le véhicule";
    return `🔧 Re-FAP Clermont-Ferrand — ${center.address}\n📞 ${center.phone}\n\nMachine Re-FAP sur place. ${prixFAP}.\n\nPrise en charge totale possible. Devis en ligne : ${center.website}`;
  };

  // ============================================================
  // RECHERCHE GARAGE PARTENAIRE (si demontage != self && != garage_own)
  // ============================================================
  let nearestGarages = [];
  if (refLat && refLng && demontage !== "self" && demontage !== "garage_own") {
    nearestGarages = await findNearestGarages(supabase, refLat, refLng, 80, 3);
  }
  const bestGarage = nearestGarages.length > 0 ? nearestGarages[0] : null;
  const garageDistLabel = (g) => g.distance_km ? ` (~${g.distance_km} km)` : "";

  // ============================================================
  // RÉPONSES PAR CAS
  // ============================================================

  if (demontage === "self") {

    if (cc.equipped.length > 0) {
      const best = cc.equipped[0];
      assignedCC = { ...best, reason: "centre express local" };
      // 🆕 Re-FAP Clermont
      if (best.isRefapCenter) {
        replyClean = `Bonne nouvelle, le centre Re-FAP est directement à ${best.city} !\n\n${buildRefapCenterBlock(best, "self")}\n\nTu veux qu'on te prépare la prise en charge pour ${vehicleInfo} ?`;
      } else {
        replyClean = `Bonne nouvelle ! Il y a un Carter-Cash équipé d'une machine Re-FAP près de chez toi : ${best.name} (${best.postal} ${best.city})${distLabel(best)}. Tu y déposes ton FAP démonté, nettoyage sur place en ~4h.\n\nTarifs : ${prixCCDetail}.\n\nTu veux qu'un expert Re-FAP te confirme les détails et prépare ta venue ?`;
      }

    } else {
      const closestDepotCC = cc.closestDepot;
      const nearestEquip = cc.closestEquipped;
      const equipMentionable = nearestEquip && nearestEquip.distance <= MAX_EQUIPPED_MENTION_KM;

      if (closestDepotCC && equipMentionable && closestDepotCC.distance < nearestEquip.distance) {
        assignedCC = { ...closestDepotCC, reason: "depot plus proche que express" };
        // 🆕 Re-FAP Clermont dans nearestEquip (mention secondaire)
        const equippedMention = nearestEquip.isRefapCenter
          ? `le centre Re-FAP Clermont-Ferrand${distLabel(nearestEquip)} — nettoyage sur place en 4h (${prixCCDetail}).`
          : `le Carter-Cash équipé le plus proche c'est ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)} — là-bas c'est nettoyage sur place en 4h (${prixCCDetail}).`;
        replyClean = `OK, près de chez toi il y a le ${closestDepotCC.name} (${closestDepotCC.postal} ${closestDepotCC.city})${distLabel(closestDepotCC)}. C'est un point dépôt : tu y laisses ton FAP démonté, il est envoyé au centre Re-FAP et te revient en 48-72h pour ${prixEnvoi} port inclus.\n\nSinon, ${equippedMention}\n\nTu veux qu'un expert Re-FAP t'oriente sur la meilleure option ?`;

      } else if (equipMentionable) {
        assignedCC = { ...nearestEquip, reason: "centre express le plus proche" };
        // 🆕 Re-FAP Clermont
        if (nearestEquip.isRefapCenter) {
          replyClean = `Le centre Re-FAP le plus proche c'est à ${nearestEquip.city}${distLabel(nearestEquip)} !\n\n${buildRefapCenterBlock(nearestEquip, "self")}\n\nTu veux qu'on te prépare la prise en charge ?`;
        } else {
          replyClean = `Le Carter-Cash équipé le plus proche de chez toi c'est ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)} — nettoyage sur place en ~4h (${prixCCDetail}). Sinon, tu peux aussi déposer ton FAP dans n'importe quel Carter-Cash (point dépôt) : envoi 48-72h, ${prixEnvoi} port inclus.${closestDepotCC ? ` Le plus proche : ${closestDepotCC.name}${distLabel(closestDepotCC)}.` : ""}\n\nTu veux qu'un expert Re-FAP t'oriente sur la meilleure option ?`;
        }

      } else if (closestDepotCC) {
        assignedCC = { ...closestDepotCC, reason: "depot standard le plus proche" };
        replyClean = `OK, le Carter-Cash le plus proche de chez toi c'est ${closestDepotCC.name} (${closestDepotCC.postal} ${closestDepotCC.city})${distLabel(closestDepotCC)}. C'est un point dépôt : tu y déposes ton FAP démonté, il est envoyé au centre Re-FAP et te revient en 48-72h pour ${prixEnvoi} port inclus.\n\nSinon tu peux aussi nous l'envoyer directement par transporteur (même tarif, même délai).\n\nTu veux qu'un expert Re-FAP t'oriente sur la meilleure option ?`;

      } else {
        replyClean = `Pour ton secteur, la solution la plus simple c'est l'envoi direct : tu nous envoies ton FAP démonté par transporteur, on le nettoie et on te le retourne en 48-72h, ${prixEnvoi} port inclus. Tu veux qu'un expert Re-FAP t'envoie les détails ?`;
      }
    }

  } else if (demontage === "garage_own") {
    replyClean = `OK, ${villeDisplay}. On va préparer tout ça pour ton garagiste.\n\nUn expert Re-FAP va te rappeler pour :\n→ Répondre aux questions techniques que ton garagiste pourrait avoir\n→ Lui envoyer les infos sur le process et les tarifs\n→ Organiser l'envoi et le retour du FAP\n\nL'objectif c'est que ton garagiste soit à l'aise pour faire le job, même si c'est la première fois. Tu veux qu'on te rappelle ?`;

  } else if (demontage === "garage" || demontage === "garage_partner") {
    // ================================================================
    // v6.3 : CIRCUIT GARAGE PARTENAIRE + CC
    // ================================================================
    const nearestEquip = cc.closestEquipped || cc.nearbyEquipped?.[0];
    const equipMentionable = nearestEquip && nearestEquip.distance <= MAX_EQUIPPED_MENTION_KM;
    const closestDepotCC = cc.closestDepot || cc.depot?.[0];

    if (bestGarage && equipMentionable) {
      assignedCC = { ...nearestEquip, reason: "circuit garage+express" };
      assignedGarage = bestGarage;
      // 🆕 Re-FAP Clermont : centre full-service, pas besoin de garage partenaire
      if (nearestEquip.isRefapCenter) {
        replyClean = `OK, ${villeDisplay}. Bonne nouvelle, le centre Re-FAP est directement à ${nearestEquip.city} et s'occupe de tout !\n\n${buildRefapCenterBlock(nearestEquip, demontage)}\n\nTu veux qu'un expert Re-FAP organise la prise en charge pour ${vehicleInfo} ?`;
      } else {
        const nomContainsReseau = bestGarage.reseau && bestGarage.nom && bestGarage.nom.toUpperCase().includes(bestGarage.reseau.toUpperCase());
        const garageLabel = nomContainsReseau ? `${bestGarage.nom}` : (bestGarage.reseau && bestGarage.reseau !== "INDEPENDANT" ? `${bestGarage.nom} (${bestGarage.reseau})` : bestGarage.nom);
        const garageVille = bestGarage.ville ? `, ${bestGarage.ville}` : "";
        replyClean = `OK, ${villeDisplay}. J'ai trouvé un circuit complet près de chez toi :\n\n🔧 ${garageLabel}${garageVille}${garageDistLabel(bestGarage)} — il s'occupe du démontage et du remontage de ton FAP.\n🏪 ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)} — nettoyage sur place en ~4h (${prixCCDetail}).\n\nConcrètement : le garage démonte le FAP, le dépose au Carter-Cash, on le nettoie et le garage le remonte. Tu n'as qu'un seul interlocuteur.\n\nTu veux qu'un expert Re-FAP organise tout ça pour ${vehicleInfo} ?`;
      }
    } else if (bestGarage && closestDepotCC) {
      // Garage partenaire + CC dépôt → tarif envoi
      assignedCC = { ...closestDepotCC, reason: "circuit garage+depot" };
      assignedGarage = bestGarage;
      const nomContainsReseau = bestGarage.reseau && bestGarage.nom && bestGarage.nom.toUpperCase().includes(bestGarage.reseau.toUpperCase());
      const garageLabel = nomContainsReseau ? `${bestGarage.nom}` : (bestGarage.reseau && bestGarage.reseau !== "INDEPENDANT" ? `${bestGarage.nom} (${bestGarage.reseau})` : bestGarage.nom);
      const garageVille = bestGarage.ville ? `, ${bestGarage.ville}` : "";
      replyClean = `OK, ${villeDisplay}. On a un garage partenaire près de chez toi :\n\n🔧 ${garageLabel}${garageVille}${garageDistLabel(bestGarage)} — il s'occupe de tout : démontage, envoi au centre Re-FAP, remontage.\n\nLe Carter-Cash le plus proche c'est ${closestDepotCC.name}${distLabel(closestDepotCC)} (point dépôt 48-72h). Le garage peut y déposer le FAP ou l'envoyer directement — on s'organise au mieux.\n\nCôté budget : ${prixEnvoi} TTC port A/R inclus + main d'œuvre garage.\n\nTu veux qu'un expert Re-FAP organise la prise en charge pour ${vehicleInfo} ?`;

    } else if (bestGarage) {
      // Garage partenaire sans CC proche → envoi direct
      assignedGarage = bestGarage;
      const nomContainsReseau = bestGarage.reseau && bestGarage.nom && bestGarage.nom.toUpperCase().includes(bestGarage.reseau.toUpperCase());
      const garageLabel = nomContainsReseau ? `${bestGarage.nom}` : (bestGarage.reseau && bestGarage.reseau !== "INDEPENDANT" ? `${bestGarage.nom} (${bestGarage.reseau})` : bestGarage.nom);
      const garageVille = bestGarage.ville ? `, ${bestGarage.ville}` : "";
      replyClean = `OK, ${villeDisplay}. On a un garage partenaire près de chez toi :\n\n🔧 ${garageLabel}${garageVille}${garageDistLabel(bestGarage)} — il s'occupe de tout : démontage du FAP, envoi au centre Re-FAP, remontage et réinitialisation.\n\nCôté budget : ${prixEnvoi} TTC port A/R inclus + main d'œuvre garage.\n\nTu veux qu'un expert Re-FAP organise la prise en charge ?`;

    } else if (equipMentionable) {
      // Pas de garage mais centre équipé proche
      assignedCC = { ...nearestEquip, reason: "centre express garage non trouve" };
      // 🆕 Re-FAP Clermont
      if (nearestEquip.isRefapCenter) {
        replyClean = `OK, ${villeDisplay}. Le centre Re-FAP le plus proche c'est à ${nearestEquip.city}${distLabel(nearestEquip)}.\n\n${buildRefapCenterBlock(nearestEquip, demontage)}\n\nTu veux qu'un expert Re-FAP organise la prise en charge pour ${vehicleInfo} ?`;
      } else {
        replyClean = `OK, ${villeDisplay}. Le Carter-Cash équipé le plus proche c'est ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)} — nettoyage sur place en ~4h (${prixCCDetail}). On a aussi des garages partenaires dans ton secteur qui gèrent tout de A à Z.\n\nLe mieux c'est qu'un expert Re-FAP te trouve le garage le plus adapté pour ${vehicleInfo}. Tu veux qu'on te rappelle ?`;
      }

    } else {
      // Fallback total
      replyClean = `OK, ${villeDisplay}. On a des garages partenaires dans ton secteur qui s'occupent de tout : démontage, envoi au centre Re-FAP, remontage et réinitialisation. Côté budget : ${prixEnvoi} TTC port A/R inclus + main d'œuvre garage.\n\nLe mieux c'est qu'un expert Re-FAP te mette en contact avec le bon garage. Tu veux qu'on te rappelle ?`;
    }

  } else {
    // ================================================================
    // DEMONTAGE INCONNU — Montrer garage + CC
    // ================================================================
    const nearestEquip = cc.closestEquipped || cc.nearbyEquipped?.[0];
    const equipMentionable = nearestEquip && nearestEquip.distance <= MAX_EQUIPPED_MENTION_KM;
    const nearestDepot = cc.closestDepot || cc.depot?.[0];

    if (bestGarage && equipMentionable && nearestEquip.distance <= 80) {
      assignedCC = { ...nearestEquip, reason: "circuit garage+express auto" };
      assignedGarage = bestGarage;
      // 🆕 Re-FAP Clermont
      if (nearestEquip.isRefapCenter) {
        replyClean = `OK, ${villeDisplay}. Bonne nouvelle, on a un garage partenaire et le centre Re-FAP directement à ${nearestEquip.city} :\n\n🔧 ${bestGarage.nom}${garageDistLabel(bestGarage)} — pour le démontage/remontage\n🏪 Re-FAP Clermont-Ferrand${distLabel(nearestEquip)} — machine sur place, nettoyage en ~4h (${prixCCDetail})\n\nSi tu préfères démonter toi-même, tu peux déposer le FAP directement au centre. Sinon le garage s'occupe de tout.\n\nTu veux qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo} ?`;
      } else {
        replyClean = `OK, ${villeDisplay}. Bonne nouvelle, on a un garage partenaire et un Carter-Cash équipé pas loin :\n\n🔧 ${bestGarage.nom}${garageDistLabel(bestGarage)} — pour le démontage/remontage\n🏪 ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)} — nettoyage sur place en ~4h (${prixCCDetail})\n\nSi tu préfères démonter toi-même, tu peux déposer le FAP directement au CC. Sinon le garage s'occupe de tout.\n\nTu veux qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo} ?`;
      }

    } else if (bestGarage && nearestDepot) {
      assignedCC = { ...nearestDepot, reason: "circuit garage+depot auto" };
      assignedGarage = bestGarage;
      // 🆕 Re-FAP Clermont dans equippedHint
      let equippedHint = "";
      if (equipMentionable) {
        equippedHint = nearestEquip.isRefapCenter
          ? `\n\nLe centre Re-FAP le plus proche c'est à ${nearestEquip.city}${distLabel(nearestEquip)} — machine sur place, nettoyage en 4h (${prixCCDetail}).`
          : `\n\nLe Carter-Cash équipé le plus proche c'est ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)} — nettoyage sur place en 4h (${prixCCDetail}).`;
      }
      replyClean = `OK, ${villeDisplay}. On a un garage partenaire près de chez toi : ${bestGarage.nom}${garageDistLabel(bestGarage)} qui peut gérer le démontage/remontage. Et le ${nearestDepot.name}${distLabel(nearestDepot)} pour le nettoyage (envoi 48-72h, ${prixEnvoi}).${equippedHint}\n\nTu veux qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo} ?`;

    } else if (equipMentionable && nearestEquip.distance <= 80) {
      assignedCC = { ...nearestEquip, reason: "centre express proche" };
      // 🆕 Re-FAP Clermont
      if (nearestEquip.isRefapCenter) {
        replyClean = `OK, ${villeDisplay}. Bonne nouvelle, le centre Re-FAP est à ${nearestEquip.city}${distLabel(nearestEquip)} — machine sur place, nettoyage en ~4h (${prixCCDetail}). On a aussi des garages partenaires dans ton secteur pour la prise en charge complète.\n\nLe mieux c'est qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo}. Tu veux qu'on te rappelle ?`;
      } else {
        replyClean = `OK, ${villeDisplay}. Bonne nouvelle, il y a un Carter-Cash équipé d'une machine Re-FAP pas loin : ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)}. Si tu déposes ton FAP démonté, nettoyage sur place en ~4h (${prixCCDetail}). On a aussi des garages partenaires dans ton secteur pour la prise en charge complète.\n\nLe mieux c'est qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo}. Tu veux qu'on te rappelle ?`;
      }

    } else if (nearestDepot) {
      assignedCC = { ...nearestDepot, reason: "depot standard le plus proche" };
      // 🆕 Re-FAP Clermont dans equippedHint
      let equippedHint = "";
      if (equipMentionable) {
        equippedHint = nearestEquip.isRefapCenter
          ? `\n\nLe centre Re-FAP le plus proche c'est à ${nearestEquip.city}${distLabel(nearestEquip)} — machine sur place, nettoyage en 4h (${prixCCDetail}).`
          : `\n\nLe Carter-Cash équipé le plus proche c'est ${nearestEquip.name} (${nearestEquip.city})${distLabel(nearestEquip)} — nettoyage sur place en 4h (${prixCCDetail}).`;
      }
      replyClean = `OK, ${villeDisplay}. Il y a le ${nearestDepot.name} (${nearestDepot.postal} ${nearestDepot.city})${distLabel(nearestDepot)} qui est un point dépôt (envoi 48-72h, ${prixEnvoi}). On a aussi des garages partenaires dans ton secteur pour la prise en charge complète.${equippedHint}\n\nLe mieux c'est qu'un expert Re-FAP regarde la meilleure option pour ${vehicleInfo}. Tu veux qu'on te rappelle ?`;

    } else {
      replyClean = `OK, ${villeDisplay}. On a des centres Carter-Cash et plus de 800 garages partenaires en France. Pour ${vehicleInfo}, le mieux c'est qu'un expert Re-FAP vérifie le centre le plus adapté près de chez toi et te confirme le prix exact. Tu veux qu'on te rappelle ?`;
    }
  }
const data = {
    ...(extracted || DEFAULT_DATA),
    intention: "rdv",
    ville: villeDisplay || null,
    departement: dept || null,
    next_best_action: "proposer_devis",
    // 🆕 centre_proche pour le récap buildFormCTA
    centre_proche: assignedCC?.isRefapCenter
      ? "Re-FAP Clermont-Ferrand"
      : assignedCC?.name ? `Carter-Cash ${assignedCC.city}` : null,
  };
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  // 🆕 centre_type inclut REFAP_CENTER
  const assignment = assignedCC ? {
    postal_code: assignedCC.postal,
    centre_type: assignedCC.isRefapCenter ? "REFAP_CENTER" : (assignedCC.equipped ? "EXPRESS" : "STANDARD"),
    reason: assignedCC.reason || "plus proche",
    user_location_input: ville || null,
    user_dept: dept || null,
    distance_km: assignedCC.distance || null,
  } : null;

  const garageAssignment = assignedGarage ? {
    garage_partenaire_id: assignedGarage.id,
    garage_name: assignedGarage.nom,
    garage_reseau: assignedGarage.reseau,
    garage_distance_km: assignedGarage.distance_km,
  } : null;

  return {
    replyClean, replyFull, extracted: data,
    assignment,
    garageAssignment,
    suggested_replies: [
      { label: "✅ Oui, rappelez-moi", value: "oui je veux être rappelé" },
      { label: "Non merci", value: "non merci" },
    ],
  };
}

function buildClosingQuestion(extracted, metier) {
  const { prixText } = getPricing(extracted, metier);
  let vehicleInfo = "";
  if (extracted?.marque) {
    vehicleInfo = `ta ${extracted.marque}`;
    if (extracted?.modele) vehicleInfo += ` ${extracted.modele}`;
  }
  const data = { ...(extracted || DEFAULT_DATA), intention: "diagnostic", next_best_action: "proposer_devis" };
  let replyClean;
  if (vehicleInfo) {
    replyClean = `Sur ${vehicleInfo}, le nettoyage professionnel du FAP c'est ${prixText}, garanti 1 an. C'est la seule solution qui retire les cendres en plus des suies. Tu veux qu'un expert Re-FAP regarde ta situation ? C'est gratuit, on te rappelle pour t'orienter.`;
  } else {
    replyClean = `Le nettoyage professionnel du FAP c'est ${prixText}, garanti 1 an — et c'est la seule solution qui retire aussi les cendres. Tu veux qu'un expert Re-FAP regarde ta situation ?`;
  }
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return {
    replyClean, replyFull, extracted: data,
    suggested_replies: [
      { label: "✅ Oui, rappelez-moi", value: "oui je veux être rappelé" },
      { label: "Non merci", value: "non merci" },
    ],
  };
}

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

function buildModelQuestion(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_modele" };
  const marque = extracted?.marque || "ta voiture";
  const replyClean = `Ok, sur une ${marque} c'est un souci qu'on voit souvent. C'est quel modèle exactement et quelle année ? Ça me permet de vérifier s'il y a un souci connu sur cette version.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildKmQuestion(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_km" };
  const vehicleStr = extracted?.marque ? `ta ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""}` : "ton véhicule";
  const replyClean = `Et ${vehicleStr}, elle a combien de km à peu près ? C'est important pour évaluer l'état du FAP.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildPreviousAttemptsQuestion(extracted, metier) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_deja_essaye" };
  const replyClean = `Avant de t'orienter : tu as déjà essayé quelque chose pour régler ça ? Additif, régénération, passage garage, ou rien du tout ?`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return {
    replyClean, replyFull, extracted: data,
    suggested_replies: [
      { label: "Additif / nettoyant", value: "j'ai essayé un additif" },
      { label: "Régénération forcée", value: "j'ai tenté une régénération forcée" },
      { label: "Passage garage", value: "je suis passé au garage" },
      { label: "Rien du tout", value: "rien du tout" },
    ],
  };
}

function buildFormCTA(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), intention: "rdv", next_best_action: "clore" };

  // 🆕 Bloc récap dynamique
  const lines = ["📋 Résumé de ta situation :\n"];

  if (extracted?.marque) {
    const vehicule = `${extracted.marque}${extracted.modele ? " " + extracted.modele : ""}`;
    lines.push(`🚗 Véhicule : ${vehicule}`);
  }
  if (extracted?.symptome && extracted.symptome !== "inconnu") {
    const symptomeLabels = {
      voyant_fap: "Voyant FAP allumé",
      voyant_fap_puissance: "Voyant FAP + perte de puissance",
      perte_puissance: "Perte de puissance",
      fumee_noire: "Fumée noire",
      fumee_blanche: "Fumée blanche",
      ct_refuse: "Contrôle technique refusé",
      regeneration_echec: "Régénération en échec",
    };
    const label = symptomeLabels[extracted.symptome] || extracted.symptome;
    lines.push(`⚠️ Symptôme : ${label}`);
  }
  if (extracted?.kilometrage) {
    lines.push(`📏 Kilométrage : ${extracted.kilometrage}`);
  }
  if (extracted?.codes?.length > 0) {
    lines.push(`🔍 Code(s) défaut : ${extracted.codes.join(", ")}`);
  }
  if (extracted?.ville) {
    lines.push(`📍 Localisation : ${extracted.ville}`);
  }
  if (extracted?.centre_proche) {
    lines.push(`🔧 Solution : Nettoyage sur place — ${extracted.centre_proche}`);
  } else if (extracted?.demontage === "self") {
    lines.push(`🔧 Solution : Dépôt FAP démonté — Carter-Cash le plus proche`);
  } else if (["garage_own", "garage_partner", "garage"].includes(extracted?.demontage)) {
    lines.push(`🔧 Solution : Prise en charge complète par garage partenaire`);
  } else {
    lines.push(`🔧 Solution : Nettoyage Re-FAP — orientation à confirmer`);
  }
  if (extracted?.departement === "63" || extracted?.ville?.toLowerCase().includes("clermont")) {
    lines.push(`💶 Tarif estimé : 99€ (DV6) ou 149€ (FAP combiné) + main d'œuvre`);
  } else if (extracted?.demontage === "self" || extracted?.centre_proche) {
    lines.push(`💶 Tarif estimé : 99€ (FAP seul) ou 149€ (FAP combiné avec catalyseur)`);
  } else {
    lines.push(`💶 Tarif estimé : 199€ TTC port A/R inclus`);
  }

  lines.push("\nUn expert Re-FAP te rappelle pour confirmer et organiser la prise en charge.");

  const replyClean = lines.join("\n");
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildDeclinedResponse(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "clore" };
  const replyClean = `Pas de souci ! Si tu changes d'avis ou si tu as d'autres questions, je suis là.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildOffTopicResponse() {
  const data = { ...DEFAULT_DATA };
  const replyClean = `Je suis FAPexpert, spécialisé dans les problèmes de filtre à particules diesel. Si tu as un souci de voyant, perte de puissance, fumée ou contrôle technique sur ton véhicule, je peux t'aider !`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}

function buildPriceDirectResponse(extracted, metier) {
  const data = { ...(extracted || DEFAULT_DATA), next_best_action: "demander_vehicule" };
  let prixText = "entre 99€ et 149€ chez Carter-Cash selon le modèle, 199€ en envoi";
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

function buildNonDieselResponse(extracted) {
  const data = { ...(extracted || DEFAULT_DATA), certitude_fap: "basse", next_best_action: "clore" };
  const vehicleStr = extracted?.marque ? `ta ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""}` : "ton véhicule";
  const replyClean = `Le FAP (filtre à particules) concerne les moteurs diesel. Si ${vehicleStr} est essence ou GPL, il n'a probablement pas de FAP — le souci vient d'ailleurs (catalyseur, sonde lambda, etc.). Re-FAP ne pourra malheureusement pas t'aider sur ce point. Si tu as un doute sur ton moteur, n'hésite pas à demander.`;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
  return { replyClean, replyFull, extracted: data };
}
// ============================================================
// ENGAGEMENT SCORING + DATA RELANCE
// ============================================================

function computeEngagement(history) {
  let score = 0;
  let userTurns = 0;
  let totalUserWords = 0;
  let gaveDetails = 0;
  let askedQuestions = 0;
  if (!Array.isArray(history)) return 0;
  for (const msg of history) {
    if (msg?.role === "user") {
      userTurns++;
      const words = String(msg.content || "").split(/\s+/).length;
      totalUserWords += words;
      if (words > 15) gaveDetails++;
      if (String(msg.content || "").includes("?")) askedQuestions++;
    }
  }
  score += Math.min(userTurns, 5);
  score += gaveDetails;
  score += askedQuestions;
  if (userTurns > 0 && totalUserWords / userTurns > 10) score += 2;
  return Math.min(score, 10);
}

function getMissingDataQuestion(extracted, history) {
  const lastBot = getLastAssistantMessage(history);
  if (lastBot && /quel mod[eè]le|combien de km|quelle ann[eé]e|code erreur|type de trajet|quel coin/i.test(lastBot)) {
    return null;
  }
  if (extracted?.marque && !extracted?.modele && !everAskedModel(history)) {
    return { field: "modele", question: `Au fait, c'est quel modèle exactement ta ${extracted.marque} ? (et l'année si tu l'as)` };
  }
  if (extracted?.marque && !extracted?.kilometrage && !everAskedKm(history)) {
    return { field: "kilometrage", question: `Elle a combien de km à peu près ta ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""} ?` };
  }
  if (lastBot && /quel mod[eè]le|combien de km|quelle ann[eé]e|code erreur|type de trajet|quel coin/i.test(lastBot)) {
    return null;
  }
  if (extracted?.marque && !extracted?.modele && !everAskedModel(history)) {
    return { field: "modele", question: `Au fait, c'est quel modèle exactement ta ${extracted.marque} ? (et l'année si tu l'as)` };
  }
  if (extracted?.marque && !extracted?.kilometrage && !everAskedKm(history)) {
    return { field: "kilometrage", question: `Elle a combien de km à peu près ta ${extracted.marque}${extracted.modele ? " " + extracted.modele : ""} ?` };
  }
  return null;
}
function getLastAssistantMessage(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      return String(history[i].raw || history[i].content || "");
    }
  }
  return null;
}

function getDataRelanceForResponse(extracted, history) {
  const missing = getMissingDataQuestion(extracted, history);
  if (!missing) return null;
  if (missing.field === "modele" || missing.field === "kilometrage") return missing.question;
  return null;
}

function withDataRelance(response, history) {
  if (!response) return response;
  const relance = getDataRelanceForResponse(response.extracted, history);
  if (!relance) return response;
  const replyClean = response.replyClean + "\n\n" + relance;
  const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(response.extracted)}`;
  return { ...response, replyClean, replyFull, suggested_replies: undefined };
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
// HANDLER — VERSION 6.2
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
    if (!message || typeof message !== "string") return res.status(400).json({ error: "Message requis" });
    if (!session_id || typeof session_id !== "string") return res.status(400).json({ error: "session_id requis" });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: "Configuration Supabase manquante" });

    // DB : conversation + message user
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .upsert({ session_id, last_seen_at: new Date().toISOString() }, { onConflict: "session_id" })
      .select("id")
      .single();
    if (convError) return res.status(500).json({ error: "Erreur DB conversation", details: convError.message });
    const conversationId = convData.id;
    await supabase.from("messages").insert({ conversation_id: conversationId, role: "user", content: message });

    // EXTRACTION
    const quickData = quickExtract(message);
    let lastExtracted = extractLastExtractedData(history);

    // Merger quickExtract dans lastExtracted
    if (quickData.marque && !lastExtracted.marque) lastExtracted.marque = quickData.marque;
    if (quickData.modele && !lastExtracted.modele) lastExtracted.modele = quickData.modele;
    if (quickData.motorisation && !lastExtracted.motorisation) lastExtracted.motorisation = quickData.motorisation;

    // SYMPTÔME : merge intelligent avec combos cross-turn
    if (quickData.symptome_key) {
      const prev = lastExtracted.symptome || "inconnu";
      const curr = quickData.symptome_key;
      const voyantTypes = ["voyant_fap", "voyant_moteur_seul"];
      const puissanceTypes = ["perte_puissance", "mode_degrade"];
      if (voyantTypes.includes(prev) && puissanceTypes.includes(curr)) {
        lastExtracted.symptome = "voyant_fap_puissance";
        lastExtracted.certitude_fap = "haute";
      } else if (puissanceTypes.includes(prev) && voyantTypes.includes(curr)) {
        lastExtracted.symptome = "voyant_fap_puissance";
        lastExtracted.certitude_fap = "haute";
      } else if (voyantTypes.includes(prev) && /fumee/.test(curr)) {
        lastExtracted.symptome = "voyant_fap";
        lastExtracted.certitude_fap = "haute";
      } else if (prev === "inconnu") {
        lastExtracted.symptome = curr;
      } else if (curr === "voyant_fap_puissance" || curr === "voyant_fap") {
        lastExtracted.symptome = curr;
      }
    }

    if (quickData.codes.length > 0 && lastExtracted.codes.length === 0) lastExtracted.codes = quickData.codes;
    if (quickData.previous_attempts.length > 0 && !lastExtracted.previous_attempts) {
      lastExtracted.previous_attempts = quickData.previous_attempts.join(", ");
    }
    const detectedYear = extractYearFromMessage(message);
    if (detectedYear && !lastExtracted.annee) lastExtracted.annee = detectedYear;
    const detectedKm = extractKmFromMessage(message);
    if (detectedKm && !lastExtracted.kilometrage) lastExtracted.kilometrage = detectedKm;
    if (quickData.anciennete && !lastExtracted.anciennete_probleme) lastExtracted.anciennete_probleme = quickData.anciennete;
    if (quickData.frequence && !lastExtracted.frequence) lastExtracted.frequence = quickData.frequence;
    if (quickData.type_trajets && (!lastExtracted.type_trajets || lastExtracted.type_trajets === "inconnu")) lastExtracted.type_trajets = quickData.type_trajets;
    if (quickData.source && !lastExtracted.source) lastExtracted.source = quickData.source;
    if (quickData.budget_evoque && !lastExtracted.budget_evoque) lastExtracted.budget_evoque = quickData.budget_evoque;
    if (quickData.garage_confiance !== null && quickData.garage_confiance !== undefined && lastExtracted.garage_confiance === null) lastExtracted.garage_confiance = quickData.garage_confiance;

    // SANITISATION
    const GARBAGE_VALUES = ["inconnu", "inconnue", "null", "undefined", "non", "non renseigné", "nc", "?", ""];
    for (const field of ["kilometrage", "modele", "motorisation", "annee", "previous_attempts", "demontage", "ville", "departement"]) {
      if (typeof lastExtracted[field] === "string" && GARBAGE_VALUES.includes(lastExtracted[field].toLowerCase().trim())) {
        lastExtracted[field] = null;
      }
    }

    // Certitude FAP upgrade
    if (lastExtracted.certitude_fap === "inconnue" || lastExtracted.certitude_fap === "basse" || lastExtracted.certitude_fap === "moyenne") {
      const merged = lastExtracted.symptome;
      const hauteCertitude = ["voyant_fap", "voyant_fap_puissance", "code_p2002", "fap_bouche_declare", "mode_degrade", "ct_refuse", "regeneration_impossible"];
      const moyenneCertitude = ["perte_puissance", "code_p0420", "voyant_moteur_seul", "fumee", "fumee_noire", "fumee_blanche"];
      if (hauteCertitude.includes(merged)) lastExtracted.certitude_fap = "haute";
      else if (moyenneCertitude.includes(merged) && lastExtracted.certitude_fap !== "haute") lastExtracted.certitude_fap = "moyenne";
    }

    const userTurns = countUserTurns(history) + 1;
    const metier = await fetchMetierData(supabase, quickData, lastExtracted);

    // HELPER : envoyer une réponse
    async function sendResponse(response, action = null) {
      if (response.extracted) response.extracted.engagement_score = computeEngagement(history);
      await supabase.from("messages").insert({ conversation_id: conversationId, role: "assistant", content: response.replyFull });
      upsertEnrichment(supabase, conversationId, response.extracted, quickData, metier);

      // Log centre assignment si présent (fire-and-forget)
     if (response.assignment || response.garageAssignment) {
        logCentreAssignment(supabase, conversationId, session_id, response.assignment, response.garageAssignment).catch(e => console.error("Assignment log error:", e));
      }

      const result = { reply: response.replyClean, reply_full: response.replyFull, session_id, conversation_id: conversationId, extracted_data: response.extracted };
      if (action) result.action = action;
      if (response.suggested_replies) result.suggested_replies = response.suggested_replies;
      return res.status(200).json(result);
    }

 // ========================================
    // OVERRIDE 0a : INSULTE → Réponse calme
    // ========================================
    if (userIsInsulting(message)) {
      return sendResponse(buildInsultResponse(lastExtracted));
    }

    // ========================================
    // OVERRIDE 0 : OFF-TOPIC
    // ========================================
    if (quickData.is_off_topic && userTurns <= 2) {
      return sendResponse(buildOffTopicResponse());
    }

    // ========================================
    // OVERRIDE 0b : NON-DIESEL
    // ========================================
    if (quickData.is_non_diesel) {
      return sendResponse(buildNonDieselResponse(lastExtracted));
    }

    // ========================================
    // OVERRIDE 1 : Closing question + OUI → Formulaire
    // ========================================
    if ((lastAssistantAskedClosingQuestion(history) || lastAssistantAskedCity(history)) && userSaysYes(message)) {
      return sendResponse(buildFormCTA(lastExtracted), { type: "OPEN_FORM", url: `https://auto.re-fap.fr/?cid=${conversationId}#devis` });
    }

    // ========================================
    // OVERRIDE 1a : Question diagnostic ("tu veux que je te détaille ?")
    // ========================================
    if (lastAssistantAskedSolutionExplanation(history)) {
      if (userIsInsulting(message)) {
        return sendResponse(buildInsultResponse(lastExtracted));
      }
      if (userSaysNo(message)) {
        // Géré par Override 2
      } else if (userSaysSelfRemoval(message)) {
        return sendResponse(buildSelfRemovalResponse(lastExtracted, metier));
      } else if (userNeedsGarage(message)) {
        return sendResponse(buildGarageTypeQuestion(lastExtracted, metier));
      } else if (looksLikeCityAnswer(message)) {
        const dept = extractDeptFromInput(message);
        if (dept) {
          const ville = cleanVilleInput(message);
          return sendResponse(await buildLocationOrientationResponse(supabase, lastExtracted, metier, ville, history));
        }
        const replyClean = "Je n'arrive pas à localiser ça. Tu peux me donner le code postal ou le numéro de département ?";
        const data = { ...(lastExtracted || DEFAULT_DATA), next_best_action: "demander_ville" };
        const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
        return sendResponse({ replyClean, replyFull, extracted: data });
      } else {
        return sendResponse(buildSolutionExplanation(lastExtracted, metier));
      }
    }

    // ========================================
    // OVERRIDE 1b : Démontage → self/garage
    // ========================================
    if (lastAssistantAskedDemontage(history)) {
      if (userIsInsulting(message)) {
        return sendResponse(buildInsultResponse(lastExtracted));
      }
      if (userSaysSelfRemoval(message)) {
        return sendResponse(buildSelfRemovalResponse(lastExtracted, metier));
      } else if (userNeedsGarage(message) || userSaysNo(message)) {
        return sendResponse(buildGarageTypeQuestion(lastExtracted, metier));
      }
      if (looksLikeCityAnswer(message)) {
        const dept = extractDeptFromInput(message);
        if (dept) {
          const ville = cleanVilleInput(message);
          return sendResponse(await buildLocationOrientationResponse(supabase, lastExtracted, metier, ville, history));
        }
        const replyClean = "Je n'arrive pas à localiser ça. Tu peux me donner le code postal ou le numéro de département ?";
        const data = { ...(lastExtracted || DEFAULT_DATA), next_best_action: "demander_ville" };
        const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
        return sendResponse({ replyClean, replyFull, extracted: data });
      }
      if (userSaysYes(message)) {
        const clarifyReply = "Pour t'orienter au mieux : tu as la possibilité de démonter le FAP toi-même, ou tu préfères qu'un garage s'occupe de tout (démontage + remontage) ?";
        const data = { ...(lastExtracted || DEFAULT_DATA), next_best_action: "demander_demontage" };
        const replyFull = `${clarifyReply}\nDATA: ${safeJsonStringify(data)}`;
        return sendResponse({ replyClean: clarifyReply, replyFull, extracted: data });
      }
      return sendResponse(buildGarageTypeQuestion(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 1b2 : Type garage (partenaire vs habituel)
    // ========================================
    if (lastAssistantAskedGarageType(history)) {
      if (userIsInsulting(message)) {
        return sendResponse(buildInsultResponse(lastExtracted));
      }
      if (userHasOwnGarage(message)) return sendResponse(buildOwnGarageResponse(lastExtracted, metier));
      if (userWantsPartnerGarage(message)) return sendResponse(buildPartnerGarageResponse(lastExtracted, metier));
      if (looksLikeCityAnswer(message)) {
        const dept = extractDeptFromInput(message);
        if (dept) {
          const ville = cleanVilleInput(message);
          return sendResponse(await buildLocationOrientationResponse(supabase, lastExtracted, metier, ville, history));
        }
        const replyClean = "Je n'arrive pas à localiser ça. Tu peux me donner le code postal ou le numéro de département ?";
        const data = { ...(lastExtracted || DEFAULT_DATA), next_best_action: "demander_ville" };
        const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
        return sendResponse({ replyClean, replyFull, extracted: data });
      }
      return sendResponse(buildPartnerGarageResponse(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 1c : Ville donnée → orientation concrète
    // ========================================
    if (lastAssistantAskedCity(history) && !userSaysYes(message) && !userSaysNo(message) && message.length > 1) {
      if (userIsInsulting(message)) {
        return sendResponse(buildInsultResponse(lastExtracted));
      }
      if (!looksLikeCityAnswer(message)) {
        const replyClean = "Je n'ai pas bien saisi. Tu es dans quelle ville ou quel département ?";
        const data = { ...(lastExtracted || DEFAULT_DATA), next_best_action: "demander_ville" };
        const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
        return sendResponse({ replyClean, replyFull, extracted: data });
      }
      const dept = extractDeptFromInput(message);
      if (!dept) {
        const replyClean = "Je n'arrive pas à localiser ça. Tu peux me donner le code postal ou le numéro de département ?";
        const data = { ...(lastExtracted || DEFAULT_DATA), next_best_action: "demander_ville" };
        const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
        return sendResponse({ replyClean, replyFull, extracted: data });
      }
      const ville = cleanVilleInput(message);
      return sendResponse(await buildLocationOrientationResponse(supabase, lastExtracted, metier, ville, history));
    }

    // ========================================
    // OVERRIDE 1d : Après formulaire CTA → clore proprement
    // ========================================
    if (lastAssistantSentFormCTA(history)) {
      if (userGivesPhoneOrEmail(message)) {
        const replyClean = "C'est noté ! Un expert Re-FAP va te rappeler rapidement. Bonne route.";
        const data = { ...(lastExtracted || DEFAULT_DATA), intention: "rdv", next_best_action: "clore" };
        const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
        return sendResponse({ replyClean, replyFull, extracted: data });
      }
      if (userSaysNo(message)) {
        return sendResponse(buildDeclinedResponse(lastExtracted));
      }
      // Autre message après CTA → laisser passer au LLM sans re-closer
    }

    // ========================================
    // OVERRIDE 2 : NON → Poli
    // ========================================
    if ((lastAssistantAskedClosingQuestion(history) || lastAssistantAskedCity(history) || lastAssistantAskedSolutionExplanation(history)) && userSaysNo(message)) {
      return sendResponse(buildDeclinedResponse(lastExtracted));
    }

    // ========================================
    // OVERRIDE 3 : Demande explicite RDV
    // ========================================
    if (userWantsFormNow(message)) {
      return sendResponse(buildFormCTA(lastExtracted), { type: "OPEN_FORM", url: `https://auto.re-fap.fr/?cid=${conversationId}#devis` });
    }

    // ========================================
    // OVERRIDE 4 : Prix direct
    // ========================================
    if (quickData.intention === "prix" && !everAskedClosing(history)) {
      return sendResponse(buildPriceDirectResponse(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 4b : "Autre marque"
    // ========================================
    if (!lastExtracted.marque && /autre\s*marque|autre\s*vehicule|pas\s*dans\s*la\s*liste/i.test(message)) {
      const replyClean = "D'accord, mais quelle marque exactement ? Juste le nom de la marque me suffit pour avancer.";
      const data = { ...(lastExtracted || DEFAULT_DATA), next_best_action: "demander_vehicule" };
      const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
      return sendResponse({ replyClean, replyFull, extracted: data });
    }

    // ========================================
    // OVERRIDE 4c : Question qualifier confirmée
    // ========================================
    if (lastAssistantAskedQualifyingQuestion(history) && !lastExtracted.marque && !everAskedClosing(history)) {
      const lastBotMsg = (getLastAssistantMessage(history) || "").toLowerCase();

      if (lastBotMsg.includes("pot d'échappement") || lastBotMsg.includes("pot d\u2019échappement") || lastBotMsg.includes("petits points") || lastBotMsg.includes("autre symbole")) {
        if (userSaysYes(message)) {
          lastExtracted.symptome = "voyant_fap";
          lastExtracted.certitude_fap = "haute";
          return sendResponse(buildVehicleQuestion(lastExtracted));
        } else if (userSaysNo(message) || /cl[eé]\s*(à|a)\s*molette|triangle|huile|temp[eé]rature|batterie|abs|airbag/i.test(message)) {
          const data = { ...(lastExtracted || DEFAULT_DATA), certitude_fap: "basse", next_best_action: "demander_vehicule" };
          const replyClean = "D'accord, ce voyant n'indique pas directement un problème de FAP. Mais ça peut quand même être lié selon le modèle. C'est quelle voiture ?";
          const replyFull = `${replyClean}\nDATA: ${safeJsonStringify(data)}`;
          return sendResponse({ replyClean, replyFull, extracted: data });
        }
        return sendResponse(buildVehicleQuestion(lastExtracted));
      }

      if (lastBotMsg.includes("fumée noire") && lastBotMsg.includes("blanche")) {
        if (/noire|noir|black/i.test(message)) {
          lastExtracted.symptome = "fumee_noire";
          lastExtracted.certitude_fap = "moyenne";
        } else if (/blanche|blanc|white/i.test(message)) {
          lastExtracted.symptome = "fumee_blanche";
          lastExtracted.certitude_fap = "basse";
        }
        return sendResponse(buildVehicleQuestion(lastExtracted));
      }

      if (lastBotMsg.includes("perte de puissance") || (lastBotMsg.includes("voyant") && lastBotMsg.includes("allumé"))) {
        if (userSaysYes(message)) {
          lastExtracted.symptome = "voyant_fap_puissance";
          lastExtracted.certitude_fap = "haute";
        }
        return sendResponse(buildVehicleQuestion(lastExtracted));
      }

      return sendResponse(buildVehicleQuestion(lastExtracted));
    }
    // ========================================
    // OVERRIDE 5 : FORMULAIRE SÉQUENTIEL
    // ========================================

    // 5a : Marque, PAS modèle → demander modèle
    if (lastExtracted.marque && lastExtracted.symptome !== "inconnu" && !lastExtracted.modele && !everAskedModel(history) && !everAskedClosing(history)) {
      return sendResponse(buildModelQuestion(lastExtracted));
    }

    // 5b : Marque + modèle, PAS km → demander km
    if (lastExtracted.marque && lastExtracted.symptome !== "inconnu" && (lastExtracted.modele || everAskedModel(history)) && !lastExtracted.kilometrage && !everAskedKm(history) && !everAskedClosing(history)) {
      return sendResponse(buildKmQuestion(lastExtracted));
    }

    // 5c : Marque + modèle + km, PAS tentatives → demander tentatives
    if (lastExtracted.marque && lastExtracted.symptome !== "inconnu" && (lastExtracted.modele || everAskedModel(history)) && (lastExtracted.kilometrage || everAskedKm(history)) && !lastExtracted.previous_attempts && !everAskedPreviousAttempts(history) && !everAskedClosing(history)) {
      return sendResponse(buildPreviousAttemptsQuestion(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 6 : Tour 3+ sans véhicule
    // ========================================
    if (userTurns >= 2 && !lastExtracted.marque && lastAssistantAskedVehicle(history) && message.trim().length >= 3) {
      const rawMarque = capitalizeVille(message.trim().split(/\s+/)[0]);
      lastExtracted.marque = rawMarque;
      lastExtracted.marque_brute = true;
      return sendResponse(buildModelQuestion(lastExtracted));
    }
    if (userTurns >= 3 && !lastExtracted.marque && !lastAssistantAskedVehicle(history) && !everAskedClosing(history)) {
      return sendResponse(buildVehicleQuestion(lastExtracted));
    }

    // ========================================
    // OVERRIDE 7 : Expert orientation
    // ========================================
    if (hasEnoughForExpertOrientation(lastExtracted) && (everAskedPreviousAttempts(history) || lastExtracted.previous_attempts) && !everGaveExpertOrientation(history) && !everAskedClosing(history)) {
      return sendResponse(withDataRelance(buildExpertOrientation(lastExtracted, metier), history));
    }

    // ========================================
    // OVERRIDE 7b : Contexte manquant pour expert orientation → demander km
    // On a marque+symptôme+tentatives mais le gate bloque (pas de km/ancienneté/code)
    // ========================================
    if (lastExtracted.marque && lastExtracted.symptome !== "inconnu" && (lastExtracted.previous_attempts || everAskedPreviousAttempts(history)) && !hasEnoughForExpertOrientation(lastExtracted) && !everGaveExpertOrientation(history) && !everAskedClosing(history)) {
      if (!lastExtracted.kilometrage && !everAskedKm(history)) {
        return sendResponse(buildKmQuestion(lastExtracted));
      }
      // Si km déjà demandé mais pas répondu, tenter expert orientation quand même (mode dégradé)
      return sendResponse(withDataRelance(buildExpertOrientation(lastExtracted, metier), history));
    }

    // ========================================
    // OVERRIDE 8 : Closing forcé tour 5+
    // ========================================
    if (userTurns >= MAX_USER_TURNS && lastExtracted.marque && !everAskedClosing(history) && !lastAssistantAskedDemontage(history) && !lastAssistantAskedCity(history) && !lastAssistantAskedSolutionExplanation(history) && !lastAssistantAskedGarageType(history)) {
      return sendResponse(buildClosingQuestion(lastExtracted, metier));
    }

    // ========================================
    // OVERRIDE 9 : Réponse BDD métier
    // ========================================
    const metierResponse = buildMetierResponse(quickData, lastExtracted, metier, userTurns, history);
    if (metierResponse) {
      return sendResponse(withDataRelance(metierResponse, history));
    }

    // ========================================
    // OVERRIDE 10 : Snippet technique
    // ========================================
    const snippetResponse = buildSnippetResponse(quickData, lastExtracted, metier);
    if (snippetResponse) {
      return sendResponse(snippetResponse);
    }

    // ========================================
    // LLM PATH : Mistral — FALLBACK
    // ========================================
    let flowHint = null;
    if (!lastExtracted.marque && !lastAssistantAskedVehicle(history) && !everAskedModel(history)) {
      flowHint = "Demande la marque et le modèle du véhicule. UNE SEULE question.";
    } else if (!lastExtracted.marque && (lastAssistantAskedVehicle(history) || everAskedModel(history))) {
      flowHint = "L'utilisateur a peut-être déjà mentionné sa marque. Relis l'historique. Sinon, demande-la UNE DERNIÈRE FOIS.";
    } else if (!lastExtracted.previous_attempts && !everAskedPreviousAttempts(history)) {
      flowHint = "Demande si l'utilisateur a déjà essayé quelque chose (additif, garage, etc.)";
    }

    const facts = buildFacts(metier, quickData, lastExtracted, flowHint);
    const messagesForMistral = [{ role: "system", content: SYSTEM_PROMPT + facts }];
    if (Array.isArray(history)) {
      for (const msg of history) {
        if (msg.role === "user") {
          messagesForMistral.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          const clean = cleanReplyForUI(msg.raw || msg.content);
          if (clean) messagesForMistral.push({ role: "assistant", content: clean });
        }
      }
    }
    messagesForMistral.push({ role: "user", content: message });

    const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: JSON.stringify({ model: process.env.MISTRAL_MODEL || "mistral-small-latest", messages: messagesForMistral, temperature: 0.4, max_tokens: 250 }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return res.status(500).json({ error: "Erreur Mistral API", details: errText });
    }

    const mistralData = await mistralResponse.json();
    let replyFull = mistralData.choices?.[0]?.message?.content || "";
    const rawExtracted = extractDataFromReply(replyFull) || DEFAULT_DATA;
    const extracted = mergeExtractedData(lastExtracted, rawExtracted, message, quickData);

    if (metier.routing && extracted.certitude_fap === "inconnue") {
      extracted.certitude_fap = metier.routing.certitude_fap;
    }

    let replyClean = cleanReplyForUI(replyFull);

   // FALLBACK si réponse vide
    if (!replyClean || replyClean.length < 5) {
      if (!extracted.marque) {
        replyClean = "D'accord. C'est quelle voiture ?";
        extracted.next_best_action = "demander_vehicule";
      } else if (extracted.symptome === "inconnu") {
        replyClean = "Ok. Qu'est-ce qui se passe exactement avec ta voiture ?";
      } else if (!everAskedClosing(history) && hasEnoughToClose(extracted, history)) {
        return sendResponse(buildClosingQuestion(extracted, metier));
      } else if (lastAssistantIsClosing(history)) {
        replyClean = "Pas de souci ! Si tu as d'autres questions sur ton FAP, n'hésite pas.";
        extracted.next_best_action = "clore";
      } else {
        replyClean = "Si tu as d'autres infos sur le problème (codes erreur, kilométrage...), je peux affiner le diagnostic.";
      }
    }
    replyFull = `${replyClean}\nDATA: ${safeJsonStringify(extracted)}`;

    // SÉCURITÉ : Bloquer TOUS les closings prématurés de Mistral
    const isMistralClosing = /on est l[àa] pour t.aider/i.test(replyClean);
    const isMistralExpertClosing =
      (/expert re-fap/i.test(replyClean) && (/gratuit/i.test(replyClean) || /sans engagement/i.test(replyClean))) &&
      !everGaveExpertOrientation(history);
    const hasRule8Violation = /1500|remplacement/i.test(replyClean);
    if (isMistralClosing || isMistralExpertClosing) {
      if (!extracted.marque) {
        return sendResponse(buildVehicleQuestion(extracted));
      }
      if (!extracted.modele && !everAskedModel(history)) {
        return sendResponse(buildModelQuestion(extracted));
      }
      if (!extracted.kilometrage && !everAskedKm(history)) {
        return sendResponse(buildKmQuestion(extracted));
      }
      if (!extracted.previous_attempts && !everAskedPreviousAttempts(history)) {
        return sendResponse(buildPreviousAttemptsQuestion(extracted, metier));
      }
      if (!everGaveExpertOrientation(history) && hasEnoughForExpertOrientation(extracted)) {
        return sendResponse(withDataRelance(buildExpertOrientation(extracted, metier), history));
      }
      return sendResponse(buildClosingQuestion(extracted, metier));
    }
    // Nettoyer violations règle 8
    if (hasRule8Violation) {
      replyClean = replyClean
        .replace(/\s*\(?99[- ]?149\s*€?\s*vs\s*1500\s*€?\+?\s*(pour\s+un\s+)?remplacement\)?/gi, "")
        .replace(/\s*vs\s*1500\s*€?\+?\s*(pour\s+un\s+)?remplacement/gi, "")
        .replace(/\s*au\s+lieu\s+de\s+1500\s*€?\+?\s*(pour\s+un\s+)?remplacement/gi, "")
        .replace(/\s*\(bien\s+moins\s+qu.un\s+remplacement\)/gi, "")
        .trim();
      replyFull = `${replyClean}\nDATA: ${safeJsonStringify(extracted)}`;
    }

    // Intercepter question multi (moteur+année+km en 1)
    const asksMultipleThings = /moteur.*ann[eé]e.*kilom[eé]trage|ann[eé]e.*moteur.*km|mod[eè]le.*ann[eé]e.*km/i.test(replyClean);
    if (asksMultipleThings && extracted.marque) {
      if (!extracted.modele && !everAskedModel(history)) {
        return sendResponse(buildModelQuestion(extracted));
      }
      if (!extracted.kilometrage && !everAskedKm(history)) {
        return sendResponse(buildKmQuestion(extracted));
      }
    }

    // Filet de sécurité : closing sans véhicule
    const looksLikeClosing = /expert re-fap/i.test(replyClean) && (/gratuit/i.test(replyClean) || /sans engagement/i.test(replyClean));
    if (looksLikeClosing && !extracted.marque) {
      return sendResponse(buildVehicleQuestion(extracted));
    }

    // AUTO-CLOSE
    if (
      hasEnoughToClose(extracted, history) && !everAskedClosing(history) &&
      !lastAssistantAskedDemontage(history) && !lastAssistantAskedCity(history) &&
      !lastAssistantAskedSolutionExplanation(history) && !lastAssistantAskedGarageType(history) &&
      (everAskedPreviousAttempts(history) || extracted.previous_attempts || userTurns >= 4)
    ) {
      if (!everGaveExpertOrientation(history) && hasEnoughForExpertOrientation(extracted)) {
        return sendResponse(withDataRelance(buildExpertOrientation(extracted, metier), history));
      } else if (!everGaveExpertOrientation(history) && !extracted.kilometrage && !everAskedKm(history)) {
        return sendResponse(buildKmQuestion(extracted));
      } else if (!everGaveExpertOrientation(history)) {
        // Km demandé mais pas répondu → expert orientation en mode dégradé
        return sendResponse(withDataRelance(buildExpertOrientation(extracted, metier), history));
      } else {
        return sendResponse(buildClosingQuestion(extracted, metier));
      }
    }

    // RÉPONSE NORMALE
    const response = { replyClean, replyFull, extracted };
    return sendResponse(response);

  } catch (error) {
    console.error("❌ Erreur handler chat:", error);
    return res.status(500).json({ error: "Erreur serveur interne", details: error.message });
  }
}

















