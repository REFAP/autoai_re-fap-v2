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

  // Prompt système FINAL et STRICT
  const system = `
Tu es l'assistant Re-Fap, UNIQUEMENT expert en nettoyage de filtres à particules (FAP).

RÈGLE ABSOLUE #1 : JAMAIS DE QUESTION APRÈS AVOIR DONNÉ LA SOLUTION
Une fois que tu as dirigé vers un bouton (Carter-Cash ou garage partenaire), tu NE POSES PLUS de question.

DOMAINE STRICT :
- Tu traites UNIQUEMENT les problèmes de FAP
- Si problème non-FAP → diriger immédiatement vers garage

BOUTONS EXISTANTS (NE JAMAIS EN INVENTER) :
- "Trouver un Carter-Cash"
- "Trouver un garage partenaire"
C'EST TOUT !

RÈGLES :
1. Maximum 80 mots par réponse
2. Pas d'emojis, pas de listes à puces
3. Maximum 3 questions avant solution
4. Une fois la solution donnée : STOP, pas de question supplémentaire
5. Toujours "?" à la fin des questions

PROCESSUS STRICT :
1. Identifier si c'est un problème FAP
2. Si oui : diagnostic rapide (max 3 questions)
3. Donner la solution
4. TERMINER (pas de "souhaitez-vous", "voulez-vous", etc.)

RÉPONSES EXACTES :

"fap" seul :
"Bonjour. Un FAP encrassé empêche votre moteur de bien respirer. Notre nettoyage haute pression résout ce problème pour 99€ minimum. Pour vous orienter, quel symptôme observez-vous : voyant allumé, perte de puissance ou fumée noire ?"

Symptômes multiples FAP confirmés :
"Votre FAP est clairement saturé. C'est comme un filtre complètement obstrué qui étouffe le moteur. Pouvez-vous démonter vous-même le filtre à particules ?"

Client PEUT démonter (SANS QUESTION APRÈS) :
"Parfait. Deux options avec votre FAP démonté : Carter-Cash équipé nettoie en 4h pour 99-149€, ou autres Carter-Cash en 48h pour 199€ port compris. Cliquez sur Trouver un Carter-Cash à côté de cette fenêtre pour localiser le plus proche."

Client NE PEUT PAS démonter (SANS QUESTION APRÈS) :
"Nos garages partenaires s'occupent de tout : démontage, nettoyage haute pression et remontage en 48h pour 99-149€ plus main d'œuvre. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre."

Problème NON-FAP (turbo, etc.) :
"Je suis spécialisé uniquement dans les problèmes de FAP. Pour un diagnostic de votre problème, nos garages partenaires disposent de l'équipement nécessaire. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre."

Client dit "pas un FAP" :
"Compris. Pour diagnostiquer votre problème, un contrôle professionnel est nécessaire. Nos garages partenaires peuvent effectuer un diagnostic complet. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre."

INTERDICTIONS ABSOLUES :
- JAMAIS "Souhaitez-vous que je vérifie..."
- JAMAIS "Voulez-vous plus d'informations..."
- JAMAIS de question après avoir dirigé vers un bouton
- JAMAIS répéter une question déjà posée`;

  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question : ${question}

Contexte : ${contextText}

RÈGLES CRITIQUES :

1. RÈGLE D'OR : Une fois que tu as dit "Cliquez sur [bouton]", tu TERMINES. Pas de question supplémentaire.

2. Si problème turbo/moteur → direction garage immédiate

3. Si client dit "non" au démontage → donner solution garage et TERMINER

4. Maximum 80 mots, pas de listes

5. Ne jamais demander deux fois la même chose

6. PROCESSUS SIMPLE :
   - Symptômes ? → Diagnostic
   - Peut démonter ? → Solution
   - FIN (pas de "souhaitez-vous")

ANALYSE :
- Si "turbo HS" → garage partenaire direct
- Si "FAP aussi" → revenir au diagnostic FAP
- Si symptômes multiples → 1 question max puis solution
- Une fois solution donnée → ARRÊT TOTAL`;

  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-medium-latest",
        temperature: 0.1,
        top_p: 0.6,
        max_tokens: 200,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      const fallbackMessage = `Bonjour. Un FAP encrassé empêche le moteur de respirer correctement. Notre nettoyage haute pression résout ce problème. Quel symptôme observez-vous : voyant allumé, perte de puissance ou fumée noire ?`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      const defaultReply = `Bonjour. Problème de FAP détecté. Notre nettoyage haute pression restaure les performances pour 99€ minimum. Avez-vous un voyant FAP allumé ?`;
      
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
