# Connectors and tools

## claude.ai connectors (status on 10 October 2026)

Connectors belong to the claude.ai account, not to the repository. Each team member has to enable them in their own settings.

| Connector | Status | Use in the project |
|---|---|---|
| Exa | Connected | Research on libraries, documentation and projects (used to validate bitcoinjs-lib, SLIP-39, the signet API, Bitkey) |
| Figma | Connected | Architecture diagram in FigJam (required topic 2), mockups when needed |
| Claude in Chrome | Connected | Walking through the web app, screenshots and backup GIFs of the demo |
| Etherscan | Connected | No longer useful for the core (Bitcoin); only for the EVM option |
| Google Drive, Linear | Connection not finished | Not used (task tracking in `09-build-plan.md`) |

Checking Bitcoin transactions: public API `https://blockstream.info/signet/api` (no connector needed).

## Project skills

In `.claude/skills/`, loaded automatically by Claude Code when working in this folder:

| Skill | Use |
|---|---|
| `custody-invariants` | Before any change to keys, rules, recovery or services: check invariants I1–I7 |
| `btc-multisig` | Bitcoin code: descriptor, PSBT, broadcast, regtest and signet |
| `slip39-backup` | Backup and rebuilding of the backup key |
| `mock-service` | Create or change a mocked service (Swissquote, partner) |
| `demo-run` | Start, reset and rehearse the demo, and collect the proofs |
| `doc-sync` | Update the documents after a decision, prepare the submission |

## Development tools

- Node 22, npm workspaces, TypeScript, Vite + React, vitest.
- Bitcoin: `bitcoinjs-lib`, `bip32`, `ecpair`, `@bitcoinerlab/secp256k1`.
- Signet through the public blockstream.info API (demo); optional local regtest: Docker + Nigiri (bitcoind + esplora).
- SLIP-39: a JS library validated against the official vectors; Trezor's Python reference `shamir-mnemonic` for interop.
- Passkeys: `@simplewebauthn/browser` and `@simplewebauthn/server`.
- Animations: `motion`, with components adapted from Rare UI (MIT).

## Rules for working with Claude

- The code is written by Claude, reviewed and explained by the team.
- No homemade cryptography.
- Every chain behaviour is checked by a test (regtest) or on the explorer (signet).
- The AI tools used are listed in the submission (brief requirement): keep the list up to date in `09-build-plan.md`.
