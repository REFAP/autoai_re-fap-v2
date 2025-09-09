// pages/api/chat.js
//
// AutoAI v2 — flux FAP en 2 temps (triage → solution), réponses compactes.
// - Détection FAP/DIAG
// - Triage obligatoire si message trop vague ("fap", peu d'infos)
// - Prompt strict + post-traitement (cap des puces, troncature)
// - Carter-Cash uniquement en FAP
// - Mistral si clé dispo, sinon fallback local concis

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { question = '', historique = '' } = req.body || {};
    const q = String(question || '').trim();
    if (!q) return res.status(400).json({ error: 'question manquante' });

    const category = detectCategory(q);
    const needTriage = category === 'FAP' && needsFapTriage(q, historique);
    const system = buildSystemPrompt(category, historique, needTriage);

    const apiKey = process.env.MISTRAL_API_KEY;
    const model = process.env.MISTRAL_MODEL || 'mistral-large-latest';
    let reply;

    if (apiKey) {
      try {
        const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: q },
            ],
            temperature: 0.2,
            top_p: 0.6,
            // volontairement court pour éviter la logorrhée
            max_tokens: needTriage ? 260 : 420,
          }),
        });
        if (!r.ok) throw new Error(`Mistral HTTP ${r.status}`);
        const data = await r.json();
        reply = (data?.choices?.[0]?.message?.content || '').trim();
      } catch {
        reply = needTriage ? fallbackTriage() : fallbackAnswer(category);
      }
    } else {
      reply = needTriage ? fallbackTriage() : fallbackAnswer(category);
    }

    // Couper tout ce qui dépasse le marqueur de fin
    reply = reply.split('<<<END>>>')[0];

    // Jamais Carter-Cash hors FAP
    if (category !== 'FAP') reply = sanitizeReplyNonFAP(reply);

    // Compactage (cap puces + nettoyage + troncature dure)
    reply = enforceFormat(reply, category);

    const nextAction = { type: needTriage ? 'FAP_TRIAGE' : (category === 'FAP' ? 'FAP' : 'DIAG') };
    return res.status(200).json({ reply, nextAction });
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/* ---------------------- Détection & triage ---------------------- */

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  const fapTerms = [
    'fap','dpf','p2463','p2002','regeneration','régénération','suie',
    'filtre à particules','filtre a particules','colmatage','voyant fap'
  ];
  if (fapTerms.some(w => t.includes(w))) return 'FAP';

  const diagTerms = [
    'vibration','vibre','tremble','roulement','bruit','turbo',
    'fumée','fumee','egr','capteur','injecteur','adblue',
    'démarre pas','demarre pas','perte de puissance'
  ];
  if (diagTerms.some(w => t.includes(w))) return 'DIAG';
  return 'DIAG';
}

function needsFapTriage(q, historique) {
  const txt = (q + ' ' + (historique || '')).toLowerCase();
  const hasDetail =
    /(voyant|p2002|p2463|fum[ée]e|perte de puissance|r[ée]g[ée]n[ée]ration|code|diag)/.test(txt);
  const veryShort = q.length < 20;
  return veryShort || !hasDetail;
}

/* ---------------------- Prompt ---------------------- */

