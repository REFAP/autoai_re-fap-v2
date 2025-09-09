// pages/api/chat.js
//
// API de chat pour AutoAI (Next.js pages router).
// - Détection locale de catégorie (FAP vs DIAG générique).
// - Prompt FR pédagogique.
// - Jamais de Carter-Cash hors FAP (sanitizer).
// - Appel Mistral si MISTRAL_API_KEY présent, sinon fallback local.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const { question = '', historique = '' } = req.body || {};
    const q = String(question || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'question manquante' });
    }

    const category = detectCategory(q);

    // Prompt système (règles de ton bot)
    const system = buildSystemPrompt(category, historique);

    // On tente Mistral si clé dispo, sinon fallback
    let reply;
    const apiKey = process.env.MISTRAL_API_KEY;
    const model = process.env.MISTRAL_MODEL || 'mistral-large-latest';

    if (apiKey) {
      try {
        const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: q },
            ],
            temperature: 0.2,
            max_tokens: 800,
          }),
        });

        if (!r.ok) {
          throw new Error(`Mistral HTTP ${r.status}`);
        }
        const data = await r.json();
        reply = data?.choices?.[0]?.message?.content?.trim();
      } catch (e) {
        // Fallback local si souci API
        reply = fallbackAnswer(category, q);
      }
    } else {
      reply = fallbackAnswer(category, q);
    }

    // Sécurité : jamais de Carter-Cash hors FAP
    if (category !== 'FAP') {
      reply = sanitizeReplyNonFAP(reply);
    }

    // nextAction aligne la colonne droite
    const nextAction = { type: category === 'FAP' ? 'FAP' : 'DIAG' };

    return res.status(200).json({ reply, nextAction });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/* ---------------------- Helpers ---------------------- */

function detectCategory(text) {
  const t = (text || '').toLowerCase();

  // Indices FAP/DPF
  const fapTerms = [
    'fap', 'dpf', 'p2463', 'p2002', 'regeneration', 'régénération', 'suie',
    'filtre à particules', 'filtre a particules', 'colmatage', 'voyant fap'
  ];
  if (fapTerms.some(w => t.includes(w))) return 'FAP';

  // Quelques cas "non FAP" fréquents -> diag générique
  const diagTerms = [
    'vibration', 'vibre', 'tremble', 'roulement', 'bruit', 'turbo',
    'fumée', 'fumee', 'egr', 'capteur', 'injecteur', 'adblue', 'démarre pas',
    'demarre pas', 'perte de puissance'
  ];
  if (diagTerms.some(w => t.includes(w))) return 'DIAG';

  // Par défaut : diag générique
  return 'DIAG';
}

function buildSystemPrompt(category, historique) {
  const common = `
Tu es **AutoAI** (Re-FAP). Tu réponds **en français**, clair, concret, concis.
Style : pédagogique, orienté action. Tu expliques **pourquoi c’est important**, **quoi faire maintenant**, puis **prochaine étape**.
Ne promets jamais de réparation magique. Suggère un **diagnostic pro** si doute de sécurité.

Historique (dernier contexte utilisateur) :
${(historique || '').slice(0, 2000)}
`.trim();

  const blockFAP = `
# Contexte FAP
- Quand le FAP n’est **pas endommagé**, le **nettoyage Re-FAP** restaure les performances d’origine dans la grande majorité des cas.
- Avantage : **économique** (évite remplacement coûteux, Carter-Cash à partir de **99€ TTC**), **éco-responsable** (on réutilise la pièce).
- Quand ça ne suffit pas : FAP **fissuré/fondu**, capteurs **différentiel/température** HS, mode **dégradé** non levé ⇒ garage partenaire.

# Structure de ta réponse FAP (Markdown simple)
- **En bref :** mini-diagnostic.
- **Pourquoi c’est important :** risques si on ignore.
- **À faire maintenant :** 3–6 puces concrètes.
- **Info / prochaine étape :** nettoyage Re-FAP vs remplacement.
- **Question finale :** *Sais-tu démonter ton FAP toi-même ?*
- **Ligne Oui/Non** (OBLIGATOIRE) :
→ **Oui** : [Trouver un Carter-Cash](https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_oui)
 • **Non** : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_non)
`.trim();

  const blockDIAG = `
# Contexte DIAG (générique/hors FAP)
- Tu guides vers un **diagnostic mécanique/électronique** : lecture codes + tests pour identifier la cause (turbo, EGR, capteurs, AdBlue, transmission…).
- **Interdit** : mentionner Carter-Cash ou nettoyage FAP (sauf si la question parle de FAP).

# Structure de ta réponse DIAG (Markdown simple)
- **En bref :** mini-diagnostic ou hypothèses probables.
- **Pourquoi c’est important :** risques/coûts si on ignore.
- **À faire maintenant :** 3–6 puces concrètes de vérifs simples.
- **Prochaine étape :** Diagnostic en garage.
- **Question finale :** *Souhaites-tu qu’on te mette en relation avec un garage proche ?*
`.trim();

  return `${common}\n\n${category === 'FAP' ? blockFAP : blockDIAG}`;
}

function sanitizeReplyNonFAP(text) {
  const t = String(text || '');
  // supprime toute mention Carter-Cash ou nettoyage FAP s’il n’y a pas de FAP
  return t
    .replace(/carter-?cash/gi, 'garage')
    .replace(/nettoyage\s+re-?fap/gi, 'diagnostic en garage')
    .replace(/nettoyage\s+(du\s+)?fap/gi, 'diagnostic en garage');
}

function fallbackAnswer(category, q) {
  if (category === 'FAP') {
    return `
**En bref :** Voyant FAP allumé = filtre saturé, risque de colmatage avancé si ignoré.

**Pourquoi c’est important :** un FAP bouché force le moteur, augmente la consommation et peut endommager turbo/EGR. Agir vite évite des coûts élevés.

**À faire maintenant :**
- Évite les trajets courts (le FAP ne se régénère pas).
- Vérifie perte de puissance ou fumée noire → si oui, arrêt immédiat.
- Pas de “vidange maison” : risque de casse.
- Prépare : localise ton FAP pour l’intervention.

**Info :** le **nettoyage Re-FAP** (≈99–149€) restaure souvent l’efficacité ; remplacement = >2000€.
**Prochaine étape :** confirmer l’état actuel (code défauts/diagnostic récent ?).

**Question finale :** Sais-tu démonter ton FAP toi-même ?
→ **Oui** : [Trouver un Carter-Cash](https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_oui)
 • **Non** : [Trouver un garage partenaire Re-FAP](https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_non)
`.trim();
  }

  // DIAG générique
  return `
**En bref :** ton souci nécessite un **diagnostic mécanique/électronique** pour identifier précisément la cause (codes défauts + tests ciblés).

**Pourquoi c’est important :** ignorer peut aggraver l’usure et augmenter la facture (ex. transmission, capteurs, turbo, AdBlue, EGR).

**À faire maintenant :**
- Noter les symptômes (fumée, pertes, bruits), depuis quand, conditions d’apparition.
- Vérifier niveaux simples (huile, liquide refroidissement), pression pneus si vibrations.
- Éviter les accélérations brutales si bruit anormal.

**Prochaine étape :** diagnostic en garage (lecture codes + tests composants).
**Question finale :** Souhaites-tu qu’on te mette en relation avec un garage proche ?
`.trim();
}
