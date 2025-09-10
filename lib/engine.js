// lib/engine.js
// Patch "no-OOD": tout ce qui n'est pas explicitement FAP passe en DIAG.
// Objectif: stopper les faux positifs OOD (ex. "voyant orange qui clignotte").

import { detectCategory, needsTriage } from './detect';
import { buildSystemPrompt } from './prompt';
import { fallbackTriage, fallbackAnswer } from './fallbacks'; // plus de fallbackOOD ici
import postProcess from './postprocess';
import { chatCompletion } from '../services/mistral';

const VERSION = '3.5-no-ood';

export async function handleChat({ question, historique }) {
  const q = String(question || '').trim();

  // 1) Détection FAP vs reste
  let category = detectCategory(q);
  // 2) Pare-feu: on neutralise totalement OOD (hors périmètre)
  category = (category === 'FAP') ? 'FAP' : 'DIAG';

  // Log debug (console du serveur)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AutoAI]', { q, category });
  }

  // Triage (questions courtes) si message vague/court
  const triage = needsTriage(category, q, historique);
  const system = buildSystemPrompt(category, historique, triage);

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
    // Fallback local (jamais OOD)
    reply = triage ? fallbackTriage(category) : fallbackAnswer(category);
  }

  // Post-traitement (format court, lisible)
  reply = postProcess(reply, category);

  const nextAction = {
    type: triage ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE') : category
  };
  return { reply, nextAction, promptVersion: VERSION };
}
