# Build plan (33 h, 3 people)

Tick as you go (`- [x]`). Roles: **A** = Bitcoin core and recovery (`packages/core`), **B** = web app and passkeys (`apps/web`), **C** = mocked services, docs, diagram, pitch.

Rules: P0 and P1 done before any bonus. Checkpoints at **H10, H20, H26**: if the core is late, the bonuses are cut. **Code freeze at H30.**

## Before H0 (preparation)

- [x] Documents updated for the 2-of-3 multisig + SLIP-39 (`03-decisions.md` is authoritative)
- [x] Project skills in `.claude/skills/`
- [x] Monorepo skeleton (`packages/core`, `apps/web`, `services/swissquote`, `services/partner`, `tools/`, `scripts/`): `npm install`, `npm test`, `npm run typecheck`, `npm run dev:all` checked on 10/10
- [x] Docker regtest tested on Noé's machine on 10/10 (block 101, faucet OK, explorer on :5000)
- [x] ~~Docker regtest on each teammate's machine~~ — no longer needed: the demo runs on signet without Docker (11/10)
- [ ] Pre-fund 3 to 5 signet addresses from the faucet (limited to 5 requests per 24 h)

## H0–H3: spike

- [x] **A** 2-of-3 descriptor, address, PSBT signed by 2 keys, regtest broadcast (`npm run spike`, 10/10)
- [x] **A** Same on **signet**: first public txid in `proofs.md` (`npm run spike:signet`, 10/10)
- [x] **A** SLIP-39: `shamir-mnemonic-ts` passes the 45 official vectors; works in the browser with `vite-plugin-node-polyfills`
- [x] **A** Interop with the Python reference; I2 test (Swissquote + partner cannot restore)
- [x] **B** Vite + React skeleton, phone layout, MOCK banner
- [x] **B** Passkey: login (mock) and passkey creation screens, verification by the service; challenge bound to each operation (10/10). PRF postponed (optional)
- [x] **C** Swissquote service: `/wallets`, `/cosign` with independent PSBT checks, own storage (done by Claude, 10/10)
- [x] **C** Minimal partner service: deposit and release of a share, own storage

## H3–H10: creation and sending

- [x] **A** `backup.ts` (split / combine), `sealing.ts` (ECDH + HKDF + AES-GCM, and PBKDF2 for C2), `summary.ts` (checked summary), `onboarding.ts` (material for a new wallet)
- [x] **A** Tests of invariants I1 to I5 (`packages/core/test/`, 79 tests on 11/10); I3 "Swissquote stopped" covered by `demo:exit`
- [x] **B** Onboarding: mocked login → passkey → keys → Swissquote → PARTNER share sealed for the partner → C1 + check of 2 words → C2 encrypted and downloaded; home (balance, address, regtest faucet, exit kit). Tested in Chrome up to the C2 download
- [x] **B** Send screen: summary checked by the app, passkey approval bound to the PSBT, tier 1 at once, tier 2 with countdown and cancellation by passkey (resumed after a reload), explorer link; home with Swissquote alerts and a receive address never reused. Tested in Chrome up to the passkey approval
- [x] **C** Cosigner rules: daily amount, tier 2 (delay + cancellable notification), sanctions (`npm run demo:cosign`)
- [x] **B + C** Passkey required on `/cosign` and `/cosign/:id/cancel`; attacks without a passkey, with a swapped PSBT and with a replay refused (`npm run demo:cosign`)
- [x] **C** Wallet registry (Travel Rule), mocked KYC, audit log; partner service: public key, PARTNER share deposit (`npm run demo:create`)
- [x] **Checkpoint H10**: creation → sending end to end on regtest (scripts and app)
- [x] **Windows Hello validation** by Noé (10/10): passkey, creation, small and large payment, cancellation, recovery on a second "device" (private window). Defect found and fixed: synced passkey already present on the recovery device

## H10–H18: recovery

