---
name: btc-multisig
description: Conventions and pitfalls of the Swissquote Wallet's Bitcoin code (2-of-3 P2WSH descriptor, BIP-48 derivation, PSBT created, signed and combined between the app and the cosigner, broadcast and tracking through the esplora API on signet and regtest, faucet funding). Load it whenever you write or debug code in packages/core that touches keys, addresses, PSBTs or the chain.
---

# 2-of-3 Bitcoin multisig

## Conventions

- Script: `wsh(sortedmulti(2, xpub_phone, xpub_swissquote, xpub_backup))`. Always sort the public keys (BIP-67): use `p2ms` with sorted pubkeys.
- Derivation: BIP-48 `m/48'/1'/0'/2'` (coin type 1 for signet, testnet and regtest), then `/0/i` (receive) and `/1/i` (change).
- Address discovery: BIP-44 gap limit (20 consecutive unused addresses per chain), see `Esplora.walletState()`.
- Network: `bitcoin.networks.testnet` for signet (`tb1…`), `bitcoin.networks.regtest` for regtest (`bcrt1…`). The choice comes from `packages/core/src/network.ts`, never hard-coded elsewhere. `BTC_NETWORK` in `.env` is validated at startup.
- Libraries: `bitcoinjs-lib` (`Psbt`, `payments.p2wsh`, `payments.p2ms`), `bip32` and `ecpair` initialised with `@bitcoinerlab/secp256k1` (`bitcoin.initEccLib(ecc)`).
- Amounts: `bigint` everywhere in `packages/core` (bitcoinjs-lib v7).

## PSBT roles

1. **Creator** (app): selects the UTXOs, adds inputs (`witnessUtxo` + `witnessScript` + `bip32Derivation`) and outputs (recipient + change to `/1/i` of the same descriptor).
2. **Signer 1** (app, phone key or backup key): `signInput`, then sends the PSBT as base64.
3. **Signer 2** (Swissquote service): checks the summary (amount, recipient, change belonging to the descriptor) **independently of the app**, applies the rules, signs.
4. **Finalizer**: `validateSignaturesOfInput`, `finalizeAllInputs`, `extractTransaction`.
5. If the two signatures were made on two copies: `Psbt.combine` before finalizing.

## esplora API

| | Signet (demo) | Regtest (Nigiri, optional) |
|---|---|---|
| Base | `https://blockstream.info/signet/api` (default; mempool.space is unreachable from some networks) | `http://localhost:3000` (Chopsticks, `ESPLORA_URL_REGTEST` in `.env`) |
| UTXOs | `GET /address/:a/utxo` | same |
| Broadcast | `POST /tx`, body = raw hex, `Content-Type: text/plain`; use `Esplora.broadcastOnce()` (an already known transaction counts as sent) | same |
| Status | `GET /tx/:txid/status` | same |
| Fees | `GET /fee-estimates` (blockstream) or `/v1/fees/recommended` (mempool.space); already handled by `Esplora.feeRate()` | fixed fees (2 sat/vB) |

Explorer: `NetworkConfig.explorerTxUrl(txid)` (blockstream.info or mempool.space depending on the API). Existing modules: `keys.ts`, `descriptor.ts`, `psbt.ts`, `esplora.ts` in `packages/core/src`; complete example: `scripts/spike-multisig.ts`.

## Funding

- Signet: https://bitcoinsignetfaucet.com, 1,000 to 10,000 sats, 5 requests per 24 h. Fund several addresses before the demo.
- Regtest (optional, Docker): `npm run regtest:up` (Docker Compose taken from Nigiri, in `tools/regtest/`), then `npm run regtest:faucet -- <bcrt1… address>` (Chopsticks mines a block automatically on every `POST /tx`). Local explorer: http://localhost:5000.

## Known pitfalls

- `POST /tx` with JSON → "TX decode failed" error: send `text/plain`.
- Forgetting `witnessScript` on a P2WSH input → finalization impossible.
- Outputs under 330 sats (P2WSH dust) → rejected by the network.
- 2-of-3 P2WSH size estimate: about 105 vB per input, 43 vB per P2WSH output, 11 vB base. Keep a margin.
- The change must go back to the client's descriptor; the cosigner must check it, otherwise a compromised app can divert the change.

## Checking a claim

Any assumption about a library or an API is checked with a regtest test, or with an Exa search (`mcp__claude_ai_Exa__web_search_exa`) on the official documentation. Never guess a function signature: read the types in `node_modules`.
