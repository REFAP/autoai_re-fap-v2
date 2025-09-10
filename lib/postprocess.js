// lib/postprocess.js
// Nettoyage / normalisation du Markdown généré par le bot.
// Export par défaut unique (pas d'exports nommés pour éviter tout conflit HMR).

export default function postProcess(text, _category = 'GEN') {
  let out = String(text || '');

  // helpers locaux (pas exportés)
  const ensureHeadingNewlines = (s) =>
    String(s || '').replace(/^(#{2,3}\s+[^\n]+)\s+(?!\n)/gm, '$1\n');

  const stripSingleItalics = (s) =>
    String(s || '').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');

  const squeezeBlankLines = (s) =>
    String(s || '').replace(/\n{3,}/g, '\n\n');

  const trimWhitespace = (s) =>
    String(s || '').replace(/[ \t]+\n/g, '\n').trim();

  // pipeline minimal, compact et lisible
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
