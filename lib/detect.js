// lib/detect.js
export function detectCategory(text = '') {
  const t = text.toLowerCase();

  const FAP = [
    'fap','dpf','p2463','p2002','regeneration','régénération','suie',
    'filtre à particules','filtre a particules','colmatage','voyant fap'
  ];
  if (FAP.some(w => t.includes(w))) return 'FAP';

  const DIAG = [
    'vibration','vibre','tremble','roulement','bruit','turbo','fumée','fumee','egr',
    'capteur','injecteur','adblue','démarre pas','demarre pas','perte de puissance',
    'frein','freinage','embrayage','boite','boîte','pneu','direction','volant'
  ];
  if (DIAG.some(w => t.includes(w))) return 'DIAG';

  // indices "auto" larges ; si rien de tout ça → OOD (hors domaine)
  const AUTO_HINTS = ['voiture','auto','moteur','garage','code p','obd','réparation','panne'];
  if (!AUTO_HINTS.some(w => t.includes(w))) return 'OOD';

  return 'DIAG';
}

export function needsTriage(category, q = '', historique = '') {
  const txt = (q + ' ' + (historique || '')).toLowerCase();
  const short = q.trim().length < 20;

  if (category === 'FAP') {
    const hasDetail = /(p2463|p2002|voyant|code|diag|perte de puissance|fum[ée]e|r[ée]g[ée]n[ée]ration)/.test(txt);
    return short || !hasDetail;
  }

  if (category === 'DIAG') {
    const vagueDiag = /(vibration|bruit|tremble)/.test(txt) &&
      !/(accélération|freinage|100|110|120|130|roue|pneu|cardan|roulement|volant)/.test(txt);
    return short || vagueDiag;
  }

  return false; // OOD : pas de triage
}
