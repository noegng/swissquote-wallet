# Contexte du projet pour Claude

## Projet

Équipe de 3 (Noé, étudiant en France, et deux coéquipiers), hackathon BSA sur DoraHacks, parcours Swissquote Wallet Prize (1800 / 1100 / 700 USD), 33 h. Objectif : un wallet self-custody que Swissquote pourrait réellement lancer, avec le cycle complet création → authentification → signature → perte d'accès → récupération, une vraie transaction sur testnet, un modèle de custody défendable et un modèle de menaces. Swissquote veut porter le projet gagnant en production.

Langue de travail et de communication avec l'équipe : **français**. Le code, les identifiants et les messages de commit peuvent rester en anglais.

## Documents à lire d'abord

1. `docs/01-brief-hackathon.md` : brief et barème (technique 35, sécurité 20, juridique 15, business 15, UX 15, bonus 20).
2. `docs/02-conception.md` : problème, solution, menaces, périmètre, répartition à 3.
3. `docs/03-decisions.md` : décisions et leur statut. Fait foi en cas de contradiction avec `02-conception.md`, qui n'a pas encore été mis à jour.
4. `docs/05-differenciation.md` et `docs/06-prototype-vers-production.md` : ce qu'on met en avant au jury.

## Règles

- Aucune cryptographie maison. Bibliothèques et contrats éprouvés uniquement (viem, permissionless.js ou abstractionkit, Safe, vérifieurs P-256 existants).
- Ce qui ne peut pas être construit (banque, KYC, serveur de gardien) est mocké **et documenté comme tel** dans `docs/06-prototype-vers-production.md`.
- Le flux create → sign → recover doit marcher de bout en bout avant tout bonus (gasless, dApp conforme).
- Les contrats sont écrits par Claude, mais chaque règle doit être relue et explicable par l'équipe. Tests Foundry obligatoires, avec fuzzing sur les plafonds et sur les récupérations répétées.
- Les adresses et comportements de chaîne se vérifient (Etherscan, test) avant usage. Voir `docs/08-references-techniques.md`.
- Le cadrage juridique est une hypothèse (non-garde selon la FINMA), à présenter comme telle, jamais comme un avis.
- Ne pas affirmer que le prototype est prêt pour la production.

## Décisions clés (résumé)

Safe + ERC-4337 sur Base Sepolia, passkey P-256, récupération 2 sur 3 avec délai (3 min en démo), module maison de plafonds par paliers, clé de veto indépendante, au moins un gardien obligatoire, une seule récupération active à la fois. Détail et statuts dans `docs/03-decisions.md`.

## Priorités

P0 : spike (Safe + passkey + vraie transaction, récupération Candide, test d'un plafond). Ensuite : contrats de règles, application, service Swissquote mocké, démo d'attaques, bonus. Répartition à 3 dans `docs/02-conception.md` section 9.

## Connecteurs

Etherscan, Exa et Figma sont activés côté claude.ai. Google Drive et Linear ne sont pas terminés. Voir `docs/07-connecteurs-et-outils.md`.
