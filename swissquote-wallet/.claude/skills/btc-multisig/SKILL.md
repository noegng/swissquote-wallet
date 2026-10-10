---
name: btc-multisig
description: Conventions et pièges du code Bitcoin du Swissquote Wallet (descripteur 2 sur 3 P2WSH, dérivation BIP-48, PSBT créée, signée et combinée entre l'app et le cosignataire, diffusion et suivi via l'API esplora sur regtest et signet, financement par faucet). À charger dès qu'on écrit ou débogue du code dans packages/core touchant aux clés, adresses, PSBT ou à la chaîne.
---

# Multisig Bitcoin 2 sur 3

## Conventions

- Script : `wsh(sortedmulti(2, xpub_téléphone, xpub_swissquote, xpub_secours))`. Toujours trier les clés publiques (BIP-67) : utiliser `p2ms` avec les pubkeys triées.
- Dérivation : BIP-48 `m/48'/1'/0'/2'` (coin type 1 pour signet, testnet et regtest), puis `/0/i` (réception) et `/1/i` (change).
- Réseau : `bitcoin.networks.testnet` pour signet (`tb1…`), `bitcoin.networks.regtest` pour regtest (`bcrt1…`). Le choix vient de `packages/core/src/network.ts`, jamais codé en dur ailleurs.
- Bibliothèques : `bitcoinjs-lib` (`Psbt`, `payments.p2wsh`, `payments.p2ms`), `bip32` et `ecpair` initialisés avec `@bitcoinerlab/secp256k1` (`bitcoin.initEccLib(ecc)`).
- Montants : vérifier si la version installée de bitcoinjs-lib attend des `bigint` (v7) ou des `number` (v6) et rester cohérent dans tout `packages/core`.

## Rôles PSBT

1. **Créateur** (app) : sélectionne les UTXO, ajoute entrées (`witnessUtxo` + `witnessScript` + `bip32Derivation`) et sorties (destinataire + change vers `/1/i` du même descripteur).
2. **Signataire 1** (app, clé téléphone ou clé de secours) : `signInput` puis envoie la PSBT en base64.
3. **Signataire 2** (service Swissquote) : vérifie le résumé (montant, destinataire, change appartenant au descripteur) **indépendamment de l'app**, applique les règles, signe.
4. **Finaliseur** : `validateSignaturesOfInput`, `finalizeAllInputs`, `extractTransaction`.
5. Si les deux signatures ont été produites sur deux copies : `Psbt.combine` avant de finaliser.

## API esplora

| | Signet | Regtest (Nigiri) |
|---|---|---|
| Base | `https://mempool.space/signet/api` | `http://localhost:3000` (Chopsticks, `ESPLORA_URL_REGTEST` du `.env`) |
| UTXO | `GET /address/:a/utxo` | idem |
| Diffusion | `POST /tx`, corps = hex brut, `Content-Type: text/plain` | idem |
| Statut | `GET /tx/:txid/status` | idem |
| Frais | `GET /v1/fees/recommended` | frais fixes (ex. 2 sat/vB) |

Explorateur : `https://mempool.space/signet/tx/<txid>`.

## Financement

- Regtest : `npm run regtest:up` (Docker Compose repris de Nigiri, dans `tools/regtest/`), puis `npm run regtest:faucet -- <adresse bcrt1…>` (Chopsticks mine un bloc automatiquement à chaque `POST /tx`). Explorateur local : http://localhost:5000.
- Signet : https://bitcoinsignetfaucet.com, 1 000 à 10 000 sats, 5 demandes par 24 h. Préfinancer plusieurs adresses avant la démo.

## Pièges connus

- `POST /tx` en JSON → erreur « TX decode failed » : envoyer du `text/plain`.
- Oublier `witnessScript` sur une entrée P2WSH → finalisation impossible.
- Sorties sous 330 sats (poussière P2WSH) → refusées par le réseau.
- Estimation de taille P2WSH 2 sur 3 : environ 105 vB par entrée, 43 vB par sortie P2WSH, 11 vB de base. Prévoir une marge.
- Le change doit retourner au descripteur du client ; le cosignataire doit le vérifier, sinon une app compromise peut détourner le change.

## Vérifier une affirmation

Toute supposition sur une bibliothèque ou une API se vérifie par un test regtest, ou par une recherche Exa (`mcp__claude_ai_Exa__web_search_exa`) sur la documentation officielle. Ne jamais deviner une signature de fonction : lire les types dans `node_modules`.
