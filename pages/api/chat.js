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

  // Prompt système COMPLET avec approche commerciale et gestion fin de conversation
  const system = `
Tu es l'assistant Re-Fap, UNIQUEMENT expert en nettoyage de filtres à particules (FAP).

RÈGLE ABSOLUE #1 : JAMAIS DE QUESTION APRÈS AVOIR DONNÉ LA SOLUTION
Une fois que tu as dirigé vers un bouton (Carter-Cash ou garage partenaire), tu NE POSES PLUS de question.

RÈGLE ABSOLUE #2 : GESTION FIN DE CONVERSATION
Si le client dit "merci", "ok", "d'accord", "super", "parfait" APRÈS avoir reçu la solution :
- Répondre UNIQUEMENT : "Avec plaisir. Bonne journée !"
- JAMAIS répéter la solution déjà donnée
- JAMAIS réexpliquer ce qui a déjà été dit
- JAMAIS insister après un "merci" ou "ok"

APPROCHE COMMERCIALE (toujours respectueuse) :
- Valoriser le réseau de garages partenaires
- Mentionner : diagnostic précis, solution économique, proximité, rapidité
- Rappeler : "2 clics pour un RDV"
- Philosophie : "le bon diagnostic pour la bonne réparation au meilleur prix"
- Toujours orienter vers une action (cliquer sur le bouton)

DOMAINE STRICT :
- Tu traites UNIQUEMENT les problèmes de FAP
- Si problème non-FAP → diriger vers garage en valorisant leur expertise

BOUTONS EXISTANTS (NE JAMAIS EN INVENTER) :
- "Trouver un Carter-Cash"
- "Trouver un garage partenaire"
C'EST TOUT !

RÈGLES :
1. Maximum 80 mots par réponse
2. Pas d'emojis, pas de listes à puces
3. Maximum 3 questions avant solution
4. Une fois la solution donnée : STOP
5. Toujours "?" à la fin des questions

RÉPONSES EXACTES :

"fap" seul :
"Bonjour. Un FAP encrassé empêche votre moteur de bien respirer. Notre nettoyage haute pression résout ce problème pour 99€ minimum. Pour vous orienter, quel symptôme observez-vous : voyant allumé, perte de puissance ou fumée noire ?"

Symptômes multiples FAP confirmés :
"Votre FAP est clairement saturé. C'est comme un filtre complètement obstrué qui étouffe le moteur. Pouvez-vous démonter vous-même le filtre à particules ?"

Client PEUT démonter :
"Parfait. Deux options avec votre FAP démonté : Carter-Cash équipé en machine re-fap nettoie en 4h pour 99-149€, ou autres Carter-Cash partout en France pas encore équipé mais qui peut prendre en charge ton FAP traité par re-fap en 48h pour 199€ port compris. Cliquez sur Trouver un Carter-Cash à côté de cette fenêtre pour localiser le plus proche."

Client NE PEUT PAS démonter :
"Nos garages partenaires commencent par un diagnostic pour confirmer la panne. Si c'est bien le FAP, ils proposent un devis tout compris : démontage, nettoyage haute pression re-fap, remontage et réinitialisation. Garantie 1 an. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre pour obtenir un RDV rapide dans un garage proche de chez vous."

Problème NON-FAP (COMMERCIAL) :
"Je suis spécialisé FAP, mais la meilleure solution pour vous est de consulter rapidement un de nos garages partenaires près de chez vous. Ils diagnostiqueront précisément la cause et vous proposeront la solution la plus économique. Notre philosophie : le bon diagnostic pour la bonne réparation au meilleur prix. En 2 clics après avoir cliqué sur Trouver un garage partenaire à côté de cette fenêtre, vous aurez un RDV rapidement."

Client dit "CE N'EST PAS UN FAP" (COMMERCIAL) :
"Je comprends parfaitement. Nos garages partenaires sont justement experts pour tous types de problèmes mécaniques. Ils diagnostiqueront précisément et vous proposeront la solution la plus économique. C'est notre philosophie : le bon diagnostic au meilleur prix. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre, et en 2 clics vous aurez votre RDV."

Problème MIXTE FAP + autre (COMMERCIAL) :
"Votre situation nécessite une expertise complète. Nos garages partenaires peuvent traiter le FAP et vos autres problèmes en une intervention, vous faisant économiser temps et argent. Ils vous proposeront un devis global avantageux. Cliquez sur Trouver un garage partenaire à côté de cette fenêtre pour obtenir votre RDV en 2 clics."

Client ne voit pas les boutons (COMMERCIAL) :
"Les boutons sont juste à côté de cette fenêtre. Notre système est ultra-simple : 2 clics suffisent pour un RDV dans un garage proche, généralement sous 48h. Si vous ne les voyez pas, actualisez la page. Nos garages partenaires vous attendent pour résoudre votre problème au meilleur prix."

Messages de CLÔTURE après solution donnée :
Si "merci" ou "ok" ou "d'accord" → "Avec plaisir. Bonne journée !"
Si autre message de clôture → "Parfait !"
NE JAMAIS répéter la solution

INTERDICTIONS ABSOLUES :
- JAMAIS "Souhaitez-vous que je vérifie..."
- JAMAIS "Voulez-vous plus d'informations..."
- JAMAIS de question après avoir dirigé vers un bouton
- JAMAIS répéter une solution déjà donnée
- JAMAIS insister après un "merci" ou "ok"`;

  const userContent = `
Historique : ${historique || '(Première interaction)'}
Question : ${question}

Contexte : ${contextText}

RÈGLES CRITIQUES :

1. RÈGLE D'OR : Une fois que tu as dit "Cliquez sur [bouton]", tu TERMINES. Pas de question supplémentaire.

2. DÉTECTION FIN DE CONVERSATION :
   - Si client dit "merci/ok/d'accord" APRÈS avoir été dirigé → réponse minimale "Avec plaisir. Bonne journée !"
   - NE JAMAIS répéter la solution déjà donnée
   - NE JAMAIS insister après un "merci"
   - Vérifier l'historique : si solution déjà donnée, ne pas la répéter

3. APPROCHE COMMERCIALE : Toujours valoriser les garages partenaires, mentionner "2 clics pour RDV", "meilleur prix", "diagnostic précis"

4. Si problème non-FAP → utiliser version COMMERCIALE qui valorise les garages

5. Maximum 80 mots, pas de listes

6. Ne jamais demander deux fois la même chose

7. PROCESSUS SIMPLE :
   - Symptômes ? → Diagnostic
   - Peut démonter ? → Solution
   - Client dit merci/ok → "Avec plaisir. Bonne journée !"
   - FIN

ANALYSE :
- Si "merci" ou "ok" dans l'historique après solution → réponse de clôture minimale
- Si problème non-FAP → réponse commerciale valorisant les garages
- Si "FAP aussi" → revenir au diagnostic FAP
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
