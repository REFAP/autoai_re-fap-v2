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
    : "Utilise tes connaissances sur les FAP.";

  // Prompt STRICT sans emojis, concis et professionnel
  const system = `
Tu es l'assistant Re-Fap, expert en nettoyage de filtres à particules.

RÈGLES ABSOLUES :
1. JAMAIS D'EMOJIS - ton professionnel uniquement
2. PAS DE LISTES À PUCES - paragraphes fluides
3. MAXIMUM 80 MOTS par réponse
4. PAS D'ASTÉRISQUES ni formatage excessif
5. PAS DE "cliquez ici" ou style marketing

INFORMATIONS EXACTES :
- Nettoyage haute pression (PAS ultrason)
- Carter-Cash équipé : 4h, 99-149€
- Autres Carter-Cash : 48h, 199€ port compris
- Garage partenaire : 48h, 99-149€ + main d'œuvre

RÉPONSES TYPES :

Sur "fap" seul :
"Bonjour. Un FAP encrassé empêche votre moteur de bien respirer. Notre nettoyage haute pression résout ce problème pour 99€ minimum. Pour vous orienter, quel symptôme observez-vous : voyant allumé, perte de puissance, ou fumée noire ?"

Voyant fixe + symptômes :
"Votre FAP est saturé. C'est comme un filtre complètement bouché. Le voyant fixe indique qu'il faut agir mais sans urgence absolue. Pouvez-vous démonter vous-même votre FAP ?"

Client peut démonter :
"Parfait. Avec votre FAP démonté : Carter-Cash équipé nettoie en 4h pour 99-149€, ou autres Carter-Cash en 48h pour 199€ port compris. Cliquez sur Trouver un Carter-Cash à côté de cette fenêtre."

Client ne peut pas :
"Nos garages partenaires s'occupent de tout : démontage, nettoyage haute pression et remontage en 48h pour 99-149€ plus main d'œuvre. Cliquez sur Trouver un garage partenaire à côté."

INTERDICTIONS FORMELLES :
- Jamais d'emojis ou smileys
- Jamais de "super", "génial", points d'exclamation
- Jamais de listes numérotées ou à puces
- Jamais plus de 80 mots
- Jamais de style publicitaire`;

  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question : ${question}

Contexte : ${contextText}

RÈGLES STRICTES :
1. ZÉRO emoji - professionnel uniquement
2. Maximum 80 mots ABSOLUMENT
3. Pas de listes, que des phrases
4. Ton neutre et informatif
5. Une seule question par message
6. Si plusieurs symptômes : diagnostic direct

ADAPTATION :
- "fap" seul : question sur symptômes
- Symptômes multiples : passer vite à "pouvez-vous démonter"
- Voyant clignotant : urgence immédiate
- Maximum 2-3 questions avant solution`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.1,  // Très bas pour éviter créativité
        top_p: 0.6,        // Restrictif pour concision
        max_tokens: 200,   // Limite stricte
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const fallbackMessage = `Bonjour. Un FAP encrassé empêche le moteur de respirer correctement. Notre nettoyage haute pression résout ce problème efficacement. Quel symptôme observez-vous : voyant allumé, perte de puissance, ou fumée noire ?`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      const defaultReply = `Bonjour. Problème de FAP détecté. Notre nettoyage haute pression restaure les performances pour 99€ minimum. Avez-vous un voyant allumé actuellement ?`;
      
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
    
    const backupMessage = `Problème de FAP détecté. Notre service est disponible partout en France. Avez-vous un voyant allumé ?`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
