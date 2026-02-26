# CLAUDE.md — Chatbot Re-FAP

## Contexte projet

Chatbot de qualification FAP (Filtre à Particules) pour Re-FAP × Carter-Cash.
Objectif : qualifier le problème du visiteur, l'orienter vers la solution adaptée
(nettoyage FAP), et déclencher un rappel ou une mise en relation avec un garage partenaire.

**Stack** : Next.js — fichiers clés dans `pages/api/`
**Moteur** : déterministe (déployé le 22/02/2026) — remplace l'ancien moteur Mistral
**Base de données** : MySQL — tables `parc_knowledge_base`, `parc_kb_categories`, `parc_sav_rapports`

---

## Fichiers clés

```
pages/api/chat.js          ← moteur principal du chatbot (flow déterministe)
pages/api/magasins.js      ← géolocalisation + recherche garages partenaires / CC équipés
pages/admin/magasins.js    ← interface admin gestion des centres
```

---

## Flow nominal attendu

```
1. SYMPTÔME     → voyant allumé / perte puissance / fumée / CT refusé / code OBD
2. MARQUE       → Peugeot / Citroën / Renault / BMW / Audi / VW / Mercedes / Ford / Toyota / autre
3. MODÈLE+ANNÉE → ex : "Mégane 3 1.5 DCI 2011"
4. KILOMÉTRAGE  → optionnel, utilisé pour adapter le diagnostic
5. ESSAIS       → rien / additif / régénération forcée / autre
6. LOCALISATION → ville ou code postal → recherche garage partenaire + CC équipé
7. CONCLUSION   → proposition rappel ou orientation CC / garage partenaire
```

**Règle importante** : si l'utilisateur donne plusieurs infos dans un seul message
(ex : "Peugeot 508 2.0l HDi 180cv de 2017 en mode dégradé"), toutes doivent être
capturées en une seule passe — ne jamais redemander une info déjà donnée.

---

## Tarification Re-FAP

- **99€ TTC** — FAP simple (ex : DV6 PSA sans catalyseur intégré) — Carter-Cash équipé
- **149€ TTC** — FAP combiné avec catalyseur — Carter-Cash équipé
- **199€ TTC** — Envoi postal (port A/R inclus, délai 48-72h)
- Délai nettoyage sur place : ~4h
- Garantie : 1 an

---

## Réseau Carter-Cash équipés (machines sur place)

Au 25/02/2026 — 5 centres équipés :

| ID  | Ville                        | FAP nettoyés | CA      |
|-----|------------------------------|--------------|---------|
| 801 | Thiais (94)                  | 305          | 34K€    |
| 065 | Lambres-lez-Douai (59)       | 249          | 29K€    |
| 003 | Villeneuve-d'Ascq (59)       | 30           | —       |
| 006 | Sarcelles (95)               | 22           | —       |
| 5e  | Sainte-Luce-sur-Loire (44)   | installé le 25/02 |    |

Les autres Carter-Cash sont des **points dépôt** (envoi 48-72h, 199€).

**Règle IDF** : Pour les départements 75, 77, 78, 91, 92, 93, 94, 95 — proposer
EN PRIORITÉ Thiais + Sarcelles avec tarifs 99€/149€. Ne mentionner l'envoi 199€
qu'en dernier recours (CC équipés > 80km, impossible en IDF).

---

## Cas de référence validés — NE PAS CASSER

Ces séquences fonctionnent en prod et servent de tests de non-régression obligatoires.
Tester R1-R8 après CHAQUE commit.

| Réf | Séquence | Résultat attendu |
|-----|----------|-----------------|
| R1 | "voyant" → "BMW" → "X3 2018" → essais → ville → rappel | Flow complet sans boucle |
| R2 | "fap bouché j'ai besoin d'un garage sur paris" | Garage partenaire + Thiais + Sarcelles en une réponse |
| R3 | CP 75000 → "oui je veux être rappelé" | Résumé affiche 99€/149€, pas 199€ |
| R4 | "mon garage habituel" | FAQ garage de confiance sans reset du flow |
| R5 | "ok merci" | Clôture propre, pas de relance flow |
| R6 | "il faut démonter le FAP moi-même ?" | FAQ logistique démontage |
| R7 | Conv `c12347d2` : "voyant" → Renault → Mégane 3 2011 → regen → ville → rappel | Flow complet |
| R8 | Conv `3a685322` : Peugeot 508 mode dégradé → localisation → CC équipé IDF | Orientation correcte |

---

## ⚠️ Leçon critique — Architecture overrides (25/02/2026)

**chat.js contient ~30 overrides exécutés dans un ordre précis.**
Des patches successifs sans cartographie préalable ont créé des conflits
qui ont rendu le bot instable (10+ sessions correctives le 25/02).

### RÈGLE ABSOLUE avant toute modification

1. **Cartographier** tous les overrides (ligne, condition, action, conflits potentiels)
2. **Valider la cartographie** avant de toucher quoi que ce soit
3. **Un commit par correction**, tester R1-R8 après chaque commit
4. **Si un test échoue → revert immédiat**, pas de fix supplémentaire par-dessus

### Zones de conflit identifiées à surveiller

**`userExpressesGaragePreference()`** — doit matcher UNIQUEMENT :
```
✅ "mon garage" (possessif explicite)
✅ "je préfère mon garage"
✅ "j'ai déjà un garage"
✅ "garage habituel / de confiance / attitré"

❌ "je veux un garage"        → RESCUE normal
❌ "je cherche un garage"     → RESCUE normal
❌ "j'ai besoin d'un garage"  → RESCUE normal
❌ "un garage pour démonter"  → RESCUE normal
```

