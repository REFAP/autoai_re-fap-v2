// pages/api/chat.js
import fs from 'fs';
import path from 'path';

const STOPWORDS_FR = new Set([
  'le','la','les','de','des','du','un','une','et','ou','au','aux','en','à','a','d\'','l\'',
  'pour','avec','sur','est','c\'est','il','elle','on','tu','te','ton','ta','tes','vos','votre',
  'mes','mon','ma','mais','plus','moins','que','qui','dans','ce','cet','cette','ses','son','leurs'
]);

function normalize(s='') {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu,'')
    .replace(/[^\p{L}\p{N}\s\-]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function tokenize(s) {
  return normalize(s).split(' ').filter(t => t && t.length>2 && !STOPWORDS_FR.has(t));
}

function parseBlocks(raw) {
  const parts = raw.split(/\n(?=\[[^\]]*\]\s*)/g);
  return parts.map(p => {
    const m = p.match(/^\[([^\]]*)\]\s*([\s\S]*)$/);
    if (!m) return null;
    const title = m[1] || '';
    const body  = (m[2] || '').trim();
    const synLine = body.match(/^Synonymes:\s*(.+)$/mi);
    const synonyms = synLine ? synLine[1].split(/[,|]/).map(s=>s.trim()).filter(Boolean) : [];
    return { title, body, synonyms };
  }).filter(Boolean);
}

function scoreBlock(block, queryTokens) {
  const bag = tokenize(block.title + ' ' + block.body + ' ' + (block.synonyms||[]).join(' '));
  if (!bag.length) return 0;
  let hits = 0;
  for (const t of queryTokens) if (bag.includes(t)) hits++;
  const titleHits = tokenize(block.title).filter(t=>queryTokens.includes(t)).length;
  const synHits   = tokenize((block.synonyms||[]).join(' ')).filter(t=>queryTokens.includes(t)).length;
  return hits + 1.5*titleHits + 1.2*synHits;
}

function classify(text) {
  const txt = normalize(text);
  if (/\bfap\b|\bdpf\b|\bfiltre a particule/.test(txt)) return { type:'FAP' };
  if (/\bdiag(nostic)?\b|\brdv\b|\brendez.?vous\b|\burgent/.test(txt)) return { type:'DIAG' };
  return { type:'GEN' };
}

