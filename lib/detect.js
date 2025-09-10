// lib/detect.js
// Détection robuste de catégorie + triage, tolérante aux fautes et accents.

function norm(s = '') {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // retire accents
    .replace(/\s+/g, ' ')
    .trim();
}

const FAP_TERMS = [
  'fap','dpf','filtre a particules','filtre a particule','filtre particules',
  'p2002','p2463','colmatage','regeneration','regenerations','regenere','voyant fap',
  'differentiel pression','capteur differentiel','contre pression'
];

const AUTO_TERMS = [
  // voyants + variations
  'voyant','voyant moteur','check engine','service','temoin','temoins',
  'voyant orange','voyant qui clignote','voyant qui clignotte','clignote','clignotte',
  // symptômes courants
  'vibration','vibrations','tremble','roulement','bruit','sifflement','claquement',
  'perte de puissance','mode degrade','fume','fumee','odeur brule','odeur de brule',
  'demarre pas','demarrage difficile','calle','calle souvent','boite','boite de vitesses',
  'embrayage','frein','direction','parallellisme','parallellisme','train roulant',
  'turbo','egr','vanne egr','injecteur','injecteurs','capteur','adblue','debimetre','sonde',
  'vidange','huile','liquide refroidissement','pneus','pression pneus','jante','equilibrage'
];

const CONTEXT_AUTO_HINTS = [
  'voiture','auto','vehicule','vehicule','peugeot','renault','dacia','citroen','vw','volkswagen','audi','bmw','mercedes','toyota','ford','fiat'
];

// sujets explicitement hors périmètre
const NON_AUTO_PROBES = [
  'recette','cuisine','poulet basquaise','basquaise','poeme','poème','musique','film',
  'jeu video','jeu vidéo','voyage','tourisme','hotel','hôtel','restaurant','foot','football'
];

// Détecte un code OBD (P0xxx, P2xxx…)
function hasObdCode(t) {
  return /\bp[0-9]{3,4}\b/i.test(t);
}

export function detectCategory(text = '') {
  const t = norm(text);

  // 1) FAP en priorité
  if (FAP_TERMS.some(w => t.includes(w)) || /\bp2(0|4)\d{2}\b/.test(t)) {
    return 'FAP';
  }

  // 2) Indices auto généraux
  if (AUTO_TERMS.some(w => t.includes(w)) || CONTEXT_AUTO_HINTS.some(w => t.includes(w)) || hasObdCode(t)) {
    return 'DIAG';
  }

  // 3) Clairement hors auto ?
  if (NON_AUTO_PROBES.some(w => t.includes(w))) {
    return 'OOD';
  }

  // 4) Par défaut → DIAG (surtout pas OOD : on reste utile)
  return 'DIAG';
}

// Heuristique : triage si question courte/vague ou premier message
export function needsTriage(category, question = '', historique = '') {
  const q = norm(question);
  if (category === 'FAP') {
    return q.length < 30 || /^(fap|p2002|p2463)\b/.test(q);
  }
  if (category === 'DIAG') {
    // triage si très court ou si pas d’indice fort
    return q.length < 25 || !/(90|110|130|vibration|bruit|voyant|p[0-9]{3,4})/.test(q);
  }
  return false;
}
