// services/mistral.js — Mistral only, JSON enforced (2-pass) + heuristic fallback
import { MistralClient } from "@mistralai/mistralai";
import { RF_SCHEMA, SYSTEM_PROMPT } from "../constants/contract.js";
import { extractBotPayload } from "../lib/fallbacks.js";

// --- Client & modèle ---
const client = new MistralClient(
  process.env.MISTRAL_API_KEY || process.env.MISTRAL_TOKEN || ""
);
const MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";

// ---------- Utils ----------
function safeParse(str) {
  try {
    return typeof str === "object" ? str : JSON.parse(str);
  } catch {
    return null;
  }
}
function isValidPayload(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    obj.stage &&
    obj.title &&
    obj.summary &&
    obj.risk &&
    obj.cta &&
    obj.cta.url
  );
}

// ---------- Pass 2: forcer la sortie JSON ----------
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
          "Validateur JSON strict. Réponds UNIQUEMENT par un objet JSON conforme au schéma. Aucun texte hors JSON."
      },
      {
        role: "user",
        content:
          "Schéma:\n" +
          schemaText +
          "\n\nConvertis ce brouillon en JSON strict:\n" +
          String(draft)
      }
    ]
  });
  return resp?.choices?.[0]?.message?.content ?? "";
}

// ---------- Secours heuristique ----------
function heuristicFromMessages(messages) {
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ||
    "";
  const yes = (re) => re.test(lastUser);

  const q1 = yes(/voyant|fap|moteur/i);
  const q2 = yes(/fum(é|e)e?\s*noire|fumee noire/i);
  const q3 = yes(/perte de puissance|mode dégrad/i);
  const score = [q1, q2, q3].filter(Boolean).length;

  const suspected = score >= 2 ? ["FAP"] : ["Non-FAP: à confirmer"];
  const risk = score >= 2 ? "moderate" : "low";

  const cta =
    score >= 2
      ? {
          label: "Prendre un diag + démontage (garage partenaire)",
          url: "https://re-fap.fr/trouver_garage_partenaire/",
          reason: "Valider FAP et éviter le mode dégradé."
        }
      : {
          label: "Confirmer la panne (garage partenaire)",
          url:
            "https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique",
          reason: "Diagnostic complet."
        };

  return {
    stage: "diagnosis",
    title: suspected[0] === "FAP" ? "FAP possiblement encrassé" : "Panne à confirmer",
    summary:
      suspected[0] === "FAP"
        ? "Fumée noire + perte de puissance → régénération bloquée ou filtre saturé."
        : "Symptômes non conclusifs sur le FAP. On vérifie chez un partenaire.",
    questions: [],
    suspected,
    risk,
    actions:
      suspected[0] === "FAP"
        ? [
            "Rouler 20–30 min à 2500–3000 tr/min (voie rapide) pour tenter une régénération.",
            "Contrôler capteur pression différentielle + admissions (fuites).",
            "Si voyant/clignote ou aucun effet → passer au garage partenaire."
          ]
        : [
            "Lire les codes défauts (OBD) pour cibler admission/allumage/sondes.",
            "Éviter trajets courts jusqu’au diagnostic."
          ],
    cta,
    alt_cta: [
      {
        label: "FAP déjà démonté ? Envoyer chez Re-FAP",
        url: "https://www.re-fap.fr",
        reason: "Nettoyage direct si FAP déposé."
      }
    ],
    follow_up: ["Odeur de brûlé ou bruit métallique ? (oui/non)"],
    legal: "Pas de suppression FAP (illégal). Arrêt immédiat si odeur de brûlé."
  };
}

// ---------- API principale ----------
export async function askModel(messages = []) {
  const schemaText = JSON.stringify(RF_SCHEMA.schema);
  const sys = {
    role: "system",
    content:
      SYSTEM_PROMPT +
      "\n\nIMPORTANT: Réponds STRICTEMENT en JSON valide (un seul objet). Aucun texte hors JSON. " +
      "Respecte ce schéma:\n" +
      schemaText
  };

  try {
    // Pass 1 — on demande le JSON directement
    const r1 = await client.chat.complete({
      model: MODEL,
      temperature: 0.2,
      maxTokens: 800,
      messages: [sys, ...messages]
    });
    const draft = r1?.choices?.[0]?.message?.content ?? "";

    // Parse tolérant
    let payload = safeParse(draft);
    if (!payload) {
      try {
        payload = extractBotPayload(draft);
      } catch {
        /* ignore */
      }
    }
    if (isValidPayload(payload)) return payload;

    // Pass 2 — on force la conversion en JSON strict
    const forced = await forceJsonFromDraft(draft);
    payload = safeParse(forced);
    if (!payload) {
      try {
        payload = extractBotPayload(forced);
      } catch {
        /* ignore */
      }
    }
    if (isValidPayload(payload)) return payload;

    // Secours
    return heuristicFromMessages(messages);
  } catch (e) {
    console.error("[Mistral] askModel error:", e);
    return heuristicFromMessages(messages);
  }
}
