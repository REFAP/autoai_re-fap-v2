// lib/engine.js
import { detectCategory, needsTriage, AUTO_HINTS, NON_AUTO_PROBES } from './detect';
import { buildSystemPrompt } from './prompt';
import { fallbackTriage, fallbackAnswer, fallbackOOD } from './fallbacks';
import postProcess from './postprocess';
import { chatCompletion } from '../services/mistral';

const VERSION = '3.4-ood-safety';

// petite normalisation locale
function norm(s='') {
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

// pare-feu : on n'accepte OOD que si c'est clairement non-auto
function forceAutoIfAmbiguous(originalQuestion, cat) {
  if (cat !== 'OOD') return cat;
  const t = norm(originalQuestion);
  const hasAuto = AUTO_HINTS.some(w => t.includes(w)) || /\bp[0-9]{3,4}\b/i.test(t);
  const isNonAuto = NON_AUTO_PROBES.some(w => t.includes(w));
  // S'il y a un indice auto, on casse OOD => DIAG
  if (hasAuto) return 'DIAG';
  // Non-auto sans ambiguïté => OOD, sinon DIAG par défaut
  return isNonAuto ? 'OOD' : 'DIAG';
}

export async function handleChat({ question, historique }) {
  const q = String(question || '').trim();

  let category = detectCategory(q);
  category = forceAutoIfAmbiguous(q, category);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[AutoAI] q=', q, '| category=', category);
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
