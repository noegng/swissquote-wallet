# swissquote-wallet

Wallet self-custody que Swissquote pourrait lancer pour ses clients. Projet de l'équipe de 3 pour le hackathon BSA (DoraHacks), parcours **Swissquote Wallet Prize**, durée 33 h.

Cycle de vie démontré : création → authentification → signature → perte d'accès → récupération, avec une vraie transaction sur testnet (Base Sepolia).

## Idée en une phrase

Compte intelligent ERC-4337 (Safe) signé par passkey, avec des règles dans le contrat (plafonds par paliers, délais, gel) et une récupération 2 sur 3 où Swissquote est un gardien borné, jamais seul.

## Contenu

| Chemin | Rôle |
|---|---|
| `CLAUDE.md` | Contexte pour les sessions Claude (décisions, règles, état) |
| `docs/01-brief-hackathon.md` | Brief officiel et barème |
| `docs/02-conception.md` | Document de conception complet : problème, solution, menaces, répartition à 3 |
| `docs/03-decisions.md` | Registre des décisions et spike de départ |
| `docs/04-precedents.md` | Projets proches et leçons |
| `docs/05-differenciation.md` | Comment se démarquer |
| `docs/06-prototype-vers-production.md` | Ce qui est démontré, mocké, et requis en production |
| `docs/07-connecteurs-et-outils.md` | Connecteurs claude.ai et outils de développement |
| `docs/08-references-techniques.md` | Adresses de contrats et notes techniques |
| `contracts/` | Contrats Solidity (Foundry), à créer |
| `app/` | Application web (passkey, UserOperations), à créer |
| `mock-swissquote/` | Service mocké de Swissquote (KYC, gardien), à créer |

## Barème

Technique 35, sécurité et custody 20, faisabilité juridique 15, business case 15, UX et pitch 15, plus jusqu'à 20 points de bonus (gasless, dApp conforme) si le flux create → sign → recover marche de bout en bout.

## État

Phase de conception terminée. Prochaine étape : le spike H0–H3 décrit dans `docs/03-decisions.md`.
