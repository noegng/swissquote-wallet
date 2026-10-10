---
name: mock-service
description: Gabarit et règles pour créer ou modifier un service mocké du Swissquote Wallet (services/swissquote = KYC, passkeys, cosignataire avec règles, récupération, notifications ; services/partner = détenteur de la part SLIP-39 TIERS). À charger avant d'écrire une route, un stockage, une règle de cosignature, un délai ou une notification dans services/.
---

# Services mockés

Exigence du brief : un détenteur de part mocké tourne comme **processus séparé avec son propre stockage**, et l'app ne détient jamais sa part. Tout mock est étiqueté.

## Règles communes

- Un dossier par service : `services/<nom>/` avec son `package.json`, son port (`PORT` dans `.env`) et son stockage `services/<nom>/data/` (gitignoré). Aucun service ne lit le stockage d'un autre ni celui de l'app.
- Node + TypeScript, serveur HTTP léger (Fastify), JSON partout.
- Chaque réponse contient `"mock": true`. Chaque log commence par `[MOCK <nom>]`.
- **Journal d'audit** append-only (`data/audit.jsonl`) : horodatage, action, wallet, résultat, raison. C'est une preuve pour la démo et l'argument juridique.
- Délais configurables : `RECOVERY_DELAY_SECONDS`, `HIGH_VALUE_DELAY_SECONDS` (démo : 120 à 180 s ; production affichée : 7 jours).
- Endpoint `POST /admin/reset` (démo uniquement) qui vide `data/`.
- Endpoint `GET /health` pour le script de démarrage.
- Ne jamais renvoyer la clé Swissquote ni la part TIERS en clair.

## services/swissquote (cosignataire)

État au 10/10 : `/wallets`, `/wallets/:id`, `/cosign`, `/cosign/:id`, `/cosign/:id/cancel`, `/notifications/:walletId`, `/rules`, `/admin/sanctions`, `/admin/reset` sont écrits (`src/server.ts`, règles dans `src/rules.ts`, clé dans `src/signer.ts`). Ajoutés ensuite : `/kyc/login` (session), `/webauthn/register/options|verify`, `/webauthn/operation/options` (défi lié à l'opération), dans `src/auth.ts`. Récupération dans `src/recovery.ts` : `GET /clients/me/wallets`, `GET /wallets/:id/recovery`, `POST /recovery` (exige `deviceCredentialId`, gèle le wallet), `GET /recovery/:id`, `POST /recovery/:id/cancel` (passkey), `/new-wallet`, `/sweep` (exige la signature de la clé de secours, sorties vers le nouveau wallet uniquement, révoque les autres passkeys). Contexte partagé dans `src/context.ts`. Gel et dégel : `POST /wallets/:id/freeze` (session ou passkey, annule les paiements en attente) et `POST /wallets/:id/unfreeze` (passkey uniquement). Annulations acceptées par session ou passkey (`authorizeProtective`). Stockage : `data/sessions.json`, `credentials.json`, `challenges.json`, `master-key.json`, `wallets.json`, `requests.json`, `spends.json`, `notifications.json`, `sanctions.json`, `recoveries.json`, `audit.jsonl`. Le `.env` est chargé par `src/env.ts` sans écraser l'environnement.

| Route | Rôle |
|---|---|
| `POST /kyc/login` | Connexion mockée d'un client existant (KYC déjà fait) |
| `POST /webauthn/register/*`, `/webauthn/auth/*` | Passkeys (`@simplewebauthn/server`) |
| `POST /wallets` | Dérive la clé SQ du client, enregistre le descripteur (preuve de propriété Travel Rule) |
| `POST /cosign` | Vérifie l'assertion passkey, décode la PSBT, applique les règles, signe ou met en attente |
| `POST /recovery`, `/recovery/:id/cancel`, `GET /recovery/:id` | Récupération avec délai et notification ; une seule active par wallet |
| `GET /notifications/:wallet` | Boîte « hors bande » affichée dans l'app (mock des SMS / e-mails) |

Règles de `/cosign`, dans cet ordre : wallet actif (ni gelé ni récupéré) → assertion passkey valide → change vers le descripteur du client → destinataire hors liste de sanctions → **montant + frais** sous le plafond quotidien (palier 1, signature immédiate) sinon palier 2 (mise en attente, notification, signature après délai sauf annulation) → en mode récupération, uniquement vers un nouveau descripteur enregistré.

## services/partner (part TIERS)

État au 10/10 : `GET /public-key`, `POST /shares` (vérifie que la part est scellée pour le partenaire, sans la journaliser), `GET /shares/:walletId` (statut seulement). Stockage : `data/partner-key.json`, `shares.json`, `audit.jsonl`. Libération : `POST /release`, `GET /release/:id` (part re-scellée pour la clé de l'appareil), `POST /release/:id/cancel`, `GET /notifications/:walletId` ; stockage `releases.json`, `notifications.json`.

| Route | Rôle |
|---|---|
| `POST /shares` | Dépôt de la part TIERS à la création (chiffrée pour le partenaire) |
| `POST /release` | Contrôle d'identité mocké, ouverture d'un délai, notification au client |
| `GET /release/:id` | Statut ; après le délai, renvoie la part **chiffrée pour la clé éphémère de l'appareil** |
| `POST /release/:id/cancel` | Annulation par le client |

Personne de confiance (D22, ajout du 10/10) : `POST /invitations`, `GET /invitations/:id`, `POST /invitations/:id/accept|confirm|collected|cancel`, `POST /release/:id/fulfil` ; stockage `invitations.json`. Après `collected`, `shares.json` ne contient plus la part (champ `trustee` à la place) et `GET /release/:id` attend l'approbation de cette personne (`awaiting: 'trustee'`). L'identifiant d'invitation n'est jamais renvoyé par `GET /shares/:walletId`. Preuve : `npm run demo:trustee`.

Le partenaire ne dépend pas de Swissquote (il doit fonctionner si Swissquote a disparu).

## En production (à rappeler dans `docs/06`)

Clé SQ en HSM ou enclave, vrai KYC, vrais canaux de notification, contrat et SLA avec deux partenaires indépendants.
