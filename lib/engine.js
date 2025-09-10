// lib/engine.js
import { detectCategory, needsTriage } from './detect';
import { buildSystemPrompt } from './prompt';
import { fallbackTriage, fallbackAnswer, fallbackOOD } from './fallbacks';
import postProcess from './postprocess';
import { chatCompletion } from '../services/mistral';

const VERSION = '3.3-detect-log';

export async function handleChat({ question, historique }) {
  const q = String(question || '').trim();
  const category = detectCategory(q);

  // LOG DEBUG (visible dans la console du serveur)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AutoAI] question=', q, '| category=', category);
  }

  // Hors périmètre : recentrer sans ping l'API
  if (category === 'OOD') {
    const reply = fallbackOOD();
    return { reply, nextAction: { type: 'OOD' }, promptVersion: VERSION };
  }

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
    reply = triage ? fallbackTriage(category) : fallbackAnswer(category);
  }

  // Post-traitement unique et compact
  reply = postProcess(reply, category);

  const nextAction = {
    type: triage ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE') : category
  };
  return { reply, nextAction, promptVersion: VERSION };
}
