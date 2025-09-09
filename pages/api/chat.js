// pages/api/chat.js
//
// AutoAI v2.3 — Fast triage + lead CTA
// - Réponses courtes et actionnables (bref + 3–5 puces + question finale)
// - Triage quand entrée vague (FAP ou DIAG "vibrations")
// - Bloc lead clair (immat + code postal -> devis diag au meilleur prix + RDV)
// - Carter-Cash uniquement en FAP
// - Normalisation d'affichage (pas de <<>>, puces compactes, pas de lignes cassées)

const PROMPT_VERSION = '2.3-fast-triage';

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
              { role: 'user', content: q },
            ],
            // Réponses courtes et stables
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

    // --- Post-traitement pour un rendu propre et concis ---
    reply = stripMarkers(reply);            // enlève <<>>, <<<START/END>>>
    reply = collapseSoftBreaks(reply);      // fusionne les sauts de ligne inutiles
    reply = normalizeBullets(reply);        // 1 ligne/puce + puces cohérentes
    reply = enforceSections(reply);         // titres ### + ordre sections
    reply = capBullets(reply, 5);           // max 5 puces
    reply = lengthCap(reply, 1300);         // cap dur longueur

    // Bloc lead toujours présent en DIAG (pas FAP)
    if (category !== 'FAP') {
      reply = ensureLeadSnippet(reply);
      reply = ensureFinalQuestion(reply, `Veux-tu que je t’envoie le lien pour trouver un garage de confiance près de chez toi ?`);
    } else {
      // en FAP on garde la question Oui/Non (Carter-Cash vs garage partenaire)
      reply = ensureFinalQuestion(reply, `Sais-tu démonter ton FAP toi-même ?`);
    }

    // Sécurité : jamais de Carter-Cash hors FAP
    if (category !== 'FAP') reply = sanitizeReplyNonFAP(reply);

    const nextAction = { type: needTriage ? (category === 'FAP' ? 'FAP_TRIAGE' : 'DIAG_TRIAGE') : category };
    return res.status(200).json({ reply, nextAction, promptVersion: PROMPT_VERSION });
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/* ---------------------- Détection & triage ---------------------- */

function detectCategory(text) {
  const t = (text || '').toLowerCase();

  // FAP
  const fapTerms = ['fap','dpf','p2463','p2002','regeneration','régénération','suie','filtre à particules','filtre a particules','colmatage','voyant fap'];
  if (fapTerms.some(w => t.includes(w))) return 'FAP';

  // DIAG générique (vibrations, bruits, etc.)
  const diagTerms = ['vibration','vibre','tremble','roulement','bruit','turbo','fumée','fumee','egr','capteur','injecteur','adblue','démarre pas','demarre pas','perte de puissance'];
  if (diagTerms.some(w => t.includes(w))) return 'DIAG';

  return 'DIAG';
}

function needsTriage(category, q, historique) {
  const txt = (q + ' ' + (historique || '')).toLowerCase();
  const short = q.length < 20;
  const hasDetail = /(p2463|p2002|voyant|code|diag|perte de puissance|fum[ée]e|r[ée]g[ée]n[ée]ration)/.test(txt);
  if (category === 'FAP') return short || !hasDetail;
  // vibrations / diag : triage si phrase très courte et vague
  const vagueDiag = /(vibration|bruit|tremble)/.test(txt) && !/(accélération|freinage|90|100|130|roue|pneu|cardan|roulement)/.test(txt);
  return short || vagueDiag;
}

/* ---------------------- Prompt ---------------------- */

