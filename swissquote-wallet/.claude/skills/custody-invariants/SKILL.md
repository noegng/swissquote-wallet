---
name: custody-invariants
description: Security guard-rail of the Swissquote Wallet. Load it BEFORE any change touching the keys (phone, Swissquote, backup), the SLIP-39 shares, the cosigner rules, the recovery, the mocked services or the storage, and before a code review or preparing the jury answers on custody and the threat model.
---

# Custody invariants

The model: 2-of-3 Bitcoin multisig (phone key, Swissquote key, backup key); backup key in SLIP-39, group threshold 2, CLIENT group (C1 on paper = C2 encrypted in the cloud, same mnemonic) and PARTNER group (the partner, or a trusted person). Swissquote holds **no** share of the backup key. Source: `docs/03-decisions.md`.

## The invariants

| # | Invariant | Test that guarantees it |
|---|---|---|
| I1 | Swissquote alone cannot move the funds | `packages/core/test/multisig.test.ts` ("no single key can finalize"); `npm run demo:cosign` (I1 step) |
| I2 | Swissquote + partner can neither move the funds nor restore the backup key | `backup.test.ts` and `onboarding.test.ts` (PARTNER alone restores nothing); `multisig.test.ts` (the SQ key alone does not finalize) |
| I3 | The client leaves without Swissquote | `multisig.test.ts` (phone + backup pair); `onboarding.test.ts` (CLIENT + PARTNER give back the backup key); `npm run demo:exit` with Swissquote really stopped |
| I4 | The app never holds the SQ key or the PARTNER share | review: no import of `services/*` in `apps/web`; the PARTNER share only reaches the app **encrypted for the device** during a recovery |
| I5 | The backup key is only reassembled on the device, then dropped | e2e: after a recovery, the funds are on a **new** descriptor; the rebuilt key is never stored or sent |
| I6 | No homemade cryptography | review: only bitcoinjs-lib, bip32, ecpair, @bitcoinerlab/secp256k1, the validated SLIP-39 library, WebCrypto, SimpleWebAuthn |
| I7 | Every mock is labelled | service responses with `mock: true`, prototype banner in the UI, README |

## Before changing sensitive code

1. Identify which invariants the change touches.
2. Check that none of these combinations becomes enough: {SQ}, {SQ, PARTNER}, {SQ, C1}, {stolen phone + email}, {C1 + C2 without PARTNER}.
3. Check that the legitimate combinations stay enough: {phone, SQ} (daily use), {backup, SQ} (lost phone), {phone, backup} (SQ gone).
4. Run `npm test` (invariant tests in `packages/core/test/`) and `npm run demo:cosign` (services running on regtest).

## Asymmetry principle

- **Protect** (cancel a payment, cancel a recovery, freeze): passkey **or** client-area session (`authorizeProtective` in `services/swissquote/src/auth.ts`). A client whose phone was stolen no longer has their passkey.
- **Relax** (unfreeze, sign): passkey required.
- The limit is computed on **amount + fees** (`outgoing()` in `rules.ts`).
- Recovery: the new wallet is backed up and stored **before** any funds move; the sweep only goes to the new wallet and requires the backup key's signature.

## Forbidden mistakes

- Giving a SLIP-39 share to Swissquote (even encrypted).
- Using 3 SLIP-39 groups with a threshold of 2 (C1 + C2 would be enough without the partner).
- Storing the rebuilt backup key, sending it to a service or logging it.
- Letting the cosigner sign without a valid passkey assertion or outside the rules (tier, delay, sanctions). The WebAuthn challenge must be single-use and bound to the operation (PSBT hash for `/cosign`, request id for a cancellation).
- Using the software test authenticator (`scripts/lib/soft-authenticator.ts`) anywhere but in the scripts.
- Counting a limit without the fees.
- Requiring the passkey for a protective action (a client with a stolen phone would be locked out).
- Moving funds to a wallet whose keys or backup are not yet stored.
- Writing a cryptographic primitive (hash, curve, secret sharing, encryption) by hand.
- Mocking without labelling.

## Jury questions to re-check after each change

- Can Swissquote, alone or with the partner, move the funds? (no)
- Who can lock the client out? (nobody durably: phone + backup are enough)
- Where is the seed reassembled? (never to sign; the backup key only on the client's device)
- What can an attacker with the phone and the email do? (spend up to the instant amount at most; recovery refused without the CLIENT share)
