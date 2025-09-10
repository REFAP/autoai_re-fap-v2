// lib/policies.js
// Garde-fous et politiques transverses (catégories, CTAs, sanitization).

import { getCTAs } from '../constants/cta.js';

export function clampCategory(base) {
  // "no-OOD": tout ce qui n'est pas explicitement FAP => DIAG
  return base === 'FAP' ? 'FAP' : 'DIAG';
}

export function buildCTAs(category, triage) {
  return getCTAs(category, triage);
}

export function guardReply(category, triage, text) {
  let out = String(text || '');

  // Jamais de Carter-Cash / nettoyage FAP hors FAP
  if (category !== 'FAP') {
    out = out.replace(/carter-?cash/gi, 'garage');
    out = out.replace(/nettoyage\s+(re-?fap|du\s+fap|fap)/gi, 'diagnostic en garage');
  }
  // Pas de CTA textuels en phase triage (les boutons sont gérés par l'UI)
  if (triage) {
    out = out.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '$1');
  }
  return out;
}
