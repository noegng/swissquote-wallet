# Project context for Claude

## Project

A team of 3 (Noé, a student in France, and two teammates), BSA hackathon on DoraHacks, Swissquote Wallet Prize track (1800 / 1100 / 700 USD), 33 h. Goal: the self-custody wallet Swissquote could launch tomorrow, with the full story creation → login and signing → loss → recovery, a real testnet transaction, a defended custody model and a threat model. Swissquote wants to take the winning project to production.

**Language:** everything in the repository is in **English** (code, comments, messages, documents, file names, commit messages). Talk to the team in **French**.

## Chosen model (10 October 2026)

**Native 2-of-3 Bitcoin multisig**: phone key (client), Swissquote key (rule-enforcing cosigner), backup key. The backup key is split with **SLIP-39 groups**: CLIENT group (one mnemonic, on paper C1 and encrypted in the cloud C2) **and** PARTNER group (the partner, or a trusted person). **Swissquote holds no share of the backup key.** Close to Bitkey: delay + notification, sweep to a new set of keys, exit possible if Swissquote disappears.

The former approach (Safe / ERC-4337 smart account) is dropped from the core of the project: do not bring it back.

The demo runs on **signet without Docker**; regtest (Docker) is for development and the scenario scripts only.

## Documents to read first

1. `docs/03-decisions.md`: decisions, invariants I1–I7, spike. **Authoritative.**
2. `../swissquote-wallet-design.md`: full design document (threats, flows, legal, business).
3. `docs/01-hackathon-brief.md`: brief, including the full track version (six required topics).
4. `docs/09-build-plan.md`: checkable tasks per person and per phase.
5. `docs/06-prototype-to-production.md`: what is real, mocked, required in production.
6. `../README.md` and `docs/10-dorahacks-submission.md`: what the jury reads.

`docs/02-initial-design-superseded.md` is obsolete.

## Rules

- **Custody invariants** (see `docs/03-decisions.md`): any change to keys, rules, recovery or services goes through the `custody-invariants` skill.
- No homemade cryptography: bitcoinjs-lib, bip32, ecpair, a SLIP-39 library validated against the official vectors, WebCrypto, SimpleWebAuthn.
- The mocked services (Swissquote, partner) are **separate processes with their own storage**; the app never holds their key or share. Every mock is labelled (UI, responses, README).
- create → sign → recover must work end to end before any bonus.
- Every chain behaviour is checked by a regtest test or on the signet explorer.
- The legal framing is an assumption (non-custody), never advice.
- Never claim the prototype is ready for production.
- After a decision, update the documents with the `doc-sync` skill.

## Code structure

npm workspaces monorepo: `packages/core` (shared Bitcoin and backup library), `apps/web` (Vite + React), `services/swissquote` and `services/partner` (mocks), `tools/slip39-interop` (Python), `tools/regtest` (optional Docker), `scripts/` (demo scenarios).

## Project skills

`custody-invariants`, `btc-multisig`, `slip39-backup`, `mock-service`, `demo-run`, `doc-sync` (in `.claude/skills/`).

## Connectors

Exa (research), Figma (architecture diagram), Claude in Chrome (testing the web app). Etherscan is no longer useful for the core. See `docs/07-connectors-and-tools.md`.
