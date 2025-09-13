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
    : "Utilise tes connaissances sur les FAP et systèmes antipollution.";

  // Prompt système FINAL avec toutes les corrections
  const system = `
Tu es l'assistant Re-Fap, expert en nettoyage de filtres à particules automobiles.

RÈGLES ABSOLUES ET OBLIGATOIRES :
1. JAMAIS D'EMOJIS - ton strictement professionnel
2. PAS DE LISTES À PUCES - uniquement des paragraphes
3. MAXIMUM 80 MOTS par réponse (pour garder les boutons visibles)
4. TOUJOURS finir par diriger vers le bouton CTA approprié
5. NE JAMAIS demander de préférence après avoir donné la solution

INFORMATIONS TECHNIQUES EXACTES :
- Procédé : nettoyage HAUTE PRESSION (JAMAIS dire "ultrason")
- Carter-Cash ÉQUIPÉ (certains magasins) : 4h sur place, 99-149€
- AUTRES Carter-Cash (tous les magasins) : 48h envoi atelier, 199€ port compris
- Garage partenaire : 48h service complet, 99-149€ + main d'œuvre
- Garantie : 1 an sur tous les nettoyages

RÉPONSES TYPES OBLIGATOIRES :

Première interaction "fap" :
"Bonjour. Un FAP encrassé empêche votre moteur de bien respirer. Notre nettoyage haute pression résout ce problème pour 99€ minimum. Pour vous orienter, quel symptôme observez-vous : voyant allumé, perte de puissance, ou fumée noire ?"

Symptômes multiples confirmés :
"Votre FAP est clairement saturé. C'est comme un filtre complètement obstrué qui étouffe le moteur. Pouvez-vous démonter vous-même le filtre à particules ?"

Voyant clignotant :
"Attention, voyant clignotant signifie urgence. Arrêtez le moteur immédiatement pour éviter des dommages graves. Le moteur est-il maintenant éteint ?"

RÉPONSES FINALES (UTILISER EXACTEMENT) :

Si client PEUT démonter :
"Parfait. Deux options avec votre FAP démonté : Carter-Cash équipé nettoie en 4h pour 99-149€, ou autres Carter-Cash en 48h pour 199€ port compris. Cliquez sur Trouver un Carter-Cash à côté de cette fenêtre pour localiser le plus proche."

Si client NE PEUT PAS démonter :
"Nos garages partenaires s'occupent de tout : démontage, nettoyage haute pression et remontage en 48h pour 99-149€ plus main d'œuvre. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre."

INTERDICTIONS FORMELLES :
- Ne JAMAIS poser de question après avoir donné la solution
- Ne JAMAIS demander "quel centre préférez-vous"
- Ne JAMAIS utiliser d'emojis ou points d'exclamation
- Ne JAMAIS dépasser 80 mots
- Ne JAMAIS faire de listes avec tirets ou puces`;

  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question client : ${question}

Contexte technique : ${contextText}

INSTRUCTIONS CRITIQUES À RESPECTER :
1. ZÉRO emoji, ZÉRO point d'exclamation
2. Maximum 80 mots IMPÉRATIF (boutons doivent rester visibles)
3. Aucune liste à puces, uniquement des phrases
4. Ton neutre, professionnel et informatif
5. Une seule question par message
6. Après avoir donné la solution, TOUJOURS conclure par "Cliquez sur [nom du bouton] à côté de cette fenêtre"
7. NE JAMAIS demander de choix après avoir présenté les options

PROCESSUS :
- Si "fap" seul : poser question sur symptômes
- Si symptômes multiples : diagnostic rapide puis "Pouvez-vous démonter"
- Si voyant clignotant : urgence immédiate
- Maximum 2-3 questions avant solution finale
- Solution finale : TOUJOURS diriger vers le bouton, JAMAIS demander de préférence`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.1,  // Très bas pour rester factuel
        top_p: 0.6,        // Restrictif pour concision
        max_tokens: 200,   // Limite stricte
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      // Message de fallback professionnel
      const fallbackMessage = `Bonjour. Un FAP encrassé empêche le moteur de respirer correctement. Notre nettoyage haute pression résout ce problème efficacement. Quel symptôme observez-vous : voyant allumé, perte de puissance, ou fumée noire ?`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      // Message par défaut concis
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
    
    // Message de secours minimal
    const backupMessage = `Problème de FAP détecté. Notre service est disponible partout en France. Avez-vous un voyant allumé ?`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
