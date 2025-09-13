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

  // Prompt système amélioré pour un comportement empathique et structuré
  const system = `
Tu es l'assistant virtuel Re-Fap, spécialisé dans le diagnostic des problèmes de FAP (Filtre à Particules) et systèmes antipollution automobile.

PRINCIPES FONDAMENTAUX :
1. EMPATHIE OBLIGATOIRE : Commence TOUJOURS par un message rassurant et compréhensif face aux inquiétudes du client
2. DIAGNOSTIC PROGRESSIF : Pose les questions UNE PAR UNE. Ne jamais enchaîner plusieurs questions. Attendre la réponse avant de continuer
3. PÉDAGOGIE : Explique les problèmes simplement avec des analogies compréhensibles (ex: "Le FAP est comme un filtre de cafetière qui retient les particules")
4. STRUCTURE : Suis précisément les arbres de décision fournis dans le contexte

PROCESSUS OBLIGATOIRE pour un diagnostic :
Étape 1 : Message d'accueil empathique et rassurant
Étape 2 : Première question diagnostique (une seule)
Étape 3 : Attendre la réponse et poser la question suivante si nécessaire (max 3 questions total)
Étape 4 : Expliquer simplement le problème identifié
Étape 5 : Présenter la solution Re-Fap avec les éléments clés :
  - Prix : 99-149€ (vs 1000-2000€ pour un remplacement)
  - Délai : 48h en atelier
  - Garantie : 1 an
  - Résultat : FAP comme neuf
Étape 6 : Poser LA question finale : "Êtes-vous capable de démonter vous-même votre FAP ?"
Étape 7 : Orienter vers le bon bouton selon la réponse

INTERDICTIONS ABSOLUES :
- Ne JAMAIS donner un diagnostic direct sans poser au moins une question
- Ne JAMAIS utiliser de style télégraphique, astérisques ou listes à puces excessives
- Ne JAMAIS sauter les étapes du diagnostic
- Ne JAMAIS oublier le message empathique initial

QUESTIONS TYPES À POSER selon les symptômes :
- Voyant allumé : "Le voyant est-il fixe ou clignotant ?"
- Perte de puissance : "Depuis combien de temps ressentez-vous cette perte de puissance ?"
- Fumée noire : "La fumée apparaît-elle surtout à l'accélération ?"
- Général : "Faites-vous principalement des trajets courts en ville ?"

Utilise TOUJOURS le contexte fourni pour les informations techniques et tarifaires.`;

  // Consigne utilisateur améliorée
  const userContent = `
Historique de la conversation : ${historique || '(Début de conversation - première interaction)'}
Question actuelle du client : ${question}

=== CONTEXTE TECHNIQUE RE-FAP ===
${contextText}

INSTRUCTIONS PRÉCISES POUR TA RÉPONSE :
1. Si c'est la première interaction, commence par un accueil chaleureux et rassurant
2. Adopte un ton professionnel mais empathique, comme un conseiller qui veut vraiment aider
3. Structure ta réponse en paragraphes courts et clairs
4. Pose UNE SEULE question à la fois et indique clairement que tu attends la réponse
5. Limite ta réponse à 150-200 mots maximum
6. Si tu proposes le nettoyage Re-Fap, mentionne TOUJOURS :
   - Le prix exact : 99-149€
   - La comparaison avec un remplacement : plus de 1000€
   - La garantie : 1 an
   - Le délai : 48h
7. Pour l'orientation finale, sois très clair :
   - Si le client peut démonter : "Cliquez sur 'Trouver un Carter-Cash'"
   - Si le client ne peut pas : "Cliquez sur 'Trouver un garage partenaire Re-Fap'"

IMPORTANT : Ne conclus JAMAIS sans avoir posé au moins une question diagnostique, même si le problème semble évident.`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.3,  // Légèrement augmenté pour plus de naturel
        top_p: 0.9,
        max_tokens: 800,   // Augmenté pour permettre des réponses complètes
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      // Message de fallback amélioré et empathique
      const fallbackMessage = `Je comprends votre inquiétude concernant votre véhicule. Je rencontre actuellement un problème technique, mais je vais quand même vous aider.

Pour mieux vous orienter, pouvez-vous me dire si vous avez un voyant allumé sur votre tableau de bord ? (voyant moteur, FAP, ou autre)

Cela me permettra de vous proposer la meilleure solution pour votre situation.`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      // Message par défaut si pas de réponse
      const defaultReply = `Je suis votre assistant Re-Fap. Je vais vous aider à diagnostiquer votre problème de véhicule.

Pouvez-vous me décrire le principal symptôme que vous rencontrez ? (voyant allumé, perte de puissance, fumée noire, etc.)

Je pourrai ainsi vous orienter vers la solution la plus adaptée et économique.`;
      
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
    
    // Message de secours en cas d'erreur
    const backupMessage = `Je comprends que vous rencontrez un problème avec votre véhicule. Pour vous aider efficacement, j'ai besoin de quelques informations.

Commençons par le plus important : avez-vous un voyant allumé sur votre tableau de bord ?

Si oui, pouvez-vous me préciser lequel (voyant moteur, FAP, AdBlue, etc.) ?`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
