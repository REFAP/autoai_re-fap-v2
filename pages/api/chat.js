// pages/api/chat.js
// Kill-switch "vibrations" : on BRISE le flux LLM et on renvoie un JSON hors FAP contrôlé.

function normalize(s = '') {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu,'')
    .replace(/[^\p{L}\p{N}\s\-]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

// Jamais 'FAP' à partir de texte brut
function classify(text) {
  const txt = normalize(text || '');
  if (/\bdiag(nostic)?\b|\brdv\b|\brendez.?vous\b|\burgent/.test(txt)) return { type:'DIAG' };
  return { type:'GEN' };
}

function hasFAPInSuspected(obj) {
  const suspected = Array.isArray(obj?.suspected) ? obj.suspected.join(' ').toLowerCase() : '';
  return /(?:^|\W)(fap|dpf|filtre.*particule)(?:$|\W)/.test(suspected);
}

function sanitizeText(s) {
  return String(s || '').replace(/diagnostic\s+(gratuit|rembours[ée]|d[ée]duit)/gi,
    'diagnostic (tarif variable, voir page RDV)');
}

function ensureWhyClickLine(actions, { risk, isFap }) {
  const arr = Array.isArray(actions) ? [...actions] : [];
  const already = arr.some(a => /pourquoi cliquer|rdv en 2 min|prix.*affich/i.test(a || ''));
  if (already) return arr;
  if (risk === 'high') {
    arr.push("Pourquoi cliquer : créneau en 2 min, diagnostic prioritaire et consignes pour éviter une casse plus coûteuse.");
  } else if (isFap) {
    arr.push("Pourquoi cliquer : créneau en 2 min, prix du diag affiché, et option nettoyage FAP 99–149 € garanti 1 an si confirmé.");
  } else {
    arr.push("Pourquoi cliquer : créneau en 2 min, prix du diag affiché avant validation, orientation claire sans remplacement inutile.");
  }
  return arr;
}

function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const GARAGE_CTA = {
    label: "Prendre RDV avec un garage partenaire",
    url: "https://re-fap.fr/trouver_garage_partenaire/",
    reason: "Près de chez vous, garages au choix : RDV en 2 min, prix affiché avant validation, diagnostic fiable pour savoir quoi faire ensuite."
  };
  const ALT_DIAG = {
    label: "Diagnostic électronique proche de chez vous",
    url: "https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique",
    reason: "Lire les codes défauts avant d’intervenir."
  };

  const isFap = hasFAPInSuspected(obj);

  if (!isFap) {
    // HORS FAP : jamais Carter-Cash
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
    // purge toute mention Carter-Cash
    obj.alt_cta = (obj.alt_cta || []).filter(a => !/carter|cash/i.test(`${a?.label} ${a?.url}`));
    if (Array.isArray(obj.actions)) {
      obj.actions = obj.actions.map(x => String(x).replace(/carter.?cash/ig, 'garage partenaire'));
    }
  } else {
    obj.cta = obj.cta || GARAGE_CTA;
    if (!Array.isArray(obj.actions)) obj.actions = [];
    if (!obj.actions.some(a => /99.?–.?149|99-149/.test(a))) {
      obj.actions.push("Nettoyage FAP Re-FAP 99–149 € (~10× moins qu’un remplacement > 1000 €), garantie 1 an.");
    }
  }

  obj.actions = ensureWhyClickLine(obj.actions, { risk: obj.risk, isFap });
  obj.legal = obj.legal || "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.";
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
        try { return JSON.parse(candidate); } catch {}
      }
    }
  }
  return null;
}

// === KILL SWITCH : hors FAP "vibrations" ===
function looksLikeVibrationQuery(q) {
  const qn = normalize(q);
  return /\b(vibration|vibrations|vibre|tremblement|tremblements|tremble|equilibrage|equilibrer|jante|jantes|disque voil|cardan|cardans|rotule|rotules|amortisseur|amortisseurs)\b/.test(qn);
}

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