function buildSystemPrompt(category, historique, needTriage) {
  const H = String(historique || '').slice(0, 800);

  const COMMON = `
Tu es **AutoAI** (Re-FAP). Écris en **français**, très **concis** et **actionnable**.
FORMAT OBLIGATOIRE :
### En bref
(deux phrases maximum)
### Pourquoi c’est important
(une phrase)
### À faire maintenant
- 3 à 5 puces, **1 seule ligne par puce**
### Prochaine étape
(une phrase)
### Question finale
(une phrase)
`.trim();

  const LEAD = `
### Trouver un garage proche (option rapide)
- Garage de **confiance** près de chez toi : entre **immatriculation** et **code postal**, tu reçois un **devis de diagnostic au meilleur prix** et tu peux **prendre RDV rapidement**.
`.trim();

  const FAP_TRIAGE = `
OBJECTIF TRIAGE FAP : l’utilisateur tape juste “fap”.
- **Pose d’abord 3 à 4 questions fermées** pour situer l’urgence (voyant, fumée noire, perte de puissance, trajet récent).
- **Ne donne pas la solution complète** tant que les réponses ne sont pas claires.
- Garde chaque question sur **une seule ligne**.
`.trim();

  const DIAG_TRIAGE = `
OBJECTIF TRIAGE DIAG : entrée vague “vibrations / bruit”.
- **Pose d’abord 3 questions rapides** : vitesse d’apparition (≈90/110 km/h ?), contexte (accélération / freinage / virage ?), bruit associé (clac-clac ?).
- Ensuite seulement, propose **les 3 causes probables** (1 ligne chacune) et la prochaine étape.
`.trim();

  if (category === 'FAP') {
    return [
      COMMON,
      needTriage ? FAP_TRIAGE : '',
      // En FAP, la vente Carter-Cash se fait via la question finale (oui/non)
      `Rappel : **Carter-Cash** n’est mentionné **qu’en FAP** (jamais en DIAG).`,
      `Historique :\n${H}`
    ].filter(Boolean).join('\n\n');
  }

  // DIAG
  return [
    COMMON,
    needTriage ? DIAG_TRIAGE : '',
    LEAD,
    `Interdiction : ne mentionne pas Carter-Cash ni “nettoyage FAP” en DIAG.`,
    `Historique :\n${H}`
  ].filter(Boolean).join('\n\n');
}

/* ---------------------- Fallbacks très courts ---------------------- */

function fallbackTriage(category) {
  if (category === 'FAP') {
    return `
### En bref
On vérifie d’abord si c’est bien le FAP et le niveau d’urgence.
### Questions rapides
1) Voyant FAP allumé ? 2) Fumée noire ? 3) Perte de puissance ? 4) Dernier long trajet (30 min à 2500 tr/min) récent ?
### À faire maintenant
- Si **voyant + perte de puissance** → évite de rouler et consulte vite.
- Note les codes défauts si tu peux (OBD).
### Prochaine étape
Dès que tu réponds, je te dis quoi faire précisément.
### Question finale
Tu peux répondre aux 4 questions ci-dessus ?
`.trim();
  }
  return `
### En bref
On clarifie tes vibrations pour éviter un mauvais diagnostic.
### Questions rapides
1) À quelle vitesse ça apparaît (≈90/110/130 km/h) ? 2) En **accélérant**, **freinant** ou **stabilisé** ? 3) Bruit “clac-clac” ?
### À faire maintenant
- Vérifie pression pneus ; si très basse → regonfle.
- Évite les tests à haute vitesse si ça vibre fort.
### Prochaine étape
Selon tes réponses, je te propose la piste la plus probable.
### Question finale
Tu me donnes ces 3 infos ?
`.trim();
}

function fallbackAnswer(category) {
  if (category === 'FAP') {
    return `
### En bref
Voyant FAP = filtre saturé, à confirmer avant de rouler longtemps.
### Pourquoi c’est important
Forcer le moteur aggrave la casse (turbo/EGR) et la facture.
### À faire maintenant
- Évite les trajets courts ; observe fumée noire / perte de puissance.
- Si voyant + perte de puissance → limite la conduite.
- Note les codes (si OBD).
### Prochaine étape
On confirmera : régénération / nettoyage Re-FAP / garage partenaire.
### Question finale
Sais-tu démonter ton FAP toi-même ?
`.trim();
  }
  return `
### En bref
Vibrations = roues/jantes déséquilibrées (le plus fréquent) ou transmission.
### Pourquoi c’est important
Ignorer use pneus/suspension et peut créer une casse.
### À faire maintenant
- Équilibrage roues (#1) ; vérifier usure/hernies.
- Test : apparaît à 100–130 km/h seulement ?
- Si bruit “clac-clac” → cardan à contrôler.
### Prochaine étape
Diagnostic rapide en garage si ça persiste après équilibrage.
### Question finale
Veux-tu le lien pour trouver un garage de confiance près de chez toi ?
`.trim();
}

