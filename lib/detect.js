// lib/detect.js
// Détection simple de catégorie + besoin de triage.

const FAP_TERMS = [
  'fap', 'dpf', 'filtre à particules', 'filtre a particules',
  'p2002', 'p2463', 'colmatage', 'régénération', 'regeneration', 'voyant fap'
];

const AUTO_TERMS = [
  'vibration', 'vibrations', 'tremble', 'roulement', 'bruit',
  'turbo', 'egr', 'injecteur', 'capteur', 'adblue',
  'voyant', 'moteur', 'frein', 'embrayage', 'direction', 'boîte', 'boite',
  'perte de puissance', 'démarre pas', 'demarre pas', 'fumée', 'fumee'
];

const NON_AUTO_PROBES = [
  'recette', 'poulet basquaise', 'cuisine', 'film', 'musique', 'poème', 'poeme',
  'voyage', 'foot', 'jeu vidéo', 'jeu video'
];

export function detectCategory(text = '') {
  const t = String(text || '').toLowerCase();

  if (FAP_TERMS.some(w => t.includes(w))) return 'FAP';
  if (NON_AUTO_PROBES.some(w => t.includes(w))) return 'OOD';
  if (AUTO_TERMS.some(w => t.includes(w))) return 'DIAG';

  // si rien de clair mais pas manifestement hors domaine : diag générique
  return 'DIAG';
}

// Heuristique : on “triage” si la question est très courte / vague
// ou si c’est un premier message sans assez d’indices.
export function needsTriage(category, question = '', historique = '') {
  const q = String(question || '').trim().toLowerCase();
  if (category === 'FAP') {
    // “fap”, “voyant fap”, code seul, etc. => poser d’abord 3–4 questions clés
    return q.length < 30 || /^(fap|p2002|p2463)\b/.test(q);
  }
  if (category === 'DIAG') {
    return q.length < 25 || !/\b(90|110|accél|vibration|bruit|fum|voyant)\b/.test(q);
  }
  return false;
}
