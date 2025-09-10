// lib/engine.js
// Mode "no-OOD": tout ce qui n'est pas explicitement FAP passe en DIAG.

import { detectCategory, needsTriage } from './detect';
import { buildSystemPrompt } from './prompt';
import { fallbackTriage, fallbackAnswer } from './fallbacks'; // ⚠️ pas de fallbackOOD
import postProcess from './postprocess';
import { chatCompletion } from '../services/mistral';

const VERSION = '3.6-no-ood';

export async function handleChat({ question, historique }) {
  const q = String(question || '').trim();

  // 1) FAP vs DIAG uniquement
  const base = detectCategory(q);
  const category = (base === 'FAP') ? 'FAP' : 'DIAG';

  if (process.env.NODE_ENV !== 'production') {
    console.log('[AutoAI]', { q, category });
  }

  // 2) Triage si message court/vague
  const triage = needsTriage(category, q, historique);
  const system = buildSystemPrompt(category, historique, triage);

  // 3) Appel LLM avec fallback local
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

  // 4) Post-traitement compact
  reply = postProcess(reply, category);

  // 5) UI hint
  const nextAction = { type: triage ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE') : category };
  return { reply, nextAction, promptVersion: VERSION };
}
