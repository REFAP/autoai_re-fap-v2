// pages/api/chat.js
import fs from 'fs';
import path from 'path';

// --- utils ----------------------------------------------------
const STOPWORDS_FR = new Set([
  'le','la','les','de','des','du','un','une','et','ou','au','aux','en','à','a',"d'","l'",
  'pour','avec','sur','est',"c'est",'il','elle','on','tu','te','ton','ta','tes','vos','votre',
  'mes','mon','ma','mais','plus','moins','que','qui','dans','ce','cet','cette','ses','son','leurs'
]);

function normalize(s = '') {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu,'')
    .replace(/[^\p{L}\p{N}\s\-]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function tokenize(s) {
  return normalize(s).split(' ').filter(t => t && t.length > 2 && !STOPWORDS_FR.has(t));
}

// --- RAG parsing & scoring -----------------------------------
function parseBlocks(raw) {
  // Format attendu dans data.txt:
  // [Titre]
  // Synonymes: a, b, c   (optionnel)
  // ...contenu...
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
  const bag = tokenize(block.title + ' ' + block.body + ' ' + (block.synonyms || []).join(' '));
  if (!bag.length) return 0;
  let hits = 0;
  for (const t of queryTokens) if (bag.includes(t)) hits++;
  const titleHits = tokenize(block.title).filter(t => queryTokens.includes(t)).length;
  const synHits   = tokenize((block.synonyms || []).join(' ')).filter(t => queryTokens.includes(t)).length;
  return hits + 1.5 * titleHits + 1.2 * synHits;
}

// --- Catégorisation (source de vérité pour CTA) ---------------
function detectCategory(text = '') {
  const t = normalize(text);

  // FAP (synonymes + codes typiques)
  if (/\bfap\b|\bdpf\b|filtre a particules|p2002\b|p2463\b|p242f\b|p244[a-b]\b/.test(t)) return 'FAP';

  // TURBO
  if (/\bturbo\b|wastegate|surpression|siffle|p0234\b|p0299\b/.test(t)) return 'TURBO';

  // EGR
  if (/\begr\b|vanne egr|p040[0-3]\b/.test(t)) return 'EGR';

  // ADBLUE / SCR
  if (/adblue|uree|scr|compte a rebours|anti.?demarrage|p20ee\b|p2bae\b/.test(t)) return 'ADBLUE';

  // Entretien / générique (pas urgent) → on dirigera vers DIAG
  if (/entretien|revision|vidange|controle technique/.test(t)) return 'GEN';

  // Par défaut
  return 'AUTRE';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error: 'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Question invalide' });

  // 1) Catégorie basée UNIQUEMENT sur la question courante (ne pas polluer avec l’historique)
  const category = detectCategory(question);
  // Politique CTA: Carter-Cash uniquement si catégorie = FAP, sinon DIAG
  const preNextType = category === 'FAP' ? 'FAP' : 'DIAG';

  // 2) RAG local
  let raw = '';
  try {
    raw = fs.readFileSync(path.join(process.cwd(), 'data', 'data.txt'), 'utf-8');
  } catch {
    return res.status(500).json({ error: 'Erreur de lecture des données' });
  }
  const blocks = parseBlocks(raw);
  const queryTokens = tokenize(`${historique || ''} ${question}`);
  const ranked = blocks
    .map(b => ({ b, s: scoreBlock(b, queryTokens) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(x => x.b);

  const contextText = ranked.length
    ? ranked.map(b => `[${b.title}]\n${b.body}`).join('\n\n')
    : "Aucune correspondance fiable dans la base locale. Donne une réponse brève, honnête, puis pose 2 questions utiles pour préciser.";

  // 3) Prompt – structure pédagogique + queue conditionnelle
  const tailForFAP = `
**Prochaine étape :** (1 phrase orientée action)
**Question finale :** Sais-tu démonter ton FAP toi-même ?
→ Oui : [Trouver un Carter-Cash](https://auto.re-fap.fr) • Non : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/)`.trim();

  const tailForDiag = `
**Prochaine étape :** (1 phrase orientée action)
**Question finale :** Souhaites-tu qu’on te mette en relation avec un garage ${category === 'AUTRE' ? 'proche' : 'expert ' + category.toLowerCase()} ?
→ Prendre RDV : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/)`.trim();

  const system = `
Tu es AutoAI, mécano expérimenté, direct et pro.
Objectif: expliquer simplement la situation, les risques et quoi faire maintenant.
Règles:
- 0 blabla, pas d'invention; si tu ne sais pas, dis-le.
- Format COMPACT (≤110 mots), pas de lignes vides superflues.
- Utilise le CONTEXTE quand pertinent.
`.trim();

  const userContent = `
CATEGORY: ${category}   (FAP | TURBO | EGR | ADBLUE | GEN | AUTRE)
Historique (résumé): ${historique || '(vide)'}
Question: ${question}

=== CONTEXTE STRUCTURÉ ===
${contextText}

Structure attendue (respecte les titres EXACTS):
**En bref :** (1 phrase : diagnostic court + niveau d'urgence)
**Pourquoi c'est important :** (1–2 phrases pédagogiques)
**À faire maintenant :**
- (2–4 puces d’actions concrètes)
${preNextType === 'FAP' ? tailForFAP : tailForDiag}
`.trim();

  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
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
      const minimal = preNextType === 'FAP'
        ? `Possible souci FAP. Dis-moi: voyant FAP allumé ? perte de puissance ? odeur/fumée ?`
        : `On priorise avec 2 infos: voyant moteur (fixe/clignotant) ? symptômes (fumée, sifflement, perte de puissance) ?`;
      return res.status(r.status).json({ reply: minimal, nextAction: { type: preNextType } });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim() || 'Réponse indisponible pour le moment.';

    // Sortie stricte: si ce n'est pas FAP, on reste DIAG (pas de Carter-Cash possible)
    const finalType = preNextType;

    return res.status(200).json({ reply, nextAction: { type: finalType } });
  } catch {
    const backup = preNextType === 'FAP'
      ? `Problème technique. Voyant FAP ? perte de puissance ? On oriente ensuite (Carter-Cash si FAP démonté, sinon garage partenaire).`
      : `Problème technique. Donne 2 infos: voyant fixe/clignotant ? symptômes (fumée, sifflement, perte de puissance) ?`;
    return res.status(200).json({ reply: backup, nextAction: { type: preNextType } });
  }
}
