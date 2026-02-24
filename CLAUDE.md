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

---

## Bugs identifiés à corriger (analyse conversations 24/02/2026)

### 🔴 BUG P0 — Boucle infinie sur symptôme hors flow standard
**Conv** : `565a7b02`
**Symptôme** : L'utilisateur entre un symptôme textuel libre
("Message risque de colmatage FAP") qui ne matche aucun bouton du flow.
Le bot répond correctement la 1ère fois, puis perd le contexte du symptôme
quand l'utilisateur donne sa marque. Il boucle ensuite indéfiniment entre
"quel symptôme ?" et "quelle marque ?" sans jamais avancer.
**Correction attendue** : capturer le symptôme dès le 1er message même s'il
est exprimé librement (pas via bouton), et ne plus le redemander.

### 🔴 BUG P1 — "Je n'ai pas bien saisi" sur question logistique légitime
**Conv** : `6ea21933`
**Symptôme** : L'utilisateur demande "Il faut démonter le FAP moi-même ?"
ou "Je dois démonter le FAP ?". Le bot répond "Je n'ai pas bien saisi.
Tu es dans quelle ville ?" — deux fois de suite.
**Correction attendue** : détecter les questions sur la logistique du démontage
et répondre avec la FAQ correspondante :
> "Pas forcément. Si tu choisis un garage partenaire, il s'occupe de tout —
> démontage, envoi, remontage. Si tu veux faire moins cher, tu peux démonter
> toi-même et déposer le FAP directement au Carter-Cash."
Puis reprendre le flow normalement.

### 🟡 BUG P2 — "Merci" relance le flow au lieu de clore
**Conv** : `ed55001f`
**Symptôme** : Après la réponse au tarif, l'utilisateur dit "merci" (signal
de fin de conversation). Le bot répond "C'est quelle voiture ?"
**Correction attendue** : détecter les messages de clôture ("merci",
"merci beaucoup", "ok merci", "bonne journée", "au revoir", "c'est bon")
et répondre :
> "Avec plaisir ! Si tu as d'autres questions sur ton FAP, n'hésite pas."
Sans relancer le flow.

### 🟡 BUG P3 — Rappel en doublon (résumé affiché deux fois)
**Conv** : `c12347d2`
**Symptôme** : Quand l'utilisateur dit "oui" puis "oui je veux être rappelé",
le résumé de rappel s'affiche deux fois identique.
**Correction attendue** : si un résumé de rappel a déjà été envoyé dans la
conversation, ne pas le renvoyer — répondre simplement :
> "C'est noté, tu seras rappelé dans les meilleurs délais !"

### 🟡 BUG P4 — Marque redemandée malgré info déjà donnée
**Convs** : `3a685322`, et nombreuses autres (58 occurrences relevées)
**Symptôme** : L'utilisateur donne marque + modèle + année dans un seul message,
le bot extrait seulement la marque puis redemande le modèle/année au lieu de
les avoir capturés directement.
**Correction attendue** : parser le message initial pour extraire en une fois
marque + modèle + année quand ils sont présents dans la même phrase.

---

## Comportements attendus (non régresser)

Ces conversations fonctionnent bien — ne pas les casser :

- **`c12347d2`** : Renault Mégane 3 → flow complet marque/modèle/essai/ville/rappel ✅
- **`3a685322`** : Peugeot 508 mode dégradé → diagnostic correct + orientation CC équipé ✅
- **`13f4cd`** : "Je cherche un garage qui gère tout" → entrée directe ville ✅
- Réponse au tarif simple : "99€ à 149€ chez CC, 199€ en envoi" ✅
- Localisation par code postal ou nom de ville ✅
- Réponse FAQ défapage illégal ✅

---

## Intentions connues du moteur déterministe

Le bot doit reconnaître (au minimum) ces intentions utilisateur :

```
symptome_voyant          → "voyant allumé", "voyant FAP", "voyant moteur"
symptome_puissance       → "perte de puissance", "mode dégradé", "bridé"
symptome_fumee           → "fume", "fumée noire/blanche"
symptome_ct              → "contrôle technique refusé", "CT"
symptome_obd             → "code erreur", "P2002", "P2458", "valise"
symptome_colmatage       → "risque de colmatage", "message FAP"  ← à améliorer
marque_vehicule          → liste des marques reconnues
demande_garage           → "garage", "démonter", "repose", "gère tout"
demande_prix             → "combien", "tarif", "prix", "coûte"
demande_logistique       → "je dois démonter", "faut démonter", "moi-même"  ← à ajouter
cloture                  → "merci", "ok merci", "bonne journée", "au revoir"  ← à ajouter
rappel                   → "oui je veux être rappelé", "rappel", "être rappelé"
```

---

## Métriques de référence (avant/après correction)

| Métrique              | Avant moteur déterministe | Après 22/02 |
|-----------------------|--------------------------|-------------|
| Taux orientation      | 30%                      | 82%         |
| Taux "Je n'ai pas bien saisi" | élevé             | 8 occurrences / 322 convs |
| Boucles infinies      | —                        | 1 identifiée (P0) |
| Clôtures mal gérées   | —                        | 2 identifiées (P2, P3) |

---

## Conventions de code

- Ne pas modifier le comportement du flow nominal (étapes 1 à 7)
- Tester chaque correction avec les messages verbatim des conversations citées
- Pas de régression sur les convs `c12347d2` et `3a685322`
- Conserver les logs DATA: en fin de message assistant (utilisés pour le dashboard)
