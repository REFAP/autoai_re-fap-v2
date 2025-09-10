// services/mistral.js (Mistral API uniquement)
import { MistralClient } from "@mistralai/mistralai";
import { RF_SCHEMA, SYSTEM_PROMPT } from "../constants/contract.js";

const apiKey =
  process.env.MISTRAL_API_KEY ||
  process.env.MISTRAL_TOKEN || // au cas où
  "";

if (!apiKey) {
  console.warn("[Mistral] MISTRAL_API_KEY manquant.");
}

const client = new MistralClient(apiKey);

/**
 * Appel modèle Mistral.
 * - Force la sortie JSON par prompt (robuste, zéro feature exotique).
 * - Laisse le front parser avec extractBotPayload().
 */
export async function askModel(messages = []) {
  const model = process.env.MISTRAL_MODEL || "mistral-large-latest";

  // On ré-injecte le schéma dans le prompt pour réduire les dérapages
  const sys = {
    role: "system",
    content:
      SYSTEM_PROMPT +
      "\n\nIMPORTANT:\n" +
      "Réponds STRICTEMENT en JSON valide (un seul objet), conforme au schéma ci-dessous. " +
      "Aucun texte hors JSON.\n" +
      JSON.stringify(RF_SCHEMA.schema),
  };

  try {
    const resp = await client.chat.complete({
      model,
      messages: [sys, ...messages],
      temperature: 0.2,
      maxTokens: 700,
      // Si ta version du SDK le supporte, tu peux tester :
      // response_format: { type: "json_object" },
    });

    // Mistral renvoie { choices: [ { message: { content: "..." } } ] }
    const content = resp?.choices?.[0]?.message?.content ?? "";
    return content; // le front fera JSON.parse via extractBotPayload()
  } catch (err) {
    console.error("[Mistral] chat.complete error:", err);
    // Fallback minimal JSON pour éviter de tout casser côté front
    return JSON.stringify({
      stage: "triage",
      title: "Erreur",
      summary: "Je n’ai pas pu traiter la demande. Réessaie.",
      risk: "low",
      cta: { label: "Nous contacter", url: "https://www.re-fap.fr" },
      legal: "Pas de suppression de FAP (illégal).",
    });
  }
}
