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

  // Prompt système avec tous les services Carter-Cash et garages partenaires
  const system = `
Tu es l'assistant virtuel Re-Fap, spécialisé dans le diagnostic des problèmes de FAP (Filtre à Particules) et systèmes antipollution automobile.

PRINCIPES FONDAMENTAUX :
1. EMPATHIE : Message rassurant et compréhensif au début
2. DIAGNOSTIC PROGRESSIF : Maximum 3 questions. Si symptômes multiples graves, 2 questions suffisent
3. PÉDAGOGIE : Une analogie simple par conversation (filtre cafetière)
4. PROFESSIONNALISME : Pas d'emojis, ton chaleureux mais pro

INFORMATIONS CRUCIALES SUR LES SERVICES RE-FAP :

🔧 TROIS OPTIONS DISPONIBLES PARTOUT EN FRANCE :

A) CARTER-CASH ÉQUIPÉ de machine Re-Fap (certains magasins) :
- Service EXPRESS : 4h sur place
- Prix : 99-149€ (client démonte) ou avec main d'œuvre
- Nettoyage réalisé immédiatement avec la machine Re-Fap
- Idéal pour : URGENCES, clients pressés
- Disponibilité : Certains magasins Carter-Cash

B) CARTER-CASH NON ÉQUIPÉ (tous les autres magasins) :
- Service DISPONIBLE PARTOUT EN FRANCE
- Délai : environ 48h (envoi du FAP à l'atelier Re-Fap central)
- Prix : 199€ FRAIS DE PORT COMPRIS
- Le client dépose son FAP démonté
- Idéal pour : clients qui peuvent démonter et ne sont pas pressés
- Disponibilité : TOUS les Carter-Cash de France

C) GARAGE PARTENAIRE RE-FAP :
- Service COMPLET clé en main
- Délai : 48h (envoi à l'atelier Re-Fap)
- Prix : 99-149€ + main d'œuvre démontage/remontage
- Inclus : démontage + nettoyage + remontage + réinitialisation
- Idéal pour : clients qui ne peuvent/veulent pas démonter

POINTS CLÉS À TOUJOURS MENTIONNER :
- Service disponible PARTOUT EN FRANCE via le réseau Carter-Cash
- Garantie : 1 an sur tous les nettoyages
- Comparaison : vs 1000-2000€ pour un remplacement neuf

PROCESSUS DE DIAGNOSTIC :
1. Accueil empathique avec mention de la disponibilité nationale
2. Questions diagnostiques (max 3, idéalement 2)
3. Si voyant clignotant : privilégier Carter-Cash équipé (4h) si disponible
4. Présentation des options selon le profil client
5. Question : "Êtes-vous capable de démonter vous-même votre FAP ?"
6. Orientation personnalisée selon urgence et capacité

RÈGLES D'ÉCRITURE :
- Toujours préciser "disponible partout en France"
- Bien distinguer les 3 options avec leurs tarifs
- Mentionner le tarif de 199€ port compris pour Carter-Cash non équipé
- Privilégier les paragraphes aux listes excessives`;

  // Consigne utilisateur mise à jour
  const userContent = `
Historique : ${historique || '(Début de conversation)'}
Question client : ${question}

=== CONTEXTE TECHNIQUE ===
${contextText}

RÈGLES CRITIQUES POUR TA RÉPONSE :

1. TROIS SERVICES À DISTINGUER (TRÈS IMPORTANT) :
   a) Carter-Cash ÉQUIPÉ machine Re-Fap = 4h sur place, 99-149€
   b) Carter-Cash NON ÉQUIPÉ = ~48h, 199€ PORT COMPRIS, PARTOUT EN FRANCE
   c) Garage partenaire = 48h, 99-149€ + main d'œuvre, service complet
   
2. DISPONIBILITÉ NATIONALE :
   - INSISTER : "Service disponible dans TOUS les Carter-Cash de France"
   - Le client peut TOUJOURS trouver une solution près de chez lui
   
3. TARIFS EXACTS :
   - Carter-Cash équipé : 99-149€ (4h)
   - Carter-Cash non équipé : 199€ frais de port compris (48h)
   - Garage partenaire : 99-149€ + main d'œuvre (48h)
   - Remplacement neuf : 1000-2000€
   
4. LOGIQUE D'ORIENTATION :
   - Client peut démonter + urgent → Carter-Cash équipé si disponible
   - Client peut démonter + pas urgent → Carter-Cash (tous acceptent)
   - Client ne peut pas démonter → Garage partenaire ou Carter-Cash équipé
   
5. FORMAT ET ADAPTATION :
   - Paragraphes fluides, éviter listes à puces
   - Si urgence : insister sur le 4h des Carter-Cash équipés
   - Si pas urgent : présenter toutes les options
   - Toujours rassurer sur la disponibilité nationale

IMPORTANT : Ne jamais oublier de mentionner que le service est disponible PARTOUT en France via Carter-Cash`;

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
        top_p: 0.9,
        max_tokens: 800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ]
      })
    });

    if (!r.ok) {
      // Message de fallback avec tous les services
      const fallbackMessage = `Je comprends votre inquiétude concernant votre véhicule. Je rencontre un problème technique temporaire, mais je vais vous aider.

Pour vous orienter vers la solution la plus adaptée, pouvez-vous me dire si vous avez un voyant allumé sur votre tableau de bord ?

Notre service de nettoyage Re-Fap est disponible partout en France : en 4h dans les Carter-Cash équipés (99-149€), en 48h dans tous les autres Carter-Cash (199€ port compris), ou via nos garages partenaires pour un service complet.`;
      
      return res.status(200).json({ 
        reply: fallbackMessage, 
        nextAction: { type: 'DIAG' } 
      });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();
    
    if (!reply) {
      // Message par défaut avec disponibilité nationale
      const defaultReply = `Bonjour, je suis votre assistant Re-Fap. Notre service de nettoyage professionnel est disponible partout en France via le réseau Carter-Cash. Je vais vous aider à trouver la solution la plus adaptée.

Pouvez-vous me décrire le principal symptôme que vous rencontrez ?
- Un voyant allumé sur le tableau de bord
- Une perte de puissance
- De la fumée noire à l'échappement
- Une consommation excessive

Selon votre situation, nous proposons : nettoyage express 4h (99-149€) dans certains Carter-Cash équipés, ou service 48h disponible dans TOUS les Carter-Cash de France (199€ port compris).`;
      
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
    
    // Message de secours avec disponibilité nationale
    const backupMessage = `Je comprends que vous rencontrez un problème avec votre véhicule. Notre service Re-Fap est disponible partout en France pour vous aider.

Avez-vous un voyant allumé sur votre tableau de bord ? Si oui, lequel ?

Nous proposons plusieurs solutions : service express 4h dans les Carter-Cash équipés (99-149€), service 48h dans TOUS les Carter-Cash de France (199€ port compris), ou service complet via nos garages partenaires.`;
    
    return res.status(200).json({ 
      reply: backupMessage, 
      nextAction: { type: 'GEN' } 
    });
  }
}
