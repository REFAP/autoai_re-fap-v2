// lib/fallbacks.js
// Réponses locales si l’API échoue.

export function fallbackOOD() {
  return `
**En bref :** Je suis spécialisé auto (FAP/DPF, voyants, pannes).  
**À faire maintenant :** décris ton souci voiture (voyant, fumée, perte de puissance, vibrations...).  
**Prochaine étape :** je te poserai 2–3 questions pour cibler le diagnostic.
`.trim();
}

export function fallbackTriage(category) {
  if (category === 'FAP') {
    return `
**En bref :** On précise ton souci FAP.  
**Questions rapides :**  
1) Voyant FAP/moteur allumé ?  
2) Fumée noire à l’échappement ?  
3) Perte de puissance / mode dégradé ?  
4) Dernier trajet autoroutier (>30 min à 2500 tr/min) à moins de 200 km ?  
**Prochaine étape :** Réponds par oui/non ou décris un symptôme.
`.trim();
  }
  return `
**En bref :** On précise tes symptômes (direction/roues/moteur).  
**Questions rapides :**  
• Vibrations plutôt au volant ou au siège ?  
• À quelle vitesse ? (90/110/130…)  
• Au freinage, en ligne droite, ou en virage ?  
**Prochaine étape :** Réponds à ces questions pour affiner.
`.trim();
}

export function fallbackAnswer(category) {
  if (category === 'FAP') {
    return `
**En bref :** FAP possiblement encrassé.  
**Pourquoi c’est important :** Un FAP bouché force le moteur et peut endommager turbo/EGR.  
**À faire maintenant :**  
- Évite les trajets courts.  
- Si fumée noire/perte de puissance → prudence.  
**Prochaine étape :** Nettoyage **Re-FAP** conseillé quand non endommagé (souvent ≈ neuf) ; remplacement si fissuré/fondu.  
**Question finale :** Sais-tu démonter ton FAP toi-même ? → **Oui** : Carter-Cash • **Non** : Garage partenaire Re-FAP.
`.trim();
  }
  return `
**En bref :** Diagnostic nécessaire (lecture codes + tests).  
**Pourquoi c’est important :** Ignorer peut coûter plus cher (transmission, freins, etc.).  
**À faire maintenant :** Noter vitesse/bruit, vérifier pneus/pressions.  
**Prochaine étape :** On peut te mettre en relation avec un **garage proche** (devis diag + RDV rapide).
`.trim();
}
