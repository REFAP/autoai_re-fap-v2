// services/mistral.js — Mistral only, JSON enforced (2-pass) + heuristic fallback
import { MistralClient } from "@mistralai/mistralai";
import { RF_SCHEMA, SYSTEM_PROMPT } from "../constants/contract.js";
import { extractBotPayload } from "../lib/fallbacks.js"; // on garde ton parser tolérant

const client = new MistralClient(
  process.env.MISTRAL_API_KEY || process.env.MISTRAL_TOKEN || ""
);
const MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

// ---------- utils ----------
function safeParse(str) {
  try { return typeof str === "object" ? str : JSON.parse(str); }
  catch { return null; }
}
// vérif minimale des champs critiques
function isValidPayload(obj) {
  return obj && typeof obj === "object" &&
    obj.stage && obj.title && obj.summary && obj.risk && obj.cta && obj.cta.url;
}

// force une conversion en JSON conforme via une 2e requête
async function forceJsonFromDraft(draft) {
  const schemaText = JSON.stringify(RF_SCHEMA.schema);
  const resp = await client.chat.complete({
    model: MODEL,
    temperature: 0,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content:
          "Tu es un validateur JSON strict. Réponds UNIQUEMENT par un objet JSON valide, un seul, conforme au schéma fourni. Aucun texte hors JSON.",
      },
      {
        role: "user",
        content:
          `Schéma JSON:\n${schemaText}\n\nTransforme STRICTEMENT ce brouillon en JSON conforme (pas de prose):\n${draft}`,
      },
    ],
  });
  return resp?.choices?.[0]?.message?.content ?? "";
}

// heuristique secours si le modèle n’a rien donné d’exploitable
function heuristicFromMessages(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === "user")?.content?.toLowerCase() || "";
  const yes = (re) => re.test(lastUser);

  const q1 = yes(/voyant|fap|moteur/i);                 // voyant ?
  const q2 = yes(/fum(é|e)e?\s*noire|fumee noire/i);     // fumée noire ?
  const q3 = yes(/perte de puissance|mode dégradé|degrade/i); // perte puissance ?
  const score = [q1,q2,q3].filter(Boolean).length;

  const suspected = score >= 2 ? ["FAP"] : ["Non-FAP: à confirmer"];
  const risk = score >= 2 ? "moderate" : "low";

  const cta = score >= 2
    ? { label: "Prendre un diag + démontage (garage partenaire)", url: "https://re-fap.fr/trouver_garage_partenaire/", reason: "Valider FAP et éviter le mode dégradé." }
    : { label: "Confirmer la panne (garage partenaire)", url: "https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique", reason: "Diagnostic complet." };

  return {
    stage: "diagnosis",
    title: suspected[0] === "FAP" ? "FAP possiblement encrassé" : "Panne à confirmer",
    summary: suspected[0] === "FAP"
      ? "Fumée noire + perte de puissance → régénération bloquée ou filtre saturé."
      : "Symptômes non conclusifs sur le FAP. On vérifie chez un partenaire.",
    questions: [],
    suspected,
    risk,
    actions: suspected[0] === "FAP"
      ? [
          "Rouler 20–30 min à 2500–3000 tr/min (voie rapide) pour tenter une régénération.",
          "Contrôler capteur pression différentielle + admissions (fuites).",
          "Si voyant/clignote ou aucun effet → passer au garage partenaire."
        ]
      : [
          "Lire les codes défauts (OBD) pour cibler admission/ALL/sondes.",
          "Éviter trajets courts jusqu’au diagnostic.",
        ],
    cta,
    alt_cta: [
      { label: "FAP déjà démonté ? Envoyer chez Re-FAP", url: "https://www.re-fap.fr", reason: "Nettoyage direct si FAP déposé." }
    ],
    follow_up: ["Odeur de brûlé ou bruit métallique ? (oui/non)"],
    legal: "Pas de suppression FAP (illégal). Arrêt immédiat si odeur de brûlé."
  };
}

// ---------- API principale ----------
export async function askModel(messages = []) {
  // 1) Pass principal avec prompt JSON-only + schéma inlined
  const schemaText = JSON.stringify(RF_SCHEMA.schema);
  const sys = {
    role: "system",
    content:
      SYSTEM_PROMPT +
      "\n\nIMPORTANT: Réponds STRICTEMENT en JSON valide (un seul objet). Aucun texte hors JSON. " +
      "Respecte le schéma ci-dessous:\n" + schemaText +
      "\nExemple minimal valide:\n" +
      JSON.stringify({
        stage: "triage",
        title: "Diagnostic rapide FAP",
        summary: "Je vérifie en 5 questions oui/non.",
        questions: [{ id: "q1", q: "Voyant moteur/FAP allumé ?" }],
        suspected: [],
        risk: "low",
        actions: [],
        cta: { label: "Voir un garage partenaire", url: "https://re-fap.fr/trouver_garage_partenaire/", reason: "Utile si voyant/puissance/fumée" },
        alt_cta: [],
        follow_up: ["Réponds: 1.oui 2.non 3.oui 4.non 5.non"],
        legal: "Pas de suppression du FAP."
      })
  };

  try {
    const r1 = await client.chat.complete({
      model: MODEL,
      temperature: 0.2,
      maxTokens: 800,
      messages: [sys, ...messages],
    });
    const draft = r1?.choices?.[0]?.message?.content ?? "";

    // 1a) tentative de parse direct (tolérant)
    let payload = null;
    payload = safeParse(draft) || (function() { try { return extractBotPayload(draft); } catch { return null; } })();
    if (isValidPayload(payload)) return payload;

    // 2) Forcer la conversion JSON
    const forced = await forceJsonFromDraft(draft);
    payload = safeParse(forced) || (function() { try { return extractBotPayload(forced); } catch { return null; } })();
    if (isValidPayload(payload)) return payload;

    // 3) Secours heuristique
    return heuristicFromMessages(messages);
  } catch (e) {
    console.error("[Mistral] askModel error:", e);
    return heuristicFromMessages(messages);
  }
}
