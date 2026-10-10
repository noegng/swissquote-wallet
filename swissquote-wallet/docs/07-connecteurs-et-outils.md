# Connecteurs et outils

## Connecteurs claude.ai (état du 10 octobre 2026)

Les connecteurs sont rattachés au compte claude.ai, pas au dépôt. Chaque membre de l'équipe doit les activer dans ses propres réglages.

| Connecteur | État | Usage dans le projet |
|---|---|---|
| Exa | Connecté | Recherche de bibliothèques, de documentation et de projets (déjà utilisé pour valider bitcoinjs-lib, SLIP-39, l'API signet, Bitkey) |
| Figma | Connecté | Schéma d'architecture en FigJam (sujet 2 obligatoire), maquettes si besoin |
| Claude in Chrome | Connecté | Parcours de la web app, captures et GIF de secours de la démo |
| Etherscan | Connecté | Plus utile au cœur (Bitcoin) ; seulement pour l'option EVM |
| Google Drive, Linear | Connexion non terminée | Non utilisés (suivi des tâches dans `09-plan-de-build.md`) |

Vérification des transactions Bitcoin : API publique `https://mempool.space/signet/api` (pas besoin de connecteur).

## Skills de projet

Dans `.claude/skills/`, chargés automatiquement par Claude Code quand on travaille dans ce dossier :

| Skill | Usage |
|---|---|
| `custody-invariants` | Avant toute modification des clés, règles, récupération ou services : vérifier les invariants I1–I7 |
| `btc-multisig` | Code Bitcoin : descripteur, PSBT, diffusion, regtest et signet |
| `slip39-backup` | Sauvegarde et reconstitution de la clé de secours |
| `mock-service` | Créer ou modifier un service mocké (Swissquote, partenaire) |
| `demo-run` | Lancer, réinitialiser, répéter la démo et collecter les preuves |
| `doc-sync` | Mettre à jour les documents après une décision, préparer la soumission |

## Outils de développement

- Node 22, npm workspaces, TypeScript, Vite + React, vitest.
- Bitcoin : `bitcoinjs-lib`, `bip32`, `ecpair`, `@bitcoinerlab/secp256k1`.
- Regtest : Docker + Nigiri (bitcoind + esplora).
- SLIP-39 : bibliothèque JS validée par les vecteurs officiels ; référence Python `shamir-mnemonic` (Trezor) pour l'interop.
- Passkeys : `@simplewebauthn/browser` et `@simplewebauthn/server`.

## Règles de travail avec Claude

- Le code est écrit par Claude, relu et expliqué par l'équipe.
- Aucune cryptographie maison.
- Tout comportement de chaîne se vérifie par un test (regtest) ou sur l'explorateur (signet).
- Les outils d'IA utilisés sont listés dans la soumission (exigence du brief) : tenir la liste à jour dans `09-plan-de-build.md`.
