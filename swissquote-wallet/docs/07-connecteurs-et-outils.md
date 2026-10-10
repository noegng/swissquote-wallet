# Connecteurs et outils

## Connecteurs claude.ai activés (état du 10 octobre 2026)

Les connecteurs sont rattachés au compte claude.ai, pas au dépôt : ils ne se versionnent pas ici. Chaque membre de l'équipe doit les activer dans ses propres réglages.

| Connecteur | État | Usage dans le projet |
|---|---|---|
| Etherscan | Connecté, sans authentification | Lire les transactions, contrats, logs et gas sur Base Sepolia (id 84532) ; vérifier les adresses de contrats ; capturer des preuves pour la démo |
| Exa | Connecté | Recherche web et recherche de code (doc, projets GitHub) |
| Figma | Connecté | Schéma d'architecture, maquettes de l'app (écrans de création, signature, récupération) |
| Google Drive | Connexion non terminée | À finir si on veut y lire des documents |
| Linear | Connexion non terminée | À finir si on veut suivre les tâches |

## Outils de développement prévus

- Solidity : Foundry (`forge`, `cast`, `anvil`) pour les contrats et les tests, y compris le fuzzing.
- TypeScript : `viem`, `permissionless.js` ou `abstractionkit` (Candide) pour construire les UserOperations et parler au bundler.
- Chaîne : Base Sepolia (id 84532), EntryPoint v0.7.
- Gas : paymaster Pimlico, Coinbase ou Circle (USDC) pour le bonus gasless.

## Règles de travail avec Claude

- Les contrats sont écrits par Claude (Opus) mais relus et expliqués par l'équipe.
- Aucun code cryptographique maison.
- Toute affirmation sur une adresse ou un comportement de chaîne se vérifie avec Etherscan ou un test avant usage.
