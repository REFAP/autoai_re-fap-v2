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
  
  // Classification améliorée et plus précise
  if (/voyant.*clignotant|urgent|arrêt.*immédiat|danger/.test(txt)) return { type:'URGENT' };
  if (/\bfap\b|\bdpf\b|\bfiltre.*particule|saturé|encrassé|colmaté/.test(txt)) return { type:'FAP' };
  if (/\begr\b|vanne.*egr|recirculation.*gaz/.test(txt)) return { type:'EGR' };
  if (/\badblue\b|niveau.*adblue|def\b/.test(txt)) return { type:'ADBLUE' };
  if (/\bdiag(nostic)?\b|\brdv\b|\brendez.?vous|garage.*partenaire|carter.*cash/.test(txt)) return { type:'DIAG' };
  
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
    : "Aucune correspondance dans la base. Utilise tes connaissances générales sur les FAP et systèmes antipollution.";

  // Prompt système SIMPLIFIÉ et DIRECT
  const system = `
Tu es l'assistant virtuel Re-Fap, expert en nettoyage de filtres à particules (FAP).

RÈGLES ABSOLUES :
1. CONCISION : Maximum 100-120 mots par réponse (sauf solution finale)
2. UNE QUESTION À LA FOIS : Ne jamais poser plusieurs questions ensemble
3. PROGRESSIF : D'abord diagnostic, PUIS solutions (pas l'inverse)
4. PARAGRAPHES : Éviter les listes à puces, privilégier le texte fluide

PROCESSUS STRICT :
Étape 1 : Message d'accueil court + UNE question diagnostique
Étape 2 : Selon la réponse, UNE autre question OU diagnostic
Étape 3 : Si problème confirmé, présenter LA solution adaptée
Étape 4 : Question finale : "Êtes-vous capable de démonter vous-même votre FAP ?"

NE JAMAIS présenter les 3 options de service avant d'avoir diagnostiqué le problème.

INFORMATIONS SERVICES (à utiliser APRÈS diagnostic) :
- Carter-Cash équipé : 4h, 99-149€
- Carter-Cash non équipé : 48h, 199€ port compris (partout en France)
- Garage partenaire : 48h, 99-149€ + main d'œuvre

PREMIÈRE INTERACTION sur "fap" seul :
"Bonjour ! Je suis votre assistant Re-Fap. Je comprends votre inquiétude concernant votre filtre à particules. Notre service est disponible partout en France pour résoudre ces problèmes à partir de 99€.

Pour vous orienter au mieux, pouvez-vous me dire quel symptôme principal vous observez : un voyant allumé, une perte de puissance, de la fumée noire, ou autre chose ?"

ATTENDRE LA RÉPONSE avant de continuer.`;

  // Consigne utilisateur SIMPLIFIÉE
  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question client : ${question}

=== CONTEXTE ===
${contextText}

INSTRUCTIONS CRITIQUES :
1. LONGUEUR : 100-120 mots MAX (sauf présentation finale des solutions)
2. STRUCTURE : Une seule question par message, attendre la réponse
3. Ne JAMAIS lister toutes les options avant le diagnostic
4. Si le client dit juste "fap", poser UNE question sur les symptômes
5. Si symptômes multiples graves, passer vite au diagnostic (2 questions max)

ADAPTATION :
- Si "fap" seul → Question sur les symptômes principaux
- Si symptômes décrits → Question de confirmation (voyant fixe/clignotant)
- Si urgence confirmée → Solution directe
- Toujours finir par : "Êtes-vous capable de démonter vous-même votre FAP ?"

INTERDICTION : Ne pas présenter les 3 types de services dans le premier message.`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.2,  // Plus bas pour plus de concision
        top_p: 0.8,        // Plus restrictif pour éviter la verbosité
        max_tokens: 400,   // Limité pour forcer la concision
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const fallbackMessage = `Bonjour ! Je suis votre assistant Re-Fap. Notre service de nettoyage professionnel est disponible partout en France à partir de 99€.

Pour vous aider efficacement, pouvez-vous me dire quel problème vous rencontrez avec votre FAP : voyant allumé, perte de puissance, fumée noire, ou autre symptôme ?`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      const defaultReply = `Bonjour ! Je suis votre assistant Re-Fap, spécialisé dans le nettoyage de filtres à particules. Notre service est disponible partout en France à partir de 99€.

Quel symptôme principal observez-vous sur votre véhicule : voyant allumé, perte de puissance, fumée noire, ou autre chose ?`;
      
      return res.status(200).json({ 
        reply: defaultReply, 
        nextAction: { type: 'GEN' } 
      });
    }

    return res.status(200).json({ 
      reply, 
      nextAction: classify(reply) 
    });

  } catch (error) {
    console.error('Erreur API:', error);
    
    const backupMessage = `Bonjour ! Je comprends que vous avez un souci de FAP. Notre service est disponible partout en France.

Pour vous orienter vers la meilleure solution, pouvez-vous me dire si vous avez un voyant allumé sur votre tableau de bord ?`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
