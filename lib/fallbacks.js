// lib/fallbacks.js
export function fallbackTriage(category) {
  if (category === 'FAP') {
    return `### En bref
On vérifie d’abord si c’est bien le FAP et l’urgence.
### Questions rapides (FAP)
- Voyant FAP allumé ?
- Fumée noire visible ?
- Perte de puissance nette ?
- Dernier long trajet récent ?
### Prochaine étape
Dès tes réponses, je te dis quoi faire précisément.`;
  }
  if (category === 'DIAG') {
    return `### En bref
On clarifie tes vibrations pour éviter un mauvais diagnostic.
### Questions rapides
- Vitesse (~90/110/130) ?
- Accélération / freinage / stabilisé ?
- Bruit "clac-clac" ?
### À faire maintenant
- Vérifie pression pneus ; évite tests à haute vitesse.
### Prochaine étape
Selon tes réponses, je cible la cause.`;
  }
  return fallbackOOD();
}

export function fallbackAnswer(category) {
  if (category === 'FAP') {
    return `### En bref
Symptômes compatibles filtre à particules saturé.
### Pourquoi c’est important
Rouler ainsi peut abîmer turbo/EGR.
### À faire maintenant
- Évite les trajets courts ; observe fumée/pertes.
- Si voyant + pertes → limite la conduite.
- Note les codes (OBD) si possible.
### Prochaine étape
On confirme puis régénération / nettoyage Re-FAP / garage.
### Question finale
Sais-tu démonter ton FAP toi-même ?`;
  }
  if (category === 'DIAG') {
    return `### En bref
Vibrations : roues/jantes (le plus fréquent) ou transmission.
### Pourquoi c’est important
Ignorer use pneus/suspension et peut mener à une casse.
### À faire maintenant
- Équilibrage roues ; contrôler usure/hernies.
- Si 100–130 km/h uniquement → suspect roues/jantes.
- Bruit "clac-clac" : contrôler cardan.
### Prochaine étape
Si ça persiste après équilibrage : diagnostic en garage.`;
  }
  return fallbackOOD();
}

export function fallbackOOD() {
  return `### En bref
Je suis spécialisé **automobile** (symptômes, voyants, FAP/DPF, codes défauts).
### Hors périmètre
Je ne fournis pas de recettes ni contenus non auto.
### À faire maintenant
- Dis-moi un **symptôme** (ex. "vibrations à 110"), un **voyant** (ex. FAP), ou un **code** (ex. P2002).
### Prochaine étape
Je te guide pas à pas avec des actions concrètes et le bon interlocuteur.`;
}
