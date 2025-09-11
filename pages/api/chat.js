// pages/api/chat.js — JSON-contract version
import fs from 'fs';
import path from 'path';

// ===== 0) Utilities =====
const STOPWORDS_FR = new Set([
  'le','la','les','de','des','du','un','une','et','ou','au','aux','en','à','a','d\'','l\'',
  'pour','avec','sur','est','c\'est','il','elle','on','tu','te','ton','ta','tes','vos','votre',
  'mes','mon','ma','mais','plus','moins','que','qui','dans','ce','cet','cette','ses','son','leurs'
]);

const PARTNER = {
  GARAGE_LABEL: 'Prendre RDV avec un garage partenaire',
  GARAGE_URL: 'https://re-fap.fr/trouver_garage_partenaire/',
  GARAGE_REASON:
    'Partout en France, près de chez vous : plusieurs garages au choix, RDV en quelques clics au meilleur prix pour un diagnostic et une solution adaptée.',
  CARTER_LABEL: 'FAP démonté ? Dépose en Carter-Cash',
  CARTER_URL: 'https://auto.re-fap.fr',
  CARTER_REASON: 'Si vous pouvez déposer le FAP : apportez-le en Carter-Cash pour un nettoyage Re-FAP.',
  IDG_LABEL: 'Diagnostic électronique proche de chez vous',
  IDG_URL:
    'https://www.idgarages.com/fr-fr/prestations/diagnostic-electronique?utm_source=re-fap&utm_medium=partenariat&utm_campaign=diagnostic-electronique&ept-publisher=re-fap&ept-name=re-fap-diagnostic-electronique',
  IDG_REASON: 'Lire les codes défauts avant d’intervenir.'
};

function normalize(s = '') {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenize(s) {
  return normalize(s)
    .split(' ')
    .filter((t) => t && t.length > 2 && !STOPWORDS_FR.has(t));
}

function parseBlocks(raw) {
  const parts = raw.split(/\n(?=\[[^\]]*\]\s*)/g);
  return parts
    .map((p) => {
      const m = p.match(/^\([^\]]*\)\s*([\s\S]*)$/); // dummy to keep compatibility
      const m2 = p.match(/^\[([^\]]*)\]\s*([\s\S]*)$/);
      const mm = m2 || m;
      if (!mm) return null;
      const title = (mm[1] || '').trim();
      const body = (mm[2] || '').trim();
      const synLine = body.match(/^Synonymes:\s*(.+)$/mi);
      const synonyms = synLine
        ? synLine[1].split(/[,|]/).map((s) => s.trim()).filter(Boolean)
        : [];
      return { title, body, synonyms };
    })
    .filter(Boolean);
}

function scoreBlock(block, queryTokens) {
  const bag = tokenize(block.title + ' ' + block.body + ' ' + (block.synonyms || []).join(' '));
  if (!bag.length) return 0;
  let hits = 0;
  for (const t of queryTokens) if (bag.includes(t)) hits++;
  const titleHits = tokenize(block.title).filter((t) => queryTokens.includes(t)).length;
  const synHits = tokenize((block.synonyms || []).join(' ')).filter((t) => queryTokens.includes(t)).length;
  return hits + 1.5 * titleHits + 1.2 * synHits;
}

function classifyFallback(text) {
  const txt = normalize(text);
  if (/\bfap\b|\bdpf\b|\bfiltre a particule/.test(txt)) return { type: 'FAP' };
  if (/\bdiag(nostic)?\b|\brdv\b|\brendez.?vous\b|\burgent/.test(txt)) return { type: 'DIAG' };
  return { type: 'GEN' };
}

// ===== 1) JSON Contract Helpers =====
function ensureHttps(u) {
  if (typeof u !== 'string') return u;
  if (!/^https?:/i.test(u)) return u;
  return u.replace(/^http:/i, 'https:');
}

