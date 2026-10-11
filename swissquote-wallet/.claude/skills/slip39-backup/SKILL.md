---
name: slip39-backup
description: Backup and rebuilding of the Swissquote Wallet's backup key with SLIP-39 groups (CLIENT and PARTNER groups, sealing a share for a device, rebuilding only on the client's device, official vectors and interop with Trezor's Python reference). Load it for any code about wallet creation, recovery or share encryption, or to choose and validate the SLIP-39 library.
---

# Backup key with SLIP-39

## Configuration (do not change without going through `custody-invariants`)

```
group threshold = 2
groups = [[1, 1], [1, 1]]     # [CLIENT, PARTNER ("tiers" in the code)]
CLIENT:  one mnemonic, stored twice (C1 on paper, C2 encrypted "cloud" copy)
PARTNER: one mnemonic, encrypted for the partner service (or a trusted person)
Swissquote: no share
```

- The spec recommends a single share per threshold-1 group: C1 and C2 are the **same** mnemonic (redundancy against loss).
- **Forbidden**: 3 groups with threshold 2 (C1 + C2 would restore without the partner).
- The SLIP-39 master secret (16 or 32 bytes) is the BIP-32 seed of the backup key.

## Library

- **Chosen: `shamir-mnemonic-ts`** (45 official vectors and Python interop validated on 10/10). Reference: `shamir-mnemonic` (Python, Trezor). In the browser it needs `vite-plugin-node-polyfills` (already set up in `apps/web/vite.config.ts`).
- **Entry gate** (spike): the JS library must pass the official `vectors.json` from https://github.com/trezor/python-shamir-mnemonic, and its shares must restore with the Python reference (and the other way round). Command: `python tools/slip39-interop/check.py`.
- Always go through the wrapper `packages/core/src/backup.ts`: the rest of the code never imports the library directly (the library can change without touching the rest).

## Sealing a share for a device (`sealing.ts`)

- WebCrypto only: ephemeral ECDH P-256 + HKDF-SHA-256 + AES-GCM. Nothing hand-written.
- The device generates an ephemeral key pair and sends its public key; the partner returns the PARTNER share encrypted for that key.
- C2 is encrypted with a key derived from the passkey (PRF extension) or, failing that, from a passphrase (WebCrypto PBKDF2, high iteration count).

## Life cycle

`sealing.ts` (`sealFor`/`openSealed`, `sealWithPassphrase`/`openWithPassphrase`) and `onboarding.ts` (`createWalletMaterial`, `backupRootFromShares`) are written and tested; the screen `apps/web/src/screens/CreateWallet.tsx` uses them; `npm run demo:create` plays the creation without a browser. The downloaded C2 file has the type `swissquote-wallet/backup-c2`.

1. **Creation**: the app generates the secret, splits it, shows C1, encrypts C2, encrypts PARTNER for the partner, sends PARTNER to the partner service, then **erases** the secret and the shares from memory.
2. **Recovery**: the app gets C1 (typed) or C2 (decrypted) + PARTNER (decrypted with the ephemeral key) → `combine` → backup key in memory → a new set of keys and a new backup are created and stored **first** → the sweep to the new wallet is signed → the old backup key is erased.
3. Never: store the rebuilt key, log it, send it to a service.

## Expected tests (`packages/core/test/`)

- Official vectors.
- {CLIENT, PARTNER} restores; {CLIENT} alone fails; {PARTNER} alone fails; {C1, C2} fails (same group).
- Round trip of sealing / opening a share; failure with a wrong key.
