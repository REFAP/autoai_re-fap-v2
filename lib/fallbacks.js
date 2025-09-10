// lib/fallbacks.js
// Fallback minimalistes et alignés avec le prompt : triage strict, réponses courtes.
// AUCUNE italique, PAS de liens ici (les boutons sont gérés par l’UI).

export function fallbackTriage(category = 'DIAG') {
  if (category === 'FAP') {
    return [
      '## Questions rapides FAP',
      'Réponds **OUI/NON** (ou "je ne sais pas") à chaque point :',
      '1) Voyant **FAP** ou **moteur** allumé au tableau de bord ?',
      '2) **Perte de puissance** ou **mode dégradé** récent ?',
      '3) **Fumée noire** à l’échappement récemment ?',
      '4) Dernier **trajet autoroute** > 30 min à ~2500 tr/min dans les **200 derniers km** ?',
      '',
      '**Réponds OUI/NON à chaque point (ou "je ne sais pas").**'
    ].join('\n');
  }

  // DIAG générique
  return [
    '## Questions rapides',
    'Réponds brièvement :',
    '1) **Où** ressens-tu le souci (volant, siège, moteur, roues…) ?',
    '2) **Quand** ça apparaît (accélération, freinage, virage, vitesse approximative) ?',
    '3) **Depuis quand** / choc ou intervention récente ?',
    '',
    '**Réponds à ces 3 questions pour affiner.**'
  ].join('\n');
}

export function fallbackAnswer(category = 'DIAG') {
  if (category === 'FAP') {
    return [
      '## En bref',
      'Indices en faveur d’un **FAP encrassé/colmaté**.',
      '',
      '## À faire maintenant',
      '- Réduis la charge, évite les trajets très courts.',
      '- Si tu as un lecteur OBD : relève les **codes** et note les symptômes.',
      '- Prépare l’immatriculation et localise ton FAP pour l’intervention.',
      '',
      '## Prochaine étape',
      '**Le nettoyage FAP Re-FAP est généralement la meilleure option quand le FAP n’est pas endommagé : équivalent au neuf, bien moins cher (dès ~99 € TTC) et plus écologique.**',
      '',
      '**Question finale :** Sais-tu démonter ton FAP toi-même ?'
    ].join('\n');
  }

  // DIAG générique
  return [
    '## En bref',
    'Un diagnostic **mécanique/électronique** est nécessaire pour cibler la cause.',
    '',
    '## À faire maintenant',
    '- Note les conditions d’apparition (vitesse, accélération, freinage, virage).',
    '- Vérifie visuellement pneus/roues et niveaux simples.',
    '- Lis les **codes OBD** si tu peux.',
    '',
    '## Prochaine étape',
    'Lecture des codes + tests ciblés en garage.',
    '',
    '**Question finale :** Veux-tu qu’on te mette en relation avec un garage proche pour un diagnostic au meilleur prix ?'
  ].join('\n');
}

// Gardé pour compatibilité (l’engine "no-OOD" ne devrait plus l’appeler).
export function fallbackOOD() {
  return [
    '## Hors périmètre',
    'Je peux t’aider pour les **symptômes auto, voyants, FAP/DPF, codes défauts**.',
    '',
    'Dis-moi un symptôme (ex. vibrations à 110), un voyant (ex. FAP) ou un code (ex. P2002).'
  ].join('\n');
}
