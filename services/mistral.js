// services/mistral.js
import OpenAI from "openai";
import { RF_SCHEMA, SYSTEM_PROMPT } from "../constants/contract.js";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function askModel(messages) {
  // messages = [{role:'user'|'system'|'assistant', content:'...'}]
  const sys = { role: "system", content: SYSTEM_PROMPT };
  try {
    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [sys, ...messages],
      response_format: { type: "json_schema", json_schema: RF_SCHEMA },
      max_output_tokens: 700
    });

    // Selon SDK, la sortie peut être parsée déjà ou sous .text
    const c = resp.output?.[0]?.content?.[0];
    const parsed = resp.output_parsed ?? (c?.type === "output_text" ? JSON.parse(c.text) : null);
    return parsed ?? c; // laisser le front tolérer via extractBotPayload
  } catch (e) {
    // Fallback: relancer en "force JSON" simple
    const force = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [sys, ...messages, {role:"system", content:"Réponds STRICTEMENT en JSON valide conforme au schéma."}],
      max_output_tokens: 700
    });
    const c2 = force.output?.[0]?.content?.[0];
    return c2?.text ?? c2 ?? { stage:"triage", title:"Erreur", summary:"Réessaie" };
  }
}
