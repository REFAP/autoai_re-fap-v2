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
Tu es AutoAI, mécano expérimenté, direct et pro.
Règles: 1) tri rapide (FAP / non-FAP / hors sujet), 2) 1 à 3 questions max si flou,
3) réponse courte, actionnable, 4) propose un CTA cohérent (FAP -> démonté ? oui = Carter-Cash ; non = Garage partenaire ; non-FAP -> diagnostic partenaire).
Interdits: pas d'inventions; si tu ne sais pas, dis-le. Appuie-toi sur le CONTEXTE quand pertinent.`;

  const userContent = `
Historique (résumé): ${historique||'(vide)'}
Question: ${question}

=== CONTEXTE STRUCTURÉ ===
${contextText}

Consigne de sortie:
- ≤ 120 mots, clair, listes concises ok.
- Termine par "**Prochaine étape**:" + 1 phrase menant à l'action appropriée.`;

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
      return res.status(r.status).json({ reply: minimal, nextAction: classify(minimal) });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim() || "Réponse indisponible pour le moment.";
    return res.status(200).json({ reply, nextAction: classify(reply) });

  } catch {
    const backup = `Problème technique. Réponds à ces 2 questions: (1) voyant allumé ? (2) perte de puissance ? Puis on oriente.`;
    return res.status(200).json({ reply: backup, nextAction: { type:'GEN' } });
  }
}