function parseBotJSON(text) {
  // Try straight parse
  try {
    const o = JSON.parse(text);
    if (o && typeof o === 'object') return o;
  } catch {}
  // Extract first {...} block
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      if (o && typeof o === 'object') return o;
    } catch {}
  }
  return null;
}

function isFAPCase(resp) {
  const arr = Array.isArray(resp?.suspected) ? resp.suspected : [];
  return arr.some((s) => /\bfap\b|\bdpf\b/i.test(String(s)));
}

function normalizeBot(resp) {
  if (!resp || typeof resp !== 'object') return null;

  // Default CTA if missing
  if (!resp.cta || !resp.cta.url) {
    resp.cta = {
      label: PARTNER.GARAGE_LABEL,
      url: PARTNER.GARAGE_URL,
      reason: PARTNER.GARAGE_REASON
    };
  }

  // Safety: enforce HTTPS
  resp.cta.url = ensureHttps(resp.cta.url);
  if (Array.isArray(resp.alt_cta)) {
    resp.alt_cta = resp.alt_cta.map((c) => ({ ...c, url: ensureHttps(c.url) }));
  } else {
    resp.alt_cta = [];
  }

  // Hors FAP or not in diagnosis => strip Carter-Cash & prices from actions/alt_cta
  const fapOK = isFAPCase(resp) && resp.stage === 'diagnosis';
  if (!fapOK) {
    if (Array.isArray(resp.actions)) {
      resp.actions = resp.actions.filter((a) => !/€|carter-?cash/i.test(String(a)));
    }
    resp.alt_cta = resp.alt_cta.filter((c) => !/carter-?cash/i.test(`${c?.label || ''} ${c?.url || ''}`));
  }

  // Risk normalization
  if (!['low', 'moderate', 'high'].includes(resp.risk)) resp.risk = 'moderate';

  return resp;
}

function classifyFromJSON(resp) {
  if (!resp) return { type: 'GEN' };
  if (isFAPCase(resp)) return { type: 'FAP' };
  if (resp.stage === 'handoff') return { type: 'DIAG' };
  return { type: 'GEN' };
}

