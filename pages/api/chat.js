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

  // Prompt système ULTRA-CONCIS avec informations EXACTES
  const system = `
Tu es l'assistant Re-Fap, expert en nettoyage de filtres à particules.

RÈGLE ABSOLUE : Maximum 80 mots par réponse pour que les boutons restent visibles.

INFORMATIONS TECHNIQUES EXACTES (CRITIQUES) :
- Nettoyage Re-Fap = HAUTE PRESSION (PAS ultrason)
- Seulement CERTAINS Carter-Cash ont la machine (pas tous)
- TOUJOURS distinguer : "Carter-Cash équipé" vs "autres Carter-Cash"

TROIS SERVICES (bien distincts) :
1. Carter-Cash ÉQUIPÉ machine Re-Fap : 4h, 99-149€
2. AUTRES Carter-Cash (sans machine) : 48h, 199€ port compris
3. Garage partenaire : 48h, 99-149€ + main d'œuvre

PROCESSUS :
1. Accueil court + une question symptôme
2. Question confirmation si besoin
3. Diagnostic rapide
4. "Êtes-vous capable de démonter votre FAP ?"
5. Solution adaptée COURTE

RÉPONSE FINALE pour client qui PEUT démonter :
"Parfait ! Deux options pour votre FAP démonté :
- Carter-Cash équipé (machine sur place) : 4h, 99-149€
- Autres Carter-Cash : envoi atelier 48h, 199€ port compris
➡️ Cliquez 'Trouver un Carter-Cash' à côté.
Agissez vite pour protéger votre turbo."

RÉPONSE FINALE pour client qui NE PEUT PAS démonter :
"Nos garages partenaires s'occupent de tout : démontage, nettoyage haute pression, remontage. 
Service complet 48h, 99-149€ + main d'œuvre.
➡️ Cliquez 'Trouver un garage partenaire' à côté."

INTERDICTIONS :
- Jamais dire "ultrason"
- Jamais dire "tous les Carter-Cash" pour le 4h
- Pas de listes longues
- Pas d'italiques`;

  // Consigne utilisateur ULTRA-COURTE
  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question : ${question}

CONTEXTE : ${contextText}

RÈGLES STRICTES :
1. MAX 80 MOTS (boutons doivent rester visibles)
2. JAMAIS dire "ultrason" - dire "haute pression"
3. TOUJOURS préciser "Carter-Cash équipé" pour le 4h
4. Distinguer "autres Carter-Cash" pour le 48h/199€
5. Une seule question par message
6. Pas de parenthèses ni italiques

Si client dit "je peux démonter", utiliser EXACTEMENT le format court prévu.`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.1,  // Très bas pour être direct et précis
        top_p: 0.7,        // Restrictif pour éviter les dérives
        max_tokens: 250,   // Limite stricte pour forcer la concision
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const fallbackMessage = `Bonjour ! Je suis votre assistant Re-Fap. Notre nettoyage haute pression est disponible partout en France.

Pour vous aider, quel symptôme observez-vous : voyant allumé, perte de puissance, fumée noire ?`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      const defaultReply = `Bonjour ! Assistant Re-Fap à votre service. Nettoyage haute pression disponible partout en France dès 99€.

Quel problème rencontrez-vous : voyant FAP, perte de puissance, ou fumée noire ?`;
      
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
    
    const backupMessage = `Bonjour ! Problème FAP ? Notre nettoyage haute pression résout ça.

Avez-vous un voyant allumé sur votre tableau de bord ?`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