function buildSystemPrompt(category, historique, needTriage) {
  const shortHistory = String(historique || '').slice(0, 1000);

  const common = `
Tu es **AutoAI** (Re-FAP). Français clair, **court**, orienté actions & sécurité.
Toujours respecter ce gabarit et rester **concis**. Zéro blabla.

RÈGLES DE LONGUEUR (STRICT) :
- Résumé : **2 phrases max**
- Liste : **3–6 puces** (≤ 120 caractères/puce)
- Prochaine étape : **1 phrase**
- Question finale : **1 phrase**, **1–2 questions max**
- Rien d’autre après <<<END>>>.
`.trim();

  const blockTRIAGE = `
OBJECTIF : l’utilisateur a donné peu d’infos (“fap”, court).
FAIRE D’ABORD **UN TRIAGE EN 4 QUESTIONS**, puis s’arrêter.

Renvoie **uniquement** :
<<<START>>>
**Avant de proposer une solution, vérifions si c’est bien le FAP :**

Réponds en une fois, par ex. *"1) oui — 2) non — 3) 3 jours, trajets courts — 4) P2463"*.

1) Voyant FAP allumé ? (oui/non)
2) Perte de puissance ou fumée noire ? (oui/non)
3) Depuis quand + type de trajets (courts/longs) ?
4) Code défaut lu (P2002/P2463/…) ?
<<<END>>>
`.trim();

  const blockFAP = `
Contexte solution FAP :
- Si FAP **non endommagé**, le **nettoyage Re-FAP** restaure la perf. d’origine dans la majorité des cas.
- **Meilleur rapport qualité/prix/fiabilité** ; évite le remplacement. Carter-Cash à partir de **99€ TTC**.
- Carter-Cash/CTA **uniquement en FAP**.

FORMAT DE RÉPONSE :
<<<START>>>
**En bref :** (2 phrases)
**Pourquoi c’est important :** (1–2 phrases)

**À faire maintenant :**
- (3–6 puces - ≤ 120 char/puce, impératif)

**Prochaine étape :** (1 phrase)
**Question finale :** Sais-tu démonter ton FAP toi-même ?

→ **Oui** : [Trouver un Carter-Cash](https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_oui)
 • **Non** : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_non)
<<<END>>>
`.trim();

  const blockDIAG = `
Contexte DIAG :
- On oriente vers un **diagnostic mécanique/électronique** (codes + tests) pour identifier la cause réelle.
- **Interdit** : mentionner Carter-Cash ou “nettoyage FAP” hors FAP.

FORMAT DE RÉPONSE :
<<<START>>>
**En bref :** (2 phrases)
**Pourquoi c’est important :** (1–2 phrases)

**À faire maintenant :**
- (3–6 puces courtes)

**Prochaine étape :** (1 phrase)
**Question finale :** Souhaites-tu qu’on te mette en relation avec un garage proche ?
<<<END>>>
`.trim();

  const hist = `Historique (contexte) :\n${shortHistory}`.trim();
  if (category === 'FAP' && needTriage) return `${common}\n\n${blockTRIAGE}\n\n${hist}`;
  return `${common}\n\n${category === 'FAP' ? blockFAP : blockDIAG}\n\n${hist}`;
}

/* ---------------------- Fallbacks ---------------------- */

function fallbackTriage() {
  return `
<<<START>>>
**Avant de proposer une solution, vérifions si c’est bien le FAP :**

Réponds en une fois, par ex. *"1) oui — 2) non — 3) 2 trajets courts — 4) P2463"*.

1) Voyant FAP allumé ? (oui/non)
2) Perte de puissance ou fumée noire ? (oui/non)
3) Depuis quand + type de trajets (courts/longs) ?
4) Code défaut lu (P2002/P2463/…) ?
<<<END>>>
`.trim();
}

function fallbackAnswer(category) {
  if (category === 'FAP') {
    return `
<<<START>>>
**En bref :** Voyant FAP/symptômes compatibles → filtre saturé probable.
**Pourquoi c’est important :** Ignorer = surconsommation + risque casse (turbo/EGR).

**À faire maintenant :**
- Évite trajets courts.
- Si perte de puissance/fumée noire → stoppe le véhicule.
- Ne tente pas de “nettoyage maison”.
- Prépare localisation du FAP pour l’intervention.

**Prochaine étape :** Confirmer par lecture des codes (P2002/P2463) ou régénération encadrée.
**Question finale :** Sais-tu démonter ton FAP toi-même ?
→ **Oui** : [Trouver un Carter-Cash](https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_oui)
 • **Non** : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_non)
<<<END>>>
`.trim();
  }
  return `
<<<START>>>
**En bref :** Il faut un **diagnostic** (codes + tests) pour cibler la panne.
**Pourquoi c’est important :** Ignorer peut aggraver l’usure et la facture.

**À faire maintenant :**
- Noter symptômes + contexte (depuis quand, à chaud/froid).
- Vérifier niveaux simples (huile, LDR), pression pneus si vibrations.
- Éviter accélérations si bruit anormal.

**Prochaine étape :** Diagnostic en garage (lecture codes + tests ciblés).
**Question finale :** Souhaites-tu qu’on te mette en relation avec un garage proche ?
<<<END>>>
`.trim();
}

/* ---------------------- Sécurité / format ---------------------- */

function sanitizeReplyNonFAP(text) {
  return String(text || '')
    .replace(/carter-?cash/gi, 'garage')
    .replace(/nettoyage\s+re-?fap/gi, 'diagnostic en garage')
    .replace(/nettoyage\s+(du\s+)?fap/gi, 'diagnostic en garage');
}

function enforceFormat(text, category) {
  let out = String(text || '');
  // normalisation basique
  out = out.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

  // Cap des listes à 6 puces consécutives max
  const lines = out.split('\n');
  let streak = 0;
  const kept = [];
  for (const l of lines) {
    if (/^\s*[-•]/.test(l)) {
      streak += 1;
      if (streak <= 6) kept.push(l);
      // on ignore au-delà de 6
    } else {
      streak = 0;
      kept.push(l);
    }
  }
  out = kept.join('\n');

  // Dure limite de longueur (sécurité)
  const hardLimit = category === 'FAP' ? 1600 : 1400;
  if (out.length > hardLimit) out = out.slice(0, hardLimit).trim();

  return out;
}