**Override 1b (ligne ~4053)** — intercepte AVANT le RESCUE.
Risque : capture les marques de voiture si le bot était en mode "attendait garage".
Ne pas modifier sans tester R1 et R2.

**Override 1b2 (ligne ~4085)** — fallthrough.
Risque : peut ignorer la ville contenue dans le message courant.

**`detectAdditionalAttempts()`** — doit couvrir Override 1b ET 1c.
Actuellement ne couvre que 1c (attend ville) — bug connu (BUG A ci-dessous).

---

## Corrections appliquées en prod (au 26/02/2026)

### ✅ Session 1 — 24/02 matin
- P0 : Boucle infinie sur symptôme libre ("risque de colmatage FAP")
- P1 : "Je n'ai pas bien saisi" sur question logistique
- P2 : "Merci" relance le flow → clôture propre
- P3 : Résumé rappel en doublon → message simple
- P4 : Marque + modèle + année capturés en une passe

### ✅ Session 2 — 24/02 soir (audit complet)
- "ok merci" → clôture (shadow fix)
- Sainte-Luce-sur-Loire equipped:true
- Bloc dupliqué getMissingDataQuestion supprimé
- everGaveExpertOrientation faux positif corrigé
- FAQ ne force plus demander_vehicule si véhicule déjà connu
- Anti-boucle question véhicule
- CP 75000 non parsé comme km

### ✅ Session 3 — 25/02
- "voyant" seul reconnu comme symptôme valide
- IDF prioritaire : Thiais + Sarcelles pour depts 75-78, 91-95
- Multi-essais : "on a aussi fait une regen" mergé (Override 1c)
- Grammaire "Sur une ta voiture" corrigée
- centre_proche propagé dans DATA JSON → tarif IDF correct dans résumé
- userExpressesGaragePreference() resserrée aux possessifs

---

## Bugs en attente — session suivante

### 🟡 BUG A — detectAdditionalAttempts() trop restrictif
**Séquence qui échoue** :
```
USER : voyant
BOT  : C'est quelle voiture ?
USER : on a aussi fait une regen sans succès
BOT  : Sur une [regen]... ← interprète "regen" comme une marque
```
**Cause** : ne couvre que Override 1c (attend ville), pas Override 1b (attend marque)
**Correction** : étendre à Override 1b — si message contient mots-clés essais
(regen, additif, karcher...), merger l'essai et re-demander le véhicule

### 🟡 BUG B — Deux questions simultanées
**Séquence** : bot pose ville ET modèle dans le même message
**Correction** : une seule question à la fois — modèle prioritaire sur ville

### 🟡 BUG C — Ville dans préférence garage non mémorisée
**Séquence** : "mon garage habituel à Saclas" → bot redemande la ville
**Correction** : extraire ville depuis le message et stocker dans lastExtracted.ville

### 🟡 BUG D — Localisation = phrase entière dans résumé
**Séquence** : "je veux un garage dans CP 75000" → résumé affiche la phrase entière
**Correction** : cleanVilleInput() extrait uniquement le CP/ville

### 🟡 BUG E — Code postal parsé comme code OBD
**Séquence** : "75000" → affiché comme "P7500" dans le résumé
**Correction** : restreindre détection OBD aux patterns P0xxx/P1xxx/P2xxx/P3xxx uniquement

---

## Intentions reconnues du moteur

```
symptome_voyant          → "voyant allumé", "voyant FAP", "voyant moteur", "voyant" seul ✅
symptome_puissance       → "perte de puissance", "mode dégradé", "bridé"
symptome_fumee           → "fume", "fumée noire/blanche"
symptome_ct              → "contrôle technique refusé", "CT"
symptome_obd             → "code erreur", "P2002", "P2458", "valise"
symptome_colmatage       → "risque de colmatage", "message FAP" ✅
marque_vehicule          → liste des marques reconnues
demande_garage_recherche → "je veux un garage", "je cherche un garage" → RESCUE
demande_garage_propre    → "mon garage", "je préfère mon garage" → FAQ garage confiance
demande_prix             → "combien", "tarif", "prix", "coûte"
demande_logistique       → "je dois démonter", "faut démonter", "moi-même" ✅
cloture                  → "merci", "ok merci", "bonne journée", "au revoir" ✅
rappel                   → "oui je veux être rappelé", "rappel", "être rappelé"
```

---

## Métriques de référence

| Métrique | Avant 22/02 | État actuel | Objectif |
|----------|-------------|-------------|----------|
| Taux orientation | 30% | 82%+ | >85% |
| "Je n'ai pas bien saisi" | élevé | ~3/conv | <1/conv |
| Boucles infinies | fréquentes | 0 | 0 |
| Tarif IDF résumé | 199€ | 99€/149€ ✅ | 99€/149€ |

---

## Conventions de code

- **Toujours cartographier les overrides AVANT de modifier**
- Un commit par bug dans l'ordre de priorité
- Tester R1-R8 après chaque commit avant de pusher
- Conserver les logs DATA: en fin de message assistant (utilisés par le dashboard)
- Ne jamais modifier `buildLocationOrientationResponse()` sans tester R2 et R3
- Ne jamais modifier `userExpressesGaragePreference()` sans tester R2 et R4
- En cas de doute → revert, pas de patch supplémentaire par-dessus un patch cassé
