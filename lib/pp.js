ï»¿export default function postProcess(text, _category = "GEN") {
  let out = String(text || "");

  // Helpers locaux (non exportÃ©s)
  const ensureHeadingNewlines = (s) =>
    String(s || "").replace(/^(#{2,3}\s+[^\n]+)\s+(?!\n)/gm, "$1\n");

  const stripSingleItalics = (s) =>
    String(s || "").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");

  const squeezeBlankLines = (s) =>
    String(s || "").replace(/\n{3,}/g, "\n\n");

  const trimWhitespace = (s) =>
    String(s || "").replace(/[ \t]+\n/g, "\n").trim();

  // Pipeline minimal, compact et lisible
  out = ensureHeadingNewlines(out);
  out = stripSingleItalics(out);
  out = squeezeBlankLines(out);
  out = trimWhitespace(out);

  if (!out) {
    out = "DÃ©solÃ©, je nâ€™ai pas pu formuler une rÃ©ponse. RÃ©essaie en prÃ©cisant les symptÃ´mes (voyant, fumÃ©e, perte de puissance, etc.).";
  }
  return out;
}

