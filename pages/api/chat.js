// pages/api/chat.js
// Mode "prompt seul" + garde-fous côté serveur.

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

function hasFAP(obj){
  const suspected = Array.isArray(obj?.suspected) ? obj.suspected.join(' ').toLowerCase() : '';
  return /fap|dpf|filtre.*particule/.test(suspected);
}

// Force nos règles business si le modèle s'égare
function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // CTA garage partenaire (source de vérité)
  const GARAGE_CTA = {
    label: "Prendre RDV avec un garage partenaire",
    url: "https://re-fap.fr/trouver_garage_partenaire/",
    reason: "Partout en France, près de chez vous : plusieurs garages au choix, RDV en quelques clics au meilleur prix pour un diagnostic et une solution adaptée."
  };
  const ALT_DIAG = {
    label: "Diagnostic électronique proche de chez vous",
    url: "https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique",
    reason: "Lire les codes défauts avant d’intervenir."
  };

  const isFap = hasFAP(obj);

  // Règle dure : HORS FAP => JAMAIS Carter-Cash dans cta/alt_cta
  if (!isFap) {
    obj.cta = GARAGE_CTA;
    // alt_cta = diag électronique, pas Carter-Cash
    obj.alt_cta = [ALT_DIAG];
    if (obj.stage !== 'handoff' && obj.stage !== 'diagnosis') obj.stage = 'triage';
    if (!obj.risk) obj.risk = 'low';
    // Ajoute une mention prix INDICATIVE sans promesse
    if (Array.isArray(obj.actions)) {
      const hasPriceLine = obj.actions.some(a => /diagnostic/i.test(a));
      if (!hasPriceLine) obj.actions.push("Diagnostic 50–90 € selon garage (prix affiché sur la page RDV).");
    } else {
      obj.actions = ["Diagnostic 50–90 € selon garage (prix affiché sur la page RDV)."];
    }
  } else {
    // Cas FAP : cta garage + possibilité d'alt_cta Carter-Cash uniquement si l’utilisateur sait déposer
    // On laisse le modèle gérer alt_cta Carter-Cash via le prompt, mais on garde cta garage par défaut
    if (!obj.cta) obj.cta = GARAGE_CTA;
  }

  // Mentions légales/phrases interdites
  if (!obj.legal) obj.legal = "Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.";
  // Purge toute promesse de “diagnostic gratuit/remboursé/déduit”
  const scrub = (s) => String(s).replace(/diagnostic\s+(gratuit|rembours[ée]|d[ée]duit)/gi, 'diagnostic (tarif variable, voir page RDV)');
  if (Array.isArray(obj.actions)) obj.actions = obj.actions.map(scrub);
  if (obj.summary) obj.summary = scrub(obj.summary);
  if (obj.follow_up) obj.follow_up = obj.follow_up.map(scrub);

  return obj;
}

function decideNextActionFromObj(obj) {
  if (!obj || typeof obj !== 'object') return { type:'GEN' };
  const isFap = hasFAP(obj);
  if ((obj.stage === 'diagnosis' && isFap) || (obj.stage === 'handoff' && isFap)) return { type:'FAP' };
  if (obj.stage === 'diagnosis' || obj.stage === 'handoff') return { type:'DIAG' };
  return { type:'GEN' };
}

// Fallback JSON pour cas hors FAP (ex: vibrations/fibrations)
function fallbackNonFapJSON() {
  return {
    stage: "triage",
    title: "Vibrations = hors périmètre FAP",
    summary: "Les vibrations viennent surtout des roues/freins/train roulant. Mieux vaut un diagnostic mécanique.",
    questions: [
      { id:"q1", q:"À quelle vitesse vibrent-elles ? (>90 km/h = roues)" },
      { id:"q2", q:"Au freinage ? (disques à contrôler)" },
      { id:"q3", q:"Au volant ou dans le siège ? (avant vs transmission)" }
    ],
    suspected: ["roues déséquilibrées", "disques voilés", "rotules/amortisseurs"],
    risk: "low",
    actions: [
      "Contrôler pression/usure pneus et masses d’équilibrage.",
      "Éviter les vitesses élevées jusqu’au contrôle.",
      "Prendre RDV pour un diagnostic en garage partenaire.",
      "Diagnostic 50–90 € selon garage (prix affiché sur la page RDV)."
    ],
    cta: {
      label: "Prendre RDV avec un garage partenaire",
      url: "https://re-fap.fr/trouver_garage_partenaire/",
      reason: "Partout en France, près de chez vous : plusieurs garages au choix, RDV en quelques clics au meilleur prix pour un diagnostic et une solution adaptée."
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

  // --- PROMPT unique (durci) ---
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
- HORS FAP (pneus/freins/train roulant/vibrations) : ne JAMAIS proposer Carter-Cash. CTA principal = garage partenaire.

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
- ESCALADE : voyant moteur clignote / brûlé / fumée très épaisse / bruits métalliques / mode dégradé sévère → stage="handoff", risk="high".

RÈGLES CTA
- CTA par défaut :
  "label": "Prendre RDV avec un garage partenaire",
  "url": "https://re-fap.fr/trouver_garage_partenaire/",
  "reason": "Partout en France, près de chez vous : plusieurs garages au choix, RDV en quelques clics au meilleur prix pour un diagnostic et une solution adaptée."
- Mention tarifs diag : “50–90 € selon garage, prix affiché sur la page de RDV”.
- Si FAP suspecté/confirmé : demander s’il sait déposer le FAP.
  - S’il sait : alt_cta Carter-Cash (https://auto.re-fap.fr). Sinon : rester sur garage partenaire (“demandez un nettoyage Re-FAP”).`;

  const userContent = `
Historique (résumé): ${historique || '(vide)'}
Question: ${question}

Consigne de sortie:
- Fournis UNIQUEMENT l'objet JSON (conforme au schéma). AUCUN texte autour.
- ≤ 120 mots, clair, listes concises ok.
`;

  // Détection hors FAP “vibrations” (tolère fautes : fibrations, etc.)
  const qn = normalize(question);
  const looksLikeVibration = /\bf?ibration|tremblement|vibre|jante|equilibrage|equilibrage|disque voil|cardan|rotule|amortisseur/.test(qn);

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
    const reply = (data.choices?.[0]?.message?.content || '').trim();

    // Parse JSON strict ou fallback hors FAP
    let obj = null;
    try { obj = JSON.parse(reply); } catch { obj = null; }

    if (!obj && looksLikeVibration) {
      obj = fallbackNonFapJSON();
    }

    if (obj) {
      const clean = sanitizeObj(obj) || obj;
      const nextAction = decideNextActionFromObj(clean);
      return res.status(200).json({ reply: JSON.stringify(clean), data: clean, nextAction });
    }

    // Si toujours pas de JSON, on renvoie la prose + classification
    return res.status(200).json({ reply: reply || 'Réponse indisponible.', data: null, nextAction: classify(reply) });

  } catch {
    const obj = looksLikeVibration ? fallbackNonFapJSON() : null;
    if (obj) return res.status(200).json({ reply: JSON.stringify(obj), data: obj, nextAction: decideNextActionFromObj(obj) });
    const backup = `Problème technique. Réponds à ces 2 questions: (1) voyant allumé ? (2) perte de puissance ? Puis on oriente.`;
    return res.status(200).json({ reply: backup, data: null, nextAction: { type:'GEN' } });
  }
}
