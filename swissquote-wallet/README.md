# swissquote-wallet

Wallet self-custody que Swissquote pourrait lancer pour ses clients. Projet d'une équipe de 3 pour le hackathon BSA (DoraHacks), parcours **Swissquote Wallet Prize**, durée 33 h.

Histoire démontrée : création → connexion et signature → perte du téléphone → récupération, avec de vraies transactions sur **Bitcoin signet**, et la sortie du client si Swissquote disparaît.

## Idée en une phrase

Multisig Bitcoin 2 sur 3 où le client détient deux clés (téléphone et clé de secours) et Swissquote une seule (cosignataire avec plafonds et délais). La clé de secours est sauvegardée en SLIP-39 de sorte que ni Swissquote, ni Swissquote avec le partenaire, ne puisse la reconstituer.

## Ce qui est réel et ce qui est mocké

| Composant | Statut |
|---|---|
| Multisig 2 sur 3, PSBT, signatures, transactions signet | Réel |
| Sauvegarde SLIP-39 à groupes, chiffrement des parts | Réel (bibliothèque validée par les vecteurs officiels) |
| Passkeys WebAuthn | Réel |
| Service Swissquote (KYC, cosignataire, notifications) | **MOCK**, processus séparé, stockage propre, clé en fichier local |
| Service partenaire (part TIERS) | **MOCK**, processus séparé, stockage propre |
| Liste de sanctions, cloud de C2, continuité bancaire | **MOCK** |

Détail et exigences de production : `docs/06-prototype-vers-production.md`.

## Contenu

| Chemin | Rôle |
|---|---|
| `CLAUDE.md` | Contexte pour les sessions Claude |
| `docs/01-brief-hackathon.md` | Brief officiel et barème |
| `docs/03-decisions.md` | Décisions, invariants de custody, spike (**fait foi**) |
| `docs/04-precedents.md` | Projets proches (Bitkey, Casa, Ledger Recover…) |
| `docs/05-differenciation.md` | Comment se démarquer |
| `docs/06-prototype-vers-production.md` | Démontré, mocké, requis en production |
| `docs/07-connecteurs-et-outils.md` | Connecteurs, skills, outils |
| `docs/08-references-techniques.md` | API signet, bibliothèques, pièges connus |
| `docs/09-plan-de-build.md` | Tâches par personne et par phase |
| `../swissquote-wallet-projet.md` | Document de conception complet |
| `packages/core` | Bibliothèque partagée : clés, descripteur, PSBT, SLIP-39, chiffrement |
| `apps/web` | Web app mobile (Vite + React) |
| `services/swissquote` | Mock du cosignataire Swissquote |
| `services/partner` | Mock du partenaire détenteur de la part TIERS |
| `tools/slip39-interop` | Vérification avec la référence Python de Trezor |
| `scripts/` | Scénarios de démo rejouables |

## Barème

Technique 35, sécurité et custody 20, juridique 15, business 15, UX et pitch 15, plus jusqu'à 20 points de bonus si create → sign → recover marche de bout en bout.

## Démarrage

Guide pas à pas : `docs/00-demarrage.md`. En résumé, dans ce dossier :

```bash
npm install && cp .env.example .env
npm run regtest:up     # Docker Desktop doit être ouvert
npm run dev:all        # puis ouvrir http://localhost:5173
```
