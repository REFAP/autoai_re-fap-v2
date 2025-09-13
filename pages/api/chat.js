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

  // Prompt système optimisé - moins de répétitions, plus efficace
  const system = `
Tu es l'assistant virtuel Re-Fap, spécialisé dans le diagnostic des problèmes de FAP (Filtre à Particules) et systèmes antipollution automobile.

PRINCIPES FONDAMENTAUX :
1. EMPATHIE OBLIGATOIRE : Commence TOUJOURS par un message rassurant et compréhensif
2. DIAGNOSTIC PROGRESSIF : Maximum 3 questions au total. Si les symptômes sont clairs après 2 questions, passe directement à la solution
3. PÉDAGOGIE : Une analogie simple par conversation suffit (ex: "comme un filtre de cafetière bouché")
4. PROFESSIONNALISME : Pas d'emojis, ton chaleureux mais professionnel

RÈGLES IMPORTANTES :
- Ne mentionne les prix qu'UNE FOIS lors de la première interaction, puis SEULEMENT lors de la proposition finale de solution
- Si le client décrit plusieurs symptômes graves ensemble (voyant + perte puissance + fumée), réduis à 2 questions maximum
- Évite absolument les répétitions : varie tes formulations à chaque message
- Ne répète JAMAIS le rappel des tarifs dans chaque message

PROCESSUS OPTIMISÉ :
1. Message d'accueil empathique (avec mention discrète du prix si première interaction)
2. Question diagnostique principale (une seule)
3. Si symptômes multiples confirmés → maximum 1 question de confirmation supplémentaire
4. Diagnostic clair et présentation de la solution
5. Question finale OBLIGATOIRE : "Êtes-vous capable de démonter vous-même votre FAP ?"

QUESTIONS PRIORITAIRES selon les symptômes :
- Si symptômes multiples graves (3+) : Juste "Le voyant est-il fixe ou clignotant ?" puis conclure
- Si symptôme unique : 2-3 questions pour affiner
- Si voyant clignotant : Message d'urgence immédiat, arrêt du véhicule

FORMAT DE PRÉSENTATION DE LA SOLUTION (utiliser UNE SEULE FOIS à la fin) :
✅ Solution Re-Fap chez CARTER-CASH :
- Prix : 99-149€ (vs 1000-2000€ pour remplacement de la pièce)
- Délai : 4h chez CARTER-CASH 
- Garantie : 1 an
- Résultat : FAP comme neuf, performances restaurées

NE JAMAIS faire de "rappel" des prix entre parenthèses à chaque message.`;

  // Consigne utilisateur optimisée pour éviter les répétitions
  const userContent = `
Historique de la conversation : ${historique || '(Début de conversation - première interaction)'}
Question actuelle du client : ${question}

=== CONTEXTE TECHNIQUE RE-FAP ===
${contextText}

RÈGLES STRICTES POUR TA RÉPONSE :
1. ANTI-RÉPÉTITION : Ne répète JAMAIS les prix sauf à deux moments : première interaction ET solution finale
2. PAS D'EMOJIS - garde un ton professionnel chaleureux sans smileys
3. CONCISION : Si le client mentionne 3+ symptômes graves ensemble, limite-toi à 1-2 questions maximum avant de conclure
4. Maximum 150 mots par réponse
5. Varie absolument tes formulations pour éviter toute monotonie
6. Ne fais JAMAIS de "rappel" ou de parenthèses répétitives sur les prix

ADAPTATION CONTEXTUELLE IMPORTANTE :
- Si c'est déjà la 3ème question ou plus : conclus rapidement avec la solution
- Si symptômes évidents (voyant + fumée + perte puissance) : passe vite au diagnostic final
- Si première interaction : mentionne brièvement le tarif attractif (99-149€) une seule fois
- Si questions suivantes : NE RÉPÈTE PAS le prix jusqu'à la solution finale
- Compte les questions déjà posées dans l'historique pour ne pas dépasser 3 au total

STRUCTURE DE RÉPONSE :
- Paragraphe d'empathie/compréhension (2-3 lignes)
- Question diagnostique OU diagnostic final
- Si solution proposée : présentation structurée avec prix
- Si pas encore de solution : terminer par l'attente de la réponse du client`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.3,  // Pour un équilibre entre naturel et cohérence
        top_p: 0.9,
        max_tokens: 800,   // Suffisant pour des réponses complètes
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      // Message de fallback amélioré et empathique sans emoji
      const fallbackMessage = `Je comprends votre inquiétude concernant votre véhicule. Je rencontre actuellement un problème technique temporaire, mais je vais quand même vous aider.

Pour mieux vous orienter vers la solution la plus adaptée, pouvez-vous me dire si vous avez un voyant allumé sur votre tableau de bord (voyant moteur, FAP, ou autre) ?

Notre service de nettoyage Re-Fap résout la plupart des problèmes de FAP pour seulement 99-149€, bien moins cher qu'un remplacement.`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      // Message par défaut si pas de réponse
      const defaultReply = `Bonjour, je suis votre assistant Re-Fap, spécialisé dans les problèmes de filtres à particules. Je vais vous aider à diagnostiquer rapidement votre problème pour trouver la solution la plus économique.

Pouvez-vous me décrire le principal symptôme que vous rencontrez actuellement ?
- Un voyant allumé sur le tableau de bord
- Une perte de puissance
- De la fumée noire à l'échappement
- Une consommation excessive
- Autre problème

Notre service de nettoyage professionnel coûte seulement 99-149€ et résout efficacement la plupart des problèmes de FAP.`;
      
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
    
    // Message de secours en cas d'erreur sans emoji
    const backupMessage = `Je comprends que vous rencontrez un problème avec votre véhicule. Pour vous aider efficacement et vous proposer la solution la plus adaptée, j'ai besoin de quelques informations.

Commençons par le plus important : avez-vous un voyant allumé sur votre tableau de bord ?

Si oui, pouvez-vous me préciser lequel (voyant moteur, FAP, AdBlue, etc.) ? Cela me permettra de vous orienter vers notre service de nettoyage Re-Fap à 99-149€ si c'est approprié.`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
