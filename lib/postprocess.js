// lib/postprocess.js
// Utilitaires de nettoyage / normalisation du Markdown généré par le bot.
// -> Objectif : un rendu compact, lisible, sans fioritures.

//
// 1) Ajoute un saut de ligne après chaque titre (## ou ###) s’il manque.
//
export function ensureHeadingNewlines(text) {
  const t = String(text || '');
  return t.replace(/^(#{2,3}\s+[^\n]+)\s+(?!\n)/gm, '$1\n');
}

//
// 2) Supprime les italiques *texte* (on garde **gras**).
//    But : éviter les alternances *...* qui réduisent la lisibilité sur mobile.
//
export function stripSingleItalics(text) {
  const t = String(text || '');
  return t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
}

//
// 3) Réduit les sauts de ligne multiples (≥ 3) en doubles sauts de ligne.
//
export function squeezeBlankLines(text) {
  const t = String(text || '');
  return t.replace(/\n{3,}/g, '\n\n');
}

//
// 4) Supprime les espaces de fin de ligne et trim global.
//
export function trimWhitespace(text) {
  const t = String(text || '');
  return t.replace(/[ \t]+\n/g, '\n').trim();
}

//
// Post-traitement principal appelé par l’engine.
//
export function postProcess(text, _category = 'GEN') {
  let out = String(text || '');

  out = ensureHeadingNewlines(out);
  out = stripSingleItalics(out);
  out = squeezeBlankLines(out);
  out = trimWhitespace(out);

  if (!out) {
    out =
      "Désolé, je n’ai pas pu formuler une réponse. Réessaie en précisant les symptômes (voyant, fumée, perte de puissance, etc.).";
  }
  return out;
}

// Export par défaut pratique pour l’engine.
export default postProcess;
