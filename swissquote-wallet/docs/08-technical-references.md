# Technical references

Collected on 10 October 2026. **Always check with a test before relying on them.**

## Bitcoin

| Item | Value |
|---|---|
| Wallet script | `wsh(sortedmulti(2, xpub_phone, xpub_swissquote, xpub_backup))` (P2WSH, sorted keys) |
| Derivation path | BIP-48 multisig: `m/48'/1'/0'/2'` on testnet, signet and regtest (coin type 1, script type 2 = P2WSH) |
| Address prefix | `tb1…` (signet and testnet), `bcrt1…` (regtest) |
| P2WSH dust threshold | 330 sats |
| Address discovery | BIP-44 gap limit of 20 per chain (receive and change) |

## esplora API

| Use | Signet (demo) | Regtest (Nigiri, optional) |
|---|---|---|
| Base | `https://blockstream.info/signet/api` (mempool.space is unreachable from some networks) | `http://localhost:3000` (Chopsticks) |
| UTXOs of an address | `GET /address/:address/utxo` | same |
| Address activity | `GET /address/:address` (`chain_stats`, `mempool_stats`) | same |
| Broadcast | `POST /tx` with the raw hex as `Content-Type: text/plain` | same |
| Status | `GET /tx/:txid/status` | same |
| Fees | `GET /fee-estimates` (blockstream) or `GET /v1/fees/recommended` (mempool.space) | fixed fees on regtest |

Signet explorer: `https://blockstream.info/signet/tx/<txid>` (or mempool.space, depending on the network).

Signet faucet: `https://bitcoinsignetfaucet.com` (1,000 to 10,000 sats per request, 5 requests per 24 h per IP and address). Fund several addresses before the demo.

## Libraries

| Need | Library | Note |
|---|---|---|
| PSBT, scripts | `bitcoinjs-lib` | Recent versions use `bigint` for amounts; check the installed version |
| Derivation | `bip32` | With `@bitcoinerlab/secp256k1` (pure JS, no WASM: simpler in Vite) |
| Keys | `ecpair` | Same |
| SLIP-39 | `shamir-mnemonic-ts` | **Chosen**: 45 official vectors + Python interop validated. Uses Node's `crypto` module: in the browser, `vite-plugin-node-polyfills` |
| SLIP-39 reference | `shamir-mnemonic` (Python, Trezor) | Interop only |
| Passkeys | `@simplewebauthn/browser`, `@simplewebauthn/server` | PRF extension to test on the team's browsers |
| Share encryption | WebCrypto (ECDH P-256 + HKDF + AES-GCM) | Native in browsers and Node 22 |

## SLIP-39

- Spec: https://github.com/satoshilabs/slips/blob/master/slip-0039.md
- Two levels: a group threshold, then a member threshold inside each group.
- A group with threshold 1 must have a single share (otherwise the shares only differ by their index).
- Our configuration: group threshold 2, groups `[[1,1], [1,1]]` = CLIENT, PARTNER.

## Known pitfalls

- `POST /tx` expects `text/plain`, not JSON; the `mempool.js` library had a field-name bug (`txhex`).
- P2WSH PSBT: provide `witnessUtxo` and `witnessScript` on every input.
- Signing with two keys in two processes: combine the PSBTs (`Psbt.combine`) before `finalizeAllInputs`.
- Rebroadcasting a transaction the network already knows returns an error: treat it as success (`Esplora.broadcastOnce`).

## Former approach (EVM, for reference)

The Base Sepolia addresses (EntryPoint v0.7, Candide, Safe passkeys, Zodiac, Pimlico, USDC) collected for the former approach are in this file's git history (commit `12269d0`). They are only useful for the USDC option.
