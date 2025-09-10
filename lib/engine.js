// lib/engine.js
import { detectCategory, needsTriage } from './detect.js';
import { buildSystemPrompt } from './prompt.js';
import { fallbackTriage, fallbackAnswer, fallbackOOD } from './fallbacks.js';
import postProcess from './postprocess.js';
import { chatCompletion } from '../services/mistral.js';

const VERSION = '3.2-clean';

// garde-fou : jamais "Carter-Cash" hors FAP
function sanitizeNonFAP(text) {
  return String(text || '').replace(/carter-?cash/gi, 'garage');
}

export async function handleChat({ question, historique }) {
  const q = String(question || '').trim();
  const category = detectCategory(q);

  // Out-Of-Domain : on recentre sans appeler l'API
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
        { role: 'user', content: q },
      ],
      {
        max_tokens: triage ? 220 : 340,
        temperature: 0.2,
        top_p: 0.6,
      },
    );
  } catch {
    reply = triage ? fallbackTriage(category) : fallbackAnswer(category);
  }

  // Post-traitement compact & lisible (titres, italiques, sauts, trim)
  reply = postProcess(reply, category);

  // garde-fou anti Carter-Cash hors FAP
  if (category !== 'FAP') reply = sanitizeNonFAP(reply);

  const nextAction = {
    type: triage
      ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE')
      : category,
  };

  return { reply, nextAction, promptVersion: VERSION };
}
