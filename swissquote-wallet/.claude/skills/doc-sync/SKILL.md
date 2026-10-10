---
name: doc-sync
description: Garder la documentation du Swissquote Wallet cohérente après une décision ou un changement de conception (ordre de mise à jour des fichiers, règles de style en français), et préparer la soumission DoraHacks (checklist des six sujets obligatoires, outils d'IA utilisés). À charger quand une décision change, quand on modifie un document de docs/ ou le document projet, ou quand on rédige la description de soumission ou le pitch.
---

# Synchroniser les documents

## Ordre de mise à jour après une décision

1. `docs/03-decisions.md` : **fait foi**. Modifier la ligne de la décision avec la date et la raison ; déplacer l'ancien choix dans « Décisions remplacées ».
2. `../swissquote-wallet-projet.md` : sections touchées (solution, menaces, périmètre, production, questions du jury).
3. `CLAUDE.md` : résumé du modèle et règles, si elles changent.
4. `README.md` : tableau réel / mocké.
5. `docs/06-prototype-vers-production.md` : tout nouveau mock.
6. `docs/09-plan-de-build.md` : tâches ajoutées, retirées ou cochées.
7. Si un invariant change : la skill `custody-invariants` et les tests `packages/core/test/invariants.test.ts`.

Puis relire les fichiers modifiés pour vérifier qu'aucun ne contredit `03-decisions.md` (rechercher les anciens termes : « Safe », « ERC-4337 », « Base Sepolia », « Candide », « gardien »).

## Style

- Français, phrases courtes, vocabulaire non technique quand c'est possible.
- Étiqueter : **Décidé**, **Proposé**, **À valider**. Le juridique est toujours une hypothèse.
- Ne jamais affirmer que le prototype est prêt pour la production ; ne pas inventer de chiffres (marché, revenus) : les marquer comme hypothèses.

## Checklist de soumission DoraHacks

La description doit couvrir (exigences du brief) :

- [ ] Modèle de custody choisi, pour et contre, mini modèle de menaces (qui peut voler, qui peut bloquer, Swissquote seul ou avec un partenaire)
- [ ] Schéma d'architecture (lien FigJam), parties mockées marquées
- [ ] Création du wallet : où les clés et parts sont générées et stockées, lien avec l'identité Swissquote
- [ ] Authentification : passkey, différence petit / gros montant
- [ ] Récupération : qui, combien de temps, ce qui arrête un attaquant, **sortie si Swissquote disparaît**, refus de l'attaquant téléphone + e-mail
- [ ] Custody et Travel Rule (section juridique)
- [ ] Business case concret
- [ ] Bonus traités
- [ ] **Outils d'IA utilisés et pour quoi** (tableau en bas de `docs/09-plan-de-build.md`)
- [ ] Liens : dépôt, vidéo, txid signet (`docs/preuves.md`)
