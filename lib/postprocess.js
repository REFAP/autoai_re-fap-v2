<<<<<<< Updated upstream
// lib/postprocess.js
// Nettoyage / normalisation du Markdown gÃ©nÃ©rÃ© par le bot (compact, lisible).

// 1) Ajoute un saut de ligne aprÃ¨s chaque titre (## ou ###) sâ€™il manque.
function ensureHeadingNewlines(text) {
  const t = String(text || '');
  return t.replace(/^(#{2,3}\s+[^\n]+)\s+(?!\n)/gm, '$1\n');
}

// 2) Supprime les italiques *texte* (on garde **gras**).
function stripSingleItalics(text) {
  const t = String(text || '');
  return t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
}

// 3) RÃ©duit les sauts de ligne multiples (â‰¥ 3) en doubles.
function squeezeBlankLines(text) {
  const t = String(text || '');
  return t.replace(/\n{3,}/g, '\n\n');
}

// 4) Trim et supprime les espaces de fin de ligne.
function trimWhitespace(text) {
  const t = String(text || '');
  return t.replace(/[ \t]+\n/g, '\n').trim();
}

// Export par dÃ©faut UNIQUE
export default function postProcess(text, _category = 'GEN') {
  let out = String(text || '');
  out = ensureHeadingNewlines(out);
  out = stripSingleItalics(out);
  out = squeezeBlankLines(out);
  out = trimWhitespace(out);

  if (!out) {
    out =
      "DÃ©solÃ©, je nâ€™ai pas pu formuler une rÃ©ponse. RÃ©essaie en prÃ©cisant les symptÃ´mes (voyant, fumÃ©e, perte de puissance, etc.).";
  }
  return out;
}
=======
ï»¿// lib/postprocess.js â€“ nettoyage/normalisation Markdown (compact, lisible).

// 1) Saut de ligne aprÃ¨s chaque titre (## ou ###) sâ€™il manque.
function ensureHeadingNewlines(text) {
  const t = String(text || '');
  return t.replace(/^(#{2,3}\s+[^\n]+)\s+(?!\n)/gm, '$1\n');
}

// 2) Supprime les italiques *texte* (on garde **gras**).
function stripSingleItalics(text) {
  const t = String(text || '');
  return t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
}

// 3) RÃ©duit les sauts de ligne multiples (â‰¥ 3) en doubles.
function squeezeBlankLines(text) {
  const t = String(text || '');
  return t.replace(/\n{3,}/g, '\n\n');
}

// 4) Trim et espaces de fin de ligne.
function trimWhitespace(text) {
  const t = String(text || '');
  return t.replace(/[ \t]+\n/g, '\n').trim();
}

// Export par dÃ©faut UNIQUE
export default function postProcess(text, _category = 'GEN') {
  let out = String(text || '');
  out = ensureHeadingNewlines(out);
  out = stripSingleItalics(out);
  out = squeezeBlankLines(out);
  out = trimWhitespace(out);

  if (!out) {
    out = "DÃ©solÃ©, je nâ€™ai pas pu formuler une rÃ©ponse. RÃ©essaie en prÃ©cisant les symptÃ´mes (voyant, fumÃ©e, perte de puissance, etc.).";
  }
  return out;
}
>>>>>>> Stashed changes

