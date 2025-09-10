// lib/engine.js
import { detectCategory, needsTriage } from './detect';
import { buildSystemPrompt } from './prompt';
import { fallbackTriage, fallbackAnswer, fallbackOOD } from './fallbacks';
import {
  stripMarkers, banEmojisAndNumbers, fixColonBreaks, collapseSoftBreaks,
  enforceSections, normalizeBullets, capBullets, lengthCap,
  ensureFapBenefits, ensureFapYesNo, removeQuestionFinale, ensureLeadGarage,
  sanitizeReplyNonFAP
} from './postprocess';
import { chatCompletion } from '../services/mistral';

const VERSION = '3.1-mod-arch';

export async function handleChat({ question, historique }) {
  const q = String(question || '').trim();
  const category = detectCategory(q);

  // OOD : on ne spamme pas l’API, on recentre proprement
  if (category === 'OOD') {
    const reply = fallbackOOD();
    return { reply, nextAction: { type: 'OOD' }, promptVersion: VERSION };
  }

  const triage = needsTriage(category, q, historique);
  const system = buildSystemPrompt(category, historique, triage);

  let reply;
  try {
    reply = await chatCompletion(
      [{ role: 'system', content: system }, { role: 'user', content: q }],
      { max_tokens: triage ? 220 : 340 }
    );
  } catch {
    reply = triage ? fallbackTriage(category) : fallbackAnswer(category);
  }

  // Post-traitement (format court, lisible)
  reply = stripMarkers(reply);
  reply = banEmojisAndNumbers(reply);
  reply = fixColonBreaks(reply);
  reply = collapseSoftBreaks(reply);
  reply = enforceSections(reply);
  reply = normalizeBullets(reply);
  reply = capBullets(reply, 5);
  reply = lengthCap(reply, 1200);

  if (category === 'FAP') {
    reply = ensureFapBenefits(reply); // avantages nettoyage (éco/écolo/≈neuf)
    reply = ensureFapYesNo(reply);    // Oui → Carter-Cash, Non → Garage
  } else {
    reply = removeQuestionFinale(reply); // jamais de question finale en DIAG
    reply = ensureLeadGarage(reply);     // CTA direct immat+CP → devis + RDV
    reply = sanitizeReplyNonFAP(reply);  // sécurité anti Carter-Cash hors FAP
  }

  const nextAction = { type: triage ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE') : category };
  return { reply, nextAction, promptVersion: VERSION };
}
