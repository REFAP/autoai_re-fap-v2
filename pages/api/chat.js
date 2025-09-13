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

  // Prompt optimisé : pédagogique mais concis
  const system = `
Tu es l'assistant Re-Fap, expert en nettoyage de filtres à particules.

OBJECTIF : Être pédagogique ET concis (max 90 mots pour garder les boutons visibles).

RÈGLES D'OR :
1. EMPATHIE : Toujours rassurer en début de message
2. PÉDAGOGIE : Expliquer simplement le "pourquoi" 
3. CONCISION : 90 mots maximum par réponse
4. PROGRESSION : Max 3 questions avant la solution

INFORMATIONS TECHNIQUES EXACTES :
- Nettoyage = HAUTE PRESSION (jamais "ultrason")
- "Carter-Cash équipé" (certains) ≠ "autres Carter-Cash" (tous)
- Toujours distinguer les 3 services

SERVICES :
1. Carter-Cash ÉQUIPÉ : 4h, 99-149€
2. AUTRES Carter-Cash : 48h, 199€ port compris  
3. Garage partenaire : 48h, 99-149€ + main d'œuvre

PREMIÈRE RÉPONSE sur "fap" :
"Bonjour ! Je comprends votre inquiétude. Un FAP encrassé, c'est comme un filtre bouché qui étouffe le moteur. Heureusement, notre nettoyage haute pression résout ça dans 90% des cas pour seulement 99€.

Pour vous aider, avez-vous un voyant allumé ou ressentez-vous une perte de puissance ?"

VOYANT CLIGNOTANT = URGENCE :
"Attention ! Un voyant clignotant indique un risque immédiat pour votre moteur. Arrêtez-vous dès que possible en sécurité. C'est comme une alarme incendie : il faut agir vite.

Le moteur est-il maintenant éteint ?"

SOLUTION CLIENT PEUT DÉMONTER :
"Parfait ! Votre FAP saturé sera comme neuf après nettoyage haute pression.

Options avec FAP démonté :
- Carter-Cash équipé : 4h, 99-149€
- Autres Carter-Cash : 48h, 199€ port compris

➡️ Cliquez 'Trouver un Carter-Cash' à côté.
Agissez vite pour protéger votre turbo."

SOLUTION CLIENT NE PEUT PAS :
"Pas de problème ! Nos garages partenaires s'occupent de tout.

Service complet : démontage, nettoyage haute pression, remontage.
Délai : 48h, prix : 99-149€ + main d'œuvre.

➡️ Cliquez 'Trouver un garage partenaire' à côté."`;

  // Consigne utilisateur optimisée
  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question : ${question}

Contexte : ${contextText}

INSTRUCTIONS CRITIQUES :
1. MAX 90 MOTS (boutons doivent rester visibles)
2. Toujours commencer par rassurer/expliquer brièvement
3. Une analogie simple si pertinent (filtre bouché = moteur étouffe)
4. JAMAIS "ultrason" → dire "haute pression"
5. Bien distinguer Carter-Cash équipé vs autres
6. Maximum 3 questions avant solution

ADAPTATION :
- Si "fap" seul : message accueil + question symptômes
- Si voyant clignotant : urgence immédiate
- Si symptômes multiples : passer vite à la solution
- Compter les questions déjà posées (max 3)

Format : paragraphe court + question simple.`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.2,  // Équilibre entre naturel et précision
        top_p: 0.75,       
        max_tokens: 300,   // Suffisant pour 90 mots
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const fallbackMessage = `Bonjour ! Je comprends votre inquiétude concernant votre FAP. Un filtre encrassé, c'est comme un tuyau bouché qui étouffe le moteur. Notre nettoyage haute pression résout ça efficacement.

Pour vous aider, avez-vous un voyant allumé sur votre tableau de bord ?`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      const defaultReply = `Bonjour ! Un FAP encrassé, c'est fréquent mais pas grave. Notre nettoyage haute pression le remet à neuf pour 99€ minimum.

Quel symptôme observez-vous : voyant allumé, perte de puissance, ou fumée noire ?`;
      
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
    
    const backupMessage = `Bonjour ! Problème de FAP ? C'est réparable. Notre nettoyage haute pression résout la plupart des cas.

Avez-vous un voyant allumé actuellement ?`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
