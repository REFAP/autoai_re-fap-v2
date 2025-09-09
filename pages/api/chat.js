// pages/api/chat.js
// AutoAI v3.0 — reset propre, flux FAP en 2 temps, DIAG avec CTA direct, sorties compactes.

const PROMPT_VERSION = '3.0-reset-clean';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  try {
    const { question = '', historique = '' } = req.body || {};
    const q = String(question || '').trim();
    if (!q) return res.status(400).json({ error: 'question manquante' });

    const category   = detectCategory(q); // 'FAP' | 'DIAG'
    const needTriage = needsTriage(category, q, historique);
    const system     = buildSystemPrompt(category, historique, needTriage);

    const apiKey = process.env.MISTRAL_API_KEY;
    const model  = process.env.MISTRAL_MODEL || 'mistral-large-latest';

    let reply;
    if (apiKey) {
      try {
        const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user',    content: q },
            ],
            temperature: 0.2,
            top_p: 0.6,
            max_tokens: needTriage ? 220 : 340, // court et stable
          }),
        });
        if (!r.ok) throw new Error(`Mistral HTTP ${r.status}`);
        const data = await r.json();
        reply = (data?.choices?.[0]?.message?.content || '').trim();
      } catch {
        reply = needTriage ? fallbackTriage(category) : fallbackAnswer(category);
      }
    } else {
      reply = needTriage ? fallbackTriage(category) : fallbackAnswer(category);
    }

    // ---------- Normalisation dure (anti dérives) ----------
    reply = stripMarkers(reply);              // enlève <<<...>>> et <<>>
    reply = banEmojisAndNumbers(reply);       // pas d’emojis ni 1) 2) …
    reply = fixColonBreaks(reply);            // "Mot\n:" -> "Mot :"
    reply = collapseSoftBreaks(reply);        // colle les phrases cassées
    reply = enforceSections(reply);           // titres ### et ordre attendu
    reply = normalizeBullets(reply);          // "- " et 1 ligne/puce
    reply = capBullets(reply, 5);             // 5 puces max
    reply = lengthCap(reply, 1200);           // limite dure

    if (category === 'FAP') {
      reply = ensureFapBenefits(reply);       // bloc bénéfices nettoyage Re-FAP
      reply = ensureFapYesNo(reply);          // Oui/Non avec bons liens
    } else {
      reply = removeQuestionFinale(reply);    // jamais de “Question finale” en DIAG
      reply = ensureLeadGarage(reply);        // bloc lead (immat + CP → devis + RDV)
      reply = sanitizeReplyNonFAP(reply);     // supprime Carter-Cash/nettoyage FAP si erreur du LLM
    }

    const nextAction = { type: needTriage ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE') : category };
    return res.status(200).json({ reply, nextAction, promptVersion: PROMPT_VERSION });
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/* ---------------------- Détection & triage ---------------------- */

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  const F = ['fap','dpf','p2463','p2002','regeneration','régénération','suie','filtre à particules','filtre a particules','colmatage','voyant fap'];
  if (F.some(w => t.includes(w))) return 'FAP';

  const D = ['vibration','vibre','tremble','roulement','bruit','turbo','fumée','fumee','egr','capteur','injecteur','adblue','démarre pas','demarre pas','perte de puissance'];
  if (D.some(w => t.includes(w))) return 'DIAG';

  return 'DIAG';
}

function needsTriage(category, q, historique) {
  const txt = (q + ' ' + (historique || '')).toLowerCase();
  const short = q.length < 20;
  if (category === 'FAP') {
    const hasDetail = /(p2463|p2002|voyant|code|diag|perte de puissance|fum[ée]e|r[ée]g[ée]n[ée]ration)/.test(txt);
    return short || !hasDetail;
  }
  // DIAG : triage si entrée très vague (p.ex. "vibrations")
  const vagueDiag = /(vibration|bruit|tremble)/.test(txt) && !/(accélération|freinage|100|110|120|130|roue|pneu|cardan|roulement|volant)/.test(txt);
  return short || vagueDiag;
}

/* ---------------------- Prompt (simple & verrouillé) ---------------------- */

