# Références techniques

Relevées le 10 octobre 2026. **Toujours vérifier par un test avant de s'appuyer dessus.**

## Bitcoin

| Élément | Valeur |
|---|---|
| Script du wallet | `wsh(sortedmulti(2, xpub_téléphone, xpub_swissquote, xpub_secours))` (P2WSH, clés triées) |
| Chemin de dérivation | BIP-48 multisig : `m/48'/1'/0'/2'` sur testnet, signet et regtest (coin type 1, script type 2 = P2WSH) |
| Préfixe d'adresse | `tb1…` (signet et testnet), `bcrt1…` (regtest) |
| Seuil de poussière P2WSH | 330 sats |

## API esplora (mempool.space)

| Usage | Signet | Regtest (Nigiri) |
|---|---|---|
| Base | `https://mempool.space/signet/api` | `http://localhost:3000` (à confirmer à l'installation) |
| UTXO d'une adresse | `GET /address/:address/utxo` | idem |
| Diffuser | `POST /tx` avec le hex brut en `Content-Type: text/plain` | idem |
| Statut | `GET /tx/:txid/status` | idem |
| Frais | `GET /v1/fees/recommended` (signet) | frais fixes en regtest |

Explorateur signet : `https://mempool.space/signet/tx/<txid>`.

Faucet signet : `https://bitcoinsignetfaucet.com` (1 000 à 10 000 sats par demande, 5 demandes par 24 h par IP et adresse). Préfinancer plusieurs adresses avant la démo.

## Bibliothèques

| Besoin | Bibliothèque | Remarque |
|---|---|---|
| PSBT, scripts | `bitcoinjs-lib` | Les versions récentes utilisent des `bigint` pour les montants ; vérifier la version installée |
| Dérivation | `bip32` | Avec `@bitcoinerlab/secp256k1` (JS pur, sans WASM : plus simple dans Vite) |
| Clés | `ecpair` | Idem |
| SLIP-39 | `shamir-mnemonic-ts` ou `slip39` (ilap) | Choix au spike : vecteurs officiels (`vectors.json` de trezor/python-shamir-mnemonic) + interop Python |
| SLIP-39 référence | `shamir-mnemonic` (Python, Trezor) | Interop uniquement |
| Passkeys | `@simplewebauthn/browser`, `@simplewebauthn/server` | Extension PRF à tester sur les navigateurs de l'équipe |
| Chiffrement des parts | WebCrypto (ECDH P-256 + HKDF + AES-GCM) | Natif navigateur et Node 22 |

## SLIP-39

- Spec : https://github.com/satoshilabs/slips/blob/master/slip-0039.md
- Deux niveaux : seuil de groupes, puis seuil de membres dans chaque groupe.
- Un groupe de seuil 1 doit avoir une seule part (sinon les parts ne diffèrent que par l'index).
- Notre configuration : seuil de groupes 2, groupes `[[1,1], [1,1]]` = CLIENT, TIERS.

## Pièges connus

- `POST /tx` de mempool.space attend du `text/plain`, pas du JSON ; la bibliothèque `mempool.js` a eu un bug de nom de champ (`txhex`).
- PSBT P2WSH : fournir `witnessUtxo` et `witnessScript` sur chaque entrée.
- Signer avec deux clés dans deux processus : combiner les PSBT (`Psbt.combine`) avant `finalizeAllInputs`.

## Ancienne approche (EVM, pour mémoire)

Les adresses Base Sepolia (EntryPoint v0.7, Candide, Safe passkeys, Zodiac, Pimlico, USDC) relevées pour l'ancienne approche sont dans l'historique git de ce fichier (commit `12269d0`). Elles ne servent plus que pour l'option USDC.