- [x] **A** Recovery: backup key rebuilt on the device, sweep to a new set of keys (`npm run demo:recover`)
- [x] **A** Exit without Swissquote: phone + backup key, direct broadcast (`npm run demo:exit`)
- [x] **B** Recovery screen (new device) and cancellation alert on the old one; exit kit downloadable from the home screen. Tested in Chrome up to the passkey
- [x] **B** "Swissquote is gone" screen (exit with phone + backup key, no session): tested end to end in Chrome with the Swissquote service stopped (10/10)
- [x] **C** Swissquote `/recovery` (open with freeze, cancel by passkey, new wallet, sweep requiring the backup key, passkey revocation) and partner `/release` (identity, delay, re-sealing for the device, cancellation)
- [x] **Regtest e2e tests** (separate scripts): `demo:create`, `demo:cosign`, `demo:recover`, `demo:exit` (Swissquote really stopped)

## H18–H22: demo

- [x] **A** Attack scripts and the "Swissquote is gone" scenario (`demo:cosign`, `demo:recover`, `demo:exit`)
- [ ] **A** Signet proofs of the full story in `proofs.md`
- [ ] **B** Demo panel (scenarios and attacks, reasons for refusals)
- [x] **C** FigJam architecture diagram (mocked parts in a distinct colour), in the README (`docs/architecture.svg`) and FigJam link; Mermaid diagram in English in the root README
- [x] **C** Threat, legal, Travel Rule and business sections finalized (`docs/10-dorahacks-submission.md`, root README, 11/10)
- [ ] **Checkpoint H20**: the full story replayable on signet

## H22–H26: bonus (only if everything above is ticked)

- [ ] **A** Fees sponsored by Swissquote (input added before the client signs, quota)
- [x] **B** Compliant interaction in the UI: plain-language summary, sanctions refusal, stronger checks ("Instant payments", delay announced before signing)
- [ ] **A** BIP-322 ownership proof (optional)
- [ ] **C** Pitch and answers to the jury's questions
- [ ] **Checkpoint H26**

## H26–H33: polish and submission

- [ ] Code freeze at H30, fixes only
- [ ] Final review with the `custody-invariants` skill and `/code-review`
- [ ] Demo rehearsal (skill `demo-run`)
- [ ] Backup video
- [ ] DoraHacks submission (checklist of the `doc-sync` skill)

## Done on 11/10 (after H26)

- [x] Bug audit (interface and transactions) and fixes, re-checked on regtest: recovery in the right order and replayable, address scan with a gap limit, replayable broadcast, partner release cancelled with the recovery, freeze kept
- [x] Shorter demo delays (30 s recovery, 20 s large payment); limit shown as "Instant payments"
- [x] Reliable Bitcoin network setting (validation, printed at startup, wallets kept per network); signet by default, no Docker for the demo
- [x] Animations (Rare UI, MIT licence); backup words copied without their numbers
- [x] Presentation README at the repository root and an up-to-date submission write-up
- [x] Whole repository in English (code, messages, documents, file names)

## Before publishing on DoraHacks

- [ ] Demo video (create → sign → lose → recover → exit), linked in the root README and on the DoraHacks page
- [ ] Team names and roles on the DoraHacks page
- [ ] New signet proofs of the full story (payment, large payment, recovery sweep, exit) in `docs/proofs.md`
- [ ] Move `main` to the latest version (`git fetch . front-figma-v3:main` then `git push origin main`): it is the branch the jury sees
- [ ] Full demo rehearsal in the browser, on signet (skill `demo-run`)

## AI tools used (to declare in the submission)

| Tool | Use |
|---|---|
| Claude Code (Opus) | Design, writing the documents, writing the code reviewed by the team, tests and scenarios, bug audit, project skills |
| Claude, Exa connector | Research on libraries, prior art (Bitkey, Casa, Ledger Recover) and APIs |
| Claude, Figma connector | Architecture diagram, app mockups |
| Claude in Chrome | Testing the web app flows and the animations |
| Claude Code `premium-ui` skill | Choosing the Rare UI animated components, ported to our styles |
