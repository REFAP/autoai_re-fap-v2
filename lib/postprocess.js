// lib/postprocess.js
// Petits utilitaires pour nettoyer / normaliser le Markdown généré par le bot.

/**
 * Force un saut de ligne après chaque titre (## / ###) si absent.
 */
export function ensureHeadingNewlines(t) {
  return String(t || '').replace(/^(#{2,3}\s+[^\n]+)\s+(?!\n)/gm, '$1\n');
}

/**
 * Supprime les italiques *texte* (on garde **gras**).
 * Objectif : éviter les alternances *...* qui cassent parfois la lisibilité.
 */
export function stripSingleItalics(t) {
  return String(t || '').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
}

/**
 * Réduit les sauts de ligne multiples (≥ 3) en doubles sauts de ligne.
 */
export function squeezeBlankLines(t) {
  return String(t || '').replace(/\n{3,}/g, '\n\n');
}

/**
 * Supprime les espaces de fin de ligne et trim global.
 */
export function trimWhitespace(t) {
  return String(t || '').replace(/[ \t]+\n/g, '\n').trim();
}

/**
 * Post-traitement principal appelé par l’engine.
 * (Ajoute/retire ce qu’il faut pour un rendu compact et lisible.)
 */
export function postProcess(text, category = 'GEN') {
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

// Laisse la possibilité d’un import par défaut.
export default postProcess;
