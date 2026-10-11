---
name: mock-service
description: Template and rules to create or change a mocked service of the Swissquote Wallet (services/swissquote = KYC, passkeys, rule-enforcing cosigner, recovery, notifications; services/partner = holder of the PARTNER SLIP-39 share). Load it before writing a route, a storage, a cosigning rule, a delay or a notification in services/.
---

# Mocked services

Brief requirement: a mocked share holder runs as a **separate process with its own storage**, and the app never holds its share. Every mock is labelled.

## Common rules

- One folder per service: `services/<name>/` with its own `package.json`, its port (`PORT` in `.env`) and its storage `services/<name>/data/` (gitignored). No service reads another's storage or the app's.
- Node + TypeScript, a light HTTP server (Fastify), JSON everywhere.
- Every response contains `"mock": true`. Every log starts with `[MOCK <name>]`.
- Append-only **audit log** (`data/audit.jsonl`): timestamp, action, wallet, result, reason. It is evidence for the demo and for the legal argument.
- Configurable delays: `RECOVERY_DELAY_SECONDS`, `HIGH_VALUE_DELAY_SECONDS` (demo: 30 s and 20 s; production shown: 7 days, 24 h to 7 days).
- `POST /admin/reset` endpoint (demo only) that empties `data/`.
- `GET /health` endpoint for the startup script.
- Never return the Swissquote key or the PARTNER share in clear.
- The `.env` is loaded by `src/env.ts` without overwriting the environment; `BTC_NETWORK` is validated and printed at startup.

## services/swissquote (cosigner)

Routes: `/wallets`, `/wallets/:id`, `/cosign`, `/cosign/:id`, `/cosign/:id/cancel`, `/notifications/:walletId`, `/rules`, `/admin/sanctions`, `/admin/reset` (`src/server.ts`, rules in `src/rules.ts`, key in `src/signer.ts`). Also `/kyc/login` (session), `/webauthn/register/options|verify`, `/webauthn/operation/options` (challenge bound to the operation), in `src/auth.ts`. Recovery in `src/recovery.ts`: `GET /clients/me/wallets` (wallets of the current network only), `GET /wallets/:id/recovery`, `POST /recovery` (requires `deviceCredentialId`, freezes the wallet), `GET /recovery/:id`, `POST /recovery/:id/cancel` (passkey or session), `/new-wallet`, `/sweep` (requires the backup key's signature, outputs to the new wallet only, revokes the other passkeys; cosigns again under the same conditions after closing, for a failed broadcast or funds that arrive later). `GET /wallets/:id/limit`: instant amount and amount already spent over 24 h. A freeze requested during a recovery survives its cancellation. Shared context in `src/context.ts`. Freeze and unfreeze: `POST /wallets/:id/freeze` (session or passkey, cancels pending payments) and `POST /wallets/:id/unfreeze` (passkey only). Cancellations accepted by session or passkey (`authorizeProtective`). Storage: `data/sessions.json`, `credentials.json`, `challenges.json`, `master-key.json`, `wallets.json`, `requests.json`, `spends.json`, `notifications.json`, `sanctions.json`, `recoveries.json`, `audit.jsonl`.

| Route | Role |
|---|---|
| `POST /kyc/login` | Mocked login of an existing client (KYC already done) |
| `POST /webauthn/register/*`, `/webauthn/operation/options` | Passkeys (`@simplewebauthn/server`) |
| `POST /wallets` | Derives the client's SQ key, registers the descriptor (Travel Rule ownership proof) |
| `POST /cosign` | Checks the passkey assertion, decodes the PSBT, applies the rules, signs or holds |
| `POST /recovery`, `/recovery/:id/cancel`, `GET /recovery/:id` | Recovery with a delay and a notification; one active per wallet |
| `GET /notifications/:wallet` | "Out-of-band" inbox shown in the app (mock of SMS / emails) |

`/cosign` rules, in this order: wallet active (neither frozen nor recovered) → valid passkey assertion → change to the client's descriptor → recipient not on the sanctions list → **amount + fees** within the instant amount (tier 1, signed at once), otherwise tier 2 (held, notification, signed after a delay unless cancelled) → in recovery mode, only to a new registered descriptor.

## services/partner (PARTNER share)

Routes: `GET /public-key`, `POST /shares` (checks that the share is sealed for the partner, without logging it), `GET /shares/:walletId` (status only). Storage: `data/partner-key.json`, `shares.json`, `audit.jsonl`. Release: `POST /release`, `GET /release/:id` (share re-sealed for the device key), `POST /release/:id/cancel`, `POST /releases/cancel` (every release in progress for a wallet, called by the app when a recovery is cancelled), `GET /notifications/:walletId`; storage `releases.json`, `notifications.json`.

| Route | Role |
|---|---|
| `POST /shares` | Deposit of the PARTNER share at creation (encrypted for the partner) |
| `POST /release` | Mocked identity check, opens a delay, notifies the client |
| `GET /release/:id` | Status; after the delay, returns the share **encrypted for the device's ephemeral key** |
| `POST /release/:id/cancel` | Cancellation by the client |
| `POST /releases/cancel` | Cancels every release in progress for a wallet (`walletId`, `clientId`) |

Trusted person (D22): `POST /invitations`, `GET /invitations/:id`, `POST /invitations/:id/accept|confirm|collected|cancel`, `POST /release/:id/fulfil`; storage `invitations.json`. After `collected`, `shares.json` no longer holds the share (a `trustee` field instead) and `GET /release/:id` waits for that person's approval (`awaiting: 'trustee'`). The invitation id is never returned by `GET /shares/:walletId`. Proof: `npm run demo:trustee`.

The partner does not depend on Swissquote (it must keep working if Swissquote is gone).

## In production (to recall in `docs/06`)

SQ key in an HSM or enclave, real KYC, real notification channels, contract and SLA with two independent partners.