// Rendu texte maîtrisé (jamais Carter-Cash côté hors FAP)
function renderTextFromObj(obj) {
  const isFap = hasFAPInSuspected(obj);
  const lines = [];
  if (!isFap) {
    lines.push("Tri: Hors sujet FAP (vibrations = train roulant/transmission).");
    lines.push("");
    lines.push("Causes probables :");
    lines.push("- Roues déséquilibrées / pneus.");
    lines.push("- Disques voilés (si au freinage).");
    lines.push("- Rotules/amortisseurs/usure direction.");
    lines.push("");
    lines.push("À vérifier :");
    lines.push("- Vitesse ? (>90 km/h = roues).");
    lines.push("- Freinage ? (disques).");
    lines.push("- Ressenti au volant ou au siège ? (avant vs transmission).");
    lines.push("");
    lines.push("Prochaine étape : Clique sur « Garage partenaire » (bouton à droite) — RDV en 2 min, prix du diag affiché, orientation claire.");
  } else {
    lines.push("Tri: Problème lié au FAP probable.");
    lines.push("");
    lines.push("Actions utiles :");
    lines.push("- Si conditions OK : roulage 20–30 min à 2500–3000 tr/min (peut déclencher la régénération).");
    lines.push("- Sinon : RDV garage partenaire (demandez un nettoyage Re-FAP 99–149 € garanti 1 an).");
    lines.push("- Vous savez déposer le FAP ? Alors dépôt possible en Carter-Cash (option).");
    lines.push("");
    lines.push("Prochaine étape : Clique sur « Garage partenaire » (bouton à droite). Si FAP démonté, utilise l’option Carter-Cash.");
  }
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error:'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error:'Question invalide' });

  // === KILL-SWITCH : si "vibrations" & co → on NE contacte PAS le LLM ===
  if (looksLikeVibrationQuery(question)) {
    const obj = sanitizeObj(fallbackNonFapJSON());
    const text = renderTextFromObj(obj);
    return res.status(200).json({ reply: text, data: obj, nextAction: decideNextActionFromObj(obj) });
  }

  // Sinon on interroge le LLM (cas FAP/voyant/etc.)
  const system = `
Tu es AutoAI (Re-FAP). Tu aides un conducteur à comprendre des symptômes (FAP/DPF, voyant, fumée, perte de puissance…) et tu l’orientes vers l’action la plus sûre et utile.

RÈGLES IMPÉRATIVES
- Réponds UNIQUEMENT par UN seul objet JSON valide conforme au schéma ci-dessous. Zéro texte hors JSON, zéro champ en plus, zéro commentaires.
- Français, ton clair/pro/empathe, phrases courtes, vocabulaire simple.
- Actions concrètes, sûres et légales. Interdit: suppression/neutralisation du FAP (illégal). Arrêt immédiat si odeur de brûlé, fumée très épaisse, bruits métalliques ou voyant moteur clignotant.
- Pas d’invention : rester en triage ou handoff si doute.
- Tarifs diag: 50–90 € (variable selon garage, prix affiché lors de la prise de RDV). Garantie Re-FAP : 1 an. 
- HORS FAP (pneus/freins/train roulant/vibrations) : ne JAMAIS proposer Carter-Cash.

SCHÉMA DE SORTIE
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
`;

  const userContent = `
Historique (résumé): ${historique || '(vide)'}
Question: ${question}

Consigne: UNIQUEMENT l'objet JSON (≤120 mots).`;

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
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
    });

    let obj = null;
    if (r.ok) {
      const data = await r.json();
      const raw = (data.choices?.[0]?.message?.content || '').trim();
      try { obj = JSON.parse(raw); } catch { obj = extractFirstJson(raw); }
    }

    if (!obj) {
      // triage minimal si le LLM foire
      obj = {
        stage: "triage",
        title: "Triage initial",
        summary: "Précise les symptômes pour orienter correctement.",
        questions: [
          {id:"q1", q:"Voyant moteur ou FAP allumé ?"},
          {id:"q2", q:"Perte de puissance ou fumée ?"},
          {id:"q3", q:"Trajets courts répétés ?"}
        ],
        suspected: [],
        risk: "low",
        actions: ["Réponds aux 3 questions ci-dessus pour affiner.", "Puis prends RDV si besoin."],
        cta: {
          label: "Prendre RDV avec un garage partenaire",
          url: "https://re-fap.fr/trouver_garage_partenaire/",
          reason: "Près de chez vous, garages au choix : RDV en 2 min, prix affiché avant validation, diagnostic fiable."
        },
        alt_cta: [],
        follow_up: [],
        legal: "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite."
      };
    }

    const clean = sanitizeObj(obj);
    const text = renderTextFromObj(clean);
    return res.status(200).json({ reply: text, data: clean, nextAction: decideNextActionFromObj(clean) });

  } catch (e) {
    const backup = "Problème technique. Dis-moi: voyant allumé ? perte de puissance ? odeur/fumée ?";
    return res.status(200).json({ reply: backup, data: null, nextAction: { type:'GEN' } });
  }
}