function buildSystemPrompt(category, historique, needTriage) {
  const H = String(historique || '').slice(0, 800);

  const COMMON = `
Tu es **AutoAI** (Re-FAP). Réponds en **français**, **court** et **actionnable**.
RÈGLES :
- Résumé : **2 phrases max**
- Liste d’actions : **3–5 puces**, **1 seule ligne/puce**, pas de listes numérotées, pas d’emojis.
- Prochaine étape : **1 phrase**
`.trim();

  const TRIAGE_FAP = `
TRIAGE FAP — si l’utilisateur a juste écrit “fap” (ou très peu d’infos) :
- Pose **3–4 questions fermées** (voyant FAP, fumée noire, perte de puissance, dernier long trajet).
- **N’expose pas** la solution complète avant ces réponses.
Format attendu :
### En bref
(1 phrase)
### Questions rapides (FAP)
- Voyant FAP allumé ?
- Fumée noire visible ?
- Perte de puissance nette ?
- Dernier long trajet (30 min à 2500 tr/min) récent ?
### Prochaine étape
(1 phrase)
`.trim();

  const SOLUTION_FAP = `
SOLUTION FAP — quand c’est clair que c’est le FAP :
### En bref
(2 phrases)
### Pourquoi c’est important
(1 phrase)
### À faire maintenant
- (3–5 puces, 1 ligne/puce)
### Prochaine étape
(1 phrase)
### Question finale
Sais-tu démonter ton FAP toi-même ?
`.trim();

  const TRIAGE_DIAG = `
TRIAGE DIAG — si “vibrations/bruit” restent vagues :
- Pose **3 questions rapides** : vitesse d’apparition (~90/110/130 km/h ?), contexte (accélération/freinage/stabilisé ?), bruit associé (clac-clac ?).
- Ensuite seulement, donne **3 actions prioritaires**.
Format attendu :
### En bref
(1 phrase)
### Questions rapides
- Vitesse d’apparition ?
- Contexte (accélération / freinage / stabilisé) ?
- Bruit “clac-clac” entendu ?
### À faire maintenant
- (3 puces)
### Prochaine étape
(1 phrase)
`.trim();

  const SOLUTION_DIAG = `
SOLUTION DIAG — réponse concise sans “Question finale”. Termine par un **CTA direct** (garage proche).
### En bref
(2 phrases)
### Pourquoi c’est important
(1 phrase)
### À faire maintenant
- (3–5 puces, 1 ligne/puce)
### Prochaine étape
(1 phrase)
`.trim();

  const parts = [COMMON];
  if (category === 'FAP') {
    parts.push(needTriage ? TRIAGE_FAP : SOLUTION_FAP);
    parts.push(`Historique:\n${H}`);
  } else {
    parts.push(needTriage ? TRIAGE_DIAG : SOLUTION_DIAG);
    parts.push(`Historique:\n${H}`);
  }
  return parts.join('\n\n');
}

/* ---------------------- Fallbacks ultra-courts ---------------------- */

function fallbackTriage(category) {
  if (category === 'FAP') {
    return `
### En bref
On vérifie d’abord si c’est bien le FAP et l’urgence.
### Questions rapides (FAP)
- Voyant FAP allumé ?
- Fumée noire visible ?
- Perte de puissance nette ?
- Dernier long trajet récent ?
### Prochaine étape
Dès tes réponses, je te dis quoi faire précisément.
`.trim();
  }
  return `
### En bref
On clarifie tes vibrations pour éviter un mauvais diagnostic.
### Questions rapides
- Vitesse d’apparition (~90/110/130 km/h) ?
- En accélérant, en freinant ou stabilisé ?
- Bruit “clac-clac” ?
### À faire maintenant
- Vérifie la pression des pneus ; regonfle si basse.
- Évite les tests à haute vitesse si ça vibre fort.
### Prochaine étape
Selon tes réponses, je cible la cause la plus probable.
`.trim();
}

function fallbackAnswer(category) {
  if (category === 'FAP') {
    return `
### En bref
Symptômes compatibles filtre à particules saturé.
### Pourquoi c’est important
Rouler ainsi peut abîmer turbo/EGR et gonfler la facture.
### À faire maintenant
- Évite les trajets courts ; observe fumée noire/perte de puissance.
- Si voyant + perte de puissance → limite la conduite.
- Note les codes défauts si possible (OBD).
### Prochaine étape
On confirme puis on oriente vers régénération/ nettoyage Re-FAP/ garage.
### Question finale
Sais-tu démonter ton FAP toi-même ?
`.trim();
  }
  return `
### En bref
Vibrations : roues/jantes déséquilibrées (le plus fréquent) ou transmission.
### Pourquoi c’est important
Ignorer use pneus/suspension et peut mener à une casse.
### À faire maintenant
- Équilibrage roues ; contrôler usure/hernies.
- Si phénomène 100–130 km/h uniquement → suspect roues/jantes.
- Bruit “clac-clac” : contrôler cardan.
### Prochaine étape
Si ça persiste après équilibrage : diagnostic en garage.
`.trim();
}

