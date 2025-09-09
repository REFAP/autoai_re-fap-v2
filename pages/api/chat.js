// pages/api/chat.js
// AutoAI v2.5 — triage court, CTA direct (DIAG), Oui/Non (FAP), format propre

const PROMPT_VERSION = '2.5-fast-triage-direct-cta';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  try {
    const { question = '', historique = '' } = req.body || {};
    const q = String(question || '').trim();
    if (!q) return res.status(400).json({ error: 'question manquante' });

    const category   = detectCategory(q);                 // 'FAP' | 'DIAG'
    const needTriage = needsTriage(category, q, historique);
    const system     = buildSystemPrompt(category, historique, needTriage);

    let reply;
    const apiKey = process.env.MISTRAL_API_KEY;
    const model  = process.env.MISTRAL_MODEL || 'mistral-large-latest';

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
            max_tokens: needTriage ? 220 : 360,
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

    // ---------- durcisseurs de format ----------
    reply = stripMarkers(reply);
    reply = stripKeycapEmojis(reply);
    reply = normalizeEnumerations(reply);
    reply = fixColonBreaks(reply);
    reply = collapseSoftBreaks(reply);
    reply = normalizeBullets(reply);
    reply = enforceSections(reply);
    reply = capBullets(reply, 5);
    reply = lengthCap(reply, 1300);

    // ---------- CTA logique ----------
    if (category !== 'FAP') {
      // Jamais de Carter-Cash hors FAP
      reply = sanitizeReplyNonFAP(reply);
      // On enlève toute "Question finale" en DIAG et on pousse le CTA direct
      reply = removeQuestionFinale(reply);
      reply = ensureLeadSnippetWithLink(reply);
    } else {
      // En FAP : on garde la question Oui/Non
      reply = ensureFinalQuestion(reply, 'Sais-tu démonter ton FAP toi-même ?');
      // le contenu peut mentionner Carter-Cash en FAP
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
  const fapTerms = ['fap','dpf','p2463','p2002','regeneration','régénération','suie','filtre à particules','filtre a particules','colmatage','voyant fap'];
  if (fapTerms.some(w => t.includes(w))) return 'FAP';
  const diagTerms = ['vibration','vibre','tremble','roulement','bruit','turbo','fumée','fumee','egr','capteur','injecteur','adblue','démarre pas','demarre pas','perte de puissance'];
  if (diagTerms.some(w => t.includes(w))) return 'DIAG';
  return 'DIAG';
}

function needsTriage(category, q, historique) {
  const txt = (q + ' ' + (historique || '')).toLowerCase();
  const short = q.length < 20;
  const hasDetail = /(p2463|p2002|voyant|code|diag|perte de puissance|fum[ée]e|r[ée]g[ée]n[ée]ration)/.test(txt);
  if (category === 'FAP') return short || !hasDetail;
  const vagueDiag = /(vibration|bruit|tremble)/.test(txt) && !/(accélération|freinage|90|100|110|120|130|roue|pneu|cardan|roulement)/.test(txt);
  return short || vagueDiag;
}

/* ---------------------- Prompt ---------------------- */

function buildSystemPrompt(category, historique, needTriage) {
  const H = String(historique || '').slice(0, 800);

  const COMMON = `
Tu es **AutoAI** (Re-FAP). Écris en **français**, **concis** et **actionnable**.
RÈGLES :
- **Pas d’emojis**, **pas de listes numérotées** ; uniquement des puces "- ".
- **Une seule ligne par puce** (pas de retour à la ligne dans une puce).
- 3 à 5 puces maximum dans "À faire maintenant" (ou "Questions rapides").
FORMAT :
### En bref
(deux phrases max)
### Pourquoi c’est important
(une phrase)
### À faire maintenant
- …
### Prochaine étape
(une phrase)
`.trim();

  const FAP_TRIAGE = `
TRIAGE FAP : si l’utilisateur tape juste "fap".
- **Pose d’abord 3–4 questions fermées** (voyant, fumée noire, perte de puissance, dernier long trajet).
- **N’expose pas** la conduite détaillée avant ces réponses.
### Questions rapides
- Voyant FAP allumé ?
- Fumée noire visible ?
- Perte de puissance marquée ?
- Dernier long trajet (30 min à 2500 tr/min) récent ?
`.trim();

  const DIAG_TRIAGE = `
TRIAGE DIAG : entrée vague "vibrations/bruit".
- **Pose d’abord 3 questions** : vitesse d’apparition (~90/110/130 km/h ?), contexte (accélération / freinage / stabilisé ?), bruit associé (clac-clac ?).
`.trim();

  const DIAG_RULE = `
En DIAG, **pas de "Question finale"** : termine par une **proposition directe** pour un garage de confiance.
`.trim();

  if (category === 'FAP') {
    return [COMMON, needTriage ? FAP_TRIAGE : '', `Historique :\n${H}`].filter(Boolean).join('\n\n');
  }
  return [COMMON, needTriage ? DIAG_TRIAGE : '', DIAG_RULE, `Historique :\n${H}`]
    .filter(Boolean).join('\n\n');
}

/* ---------------------- Fallbacks courts ---------------------- */

function fallbackTriage(category) {
  if (category === 'FAP') {
    return `
### En bref
On confirme d’abord si c’est bien le FAP et le niveau d’urgence.
### Questions rapides
- Voyant FAP allumé ?
- Fumée noire visible ?
- Perte de puissance ?
- Dernier long trajet (30 min à 2500 tr/min) récent ?
### À faire maintenant
- Si **voyant + perte de puissance** → évite de rouler et consulte vite.
- Note les codes défauts si possible (OBD).
### Prochaine étape
Dès tes réponses, je te donne la conduite précise.
`.trim();
  }
  return `
### En bref
On clarifie tes vibrations pour éviter un mauvais diagnostic.
### Questions rapides
- À quelle vitesse (~90/110/130 km/h) ?
- En **accélérant**, **freinant** ou **stabilisé** ?
- Bruit "clac-clac" entendu ?
### À faire maintenant
- Vérifie la pression des pneus.
- Évite les tests à haute vitesse si ça vibre fort.
### Prochaine étape
Selon tes réponses : piste la plus probable.
`.trim();
}

function fallbackAnswer(category) {
  if (category === 'FAP') {
    return `
### En bref
Voyant FAP = filtre saturé, à confirmer.
### Pourquoi c’est important
Forcer le moteur abîme turbo/EGR et augmente la facture.
### À faire maintenant
- Évite les trajets courts ; observe fumée noire / pertes.
- Si voyant + pertes → limite la conduite.
- Note les codes (si OBD).
### Prochaine étape
On confirme : régénération, **nettoyage Re-FAP** ou garage partenaire.
### Question finale
Sais-tu démonter ton FAP toi-même ?
`.trim();
  }
  return `
### En bref
Vibrations : roues/jantes déséquilibrées (le plus fréquent) ou transmission.
### Pourquoi c’est important
Ignorer use pneus/suspension et peut créer une casse.
### À faire maintenant
- Équilibrage roues ; contrôler usure/hernies.
- Si ça n’apparaît qu’à 100–130 km/h : suspect roues/jantes.
- Bruit "clac-clac" : contrôler cardan.
### Prochaine étape
Si ça persiste : diagnostic en garage.
`.trim();
}

/* ---------------------- Format guards ---------------------- */

function stripMarkers(t){ return String(t||'').replace(/<{1,3}<?(start|end)>{1,3}/ig,'').replace(/<<+|>>+/g,''); }
function stripKeycapEmojis(t){ return String(t||'').replace(/([0-9])\uFE0F?\u20E3/g,'$1. '); }
function normalizeEnumerations(t){ return String(t||'').split('\n').map(l=>l.replace(/^\s*\d+[\.\)]\s+/, '- ')).join('\n'); }
function fixColonBreaks(t){ return String(t||'').replace(/\n\s*:\s*/g,' : '); }
function collapseSoftBreaks(t){
  return String(t||'')
    .replace(/([^\n])\n(?!\n)(?!\s*(?:### |\-\s|•\s|\d+[\.\)]\s))/g,'$1 ')
    .replace(/\n{3,}/g,'\n\n');
}
function normalizeBullets(t){
  return String(t||'').split('\n').map(l=>{
    if (/^(\*|•|\-)\s*/.test(l)) {
      l = '- ' + l.replace(/^(\*|•|\-)\s*/, '');
      l = l.replace(/\s+/g,' ').trim();
    }
    return l;
  }).join('\n');
}
function enforceSections(t){
  let out = String(t||'');
  out = out
    .replace(/^en bref\s*:?/gim,'### En bref')
    .replace(/^pourquoi c[’']est important\s*:?/gim,'### Pourquoi c’est important')
    .replace(/^à faire maintenant\s*:?/gim,'### À faire maintenant')
    .replace(/^prochaine étape\s*:?/gim,'### Prochaine étape')
    .replace(/^question finale\s*:?/gim,'### Question finale')
    .replace(/^questions rapides\s*:?/gim,'### Questions rapides');
  return out;
}
function capBullets(t, max=5){
  const lines = String(t||'').split('\n');
  let inList=false, count=0; const res=[];
  for (const line of lines){
    const isSection = /^### /.test(line);
    if (isSection){ inList=/À faire maintenant|Questions rapides/i.test(line); count=0; res.push(line); continue; }
    if (inList && /^\-\s/.test(line)){ if (count<max){ res.push(line); count++; } continue; }
    res.push(line);
    if (!line.trim()) inList=false;
  }
  return res.join('\n').replace(/\n{3,}/g,'\n\n');
}
function lengthCap(t, max=1300){
  const s = String(t||''); if (s.length<=max) return s;
  return s.slice(0, max-20).replace(/\n+?[^#\n]*$/,'')+'\n…';
}

// Supprime toute section "### Question finale" (utilisé en DIAG)
function removeQuestionFinale(t){
  const lines = String(t||'').split('\n');
  const out=[]; let skip=false;
  for (const line of lines){
    if (/^### Question finale/i.test(line)){ skip=true; continue; }
    if (skip && /^### /.test(line)){ skip=false; }
    if (!skip) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n');
}

// Ajoute/garantit le bloc lead + lien cliquable en DIAG
function ensureLeadSnippetWithLink(t){
  if (/### Trouver un garage proche/i.test(t)) return t;
  const lead =
`### Trouver un garage proche (option rapide)
- Garage de **confiance** près de chez toi : entre **immatriculation** et **code postal**, tu reçois un **devis de diagnostic au meilleur prix** et tu peux **prendre RDV rapidement**.
- 👉 [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=lead_snippet)`;
  return `${t.trim()}\n\n${lead}`;
}

// En FAP : on garde une seule "Question finale"
function ensureFinalQuestion(t, q){
  if (/^### Question finale/im.test(t)) return t;
  return `${t.trim()}\n\n### Question finale\n${q}`;
}

// Sanitize : jamais Carter-Cash / nettoyage FAP en DIAG
function sanitizeReplyNonFAP(text){
  return String(text||'')
    .replace(/carter-?cash/gi,'garage')
    .replace(/nettoyage\s+re-?fap/gi,'diagnostic en garage')
    .replace(/nettoyage\s+(du\s+)?fap/gi,'diagnostic en garage');
}
