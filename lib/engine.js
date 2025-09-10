<<<<<<< Updated upstream
// lib/engine.js
import { detectCategory, needsTriage } from './detect.js';
import { buildSystemPrompt } from './prompt.js';
import { fallbackTriage, fallbackAnswer } from './fallbacks.js';
import postProcess from './postprocess.js';
import { chatCompletion } from '../services/mistral.js';
import { clampCategory, buildCTAs, guardReply } from './policies.js';

const VERSION = '4.0-stable-core';

export async function handleChat({ question, historique }) {
  const q = String(question || '').trim();

  // 1) Catégorie minimisée (FAP vs DIAG, jamais OOD)
  const category = clampCategory(detectCategory(q));

  // 2) Triage si question courte/vague
  const triage = needsTriage(category, q, historique);

  // 3) Prompt système
  const system = buildSystemPrompt(category, historique, triage);

  // 4) Appel modèle + fallback
  let reply;
  try {
    reply = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: q }
      ],
      { max_tokens: triage ? 220 : 340, temperature: 0.2, top_p: 0.6 }
    );
  } catch {
    reply = triage ? fallbackTriage(category) : fallbackAnswer(category);
  }

  // 5) Garde-fous + post-traitement
  reply = guardReply(category, triage, reply);
  reply = postProcess(reply, category);

  // 6) CTAs inline (affichés sous la bulle côté UI)
  const ctas = buildCTAs(category, triage);

  return {
    reply,
    nextAction: { type: triage ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE') : category, ctas },
    promptVersion: VERSION
  };
=======
﻿import { detectCategory, needsTriage } from "./detect";
import { buildSystemPrompt } from "./prompt";
import { fallbackTriage, fallbackAnswer } from "./fallbacks"; // ❌ pas de fallbackOOD
import postProcess from "./postprocess";
import { chatCompletion } from "../services/mistral";

const VERSION = "3.6-no-ood";

export async function handleChat({ question, historique }) {
  const q = String(question || "").trim();

  // 1) FAP vs DIAG uniquement (on neutralise toute idée d'OOD)
  const base = detectCategory(q);
  const category = base === "FAP" ? "FAP" : "DIAG";

  if (process.env.NODE_ENV !== "production") {
    console.log("[AutoAI]", { q, category });
  }

  // 2) Triage (questions courtes) si message court/vague
  const triage = needsTriage(category, q, historique);
  const system = buildSystemPrompt(category, historique, triage);

  // 3) Appel LLM avec fallback local (jamais OOD)
  let reply;
  try {
    reply = await chatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: q },
      ],
      { max_tokens: triage ? 220 : 340, temperature: 0.2, top_p: 0.6 }
    );
  } catch {
    reply = triage ? fallbackTriage(category) : fallbackAnswer(category);
  }

  // 4) Post-traitement compact
  reply = postProcess(reply, category);

  // 5) Hint UI
  const nextAction = {
    type: triage ? (category === "FAP" ? "FAP_TRIAGE" : "DIAG_TRIAGE") : category,
  };
  return { reply, nextAction, promptVersion: VERSION };
>>>>>>> Stashed changes
}
