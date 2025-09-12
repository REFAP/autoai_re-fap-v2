// pages/api/chat.js
// Prompt seul + JSON forcé + fallback hors FAP + sanitisation + microcopy CTA pédagogique

function normalize(s = '') {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu,'')
    .replace(/[^\p{L}\p{N}\s\-]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function classify(text) {
  const txt = normalize(text || '');
  if (/\bfap\b|\bdpf\b|\bfiltre a particule/.test(txt)) return { type:'FAP' };
  if (/\bdiag(nostic)?\b|\brdv\b|\brendez.?vous\b|\burgent/.test(txt)) return { type:'DIAG' };
  return { type:'GEN' };
}

function hasFAPInSuspected(obj) {
  const suspected = Array.isArray(obj?.suspected) ? obj.suspected.join(' ').toLowerCase() : '';
  return /fap|dpf|filtre.*particule/.test(suspected);
}

function sanitizeText(s) {
  return String(s || '').replace(/diagnostic\s+(gratuit|rembours[ée]|d[ée]duit)/gi,
    'diagnostic (tarif variable, voir page RDV)');
}

function ensureWhyClickLine(actions, { risk, isFap }) {
  const arr = Array.isArray(actions) ? [...actions] : [];
  const already = arr.some(a => /pourquoi cliquer|rdv en 2 min|prix.*affich/i.test(a || ''));
  if (already) return arr;

  // Microcopy courte, honnête, orientée valeur
  if (risk === 'high') {
    arr.push("Pourquoi cliquer : créneau en 2 min, diagnostic prioritaire et consignes claires pour éviter une casse plus coûteuse.");
  } else if (isFap) {
    arr.push("Pourquoi cliquer : créneau en 2 min, prix du diag affiché, et option nettoyage FAP 99–149 € garanti 1 an si confirmé.");
  } else {
    arr.push("Pourquoi cliquer : créneau en 2 min, prix du diag affiché avant validation, orientation claire sans remplacement inutile.");
  }
  return arr;
}

// Imposer nos règles business dans le JSON (CTA, tarifs, microcopy)
function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const GARAGE_CTA = {
    label: "Prendre RDV avec un garage partenaire",
    url: "https://re-fap.fr/trouver_garage_partenaire/",
    // Raison plus pédagogique (bénéfices + frictions levées)
    reason: "Près de chez vous, garages au choix : RDV en 2 min, prix affiché avant validation, diagnostic fiable pour savoir quoi faire ensuite."
  };
  const ALT_DIAG = {
    label: "Diagnostic électronique proche de chez vous",
    url: "https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique",
    reason: "Lire les codes défauts avant d’intervenir."
  };

  const isFap = hasFAPInSuspected(obj);

  // Hors FAP : JAMAIS Carter-Cash, on pousse le garage
  if (!isFap) {
    obj.cta = GARAGE_CTA;
    obj.alt_cta = [ALT_DIAG];
    if (obj.stage !== 'handoff' && obj.stage !== 'diagnosis') obj.stage = 'triage';
    obj.risk = obj.risk || 'low';

    if (!Array.isArray(obj.actions)) obj.actions = [];
    if (!obj.actions.some(a => /diagnostic/i.test(a))) {
      obj.actions.unshift("Prendre RDV pour un diagnostic en garage partenaire (lecture défauts + essai routier).");
    }
    if (!obj.actions.some(a => /50.?–.?90|50-90|50 – 90/.test(a))) {
      obj.actions.push("Diagnostic 50–90 € selon garage (prix exact affiché sur la page RDV).");
    }
    // Alt CTA : purge toute mention Carter-Cash
    obj.alt_cta = (obj.alt_cta || []).filter(a => !/carter|cash/i.test(`${a?.label} ${a?.url}`));
  } else {
    // FAP : cta garage OK ; Carter-Cash possible en alt_cta si l’utilisateur sait déposer (géré par le prompt)
    obj.cta = obj.cta || GARAGE_CTA;
    if (!Array.isArray(obj.actions)) obj.actions = [];
    // Rappel pédagogique FAP (valeur)
    if (!obj.actions.some(a => /99.?–.?149|99-149/.test(a))) {
      obj.actions.push("Nettoyage FAP Re-FAP 99–149 € (~10× moins qu’un remplacement > 1000 €), garantie 1 an.");
    }
  }

  // Ajout systématique d’une ligne “Pourquoi cliquer …”
  obj.actions = ensureWhyClickLine(obj.actions, { risk: obj.risk, isFap });

  // Mentions légales
  obj.legal = obj.legal || "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.";

  // Nettoyage des promesses interdites
  if (Array.isArray(obj.actions)) obj.actions = obj.actions.map(sanitizeText);
  if (Array.isArray(obj.follow_up)) obj.follow_up = obj.follow_up.map(sanitizeText);
  if (obj.summary) obj.summary = sanitizeText(obj.summary);

  return obj;
}

