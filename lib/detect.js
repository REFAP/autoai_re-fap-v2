// lib/detect.js
// Détection robuste + triage, tolérante fautes/accents. Par défaut => DIAG.

function norm(s = '') {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents (sans \p{Diacritic})
    .replace(/\s+/g, ' ')
    .trim();
}

// Indices FAP
const FAP_TERMS = [
  'fap','dpf','filtre a particules','filtre particule',
  'p2002','p2463','colmatage','regeneration','regenerations','regenere','voyant fap',
  'differentiel pression','capteur differentiel','contre pression'
];

// Indices “auto” (voyants, symptomes, pieces)
export const AUTO_HINTS = [
  'voyant','voyant moteur','voyant orange','voyant qui clignote','voyant qui clignotte',
  'temoin','check engine','service',
  'vibration','vibrations','tremble','roulement','bruit','sifflement','claquement',
  'perte de puissance','mode degrade','fume','fumee','odeur brule','odeur de brule',
  'demarre pas','demarrage difficile','calle','boite','boite de vitesses',
  'embrayage','frein','direction','parallelisme','train roulant',
  'turbo','egr','vanne egr','injecteur','injecteurs','capteur','adblue','debimetre','sonde',
  'vidange','huile','liquide refroidissement','pneus','pression pneus','jante','equilibrage',
  'voiture','auto','vehicule','vehicule'
];

// Sujets clairement non-auto
export const NON_AUTO_PROBES = [
  'recette','cuisine','poulet basquaise','basquaise',
  'poeme','poème','musique','film',
  'jeu video','jeu vidéo',
  'voyage','tourisme','hotel','hôtel','restaurant',
  'foot','football'
];

// Code OBD (P0xxx, P2xxx…)
function hasObdCode(t) {
  return /\bp[0-9]{3,4}\b/i.test(t);
}

export function detectCategory(text = '') {
  const t = norm(text);

  // 1) FAP prioritaire
  if (FAP_TERMS.some(w => t.includes(w)) || /\bp2(0|4)\d{2}\b/.test(t)) {
    return 'FAP';
  }

  // 2) Auto générique ?
  if (AUTO_HINTS.some(w => t.includes(w)) || hasObdCode(t)) {
    return 'DIAG';
  }

  // 3) Non-auto clair ET aucun indice auto => OOD
  if (NON_AUTO_PROBES.some(w => t.includes(w))) {
    return 'OOD';
  }

  // 4) Par défaut on reste utile => DIAG
  return 'DIAG';
}

// Heuristique triage (poser d’abord des questions)
export function needsTriage(category, question = '', _historique = '') {
  const q = norm(question);
  if (category === 'FAP') {
    return q.length < 30 || /^(fap|p2002|p2463)\b/.test(q);
  }
  if (category === 'DIAG') {
    return q.length < 25 || !/(90|110|130|vibration|bruit|voyant|p[0-9]{3,4})/.test(q);
  }
  return false;
}
