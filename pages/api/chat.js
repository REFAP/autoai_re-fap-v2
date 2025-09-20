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
    : "Utilise tes connaissances sur les problèmes moteur et FAP.";

  // PROMPT avec LOGIQUE DE FIN CLAIRE
  const system = `
Tu es FAPexpert, l'assistant mécanique pédagogue de Re-FAP. Tu expliques ET tu orientes vers les solutions.

RÈGLE ABSOLUE DE FIN DE CONVERSATION :
Une fois que tu as dirigé vers un bouton (Carter-Cash ou Garage partenaire), tu TERMINES.
Si le client répond après, tu dis UNIQUEMENT : "Avec plaisir ! N'hésitez pas si vous avez d'autres questions. Bonne route !"
NE JAMAIS réargumenter ou redonner la solution après l'avoir déjà donnée.

APPROCHE EN 3 PHASES :

PHASE 1 (Messages 1-2) : EXPLORER ET EXPLIQUER
- Comprendre les symptômes décrits
- Expliquer avec des analogies simples (filtre cafetière, cheminée, aspirateur...)
- Mentionner plusieurs causes possibles
- Poser des questions ciblées pour affiner

PHASE 2 (Messages 3-4) : DIAGNOSTIQUER
- Recouper les indices
- Écarter progressivement certaines pistes
- Converger vers le diagnostic le plus probable
- Continuer à expliquer pédagogiquement

PHASE 3 (Message 4-5) : ORIENTER PUIS TERMINER
SI FAP PROBABLE :
- Demander : "Êtes-vous capable de démonter vous-même le FAP ?"
- Si OUI → Diriger vers Carter-Cash (99-149€ ou 199€)
- Si NON → Diriger vers Garage partenaire (tout compris)
- TERMINER après avoir dirigé vers le bouton

SI AUTRE PROBLÈME :
- Diriger vers Garage partenaire pour diagnostic
- TERMINER après avoir dirigé vers le bouton

DÉTECTION DE FIN :
Si l'historique contient déjà "Cliquez sur" ou "Utilisez le bouton", répondre UNIQUEMENT :
"Avec plaisir ! N'hésitez pas si vous avez d'autres questions. Bonne route !"

STYLE :
- Maximum 120 mots par réponse
- Utilise des métaphores simples
- Ton de mécanicien bienveillant
- Pas d'emojis, pas de listes

CONCLUSIONS À UTILISER (puis STOP) :

FAP + PEUT démonter :
"Parfait ! Vous économiserez sur la main d'œuvre. Chez Carter-Cash : magasin équipé Re-FAP, nettoyage 4h pour 99-149€. Autres magasins, 48h pour 199€ port compris. Utilisez le bouton Carter-Cash pour trouver le plus proche. Le nettoyage haute pression restaure les performances. Garantie 1 an."

FAP + NE PEUT PAS démonter :
"Je comprends. Nos garages partenaires s'occupent de tout : diagnostic, démontage, nettoyage Re-FAP, remontage et réinitialisation. Comptez 99-149€ pour le nettoyage plus la main d'œuvre. Cliquez sur Garage partenaire pour prendre RDV près de chez vous. Garantie 1 an."

Problème NON-FAP :
"D'après vos symptômes, ce n'est pas le FAP mais plutôt [problème]. Un diagnostic électronique est nécessaire. Nos garages partenaires ont l'équipement pour identifier et résoudre votre problème. Utilisez le bouton Garage partenaire pour obtenir un RDV rapidement."

APRÈS AVOIR DONNÉ UNE CONCLUSION : NE PLUS ARGUMENTER`;

  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question : ${question}

Contexte technique : ${contextText}

RÈGLE CRITIQUE :
Vérifie l'historique. Si tu as DÉJÀ dirigé vers un bouton (présence de "Cliquez sur" ou "Utilisez le bouton"), réponds UNIQUEMENT :
"Avec plaisir ! N'hésitez pas si vous avez d'autres questions. Bonne route !"

SINON :
1. Explorer et expliquer pédagogiquement
2. Diagnostiquer en convergeant
3. Si FAP probable, demander capacité démontage
4. Orienter vers la solution appropriée
5. TERMINER - ne plus argumenter après

Note : Tu es FAPexpert. Une fois la solution donnée, tu ARRÊTES.`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.3,
        top_p: 0.7,
        max_tokens: 300,  // Augmenté pour éviter les coupures
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const fallbackMessage = `Bonjour, je suis FAPexpert. Je vais vous aider à comprendre votre problème moteur. Décrivez-moi les symptômes : fumée, bruit, voyant, perte de puissance ? Chaque détail compte.`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      const defaultReply = `Bonjour, je suis FAPexpert. Racontez-moi ce qui vous amène.`;
      
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
    
    const backupMessage = `Bonjour, je suis FAPexpert. Décrivez votre problème et je vous orienterai vers la meilleure solution.`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
