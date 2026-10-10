---
name: custody-invariants
description: Garde-fou de sécurité du Swissquote Wallet. À charger AVANT toute modification touchant aux clés (téléphone, Swissquote, secours), aux parts SLIP-39, aux règles du cosignataire, à la récupération, aux services mockés ou au stockage, et avant une revue de code ou la préparation des réponses au jury sur la custody et le modèle de menaces.
---

# Invariants de custody

Le modèle : multisig Bitcoin 2 sur 3 (clé téléphone, clé Swissquote, clé de secours) ; clé de secours en SLIP-39, seuil de groupes 2, groupes CLIENT (C1 papier = C2 cloud chiffré, même mnémonique) et TIERS (partenaire). Swissquote n'a **aucune** part de la clé de secours. Source : `docs/03-decisions.md`.

## Les invariants

| # | Invariant | Test qui le garantit |
|---|---|---|
| I1 | Swissquote seul ne peut pas déplacer les fonds | `packages/core/test/multisig.test.ts` (« aucune clé seule ne peut finaliser ») ; `npm run demo:cosign` (étape I1) |
| I2 | Swissquote + partenaire ne peuvent ni déplacer les fonds ni restaurer la clé de secours | `backup.test.ts` et `onboarding.test.ts` (TIERS seul ne restaure rien) ; `multisig.test.ts` (clé SQ seule ne finalise pas) |
| I3 | Le client sort sans Swissquote | `multisig.test.ts` (paire téléphone + secours) ; `onboarding.test.ts` (CLIENT + TIERS redonnent la clé de secours) ; e2e « Swissquote arrêté » à écrire |
| I4 | L'app ne détient jamais la clé SQ ni la part TIERS | revue : aucun import de `services/*` dans `apps/web` ; la part TIERS n'arrive dans l'app que **chiffrée pour l'appareil** pendant une récupération |
| I5 | La clé de secours n'est réassemblée que sur l'appareil, puis abandonnée | e2e : après récupération, les fonds sont sur un **nouveau** descripteur ; la clé reconstituée n'est jamais persistée ni envoyée |
| I6 | Aucune cryptographie maison | revue : uniquement bitcoinjs-lib, bip32, ecpair, @bitcoinerlab/secp256k1, la lib SLIP-39 validée, WebCrypto, SimpleWebAuthn |
| I7 | Tout mock est étiqueté | réponses des services avec `mock: true`, bannière MOCK dans l'UI, README |

## Avant de modifier du code sensible

1. Identifier quels invariants le changement touche.
2. Vérifier qu'aucune des combinaisons suivantes ne devient suffisante : {SQ}, {SQ, TIERS}, {SQ, C1}, {téléphone volé + e-mail}, {C1 + C2 sans TIERS}.
3. Vérifier que les combinaisons légitimes restent suffisantes : {téléphone, SQ} (quotidien), {secours, SQ} (téléphone perdu), {téléphone, secours} (SQ disparu).
4. Lancer `npm test` (tests d'invariants dans `packages/core/test/`) et `npm run demo:cosign` (services lancés).

## Erreurs interdites

- Donner une part SLIP-39 à Swissquote (même chiffrée).
- Faire 3 groupes SLIP-39 avec un seuil de 2 (C1 + C2 suffiraient sans partenaire).
- Persister la clé de secours reconstituée, l'envoyer à un service ou la logger.
- Laisser le cosignataire signer sans assertion passkey valide ou hors des règles (palier, délai, sanctions). Le défi WebAuthn doit être à usage unique et lié à l'opération (empreinte de la PSBT pour `/cosign`, identifiant de la demande pour une annulation).
- Utiliser l'authentificateur logiciel de test (`scripts/lib/soft-authenticator.ts`) ailleurs que dans les scripts.
- Écrire une primitive cryptographique (hash, courbe, partage de secret, chiffrement) à la main.
- Mocker sans l'étiqueter.

## Questions du jury à revérifier après chaque changement

- Swissquote, seul ou avec le partenaire, peut-il déplacer les fonds ? (non)
- Qui peut bloquer le client ? (personne durablement : téléphone + secours suffisent)
- Où la seed est-elle réassemblée ? (jamais pour signer ; la clé de secours seulement sur l'appareil du client)
- Que peut faire un attaquant avec le téléphone et l'e-mail ? (dépenser sous le plafond au plus ; récupération refusée faute de part CLIENT)