/* ---------------------- Normalisation & garde-fous ---------------------- */

function stripMarkers(t) {
  return String(t || '')
    .replace(/<{1,3}<?(start|end)>{1,3}/ig, '')
    .replace(/<<+|>>+/g, '');
}

function collapseSoftBreaks(t) {
  // Fusionne “mots\nmots” en “mots mots” sauf titres/puces
  return t
    .replace(/[^\S\r\n]*\n(?!\n)(?![#*-]|\d+\))/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function normalizeBullets(t) {
  const lines = String(t || '').split('\n').map(l => l.trimEnd());
  // normalise les puces en “- ...”
  for (let i = 0; i < lines.length; i++) {
    if (/^(\*|\u2022|\-)\s*/.test(lines[i])) {
      lines[i] = '- ' + lines[i].replace(/^(\*|\u2022|\-)\s*/, '');
    }
  }
  return lines.join('\n');
}

function enforceSections(t) {
  let out = t;

  // force les titres en “### …”
  out = out
    .replace(/^en bref\s*:?/gim, '### En bref')
    .replace(/^pourquoi c[’']est important\s*:?/gim, '### Pourquoi c’est important')
    .replace(/^à faire maintenant\s*:?/gim, '### À faire maintenant')
    .replace(/^prochaine étape\s*:?/gim, '### Prochaine étape')
    .replace(/^question finale\s*:?/gim, '### Question finale')
    .replace(/^questions rapides\s*:?/gim, '### Questions rapides')
    .replace(/^trouver un garage proche.*$/gim, '### Trouver un garage proche (option rapide)');

  return out;
}

function capBullets(t, max = 5) {
  const lines = String(t || '').split('\n');
  let inside = false, count = 0;
  const res = [];

  for (const line of lines) {
    const isSection = /^### /.test(line);
    if (isSection) { inside = /À faire maintenant/i.test(line) || /Questions rapides/i.test(line); count = 0; res.push(line); continue; }

    if (inside && /^\-\s/.test(line)) {
      if (count < max) { res.push(line.replace(/\s+/g, ' ').trim()); count++; }
      else { continue; }
    } else {
      res.push(line);
      if (/^$/.test(line)) inside = false;
    }
  }
  return res.join('\n').replace(/\n{3,}/g, '\n\n');
}

function lengthCap(t, max = 1300) {
  const s = String(t || '');
  if (s.length <= max) return s;
  return s.slice(0, max - 20).replace(/\n+?[^#\n]*$/, '') + '\n…';
}

function ensureFinalQuestion(t, question) {
  if (/^### Question finale/im.test(t)) return t;
  return t.trim() + `\n\n### Question finale\n${question}`;
}

function ensureLeadSnippet(t) {
  if (/### Trouver un garage proche/im.test(t)) return t;
  return `${t}\n\n### Trouver un garage proche (option rapide)\n- Garage de **confiance** près de chez toi : entre **immatriculation** et **code postal**, tu reçois un **devis de diagnostic au meilleur prix** et tu peux **prendre RDV rapidement**.`;
}

function sanitizeReplyNonFAP(text) {
  return String(text || '')
    .replace(/carter-?cash/gi, 'garage')
    .replace(/nettoyage\s+re-?fap/gi, 'diagnostic en garage')
    .replace(/nettoyage\s+(du\s+)?fap/gi, 'diagnostic en garage');
}
