// pages/api/chat.js
// Mode "prompt seul" : aucune lecture de /data, pas de RAG local.

function normalize(s = '') {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu,'')
    .replace(/[^\p{L}\p{N}\s\-]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

// Fallback très simple si le modèle ne renvoie pas un JSON valide
function classify(text) {
  const txt = normalize(text || '');
  if (/\bfap\b|\bdpf\b|\bfiltre a particule/.test(txt)) return { type:'FAP' };
  if (/\bdiag(nostic)?\b|\brdv\b|\brendez.?vous\b|\burgent/.test(txt)) return { type:'DIAG' };
  return { type:'GEN' };
}

// Décide l’UI à partir du JSON structuré du modèle
function decideNextActionFromObj(obj) {
  if (!obj || typeof obj !== 'object') return { type:'GEN' };
  const suspected = Array.isArray(obj.suspected) ? obj.suspected.join(' ').toLowerCase() : '';
  const hasFap = /fap|dpf|filtre.*particule/.test(suspected);
  if ((obj.stage === 'diagnosis' && hasFap) || (obj.stage === 'handoff' && hasFap)) return { type:'FAP' };
  if (obj.stage === 'diagnosis' || obj.stage === 'handoff') return { type:'DIAG' };
  return { type:'GEN' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Méthode non autorisée' });
  if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ error:'MISTRAL_API_KEY manquante' });

  const { question, historique } = req.body || {};
  if (!question || typeof question !== 'string') return res.status(400).json({ error:'Question invalide' });

  // === PROMPT “source de vérité” unique (pas de data.txt) ===
  const system = `
Tu es AutoAI (Re-FAP). Tu aides un conducteur à comprendre des symptômes (FAP/DPF, voyant, fumée, perte de puissance…) et tu l’orientes vers l’action la plus sûre et utile.

RÈGLES IMPÉRATIVES
- Réponds UNIQUEMENT par UN seul objet JSON valide conforme au schéma ci-dessous. Zéro texte hors JSON, zéro champ en plus, zéro commentaires.
- Français, ton clair/pro/empathe, phrases courtes, vocabulaire simple.
- Actions concrètes, sûres et légales. Interdit: suppression/neutralisation du FAP (illégal). Arrêt immédiat si odeur de brûlé, fumée très épaisse, bruits métalliques ou voyant moteur clignotant / risque casse turbo.
- Pas d’invention quand il manque de l’info : rester en triage ou passer en handoff (garage).
- Tolère fautes/accents manquants. Si l’utilisateur dit “je ne sais pas”, propose une observation simple à la place.
- PRIORITÉ DES SOURCES : tu n’as AUCUN contexte externe. Tes règles font foi. Sortie = JSON strict.
- Tarifs : fourchette OK (ex. diagnostic 50–90 €). INTERDIT d’annoncer “diagnostic gratuit”, “remboursé” ou “déduit”. Toujours “variable selon garage, prix affiché lors de la prise de RDV”.
- Garantie Re-FAP : toujours “1 an”. Ne jamais écrire “2 ans”.

SCHÉMA DE SORTIE (obligatoire)
{
  "stage": "triage|diagnosis|handoff",
  "title": "string",
  "summary": "string",
  "questions": [{"id":"q1","q":"string"}],
  "suspected": ["string"],
  "risk": "low|moderate|high",
  "actions": ["string"],
  "cta": {"label":"string","url":"string","reason":"string"},
  "alt_cta": [{"label":"string","url":"string","reason":"string"}],
  "follow_up": ["string"],
  "legal": "string"
}

POLITIQUE D’ARBITRAGE
- Intention vague → stage="triage" ; poser 3–5 questions oui/non discriminantes :
  (voyant FAP/moteur ? fumée noire ? perte de puissance / mode dégradé ? trajets courts répétés ? dernier trajet >20 min à >2500 tr/min ? odeur de brûlé ?)
  risk="low" ; cta = garage partenaire.
- ≥2 signaux FAP → stage="diagnosis" ; suspected inclut "FAP" ; risk="moderate" (ou "high" si voyant clignote / brûlé / bruit métallique / mode dégradé sévère) ;
  actions: régénération 20–30 min à 2500–3000 tr/min (si conditions OK), contrôler capteur pression diff./admission ; si aucun effet → garage.
  Pédagogie : “Nettoyage FAP Re-FAP = meilleur rapport prix/efficacité/long terme ; 99–149 € (~10× moins qu’un remplacement > 1000 €), garantie 1 an.”
- Signaux critiques / doute sérieux → stage="handoff", risk="high" ; actions de sécurité + orientation garage.
- Hors FAP (vibrations, pneus, freins, etc.) → hors périmètre : donner 2–3 vérifs simples (pression/équilibrage pneus, disques au freinage, etc.) puis cta garage partenaire.
- ESCALADE SYSTÉMATIQUE : voyant moteur **clignote**, odeur de brûlé, fumée très épaisse, bruits métalliques, ou mode dégradé sévère → stage="handoff", risk="high".

RÈGLES CTA & PÉDAGOGIE (toujours appliquer)
A) Garage partenaire Re-FAP (cta principal par défaut)
   - label: "Prendre RDV avec un garage partenaire"
   - url:   "https://re-fap.fr/trouver_garage_partenaire/"
   - reason: "Partout en France, près de chez vous : plusieurs garages au choix, RDV en quelques clics au meilleur prix pour un diagnostic et une solution adaptée."
   - Mention tarifs: “Diagnostic 50–90 € selon garage, prix affiché sur la page de RDV.” (pas de promesse de remboursement).

B) Si FAP suspecté/confirmé
   - Demander si l’utilisateur sait déposer/démonter son FAP.
   - S’il sait déposer → **alt_cta Carter-Cash** :
       label:  "FAP démonté ? Dépose en Carter-Cash"
       url:    "https://auto.re-fap.fr"
       reason: "Si vous pouvez déposer le FAP : apportez-le en Carter-Cash pour un nettoyage Re-FAP."
   - Sinon / si doute → cta principal **Garage partenaire** + mention explicite “exiger un nettoyage Re-FAP”.
   - Ne JAMAIS suggérer suppression/neutralisation du FAP.

CONSTRUCTION
- title 4–7 mots ; summary 1–2 phrases pédagogiques ; questions (triage uniquement) 3–5 ; suspected court ; actions 2–4 ;
  cta.url HTTPS ; follow_up 1–2 ; legal : rappeler interdiction suppression FAP + “pas un diagnostic officiel”.
- En cas FAP : inclure dans actions une ligne “Pouvez-vous déposer le FAP vous-même ? Si oui : Carter-Cash ; sinon : RDV garage partenaire (demandez un nettoyage Re-FAP).”
- Forme courte. Prix : “Nettoyage 99–149 € (≈10× moins qu’un remplacement > 1000 €)”.
- **Interdit dans "suspected"** : pourcentages/probabilités. Utiliser “probable”, “moins probable”.
`;

  const userContent = `
Historique (résumé): ${historique || '(vide)'}
Question: ${question}

Consigne de sortie:
- Fournis UNIQUEMENT l'objet JSON (conforme au schéma). AUCUN texte autour.
- ≤ 120 mots, clair, listes concises ok.
`;

  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-medium-latest',
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!r.ok) {
      const minimal = `Je n'ai pas de contexte local. Dis-moi: voyant allumé ? perte de puissance ? odeur/fumée ?`;
      return res.status(r.status).json({ reply: minimal, data: null, nextAction: classify(minimal) });
    }

    const data = await r.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim() || 'Réponse indisponible pour le moment.';

    // Parse JSON strict
    let obj = null;
    try { obj = JSON.parse(reply); } catch { obj = null; }

    const nextAction = obj ? decideNextActionFromObj(obj) : classify(reply);
    return res.status(200).json({ reply, data: obj, nextAction });

  } catch {
    const backup = `Problème technique. Réponds à ces 2 questions: (1) voyant allumé ? (2) perte de puissance ? Puis on oriente.`;
    return res.status(200).json({ reply: backup, data: null, nextAction: { type:'GEN' } });
  }
}
