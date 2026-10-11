# Getting started, step by step

A guide to set the project up on your machine, with no Bitcoin background needed. Tested on Windows.

The demo runs on **signet**, Bitcoin's public test network: **no Docker needed**. A local Docker network (regtest) is optional, for development only (section 9).

## 1. Install the tools (once)

| Tool | Why | Check in a terminal |
|---|---|---|
| **Git** | Get the code | `git --version` |
| **Node.js 22** (https://nodejs.org, LTS version) | Run the app and the services | `node -v` → `v22.x` |
| Python 3 (optional) | SLIP-39 interop check only | `python --version` |
| Docker Desktop (optional) | Local regtest network, for development only | `docker info` |

## 2. Get the project

```bash
git clone https://github.com/noegng/swissquote-wallet.git
cd swissquote-wallet
cd swissquote-wallet          # the code folder (the one with package.json)
```

**Note: the repository contains a `swissquote-wallet/` folder inside `swissquote-wallet/`.** Every `npm` command runs in the inner folder.

If the repository is in OneDrive: exclude `node_modules` from sync, or clone elsewhere (e.g. `C:\dev\`). Otherwise installing is slow and OneDrive can create conflicts.

## 3. Install and configure

```bash
npm install                   # installs every dependency (1 to 2 minutes)
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

The `.env` file holds the local settings (network, ports, delays). The defaults are ready for the demo: **signet**, 30 s recovery delay, 20 s delay for large payments, 3000 sats signed at once per day.

Put it **in the inner folder**, next to `.env.example` (one level up is accepted as a fallback). When `npm run dev:all` starts, each server prints the network and the `.env` file it uses. Editing `.env` restarts the servers automatically.

## 4. Start the app and the services

```bash
npm run dev:all
```

This starts three programs at once (a colour prefix per program):

| Program | Address | Role |
|---|---|---|
| `sq` | http://localhost:4001 | **Mocked** Swissquote service (cosigner) |
| `partner` | http://localhost:4002 | **Mocked** partner service (backup share) |
| `web` | http://localhost:5173 | The app, to open in the browser |

Check that the three lines `Bitcoin network: signet` appear. Open http://localhost:5173. To simulate a phone: DevTools (F12) → phone icon (device mode), or use the *App* layout button at the top.

`Ctrl + C` stops all three.

## 5. Fund the wallet (signet)

1. In the app: log in, create the passkey, then the wallet, and finish the backup ceremony.
2. *Transfers → Get test bitcoin*: the app copies your address (it starts with `tb1…`) and opens a signet faucet, https://bitcoinsignetfaucet.com, in a new tab. Paste the address there. (Or *Transfers → Receive bitcoin* to see the address and its QR code.)
3. The faucet allows about 5 requests per 24 h: do not waste them.
4. The balance updates within about 20 seconds. Signet blocks come every ~10 minutes, but unconfirmed funds can already be spent.

**Fund the wallet an hour before the demo**, at several addresses if possible. Every transaction can be checked by anyone on https://blockstream.info/signet.

## 6. The passkey (Windows Hello, Touch ID)

The app creates a passkey: the computer's secure chip keeps it (TPM through Windows Hello on a PC, Secure Enclave on a Mac). On a PC, Windows Hello asks for the PIN or the face. Nothing to configure: it works on `localhost`.

If Windows Hello does not work (demo machine, no PIN set up): Chrome's virtual authenticator.
1. F12 → ⋮ menu → **More tools** → **WebAuthn**.
2. Tick **Enable virtual authenticator environment**, then **Add** (protocol `ctap2`, transport `internal`, tick *resident key* and *user verification*).
3. Reload the app: the passkey is created in this virtual authenticator.

## 7. Check that everything is fine

```bash
npm test             # 79 tests, including the custody invariants
npm run typecheck    # TypeScript type check
```

## 8. Everyday commands

| I want to… | Command |
|---|---|
| Start my session | `npm run dev:all` |
| Reset the demo | `npm run reset` (services running), then in the browser: F12 → Application → Clear site data (erases the local wallet) |
| Get the others' work | `git pull`, then `npm install` if `package.json` changed |

## 9. Optional: local regtest network (development)

Regtest is a private Bitcoin network on your machine: instant blocks, unlimited test coins, and the scenario scripts (`npm run demo:*`) run on it. It needs **Docker Desktop**, open while you work.

```bash
npm run regtest:up                  # first time: Docker downloads the images (a few minutes)
curl localhost:3000/blocks/tip/height   # prints a number (e.g. 101)
```

Then set `BTC_NETWORK=regtest` in `.env` (the servers restart by themselves) and create a new wallet: its addresses start with `bcrt1…`, and *Transfers → Get test bitcoin* funds it instantly. With the regtest faucet you can raise `DAILY_LIMIT_SATS` (e.g. 50000).

| I want to… | Command |
|---|---|
| Fund a regtest address | `npm run regtest:faucet -- bcrt1q...` |
| Stop the local Bitcoin node | `npm run regtest:down` |
| Start from an empty chain | `npm run regtest:down`, delete `tools/regtest/volumes/`, `npm run regtest:up` |

What it starts: a Bitcoin node, an API on http://localhost:3000 (the same API as blockstream.info) and an explorer on http://localhost:5000. Wallets are kept per network: switching back to signet brings back your signet wallets.

## 10. Common problems

| Symptom | Fix |
|---|---|
| The servers print `Bitcoin network: regtest` while you expect signet | The `.env` is not in the inner folder, or `BTC_NETWORK` is misspelled (an invalid value stops the startup with a message) |
| `port is already allocated` / `EADDRINUSE` | An old program is still running: close the other terminals |
| The app shows the services "offline" | `npm run dev:all` is not running, or crashed: look at the `[sq]` and `[partner]` messages |
| The balance does not update on signet | The public API limits the request rate: wait 20 s; check the address on https://blockstream.info/signet |
| `npm install` is very slow | Repository in OneDrive: see section 2 |
| Passkey creation fails or offers nothing | Windows Hello is not set up: Settings → Accounts → Sign-in options → PIN. Otherwise, Chrome's virtual authenticator (section 6) |
| Regtest: `Cannot connect to the Docker daemon` | Docker Desktop is not running: open it and wait until it is ready |

## 11. Working with Claude Code

Open Claude Code in the inner `swissquote-wallet/` folder. It reads `CLAUDE.md` and loads the project skills automatically (`custody-invariants`, `btc-multisig`, `slip39-backup`, `mock-service`, `demo-run`, `doc-sync`). To know what to do next: `docs/09-build-plan.md`.
