---
name: demo-run
description: Start, reset, test end to end and rehearse the Swissquote Wallet demo (signet without Docker for the presentation, optional Docker regtest for the scripts, mocked services, web app, scripted scenarios and attacks, collecting txids and explorer links in docs/proofs.md). Load it to start the project, run the end-to-end scenarios, prepare or rehearse the demo, or produce verifiable proofs.
---

# Running and rehearsing the demo

All paths are relative to `swissquote-wallet/` (the folder with `package.json`).

## Starting (presentation: signet, no Docker)

```bash
npm install
cp .env.example .env      # BTC_NETWORK=signet, 30 s recovery, 20 s large payments, 3000 sats instant
npm run dev:all           # services/swissquote, services/partner, apps/web in parallel
```

Each server prints `Bitcoin network: …` and the `.env` it uses. The web app shows the network and the prototype banner. Fund the wallet from https://bitcoinsignetfaucet.com an hour before the demo.

## Scenario scripts (regtest, Docker)

The scripts need instant blocks and the regtest faucet: `npm run regtest:up`, then services on regtest (`BTC_NETWORK=regtest` in `.env`, or environment variables on other ports so the signet servers keep running, e.g. `SWISSQUOTE_PORT=4101 PARTNER_PORT=4102`). Run them one at a time: in parallel they compete for the same regtest faucet.

```bash
npm run demo:create      # full creation: passkey, wallet, PARTNER share at the partner, C2
npm run demo:cosign      # tiers 1 and 2, cancellation, sanctions, another wallet's funds, passkey attacks, I1, huge-fee attack, freeze
npm run demo:recover     # phone + email attack refused, cancellation, full recovery (RECOVERY_DELAY_SECONDS=6 recommended)
npm run demo:trustee     # trusted person: invitation, handover, approval of a release (partner only)
npm run demo:exit -- create   # then stop the Swissquote service (port 4001), then:
npm run demo:exit -- exit     # exit with phone + backup key, checks that Swissquote is unreachable
npm run spike:signet     # public 2-of-3 transaction on signet
```

```bash
npm test                  # unit tests + invariants I1–I5 (packages/core)
python tools/slip39-interop/check.py   # SLIP-39 interop with the Trezor reference
```

## Resetting between two rehearsals

```bash
npm run reset             # empties services/*/data (instructions for the app storage in the console)
```

## Demo scenarios (pitch order)

1. Wallet creation (C1 shown, C2 encrypted, PARTNER share sent).
2. Small payment signed at once (instant payments) → signet txid.
3. Large payment → held 20 s, alert, visible delay.
4. Attack: thief with the unlocked phone → held, cancelled by the client.
5. Attack: phone + email start a recovery → refused (no CLIENT share).
6. Attack: Swissquote + partner try to restore → combination rejected.
7. Lost phone → recovery, sweep to a new set of keys.
8. Swissquote is gone → stop `services/swissquote` (close its terminal or kill port 4001), login screen → "Swissquote unavailable? Use your exit kit".

## Proofs

- Record each signet txid in `docs/proofs.md` with the link `https://blockstream.info/signet/tx/<txid>` and the date.
- Check the confirmation: `GET https://blockstream.info/signet/api/tx/<txid>/status` (WebFetch) → `confirmed: true`.
- Before the demo: pre-fund 3 to 5 signet addresses (faucet limited to 5 requests per 24 h), record a **backup video** and a GIF of the flow (Claude in Chrome, `gif_creator`).

## If something breaks on the day

- Slow signet or empty faucet → show the signet txids already in `proofs.md`; as a last resort, switch to regtest (`BTC_NETWORK=regtest`, needs Docker).
- Passkey unavailable on the demo machine → use the browser and device tested during the rehearsal, or Chrome's virtual authenticator.
- Nothing works → backup video.
