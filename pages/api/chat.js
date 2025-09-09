// pages/api/chat.js
import fs from 'fs';
import path from 'path';

/* =========================================================
   Utils
   ========================================================= */

const STOPWORDS_FR = new Set([
  'le','la','les','de','des','du','un','une','et','ou','au','aux','en','à','a',
  "d'","l'","t'","qu'","jusqu'","puisqu'","lorsqu'",
  'pour','avec','sur','est',"c'est",'il','elle','on','tu','te','toi','ton','ta','tes',
  'vos','votre','mes','mon','ma','mais','plus','moins','que','qui','dans','ce','cet',
  'cette','ses','son','leurs','leur','aux','par','chez','deux','trois'
]);

function normalize(s = '') {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  return normalize(s)
    .split(' ')
    .filter(t => t && t.length > 2 && !STOPWORDS_FR.has(t));
}

/* =========================================================
   RAG : lecture data.txt + scoring simple
   ========================================================= */

function parseBlocks(raw) {
  // Format attendu dans data.txt :
  // [Titre]
  // Synonymes: a,b,c  (optionnel)
  // ...contenu markdown...
  const parts = raw.split(/\n(?=\[[^\]]+\]\s*)/g);
  return parts.map(p => {
    const m = p.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (!m) return null;
    const title = m[1] || '';
    const body  = (m[2] || '').trim();
    const synLine = body.match(/^Synonymes:\s*(.+)$/mi);
    const synonyms = synLine ? synLine[1].split(/[,|]/).map(s => s.trim()).filter(Boolean) : [];
    return { title, body, synonyms };
  }).filter(Boolean);
}

function scoreBlock(block, qTokens) {
  const bag = tokenize(block.title + ' ' + block.body + ' ' + (block.synonyms || []).join(' '));
  if (!bag.length) return 0;
  let hits = 0;
  for (const t of qTokens) if (bag.includes(t)) hits++;
  const titleHits = tokenize(block.title).filter(t => qTokens.includes(t)).length;
  const synHits   = tokenize((block.synonyms || []).join(' ')).filter(t => qTokens.includes(t)).length;
  return hits + 1.5 * titleHits + 1.2 * synHits;
}

/* =========================================================
   Catégorisation légère (basée sur la question)
   ========================================================= */

function detectCategory(text = '') {
  const t = normalize(text);

  // FAP / DPF
  if (/\bfap\b|\bdpf\b|filtre a particules|p2002\b|p2463\b|p242f\b|p244[ab]\b/.test(t)) return 'FAP';

  // TURBO
  if (/\bturbo\b|wastegate|siffle|p0234\b|p0299\b|p2263\b|geometrie variable/.test(t)) return 'TURBO';

  // EGR
  if (/\begr\b|vanne egr|p040[0-3]\b|p040[5-6]\b/.test(t)) return 'EGR';

  // ADBLUE / SCR
  if (/adblue|uree|scr|compte a rebours|anti.?demarrage|p20ee\b|p2bae\b|p204f\b/.test(t)) return 'ADBLUE';

  // Symptômes châssis / génériques
  if (/entretien|revision|vidange|controle technique|vibration|roulement|roue|pneu|amortisseur|equilibrage|parallell?isme/.test(t)) return 'GEN';

  return 'AUTRE';
}

const expertiseLabel = (cat) =>
  (['GEN','AUTRE'].includes(cat) ? 'proche' : `expert ${cat.toLowerCase()}`);

/* =========================================================
   Sanitize : règles éditoriales
   ========================================================= */