function decideNextActionFromObj(obj) {
  if (!obj || typeof obj !== 'object') return { type:'GEN' };
  const suspected = Array.isArray(obj.suspected) ? obj.suspected.join(' ').toLowerCase() : '';
  const hasFap = /fap|dpf|filtre.*particule/.test(suspected);
  if ((obj.stage === 'diagnosis' && hasFap) || (obj.stage === 'handoff' && hasFap)) return { type:'FAP' };
  if (obj.stage === 'diagnosis' || obj.stage === 'handoff') return { type:'DIAG' };
  return { type:'GEN' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error:'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error:'Question invalide' });

  let raw;
  try {
    raw = fs.readFileSync(path.join(process.cwd(),'data','data.txt'),'utf-8');
  } catch {
    return res.status(500).json({ error:'Erreur de lecture des données' });
  }

  const blocks = parseBlocks(raw);
  const queryTokens = tokenize(`${historique||''} ${question}`);

  const ranked = blocks
    .map(b => ({ b, s: scoreBlock(b, queryTokens) }))
    .sort((a,b) => b.s - a.s)
    .slice(0, 3)
    .map(x => x.b);

  const contextText = ranked.length
    ? ranked.map(b => `[${b.title}]\n${b.body}`).join('\n\n')
    : "Aucune correspondance fiable dans la base locale. Donne une réponse brève et honnête, puis pose 2 questions de clarification utiles.";

  const system = `
Tu es AutoAI (Re-FAP). Tu aides un conducteur à comprendre des symptômes (FAP/DPF, voyant, fumée, perte de puissance…) et tu l’orientes vers l’action la plus sûre et utile.

RÈGLES IMPÉRATIVES
- Réponds UNIQUEMENT par UN seul objet JSON valide conforme au schéma ci-dessous. Zéro texte hors JSON, zéro champ en plus, zéro commentaires.
- Français, ton clair/pro/empathe, phrases courtes, vocabulaire simple.
- Actions concrètes, sûres et légales. Interdit: suppression/neutralisation du FAP (illégal). Arrêt immédiat si odeur de brûlé, fumée très épaisse, bruits métalliques ou voyant moteur clignotant / risque casse turbo.
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
- Intention vague → stage="triage" ; 3–5 questions oui/non (voyant FAP/moteur ? fumée noire ? perte de puissance ? trajets courts répétés ? dernier trajet >20 min à >2500 tr/min ? odeur de brûlé ?). risk="low" ; cta garage partenaire.
- ≥2 signaux FAP → stage="diagnosis" ; suspected inclut "FAP" ; risk="moderate" (ou "high" si voyant clignote / brûlé / bruit métallique / mode dégradé sévère) ; actions: régénération route si conditions OK, contrôles capteurs ; sinon garage. Pédagogie: nettoyage FAP Re-FAP (99–149 €, ≈10× moins qu’un remplacement >1000 €), garantie 1 an.
- Signaux critiques / doute sérieux → stage="handoff", risk="high" ; actions de sécurité + orientation garage.
- Hors FAP (vibrations, pneus, freins...) → hors périmètre : donner 2–3 vérifs simples puis cta garage partenaire.
- ESCALADE SYSTÉMATIQUE : voyant moteur clignotant / odeur de brûlé / fumée très épaisse / bruits métalliques / mode dégradé sévère → stage="handoff".

RÈGLES CTA
- cta principal garage partenaire (toujours HTTPS, label “Prendre RDV avec un garage partenaire”, url “https://re-fap.fr/trouver_garage_partenaire/”, reason court: “Partout en France, près de chez vous : plusieurs garages au choix, RDV en quelques clics au meilleur prix pour un diagnostic et une solution adaptée.”).
- Si FAP suspecté/confirmé: demander si l’utilisateur sait déposer son FAP. S’il sait → alt_cta Carter-Cash (https://auto.re-fap.fr). Sinon → rester sur garage partenaire et “demander un nettoyage Re-FAP”.

CONSTRUCTION
- title 4–7 mots ; summary 1–2 phrases ; questions (triage) 3–5 ; suspected court ; actions 2–4 ; follow_up 1–2 ; legal: interdiction suppression FAP + “pas un diagnostic officiel”.
- Forme courte.`;

  const userContent = `
Historique (résumé): ${historique||'(vide)'}
Question: ${question}

=== CONTEXTE STRUCTURÉ ===
${contextText}

Consigne de sortie:
- Fournis UNIQUEMENT l'objet JSON (conforme au schéma). AUCUN texte autour.
- ≤ 120 mots, clair, listes concises ok.`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 600,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const minimal = ranked.length
        ? `Je m'appuie sur: ${ranked.map(r=>r.title||'info').join(', ')}. ${ranked[0].body.split('\n').slice(0,4).join(' ')}`
        : `Je ne trouve pas d'info locale fiable. Dis-moi: voyant allumé ? perte de puissance ? odeur/fumée ?`;
      return res.status(r.status).json({ reply: minimal, data: null, nextAction: classify(minimal) });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim() || "Réponse indisponible pour le moment.";

    // Essaie de parser l'objet JSON renvoyé par le modèle
    let obj = null;
    try { obj = JSON.parse(reply); } catch { obj = null; }

    const nextAction = obj ? decideNextActionFromObj(obj) : classify(reply);
    return res.status(200).json({ reply, data: obj, nextAction });

  } catch {
    const backup = `Problème technique. Réponds à ces 2 questions: (1) voyant allumé ? (2) perte de puissance ? Puis on oriente.`;
    return res.status(200).json({ reply: backup, data: null, nextAction: { type:'GEN' } });
  }
}