// ===== 2) Prompt Builder =====
const CONTRACT_PROMPT = `
Tu es AutoAI (Re-FAP). Tu aides un conducteur à comprendre des symptômes (FAP/DPF, voyant, fumée, perte de puissance…) et tu l’orientes vers l’action la plus sûre et utile.

RÈGLES IMPÉRATIVES
- Réponds UNIQUEMENT par UN seul objet JSON valide conforme au schéma ci-dessous. Zéro texte hors JSON, zéro champ en plus, zéro commentaires.
- Français, ton clair/pro/empathe, phrases courtes, vocabulaire simple.
- Actions concrètes, sûres et légales. Interdit : suppression/neutralisation du FAP (illégal). Arrêt immédiat si odeur de brûlé, fumée très épaisse, bruits métalliques ou voyant moteur clignotant / risque casse turbo.
- Pas d’invention quand il manque de l’info : rester en triage ou passer en handoff (garage).
- Tolère fautes/accents manquants. Si l’utilisateur dit “je ne sais pas”, propose une observation simple à la place.

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
- Intention vague → stage="triage" ; poser 3–5 questions oui/non discriminantes :
  (voyant FAP/moteur ? fumée noire ? perte de puissance / mode dégradé ? trajets courts répétés ? dernier trajet >20 min à >2500 tr/min ? odeur de brûlé ?)
  risk="low" ; cta: garage partenaire (voir règles CTA).

- ≥2 signaux FAP → stage="diagnosis" ; suspected inclut "FAP" ; risk="moderate" (ou "high" si voyant clignote / brûlé / bruit métallique / mode dégradé sévère) ;
  actions: régénération 20–30 min à 2500–3000 tr/min (si conditions OK), contrôler capteur pression diff. / admissions ; si aucun effet → garage.
  Pédagogie : expliquer brièvement que le meilleur rapport prix/efficacité/durée est un nettoyage FAP, en privilégiant Re-FAP.

- Signaux critiques / doute sérieux → stage="handoff" ; risk="high" ; actions de sécurité + orientation garage.
- ESCALADE SYSTÉMATIQUE : si voyant moteur **clignote**, odeur de brûlé, fumée très épaisse, bruits métalliques, ou mode dégradé sévère → stage="handoff", risk="high".

- HORS PÉRIMÈTRE (non-FAP / châssis/roues/freins/direction/suspension/pneus, ex. *vibrations en roulant*) :
  - Donner au max 2–3 causes plausibles + 2 vérifications simples & sûres.
  - Conclure explicitement que le cas est hors périmètre prioritaire du bot et qu’un diagnostic atelier est nécessaire.
  - stage="handoff" par défaut ; risk="high" si signes de danger (vibrations fortes au freinage, direction qui tire, bruits métalliques, odeur de brûlé, témoins ABS/ESP/frein, fumée, perte de contrôle potentielle).
  - cta principal = garage partenaire Re-FAP (voir règles CTA). Ne pas afficher de prix FAP.

RÈGLES CTA & PÉDAGOGIE (toujours appliquer)
A) Garage partenaire Re-FAP (raison en 1 phrase):
  - “Mise en relation partout en France, près de chez vous”
  - “Plusieurs garages au choix”
  - “RDV en quelques clics, au meilleur prix”
  - “Diagnostic + solution adaptée”
  Exemple reason: "${PARTNER.GARAGE_REASON}"
  cta attendu :
    - label: "${PARTNER.GARAGE_LABEL}"
    - url:   "${PARTNER.GARAGE_URL}"

B) Si FAP suspecté/confirmé (stage="diagnosis" avec FAP ou "handoff" lié à FAP) :
  - Expliquer brièvement : “Le meilleur rapport prix/efficacité/long terme = nettoyage FAP Re-FAP (évite un remplacement > 1000 €).”
  - Demander si l’utilisateur sait déposer le FAP.
  - S’il sait déposer → proposer **Carter-Cash** en alt_cta :
      label:  "${PARTNER.CARTER_LABEL}"
      url:    "${PARTNER.CARTER_URL}"
      reason: "${PARTNER.CARTER_REASON}"
  - Sinon / si doute → **Garage partenaire** (cta principal) + mention explicite “demandez un nettoyage Re-FAP”.
  - Ne JAMAIS suggérer suppression/neutralisation du FAP.
  - Garantie : toujours “1 an”.
  - Prix (uniquement si FAP) : “Nettoyage 99–149 € (≈10× moins qu’un remplacement > 1000 €)”.

C) Hors FAP (incertain / EGR / autre) :
  - cta principal = garage partenaire (même reason court).
  - alt_cta (diagnostic électronique) UNIQUEMENT si voyant/doute électronique :
      label:  "${PARTNER.IDG_LABEL}"
      url:    "${PARTNER.IDG_URL}"
      reason: "${PARTNER.IDG_REASON}"

CONSTRUCTION
- title 4–7 mots ; summary 1–2 phrases ; questions (triage) 3–5 ; suspected court ; actions 2–4 ;
- cta.url en HTTPS ; follow_up 1–2 ; legal : rappeler interdiction suppression FAP + “pas un diagnostic officiel”.
- En cas FAP : inclure dans actions “Pouvez-vous déposer le FAP vous-même ? Si oui : apport Carter-Cash ; sinon : RDV garage partenaire (demandez un nettoyage Re-FAP).”.
- Ne jamais afficher de prix si le cas n’est pas FAP.
- Interdit dans "suspected" : pourcentages/probabilités.

NE FOURNIS QUE L’OBJET JSON. AUCUN TEXTE AUTOUR.`;

