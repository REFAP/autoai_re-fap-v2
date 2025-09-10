// lib/postprocess.js
import { LINKS, FAP_BENEFITS, LEAD_GARAGE_SNIPPET } from '../constants/pitch';

export function sanitizeReplyNonFAP(text){
  return String(text||'')
    .replace(/carter-?cash/gi,'garage')
    .replace(/nettoyage\s+re-?fap/gi,'diagnostic en garage')
    .replace(/nettoyage\s+(du\s+)?fap/gi,'diagnostic en garage');
}

export function stripMarkers(t){ return String(t||'').replace(/<{1,3}<?(start|end)>{1,3}/ig,'').replace(/<<+|>>+/g,''); }
export function banEmojisAndNumbers(t){
  return String(t||'')
    .replace(/([0-9])\uFE0F?\u20E3/g,'$1. ')
    .replace(/^\s*\d+[\.\)]\s+/gm,'- ');
}
export function fixColonBreaks(t){ return String(t||'').replace(/\n\s*:\s*/g,' : '); }
export function collapseSoftBreaks(t){
  return String(t||'')
    .replace(/([^\n])\n(?!\n)(?!\s*(### |\-\s|•\s|\d+[\.\)]\s))/g,'$1 ')
    .replace(/\n{3,}/g,'\n\n');
}
export function enforceSections(t){
  return String(t||'')
    .replace(/^en bref\s*:?/gim,'### En bref')
    .replace(/^pourquoi c[’']est important\s*:?/gim,'### Pourquoi c’est important')
    .replace(/^questions rapides\s*:?/gim,'### Questions rapides')
    .replace(/^à faire maintenant\s*:?/gim,'### À faire maintenant')
    .replace(/^prochaine étape\s*:?/gim,'### Prochaine étape')
    .replace(/^question finale\s*:?/gim,'### Question finale');
}
export function normalizeBullets(t){
  return String(t||'').split('\n').map(l=>{
    if (/^(\*|•|\-)\s*/.test(l)) {
      l = '- ' + l.replace(/^(\*|•|\-)\s*/, '');
      l = l.replace(/\s+/g,' ').trim();
    }
    return l;
  }).join('\n');
}
export function capBullets(t, max=5){
  const lines = String(t||'').split('\n');
  let inList=false, count=0; const out=[];
  for (const line of lines){
    const isSection = /^### /.test(line);
    if (isSection){ inList=/À faire maintenant|Questions rapides/i.test(line); count=0; out.push(line); continue; }
    if (inList && /^\-\s/.test(line)){ if (count<max){ out.push(line); count++; } continue; }
    out.push(line);
    if (!line.trim()) inList=false;
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n');
}
export function lengthCap(t, max=1200){
  const s = String(t||'');
  if (s.length <= max) return s;
  return s.slice(0, max-20).replace(/\n+?[^#\n]*$/,'') + '\n…';
}

/* Injections */
export function ensureFapBenefits(t){
  if (/### Pourquoi le nettoyage FAP/i.test(t)) return t;
  const block = '### Pourquoi le nettoyage FAP (Re-FAP)\n- ' + FAP_BENEFITS.join('\n- ');
  return `${t.trim()}\n\n${block}`;
}
export function ensureFapYesNo(t){
  const yesNo = `→ **Oui** : [Trouver un Carter-Cash](${LINKS.carterCash}) • **Non** : [Trouver un garage partenaire Re-FAP](${LINKS.garage})`;
  if (/### Question finale/i.test(t)) return `${t.trim()}\n\n${yesNo}`;
  return `${t.trim()}\n\n### Question finale\nSais-tu démonter ton FAP toi-même ?\n${yesNo}`;
}
export function removeQuestionFinale(t){
  const lines = String(t||'').split('\n'); const out=[]; let skip=false;
  for (const line of lines){
    if (/^### Question finale/i.test(line)){ skip=true; continue; }
    if (skip && /^### /.test(line)){ skip=false; }
    if (!skip) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n');
}
export function ensureLeadGarage(t){
  if (/### Trouver un garage proche/i.test(t)) return t;
  const lead = `### Trouver un garage proche (direct)\n- ${LEAD_GARAGE_SNIPPET}\n- 👉 [Trouver un garage partenaire Re-FAP](${LINKS.garage})`;
  return `${t.trim()}\n\n${lead}`;
}
