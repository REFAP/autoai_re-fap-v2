// lib/postprocess.js
// Nettoyage / normalisation du Markdown généré par le bot (compact, lisible).

// 1) Ajoute un saut de ligne après chaque titre (## ou ###) s’il manque.
function ensureHeadingNewlines(text) {
  const t = String(text || '');
  return t.replace(/^(#{2,3}\s+[^\n]+)\s+(?!\n)/gm, '$1\n');
}

// 2) Supprime les italiques *texte* (on garde **gras**).
function stripSingleItalics(text) {
  const t = String(text || '');
  return t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
}

// 3) Réduit les sauts de ligne multiples (≥ 3) en doubles.
function squeezeBlankLines(text) {
  const t = String(text || '');
  return t.replace(/\n{3,}/g, '\n\n');
}

// 4) Trim et supprime les espaces de fin de ligne.
function trimWhitespace(text) {
  const t = String(text || '');
  return t.replace(/[ \t]+\n/g, '\n').trim();
}

// Export par défaut UNIQUE
export default function postProcess(text, _category = 'GEN') {
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
