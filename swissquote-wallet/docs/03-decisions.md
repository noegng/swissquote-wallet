# Registre des décisions

Statuts : **Décidé** (acté dans la conversation), **Proposé** (recommandé, à confirmer), **À valider** (dépend d'un test ou d'un avis externe).
Mettre à jour ce fichier à chaque changement, avec la date et la raison.

| # | Sujet | Choix | Statut | Raison / condition |
|---|---|---|---|---|
| D1 | Parcours | Swissquote Wallet (pas Belem Capital) | Décidé | Plus réaliste en 33 h à 3, et le barème récompense la sécurité, le juridique et le pitch |
| D2 | Rejet de l'option « seed phrase en coffre » | Rejetée | Décidé | Swissquote aurait le contrôle des fonds : mauvais pour la sécurité, la qualification juridique et le brief (« sans donner à Swissquote un contrôle non voulu ») |
| D3 | Type de compte | Smart account ERC-4337 (Safe 1.4.1 + Safe4337Module, EntryPoint v0.7) | Proposé | Briques éprouvées, passkeys et recovery déjà outillés |
| D4 | Authentification quotidienne | Passkey WebAuthn (P-256) | Proposé | Vérification via précompile P-256 si présente, sinon vérifieur Solidity (Daimo ou FCL). **À valider par une vraie UserOp** sur la chaîne cible |
| D5 | Chaîne | Base Sepolia (id 84532) | Proposé | Candide, Safe passkeys, Zodiac, paymasters Coinbase/Circle et Etherscan la couvrent |
| D6 | Récupération | 2 sur 3 : Swissquote (après KYC, mocké), second appareil ou passkey, contact de confiance optionnel. Swissquote n'est jamais seul | Proposé | Argument pour la non-garde (FINMA, à valider par un juriste) |
| D7 | Délai de récupération | Configurable : 3 min pour la démo, 24 h minimum en réel | Proposé | Le module Candide de 3 minutes sert aux tests |
| D8 | Où vivent les plafonds | Petit module ou garde maison, plafonds par paliers de montant, écrit par Opus, testé avec Foundry (fuzzing inclus) | Proposé | Zodiac Roles borne les membres d'un rôle, pas les propriétaires du Safe. À confirmer après le spike H0–H3. Fallback : plafond annoncé seulement au niveau du contrat de récupération |
| D9 | Veto indépendant | Clé de veto enregistrée à l'avance sur un second appareil : peut geler ou annuler une récupération, jamais déplacer des fonds | Proposé | Le module Candide ne permet l'annulation qu'au propriétaire, donc un voleur de téléphone peut annuler une récupération légitime |
| D10 | Garde-fous de récupération | Au moins un gardien obligatoire, une seule récupération active à la fois, délai avant d'en relancer une, gel d'urgence par un gardien | Proposé | Failles historiques d'Argent (zéro gardien, déni de service) |
| D11 | Gasless (bonus) | Paymaster (Pimlico, Coinbase ou Circle) avec gas payé en USDC | Proposé | Seulement si create → sign → recover marche de bout en bout |
| D12 | dApp conforme (bonus) | Liste de dApps approuvées et simulation de transaction avant signature | Proposé | Priorité basse |
| D13 | Qui écrit le code | Les contrats sont écrits par Opus, relus et expliqués par l'équipe (Noé a des bases en Solidity) | Décidé | Chaque règle du contrat doit pouvoir être expliquée au jury |
| D14 | Cryptographie | Aucune cryptographie maison : bibliothèques et contrats éprouvés uniquement | Décidé | Exigé par le brief |
| D15 | Différenciation | Démo d'attaques qui échouent, veto indépendant, continuité bancaire pendant le délai, section « Du prototype à la production » | Proposé | Voir `05-differenciation.md` |
| D16 | Cadrage juridique | Hypothèse de non-garde, présentée comme à valider par un avocat suisse | À valider | Voir `02-conception.md` section 7 |
| D17 | MPC (10 octobre 2026) | Rejeté au profit de la smart custody (règles on-chain dans le smart account) | Proposé | Avec un MPC où la banque cosigne, elle participe à chaque mouvement (risque de qualification en garde). Règles vérifiables on-chain, compte utilisable sans le fournisseur. Limites : EVM uniquement (Bitcoin natif en point ouvert), plafonds et gardiens publics (confidentialité). Détail dans `swissquote-wallet-projet.md` section 2.5 |

## Spike de départ (H0–H3)

À réaliser avant toute fonctionnalité :

1. Safe + passkey + une vraie transaction sur Base Sepolia.
2. Récupération Candide avec le module de 3 minutes, vers une nouvelle passkey.
3. Test d'un plafond appliqué à la passkey quotidienne (le module maison de D8).
4. Si l'étape 3 échoue ou dépasse 3 h : bascule sur le fallback de D8.

## Problèmes connus, non encore corrigés dans `02-conception.md`

- L'annulation d'une récupération Candide est réservée au propriétaire (point de D9).
- Zodiac Roles ne borne pas les propriétaires du Safe (point de D8).
- Cas Ledger du 9 octobre 2026 : compromission possible d'un appareil à l'achat (revendeur). À ajouter au modèle de menaces après lecture des articles CoinDesk et Bitcoin.com. Conséquence pour nous : ne pas dépendre d'un seul appareil non vérifié.
- La section 7 de `02-conception.md` (juridique) reste une hypothèse.
