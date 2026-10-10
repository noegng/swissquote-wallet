# Contexte du projet pour Claude

## Projet

Équipe de 3 (Noé, étudiant en France, et deux coéquipiers), hackathon BSA sur DoraHacks, parcours Swissquote Wallet Prize (1800 / 1100 / 700 USD), 33 h. Objectif : le wallet self-custody que Swissquote pourrait lancer demain, avec l'histoire complète création → connexion et signature → perte → récupération, une vraie transaction sur testnet, un modèle de custody défendu et un modèle de menaces. Swissquote veut porter le projet gagnant en production.

Langue de travail et de communication avec l'équipe : **français**. Le code, les identifiants et les messages de commit peuvent rester en anglais.

## Modèle retenu (10 octobre 2026)

**Multisig Bitcoin natif 2 sur 3** : clé téléphone (client), clé Swissquote (cosignataire avec règles), clé de secours. La clé de secours est découpée en **SLIP-39 à groupes** : groupe CLIENT (une mnémonique, sur papier C1 et chiffrée dans le cloud C2) **et** groupe TIERS (partenaire). **Swissquote n'a aucune part de la clé de secours.** Modèle proche de Bitkey : délai + notification, transfert vers un nouveau jeu de clés, sortie possible si Swissquote disparaît.

L'ancienne approche (smart account Safe / ERC-4337) est abandonnée au cœur du projet : ne pas la réintroduire.

## Documents à lire d'abord

1. `docs/03-decisions.md` : décisions, invariants I1–I7, spike. **Fait foi.**
2. `../swissquote-wallet-projet.md` : document de conception complet (menaces, flux, juridique, business).
3. `docs/01-brief-hackathon.md` : brief, dont la version complète du track (six sujets obligatoires).
4. `docs/09-plan-de-build.md` : tâches cochables par personne et par phase.
5. `docs/06-prototype-vers-production.md` : ce qui est réel, mocké, requis en production.

`docs/02-conception.md` est obsolète.

## Règles

- **Invariants de custody** (voir `docs/03-decisions.md`) : toute modification des clés, règles, récupération ou services passe par la skill `custody-invariants`.
- Aucune cryptographie maison : bitcoinjs-lib, bip32, ecpair, bibliothèque SLIP-39 validée par les vecteurs officiels, WebCrypto, SimpleWebAuthn.
- Les services mockés (Swissquote, partenaire) sont des **processus séparés avec leur propre stockage** ; l'app ne détient jamais leur clé ou leur part. Tout mock est étiqueté (UI, réponses, README).
- create → sign → recover doit marcher de bout en bout avant tout bonus.
- Chaque comportement de chaîne se vérifie par un test regtest ou sur l'explorateur signet.
- Le cadrage juridique est une hypothèse (non-garde), jamais un avis.
- Ne pas affirmer que le prototype est prêt pour la production.
- Après une décision, mettre à jour les documents avec la skill `doc-sync`.

## Structure du code

Monorepo npm workspaces : `packages/core` (bibliothèque Bitcoin et sauvegarde partagée), `apps/web` (Vite + React), `services/swissquote` et `services/partner` (mocks), `tools/slip39-interop` (Python), `scripts/` (scénarios de démo).

## Skills de projet

`custody-invariants`, `btc-multisig`, `slip39-backup`, `mock-service`, `demo-run`, `doc-sync` (dans `.claude/skills/`).

## Connecteurs

Exa (recherche), Figma (schéma d'architecture), Claude in Chrome (tests de la web app). Etherscan n'est plus utile au cœur. Voir `docs/07-connecteurs-et-outils.md`.