// Hors FAP : jamais de Carter-Cash, on pousse RDV garage
function sanitizeReplyNonFAP(text, category) {
  let out = text;

  // Supprimer toute ligne mentionnant Carter(-)Cash
  out = out.replace(/^.*carter[\-\s]?cash.*$/gim, '');

  // Supprimer les choix Oui/Non éventuels
  out = out.replace(/^\s*→\s*Oui\s*:.*$/gim, '');
  out = out.replace(/^\s*(•\s*)?Non\s*:.*$/gim, '');

  out = out.replace(/\n{3,}/g, '\n\n').trim();

  const qLine   = `**Question finale :** Souhaites-tu qu’on te mette en relation avec un garage ${expertiseLabel(category)} ?`;
  const ctaLine = `→ Prendre RDV : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/)`;

  if (!/Question finale\s*:/i.test(out)) {
    out = `${out}\n${qLine}\n${ctaLine}`;
  } else {
    out = out.replace(
      /(\*\*Question finale\s*:\*\*[\s\S]*?)(?=\n\*\*|$)/i,
      `**Question finale :** Souhaites-tu qu’on te mette en relation avec un garage ${expertiseLabel(category)} ?\n${ctaLine}\n`
    );
  }
  return out.trim();
}

// FAP : prudence sur %/garantie/prix/roulage + dédoublonnage + 4 puces max
function sanitizeFAPReply(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const safeLine =
    "Le nettoyage Re-FAP est généralement la meilleure option qualité/prix/fiabilité quand le FAP n’est pas endommagé (solution économique et éco-responsable).";

  const rewritten = sentences.map(s => {
    const sLow = s.toLowerCase();
    const hasPct = /(\d{1,3}\s?%)/.test(s);
    const hasGuarantee = /garanti|garantie|garanties/.test(sLow);
    const strongClaim = /(restaur|efficacit|performance)/i.test(s) && (hasPct || hasGuarantee);
    if (hasPct || hasGuarantee || strongClaim) return safeLine;

    // “Rouler 10–15 min … 2500 tr/min” → version conditionnelle
    if (/rouler.*(10|15).*(min|minutes).*2500.*tr\/?min/i.test(sLow)) {
      return "Si voyant récent et sans perte de puissance ni fumée : un trajet d’autoroute 10–15 min à ~2500 tr/min peut aider. Sinon, ne pas rouler et passer au diagnostic.";
    }
    return s;
  });

  let out = rewritten.join(' ');

  // Montants rigides → wording générique
  out = out.replace(/(\d{4,5}\s?€\s?pour\s?un\s?neuf)/gi, "plusieurs milliers d’€ pour un remplacement");
  out = out.replace(/[~≈]?\s*\d{4,5}\s?€/g, "plusieurs milliers d’€");
  out = out.replace(/\benviron\s+\d{4,5}\s?€/gi, "plusieurs milliers d’€");
  out = out.replace(/\b(\d{4,5})\s?€\s*(le|pour\s+un)\s+neuf/gi, "plusieurs milliers d’€ pour un remplacement");
  out = out.replace(/\balternative\s+prouv(ée|e)s?\b/gi, "option souvent recommandée");

  // 1) Dédupe de lignes quasi identiques (évite redite)
  {
    const seen = new Set();
    out = out
      .split('\n')
      .filter((ln) => {
        const key = ln.toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[.,;:!?]/g, '')
          .trim();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join('\n');
  }

  // 2) Limiter à 4 puces dans le bloc "**À faire maintenant :**"
  out = out.replace(/(\*\*À faire maintenant\s*:\*\*[\s\S]*?)(?=\n\*\*|$)/i, (m, block) => {
    const lines = block.split('\n');
    const head = lines.shift(); // "**À faire maintenant :**"
    const bullets = [];
    const others  = [];
    for (const l of lines) {
      if (/^\s*[-•]/.test(l)) bullets.push(l);
      else others.push(l);
    }
    const kept = bullets.slice(0, 4);
    return [head, ...kept, ...others].join('\n');
  });

  // Nettoyage final
  out = out.replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim();
  return out;
}

/* =========================================================
   Handler
   ========================================================= */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error: 'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Question invalide' });

  // Catégorie basée UNIQUEMENT sur la question
  const category = detectCategory(question);
  const nextType = (category === 'FAP') ? 'FAP' : 'DIAG';

  // RAG
  let raw;
  try {
    raw = fs.readFileSync(path.join(process.cwd(), 'data', 'data.txt'), 'utf-8');
  } catch {
    return res.status(500).json({ error: 'Erreur de lecture des données' });
  }
  const blocks = parseBlocks(raw);
  const qTokens = tokenize(`${historique || ''} ${question}`);
  const ranked = blocks
    .map(b => ({ b, s: scoreBlock(b, qTokens) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(x => x.b);

  const contextText = ranked.length
    ? ranked.map(b => `[${b.title}]\n${b.body}`).join('\n\n')
    : "Aucune correspondance fiable dans la base locale. Réponds brièvement et honnêtement, puis pose 2 questions utiles pour préciser.";

  // Tails (fin de réponse) avec UTM
  const tailForFAP = `
**Info :** Quand le FAP n’est pas endommagé (pas fissuré/fondu), le nettoyage Re-FAP est généralement la meilleure option *qualité / prix / fiabilité* (solution économique et éco-responsable).
**Prochaine étape :** (1 phrase orientée action)
**Question finale :** Sais-tu démonter ton FAP toi-même ?
→ Oui : [Trouver un Carter-Cash](https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=cartercash) • Non : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=garage)`.trim();

  const tailForDiag = `
**Prochaine étape :** (1 phrase orientée action)
**Question finale :** Souhaites-tu qu’on te mette en relation avec un garage ${expertiseLabel(category)} ?
→ Prendre RDV : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/)`.trim();

  // Prompt
  const system = `
Tu es AutoAI, mécano expérimenté, direct et pro.
Objectif: expliquer simplement la situation, les risques et quoi faire maintenant.
Règles:
- Pas d'invention; si tu ne sais pas, dis-le.
- Format COMPACT (≤110 mots), sans lignes vides superflues.
- Utilise le CONTEXTE si pertinent.
- Interdiction absolue : si CATEGORY ≠ FAP, ne mentionne jamais "Carter-Cash" ni un choix "Oui/Non".
- N’écris JAMAIS “rouler X minutes à 2500 tr/min” sauf si l’utilisateur indique explicitement voyant récent ET AUCUNE perte de puissance ET AUCUNE fumée.
`.trim();

  const userContent = `
CATEGORY: ${category}   (FAP | TURBO | EGR | ADBLUE | GEN | AUTRE)
Historique (résumé): ${historique || '(vide)'}
Question: ${question}

=== CONTEXTE STRUCTURÉ ===
${contextText}

Structure attendue (titres EXACTS) :
**En bref :** (1 phrase : diagnostic court + niveau d'urgence)
**Pourquoi c'est important :** (1–2 phrases pédagogiques)
**À faire maintenant :**
- (2–4 puces d’actions concrètes)
${nextType === 'FAP' ? tailForFAP : tailForDiag}
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
          { role: 'user',    content: userContent },
        ],
      }),
    });

    if (!r.ok) {
      const minimal = (nextType === 'FAP')
        ? `Possible souci FAP. Voyant FAP ? perte de puissance ? odeur/fumée ?`
        : `On priorise avec 2 infos: voyant moteur (fixe/clignotant) ? symptômes (fumée, sifflement, perte de puissance) ?`;
      return res.status(r.status).json({ reply: minimal, nextAction: { type: nextType } });
    }

    const data  = await r.json();
    let reply   = (data.choices?.[0]?.message?.content || '').trim() || 'Réponse indisponible pour le moment.';
    reply = (nextType === 'FAP')
      ? sanitizeFAPReply(reply)
      : sanitizeReplyNonFAP(reply, category);

    return res.status(200).json({ reply, nextAction: { type: nextType } });
  } catch {
    const backup = (nextType === 'FAP')
      ? `Problème technique. Voyant FAP ? perte de puissance ? On oriente ensuite (Carter-Cash si FAP démonté, sinon garage partenaire).`
      : `Problème technique. Donne 2 infos: voyant fixe/clignotant ? symptômes (fumée, sifflement, perte de puissance) ?`;
    return res.status(200).json({ reply: backup, nextAction: { type: nextType } });
  }
}
