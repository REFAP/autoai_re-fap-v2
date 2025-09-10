// lib/detect.js
// Détection minimaliste et robuste : FAP sinon DIAG. Jamais OOD.

function norm(s = '') {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents
    .replace(/\s+/g, ' ')
    .trim();
}

const FAP_TERMS = [
  'fap','dpf','filtre a particules','filtre particule','filtre particules',
  'p2002','p2463','colmatage','regeneration','regenerations','regenere',
  'voyant fap','differentiel pression','capteur differentiel','contre pression'
];

// Détecte un code OBD P2xxx ou P2002
function hasFapObd(t) {
  return /\bp2(0|4)\d{2}\b/i.test(t) || /\bp2002\b/i.test(t) || /\bp2463\b/i.test(t);
}

export function detectCategory(text = '') {
  const t = norm(text);
  if (FAP_TERMS.some(w => t.includes(w)) || hasFapObd(t)) return 'FAP';
  return 'DIAG'; // défaut utile
}

// Heuristique : triage si message court/vague
export function needsTriage(category, question = '', _historique = '') {
  const q = norm(question);
  if (category === 'FAP') return q.length < 30 || /^(fap|p2002|p2463)\b/.test(q);
  if (category === 'DIAG') return q.length < 25 || !/(90|110|130|vibration|bruit|voyant|p[0-9]{3,4})/.test(q);
  return false;
}