/* ---------------------- Normalisation / garde-fous ---------------------- */

function stripMarkers(t){
  return String(t||'')
    .replace(/<{1,3}<?(start|end)>{1,3}/ig,'')
    .replace(/<<+|>>+/g,'');
}
function banEmojisAndNumbers(t){
  return String(t||'')
    .replace(/([0-9])\uFE0F?\u20E3/g,'$1.')      // supprime 1️⃣ 2️⃣
    .replace(/^\s*\d+[\.\)]\s+/gm,'- ');          // 1) ou 1. -> "- "
}
function fixColonBreaks(t){ return String(t||'').replace(/\n\s*:\s*/g,' : '); }
function collapseSoftBreaks(t){
  return String(t||'')
    .replace(/([^\n])\n(?!\n)(?!\s*(### |\-\s))/g,'$1 ')
    .replace(/\n{3,}/g,'\n\n');
}
function enforceSections(t){
  return String(t||'')
    .replace(/^en bref\s*:?/gim,'### En bref')
    .replace(/^pourquoi c[’']est important\s*:?/gim,'### Pourquoi c’est important')
    .replace(/^questions rapides\s*:?/gim,'### Questions rapides')
    .replace(/^à faire maintenant\s*:?/gim,'### À faire maintenant')
    .replace(/^prochaine étape\s*:?/gim,'### Prochaine étape')
    .replace(/^question finale\s*:?/gim,'### Question finale');
}
function normalizeBullets(t){
  return String(t||'').split('\n').map(l=>{
    if (/^(\*|•|\-)\s*/.test(l)) {
      l = '- ' + l.replace(/^(\*|•|\-)\s*/, '');
      l = l.replace(/\s+/g,' ').trim(); // 1 ligne / puce
    }
    return l;
  }).join('\n');
}
function capBullets(t, max=5){
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
function lengthCap(t, max=1200){
  const s = String(t||''); if (s.length<=max) return s;
  return s.slice(0, max-20).replace(/\n+?[^#\n]*$/,'')+'\n…';
}

/* ----- Injecteurs logiques (bénéfices/CTAs garantis) ----- */

function ensureFapBenefits(t){
  if (/### (Info|Pourquoi) le nettoyage FAP/i.test(t)) return t;
  const block =
`### Pourquoi le nettoyage FAP (Re-FAP)
- **Économique** : évite le remplacement (Carter-Cash dès **99€ TTC**).
- **Éco-responsable** : on réutilise la pièce, moins de déchets.
- **Résultat ≈ neuf** quand le FAP n’est pas endommagé (perfs restaurées).`;
  return `${t.trim()}\n\n${block}`;
}

function ensureFapYesNo(t){
  if (/### Question finale/i.test(t) && /\[Trouver un Carter-Cash\]|\[Trouver un garage partenaire Re-FAP\]/.test(t)) return t;
  const yesNo =
`→ **Oui** : [Trouver un Carter-Cash](https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=oui)
 • **Non** : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=non)`;
  if (/### Question finale/i.test(t)) return `${t.trim()}\n\n${yesNo}`;
  return `${t.trim()}\n\n### Question finale\nSais-tu démonter ton FAP toi-même ?\n${yesNo}`;
}

function removeQuestionFinale(t){
  const lines = String(t||'').split('\n'); const out=[]; let skip=false;
  for (const line of lines){
    if (/^### Question finale/i.test(line)){ skip=true; continue; }
    if (skip && /^### /.test(line)){ skip=false; }
    if (!skip) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n');
}

function ensureLeadGarage(t){
  if (/### Trouver un garage proche/i.test(t)) return t;
  const lead =
`### Trouver un garage proche (direct)
- Garage de **confiance** près de chez toi : saisis **immatriculation** + **code postal**, reçois un **devis de diagnostic au meilleur prix** et **prends RDV rapidement**.
- 👉 [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=lead)`;
  return `${t.trim()}\n\n${lead}`;
}

function sanitizeReplyNonFAP(text){
  return String(text||'')
    .replace(/carter-?cash/gi,'garage')
    .replace(/nettoyage\s+re-?fap/gi,'diagnostic en garage')
    .replace(/nettoyage\s+(du\s+)?fap/gi,'diagnostic en garage');
}
