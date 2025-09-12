// pages/api/chat.js
// Conseiller commercial maîtrisé : tarifs figés côté serveur, pédagogie imposée, kill-switch "vibrations".

// === CONFIG TARIFS (modifie ici si besoin) =========================
const PRICING = {
  fap_clean_min: 99,
  fap_clean_max: 149,
  replacement_ref: 1000,     // " > 1000 € " pour un repère simple
  diag_min: 50,
  diag_max: 90
};
// ==================================================================

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
  return String(s || '')
    .replace(/diagnostic\s+(gratuit|rembours[ée]|d[ée]duit)/gi, 'diagnostic (tarif variable, voir page RDV)')
    .replace(/\b(gratuit|free)\b/gi, 'affiché avant validation');
}

function ensureWhyClickLine(actions, { risk, isFap }) {
  const arr = Array.isArray(actions) ? [...actions] : [];
  const already = arr.some(a => /pourquoi cliquer|rdv en 2 min|prix.*affich/i.test(a || ''));
  if (already) return arr;
  if (risk === 'high') {
    arr.push("Pourquoi cliquer : créneau en 2 min, diagnostic prioritaire et consignes pour éviter une casse plus coûteuse.");
  } else if (isFap) {
    arr.push(`Pourquoi cliquer : créneau en 2 min, prix du diag affiché, option nettoyage FAP ${PRICING.fap_clean_min}–${PRICING.fap_clean_max} € garanti 1 an si confirmé.`);
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

  // Harmonise le risk
  if (!obj.risk) obj.risk = isFap ? 'moderate' : 'low';

  // Actions & CTA
  if (!isFap) {
    // HORS FAP : jamais Carter-Cash, pousse garage + diag
    obj.cta = GARAGE_CTA;
    obj.alt_cta = [ALT_DIAG];
    if (obj.stage !== 'handoff' && obj.stage !== 'diagnosis') obj.stage = 'triage';

    if (!Array.isArray(obj.actions)) obj.actions = [];
    // impose nos actions
    obj.actions = [
      "Contrôler pression/usure pneus et masses d’équilibrage (si vibrations à vitesse).",
      "Éviter les vitesses élevées jusqu’au contrôle.",
      `Prendre RDV pour un diagnostic en garage partenaire (lecture défauts + essai routier).`,
      `Diagnostic ${PRICING.diag_min}–${PRICING.diag_max} € selon garage (prix exact affiché sur la page RDV).`,
      ...obj.actions.filter(Boolean)
    ];
    // purge Carter-Cash
    obj.alt_cta = (obj.alt_cta || []).filter(a => !/carter|cash/i.test(`${a?.label} ${a?.url}`));
  } else {
    // FAP : impose nos messages + tarifs
    obj.cta = obj.cta || GARAGE_CTA;
    if (!Array.isArray(obj.actions)) obj.actions = [];
    const core = [
      `Nettoyage FAP Re-FAP ${PRICING.fap_clean_min}–${PRICING.fap_clean_max} € (~10× moins qu’un remplacement > ${PRICING.replacement_ref} €), garantie 1 an.`,
      "Si conditions OK : rouler 20–30 min à 2500–3000 tr/min (peut déclencher une régénération).",
      "Sinon : RDV garage partenaire (demandez explicitement un nettoyage Re-FAP).",
      "Vous savez déposer le FAP ? Dépôt possible en Carter-Cash (tarif affiché avant validation)."
    ];
    // remplace toute tarification fantaisiste par nos lignes
    obj.actions = [...core, ...obj.actions.filter(a => !/€/.test(String(a)))];
  }

  obj.actions = ensureWhyClickLine(obj.actions, { risk: obj.risk, isFap });

  // Pédagogie commerciale (toujours, mais adaptée)
  obj.follow_up = Array.isArray(obj.follow_up) ? obj.follow_up : [];
  if (isFap) {
    addUnique(obj.follow_up,
      "Pourquoi le nettoyage Re-FAP ? Prix 10× inférieur au remplacement, résultat équivalent à neuf, garanti 1 an, rapide (~48h) et légal (pas de suppression FAP).");
    addUnique(obj.follow_up,
      "Impact si on attend : risque EGR/turbo/catalyseur, consommation en hausse, contre-visite au contrôle technique.");
  } else {
    addUnique(obj.follow_up, "Reviens avec 3 infos : vitesse d’apparition, freinage oui/non, ressenti au volant ou au siège.");
  }

  obj.legal = "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.";
  if (Array.isArray(obj.actions)) obj.actions = obj.actions.map(sanitizeText);
  if (Array.isArray(obj.follow_up)) obj.follow_up = obj.follow_up.map(sanitizeText);
  if (obj.summary) obj.summary = sanitizeText(obj.summary);

  return obj;
}

function addUnique(arr, line) {
  if (!arr.some(x => (x || '').toLowerCase() === line.toLowerCase())) arr.push(line);
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

// === KILL SWITCH : hors FAP "vibrations" (zéro LLM) ================
function looksLikeVibrationQuery(q) {
  const qn = normalize(q);
  return /\b(vibration|vibrations|vibre|tremblement|tremblements|tremble|equilibrage|equilibrer|jante|jantes|disque voil|cardan|cardans|rotule|rotules|amortisseur|amortisseurs)\b/.test(qn);
}

function fallbackNonFapJSON() {
  return {
    stage: "triage",
    title: "Vibrations = hors périmètre FAP",
    summary: "Vibrations = surtout roues/freins/train roulant. Le bon réflexe : diagnostic mécanique.",
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
      `Prendre RDV pour un diagnostic en garage partenaire (lecture défauts + essai routier).`,
      `Diagnostic ${PRICING.diag_min}–${PRICING.diag_max} € selon garage (prix exact affiché sur la page RDV).`,
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
    follow_up: [],
    legal: "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite."
  };
}
// ===================================================================

// Rendu texte maîtrisé (aucune prose brute du LLM)
function renderTextFromObj(obj) {
  const isFap = hasFAPInSuspected(obj);
  const L = [];
  if (!isFap) {
    L.push("Tri: Hors sujet FAP (vibrations = train roulant/transmission).");
    L.push("");
    L.push("Causes probables :");
    L.push("- Roues déséquilibrées / pneus.");
    L.push("- Disques voilés (si au freinage).");
    L.push("- Rotules/amortisseurs/usure direction.");
    L.push("");
    L.push("À vérifier :");
    L.push("- Vitesse ? (>90 km/h = roues).");
    L.push("- Freinage ? (disques).");
    L.push("- Ressenti au volant ou au siège ? (avant vs transmission).");
    L.push("");
    L.push("Prochaine étape : Clique sur « Garage partenaire » (bouton à droite) — RDV en 2 min, prix du diag affiché, orientation claire.");
  } else {
    L.push("Tri: Problème FAP probable.");
    L.push("");
    L.push("Pourquoi le nettoyage Re-FAP :");
    L.push(`- ${PRICING.fap_clean_min}–${PRICING.fap_clean_max} € (~10× moins qu’un remplacement > ${PRICING.replacement_ref} €).`);
    L.push("- Résultat équivalent à neuf (décolmatage profond), légal et garanti 1 an.");
    L.push("- Rapide (~48h) via garage partenaire ; pas de suppression/reprog illégale.");
    L.push("");
    L.push("Actions :");
    L.push("- Si conditions OK : 20–30 min à 2500–3000 tr/min (peut déclencher une régénération).");
    L.push("- Sinon : RDV garage partenaire (demandez un nettoyage Re-FAP).");
    L.push("- FAP déjà déposé ? Dépôt possible en Carter-Cash (tarif affiché avant validation).");
    L.push("");
    L.push("Prochaine étape : Clique sur « Garage partenaire » (bouton à droite). Si FAP démonté, utilise l’option Carter-Cash.");
  }
  return L.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error:'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error:'Question invalide' });

  // KILL-SWITCH : vibrations & co => pas d'appel LLM
  if (looksLikeVibrationQuery(question)) {
    const obj = sanitizeObj(fallbackNonFapJSON());
    const text = renderTextFromObj(obj);
    return res.status(200).json({ reply: text, data: obj, nextAction: decideNextActionFromObj(obj) });
  }

  // Sinon interroge le LLM (FAP/voyant/etc.) — mais tarifs & pédagogie restent forcés côté serveur
  const system = `
Tu es AutoAI (Re-FAP). Tu aides un conducteur (FAP/DPF, voyant, fumée, perte de puissance…) et tu l’orientes vers l’action la plus sûre et utile.

RÈGLES
- Réponds UNIQUEMENT par UN objet JSON valide conforme au schéma (pas de texte hors JSON).
- Français, ton clair/pro/empathe, phrases courtes, vocabulaire simple.
- Interdit: suppression/neutralisation du FAP. Arrêt immédiat si brûlé, fumée épaisse, bruits métal, voyant moteur clignotant.
- Pas d’invention; si doute → triage ou handoff.
- Tarifs : NE PAS inventer. Les prix affichés à l’utilisateur seront gérés par l’application.
- Hors FAP (pneus/freins/vibrations) : NE PAS proposer Carter-Cash.

SCHÉMA
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

Consigne: rends UNIQUEMENT l'objet JSON conforme au schéma (≤120 mots).
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
