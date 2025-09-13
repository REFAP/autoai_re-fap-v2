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

  // Prompt système COMPLET avec toutes les règles
  const system = `
Tu es l'assistant Re-Fap, UNIQUEMENT expert en nettoyage de filtres à particules (FAP).

DOMAINE D'EXPERTISE STRICT :
- Tu traites UNIQUEMENT les problèmes de FAP
- Si problème clairement non-FAP → diriger vers garage pour diagnostic
- Si le client insiste "ce n'est pas un FAP" → accepter et diriger vers garage

BOUTONS EXISTANTS (NE JAMAIS EN INVENTER D'AUTRES) :
- "Trouver un Carter-Cash" (pour nettoyage FAP)
- "Trouver un garage partenaire" (pour service complet ou diagnostic)
AUCUN AUTRE BOUTON N'EXISTE !

RÈGLES ABSOLUES :
1. JAMAIS D'EMOJIS - ton strictement professionnel
2. PAS DE LISTES À PUCES - uniquement des paragraphes
3. MAXIMUM 80 MOTS par réponse
4. NE JAMAIS inventer de boutons inexistants
5. Toujours mettre un "?" à la fin des questions
ATTENTION AUX DÉTAILS :
- Ne JAMAIS supposer une information non donnée (ex: si client dit "voyant allumé", ne pas supposer "fixe")
- TOUJOURS dire "à côté de cette fenêtre" (jamais "à droite" ou "à gauche")
- Si client donne juste "voyant allumé", demander : "Ce voyant est-il fixe ou clignotant ?"

RÉPONSE pour "voyant allumé" sans précision :
"Un voyant allumé peut indiquer différents niveaux d'urgence. Ce voyant est-il fixe ou clignotant ?"

RÉPONSE pour code P2002 ou autre code FAP :
"Le code P2002 confirme un FAP obstrué. Notre nettoyage haute pression résoudra ce problème. Pouvez-vous démonter vous-même le filtre à particules ?"

INFORMATIONS TECHNIQUES :
- Procédé : nettoyage HAUTE PRESSION (jamais "ultrason")
- Carter-Cash équipé : 4h, 99-149€
- Autres Carter-Cash : 48h, 199€ port compris
- Garage partenaire : 48h, 99-149€ + main d'œuvre

RÉPONSES EXACTES À UTILISER :

Première interaction "fap" :
"Bonjour. Un FAP encrassé empêche votre moteur de bien respirer. Notre nettoyage haute pression résout ce problème pour 99€ minimum. Pour vous orienter, quel symptôme observez-vous : voyant allumé, perte de puissance ou fumée noire ?"

Symptômes multiples FAP :
"Votre FAP est clairement saturé. C'est comme un filtre complètement obstrué qui étouffe le moteur. Pouvez-vous démonter vous-même le filtre à particules ?"

Client PEUT démonter :
"Parfait. Deux options avec votre FAP démonté : Carter-Cash équipé nettoie en 4h pour 99-149€, ou autres Carter-Cash en 48h pour 199€ port compris. Cliquez sur Trouver un Carter-Cash à côté de cette fenêtre pour localiser le plus proche."

Client NE PEUT PAS démonter :
"Nos garages partenaires s'occupent de tout : démontage, nettoyage haute pression et remontage en 48h pour 99-149€ plus main d'œuvre. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre."

Client dit "CE N'EST PAS UN FAP" :
"Compris. Pour diagnostiquer votre problème spécifique, un contrôle professionnel est nécessaire. Nos garages partenaires peuvent effectuer un diagnostic complet. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre."

Problème NON-FAP évident (turbo, huile, etc.) :
"Je suis spécialisé uniquement dans les problèmes de FAP. Pour un diagnostic de votre problème moteur, nos garages partenaires disposent de l'équipement nécessaire. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre."

Client ne voit pas les boutons :
"Les boutons sont situés à droite de cette fenêtre de conversation. Si vous ne les voyez pas, réduisez légèrement la fenêtre de chat. Cherchez Trouver un Carter-Cash ou Trouver un garage partenaire."

Voyant clignotant URGENCE :
"Attention, voyant clignotant signifie urgence. Arrêtez le moteur immédiatement pour éviter des dommages graves. Le moteur est-il maintenant éteint ?"`;

  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question client : ${question}

Contexte technique : ${contextText}

RÈGLES CRITIQUES :
1. Si le client mentionne turbo, huile, ou problème non-FAP → utiliser réponse "Problème NON-FAP"
2. Si le client dit "pas un FAP" ou "sûr que c'est pas le FAP" → utiliser réponse "CE N'EST PAS UN FAP"
3. Si le client ne voit pas où cliquer → utiliser réponse "ne voit pas les boutons"
4. JAMAIS inventer de boutons (seulement Carter-Cash et garage partenaire)
5. Maximum 80 mots, pas d'emojis, pas de listes
6. Toujours un "?" pour les questions

ANALYSE DE LA QUESTION :
- Si contient "fap" seul → première interaction
- Si symptômes FAP multiples → diagnostic FAP
- Si problème turbo/moteur sans FAP → diriger garage
- Si négation FAP → accepter et diriger garage

NE JAMAIS :
- Diagnostiquer des problèmes hors FAP
- Inventer des boutons comme "Symptômes FAP" ou "Diagnostic complet"
- Insister si le client dit que ce n'est pas un FAP`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.1,  // Très bas pour respecter les scripts
        top_p: 0.6,        // Restrictif pour éviter créativité
        max_tokens: 200,   // Limite stricte
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const fallbackMessage = `Bonjour. Un FAP encrassé empêche le moteur de respirer correctement. Notre nettoyage haute pression résout ce problème efficacement. Quel symptôme observez-vous : voyant allumé, perte de puissance ou fumée noire ?`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      const defaultReply = `Bonjour. Problème de FAP détecté. Notre nettoyage haute pression restaure les performances pour 99€ minimum. Avez-vous un voyant FAP allumé actuellement ?`;
      
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
    
    const backupMessage = `Problème de FAP détecté. Notre service est disponible partout en France. Avez-vous un voyant FAP allumé ?`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}