function decideNextActionFromObj(obj) {
  if (!obj || typeof obj !== 'object') return { type:'GEN' };
  const isFap = hasFAPInSuspected(obj);
  if ((obj.stage === 'diagnosis' && isFap) || (obj.stage === 'handoff' && isFap)) return { type:'FAP' };
  if (obj.stage === 'diagnosis' || obj.stage === 'handoff') return { type:'DIAG' };
  return { type:'GEN' };
}

function extractFirstJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch { /* continue */ }
      }
    }
  }
  return null;
}

// Fallback hors FAP (vibrations & co)
function fallbackNonFapJSON() {
  return {
    stage: "triage",
    title: "Vibrations = hors périmètre FAP",
    summary: "Les vibrations viennent surtout des roues/freins/train roulant. Mieux vaut un diagnostic mécanique.",
    questions: [
      { id:"q1", q:"À quelle vitesse ? (>90 km/h = roues)" },
      { id:"q2", q:"Au freinage ? (disques à contrôler)" },
      { id:"q3", q:"Au volant ou dans le siège ? (avant vs transmission)" }
    ],
    suspected: ["roues déséquilibrées", "disques voilés", "rotules/amortisseurs"],
    risk: "low",
    actions: [
      "Contrôler pression/usure pneus et masses d’équilibrage.",
      "Éviter les vitesses élevées jusqu’au contrôle.",
      "Prendre RDV pour un diagnostic en garage partenaire (lecture défauts + essai routier).",
      "Diagnostic 50–90 € selon garage (prix exact affiché sur la page RDV).",
      "Pourquoi cliquer : créneau en 2 min, prix du diag affiché, orientation claire sans remplacement inutile."
    ],
    cta: {
      label: "Prendre RDV avec un garage partenaire",
      url: "https://re-fap.fr/trouver_garage_partenaire/",
      reason: "Près de chez vous, garages au choix : RDV en 2 min, prix affiché avant validation, diagnostic fiable pour savoir quoi faire ensuite."
    },
    alt_cta: [
      {
        label: "Diagnostic électronique proche de chez vous",
        url: "https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique",
        reason: "Lire les codes défauts avant d’intervenir."
      }
    ],
    follow_up: ["Reviens avec les constats (vitesse, freinage, localisation)."],
    legal: "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite."
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error:'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error:'Question invalide' });

  // Détection hors FAP “vibrations” (tolère fautes)
  const qn = normalize(question);
  const looksLikeVibration = /\b(vibration|vibrations|vibre|tremblement|tremblements|tremble|equilibrage|equilibrer|jante|jantes|disque voil|cardan|cardans|rotule|rotules|amortisseur|amortisseurs)\b/.test(qn);

  const system = `
Tu es AutoAI (Re-FAP). Tu aides un conducteur à comprendre des symptômes (FAP/DPF, voyant, fumée, perte de puissance…) et tu l’orientes vers l’action la plus sûre et utile.

RÈGLES IMPÉRATIVES
- Réponds UNIQUEMENT par UN seul objet JSON valide conforme au schéma ci-dessous. Zéro texte hors JSON, zéro champ en plus, zéro commentaires.
- Français, ton clair/pro/empathe, phrases courtes, vocabulaire simple.
- Actions concrètes, sûres et légales. Interdit: suppression/neutralisation du FAP (illégal). Arrêt immédiat si odeur de brûlé, fumée très épaisse, bruits métalliques ou voyant moteur clignotant / risque casse turbo.
- Pas d’invention quand il manque de l’info : rester en triage ou passer en handoff (garage).
- Tolère fautes/accents manquants. Si l’utilisateur dit “je ne sais pas”, propose une observation simple à la place.
- PRIORITÉ : tu n’as AUCUN contexte externe. TES RÈGLES font foi. Sortie = JSON strict.
- Tarifs : fourchette OK (diag 50–90 €). INTERDIT “diagnostic gratuit/remboursé/déduit”. Toujours “variable selon garage, prix affiché lors de la prise de RDV”.
- Garantie Re-FAP : toujours “1 an”. Ne jamais écrire “2 ans”.
- HORS FAP (pneus/freins/train roulant/vibrations) : ne JAMAIS proposer Carter-Cash. Les CTA et tarifs doivent être fournis UNIQUEMENT via "cta"/"alt_cta".

SCHÉMA DE SORTIE (obligatoire)
{
  "stage": "triage|diagnosis|handoff",
  "title": "string",
  "summary": "string",
  "questions": [{"id":"q1","q":"string"}],
  "suspected": ["string"],
  "risk": "low|moderate|high",
  "actions": ["string"],
  "cta": {"label":"string","url":"string","reason":"string"},
  "alt_cta": [{"label":"string","url":"string","reason":"string"}],
  "follow_up": ["string"],
  "legal": "string"
}

POLITIQUE D’ARBITRAGE
- Intention vague → stage="triage" ; 3–5 questions oui/non : voyant FAP/moteur ? fumée noire ? perte de puissance/mode dégradé ? trajets courts répétés ? dernier trajet >20 min à >2500 tr/min ? odeur de brûlé ?
- ≥2 signaux FAP → stage="diagnosis" ; suspected inclut "FAP" ; risk="moderate" (ou "high" si voyant clignote / brûlé / bruit métallique / mode dégradé sévère).
  Actions: régénération 20–30 min à 2500–3000 tr/min (si conditions OK), contrôler capteur pression diff./admission ; si aucun effet → garage.
  Pédagogie : Nettoyage FAP Re-FAP = 99–149 € (~10× moins qu’un remplacement > 1000 €), garantie 1 an.
- Signaux critiques / doute sérieux → stage="handoff", risk="high".
- HORS FAP (vibrations, pneus, freins, supports moteur, transmission) → 2–3 vérifs simples puis cta garage partenaire. Ne JAMAIS proposer Carter-Cash ici.

MICROCOPY CTA (obligatoire)
- Dans "actions", ajoute une ligne finale commençant par "Pourquoi cliquer : ..." qui explique la valeur : "RDV en 2 min", "prix affiché avant validation", "diagnostic fiable/orientation claire". Si risk="high", ajouter l’urgence (“éviter une casse plus coûteuse”).

RÈGLES CTA
- CTA par défaut :
  "label": "Prendre RDV avec un garage partenaire",
  "url": "https://re-fap.fr/trouver_garage_partenaire/",
  "reason": "Près de chez vous, garages au choix : RDV en 2 min, prix affiché avant validation, diagnostic fiable pour savoir quoi faire ensuite."
- Si FAP suspecté/confirmé : demander s’il sait déposer le FAP.
  - S’il sait : alt_cta Carter-Cash (https://auto.re-fap.fr). Sinon : rester sur garage partenaire (“demandez un nettoyage Re-FAP”).
`;

  const userContent = `
Historique (résumé): ${historique || '(vide)'}
Question: ${question}

Consigne de sortie:
- Fournis UNIQUEMENT l'objet JSON (conforme au schéma). AUCUN texte autour.
- ≤ 120 mots, clair, listes concises ok.
`;

  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-medium-latest',
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 600,
        response_format: { type: 'json_object' }, // JSON forcé
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!r.ok) {
      const obj = looksLikeVibration ? fallbackNonFapJSON() : null;
      if (obj) return res.status(200).json({ reply: JSON.stringify(obj), data: obj, nextAction: decideNextActionFromObj(obj) });
      const minimal = `Je n'ai pas de contexte local. Dis-moi: voyant allumé ? perte de puissance ? odeur/fumée ?`;
      return res.status(r.status).json({ reply: minimal, data: null, nextAction: classify(minimal) });
    }

    const data = await r.json();
    let reply = (data.choices?.[0]?.message?.content || '').trim();

    let obj = null;
    try { obj = JSON.parse(reply); } catch {}
    if (!obj) obj = extractFirstJson(reply);
    if (!obj && looksLikeVibration) obj = fallbackNonFapJSON();

    if (obj) {
      const clean = sanitizeObj(obj) || obj;
      const nextAction = decideNextActionFromObj(clean);
      return res.status(200).json({ reply: JSON.stringify(clean), data: clean, nextAction });
    }

    return res.status(200).json({ reply: reply || 'Réponse indisponible.', data: null, nextAction: classify(reply) });

  } catch {
    const obj = looksLikeVibration ? fallbackNonFapJSON() : null;
    if (obj) return res.status(200).json({ reply: JSON.stringify(obj), data: obj, nextAction: decideNextActionFromObj(obj) });
    const backup = `Problème technique. Réponds à ces 2 questions: (1) voyant allumé ? (2) perte de puissance ? Puis on oriente.`;
    return res.status(200).json({ reply: backup, data: null, nextAction: { type:'GEN' } });
  }
}