// ===== 3) API Route =====
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error: 'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Question invalide' });

  let raw;
  try {
    raw = fs.readFileSync(path.join(process.cwd(), 'data', 'data.txt'), 'utf-8');
  } catch {
    raw = '';
  }

  const blocks = raw ? parseBlocks(raw) : [];
  const queryTokens = tokenize(`${historique || ''} ${question}`);
  const ranked = blocks
    .map((b) => ({ b, s: scoreBlock(b, queryTokens) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.b);

  const contextText = ranked.length
    ? ranked.map((b) => `[${b.title}]\n${b.body}`).join('\n\n')
    : 'Aucune correspondance fiable dans la base locale.';

  const system = CONTRACT_PROMPT;
  const userContent = `Historique (résumé): ${historique || '(vide)'}\nQuestion: ${question}\n\n=== CONTEXTE STRUCTURÉ ===\n${contextText}`;

  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-medium-latest',
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent }
        ]
      })
    });

    // Network/API error → soft fail
    if (!r.ok) {
      const minimal = ranked.length
        ? `Je m'appuie sur: ${ranked.map((r) => r.title || 'info').join(', ')}.`
        : `Base locale vide. On bascule sur un diagnostic en atelier.`;
      const fallbackJSON = {
        stage: 'handoff',
        title: 'Orientation garage partenaire',
        summary: 'Réponse non disponible. On vous oriente vers un garage partenaire pour un diagnostic fiable.',
        questions: [],
        suspected: [],
        risk: 'moderate',
        actions: [],
        cta: { label: PARTNER.GARAGE_LABEL, url: PARTNER.GARAGE_URL, reason: PARTNER.GARAGE_REASON },
        alt_cta: [],
        follow_up: [],
        legal: 'Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.'
      };
      return res.status(r.status).json({ reply: JSON.stringify(fallbackJSON), data: fallbackJSON, nextAction: classifyFromJSON(fallbackJSON), note: minimal });
    }

    const data = await r.json();
    const rawText = (data.choices?.[0]?.message?.content || '').trim();

    // Parse → Normalize → Return
    const parsed = parseBotJSON(rawText);
    if (!parsed) {
      const fallbackJSON = {
        stage: 'handoff',
        title: 'Diagnostic en atelier',
        summary: 'Réponse non reconnue. Prenez un RDV avec un garage partenaire près de chez vous.',
        questions: [],
        suspected: [],
        risk: 'moderate',
        actions: [],
        cta: { label: PARTNER.GARAGE_LABEL, url: PARTNER.GARAGE_URL, reason: PARTNER.GARAGE_REASON },
        alt_cta: [],
        follow_up: [
          'Indiquez si un voyant est allumé (moteur/ABS/ESP).',
          'Précisez les symptômes clés (perte de puissance, fumée, odeur, vitesse d’apparition).'
        ],
        legal: 'Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.'
      };
      return res.status(200).json({ reply: JSON.stringify(fallbackJSON), data: fallbackJSON, nextAction: classifyFromJSON(fallbackJSON) });
    }

    const normalized = normalizeBot(parsed);
    return res.status(200).json({ reply: JSON.stringify(normalized), data: normalized, nextAction: classifyFromJSON(normalized) });
  } catch (e) {
    const backupJSON = {
      stage: 'triage',
      title: 'Questions rapides de triage',
      summary: 'Problème technique. Répondez à ces questions et je vous oriente ensuite.',
      questions: [
        { id: 'q1', q: 'Voyant moteur/clignotant allumé ?' },
        { id: 'q2', q: 'Perte de puissance ou fumée ?' },
        { id: 'q3', q: 'Trajets très courts répétés récemment ?' }
      ],
      suspected: [],
      risk: 'low',
      actions: [
        'Si voyant clignote/odeur de brûlé/bruits métalliques : arrêtez et faites remorquer.'
      ],
      cta: { label: PARTNER.GARAGE_LABEL, url: PARTNER.GARAGE_URL, reason: PARTNER.GARAGE_REASON },
      alt_cta: [],
      follow_up: [],
      legal: 'Ne constitue pas un diagnostic officiel. Suppression/neutralisation du FAP interdite.'
    };
    return res.status(200).json({ reply: JSON.stringify(backupJSON), data: backupJSON, nextAction: classifyFromJSON(backupJSON) });
  }
}
