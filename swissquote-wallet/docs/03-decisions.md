# Decision log

Statuses: **Decided** (agreed by the team), **Proposed** (recommended, to be confirmed), **To validate** (depends on a test or an outside opinion).
Update this file on every change, with the date and the reason. This file **is authoritative** when another document contradicts it.

## Change of course on 10 October 2026

The full track brief (see `01-hackathon-brief.md`) puts Bitcoin at the centre (the vast majority of Swissquote's crypto clients hold BTC) and requires that the client gets their funds back if Swissquote disappears. The Safe / ERC-4337 smart account, limited to EVM, is no longer the main model. The team chose **collaborative custody with a 2-of-3 Bitcoin multisig**, whose backup key is stored with **SLIP-39 groups**. The former decisions are kept at the bottom of the page for reference.

## Current decisions

| # | Topic | Choice | Status | Reason / condition |
|---|---|---|---|---|
| D1 | Track | Swissquote Wallet (not Belem Capital) | Decided | More realistic in 33 h for 3 people, and the scoring rewards security, legal and the pitch |
| D2 | Seed phrase in a vault at the bank | Rejected | Decided | Swissquote would control the funds |
| D3 | Custody model (10/10/2026) | Native **2-of-3** P2WSH Bitcoin multisig (`wsh(sortedmulti(2, …))`): phone key (client), Swissquote key (rule-enforcing cosigner), backup key | Decided | Native Bitcoin, no key reassembled to sign, Swissquote never alone, the client is autonomous with 2 keys. A proven model (Bitkey, Casa, Unchained) |
| D4 | Authentication (10/10/2026) | Platform WebAuthn passkey (Secure Enclave, TEE/StrongBox, TPM through Windows Hello, managed by the browser): authenticates the client to the cosigner with a **challenge bound to each operation** (hash of the PSBT or of the request, single use, 3 min). The phone's Bitcoin key is encrypted with a non-extractable WebCrypto key (PRF optional). Demo on a computer, Chrome's virtual authenticator as a fallback | Decided | The chip only handles P-256 and Bitcoin uses secp256k1: the passkey proves identity, it does not sign the transaction. Direct Secure Enclave access = native app, out of scope |
| D5 | Chain (10/10/2026, updated 11/10) | **Signet** for the public demo, through the **blockstream.info** esplora API (mempool.space is unreachable from Noé's network), **without Docker**. **Regtest** (Docker, compose taken from Nigiri) only for development and the scenario scripts | Decided | Signet is stable, public and has faucets; regtest gives instant blocks. Regtest spike succeeded on 10/10. The team prefers not to depend on Docker for the presentation (11/10) |
| D6 | Recovery (10/10/2026) | Backup key split with SLIP-39: CLIENT group (one mnemonic, kept on paper C1 and encrypted in the cloud C2) **and** PARTNER group (independent partner). Group threshold = 2 | Decided | Swissquote + partner cannot restore it (the CLIENT group is missing); Swissquote holds no share of the backup key |
| D7 | Delay (10/10/2026, shortened on 11/10) | Demo: **30 s** for recovery (Swissquote and partner, in parallel), **20 s** for a large payment; production: **7 days** for recovery (as Bitkey), 24 h to 7 days for a large payment, with notifications | Decided | Gives the legitimate client time to cancel; the demo is shortened to fit in little time (set in `.env`) |
| D8 | Limits (10/10/2026) | Enforced by the **Swissquote cosigner**: tier 1 (24 h total of **amounts + fees** within the threshold) at once; tier 2 delay + notification, can be cancelled; sanctioned address refused. Shown to the client as "**Instant payments**" (see D23). Demo threshold on signet: 3000 sats | Decided | No on-chain rules in Bitcoin; Swissquote can refuse to cosign but never sign alone. Fees count: otherwise a thief destroys the funds with huge fees (bug fixed on 10/10) |
| D9 | Protective actions (10/10/2026) | **Protect** (cancel a payment, cancel a recovery, freeze the wallet): passkey **or** client-area session. **Relax** (unfreeze): passkey required. A recovery can be opened on a wallet the client froze | Decided | A client whose phone was stolen no longer has their passkey: they must be able to react from a computer (bug fixed on 10/10). With the session, an attacker can only delay or freeze, never move funds |
| D10 | Recovery safeguards (completed on 11/10) | One active recovery per wallet, mandatory sweep to a **new** set of keys. The new wallet is created, its PARTNER share deposited and its backup done **before** any funds move; the sweep can be cosigned again under the same conditions (signed by the backup key, outputs to the new wallet only). Cancelling a recovery also cancels the partner's release; a freeze requested during a recovery survives its cancellation | Decided | Revocation of the old keys and shares; lessons from Argent and Bitkey. 11/10 audit: before, funds could move to a wallet not yet backed up, or stay stuck after a failed broadcast |
| D11 | Gasless (bonus) | Bitcoin equivalent: Swissquote sponsors the fees by adding an input from its fee wallet to the PSBT before the client signs, with a per-client quota | Proposed | Only if create → sign → recover works end to end |
| D12 | Compliant interaction (bonus) | Plain-language summary of the transaction before signing, screening of addresses against a sanctions list (labelled mock), stronger checks above a threshold | Decided | Implemented: summary checked by the app and by Swissquote, sanctions, delay and alert |
| D13 | Who writes the code | Written by Claude, reviewed and explained by the team | Decided | Every rule must be explainable to the jury |
| D14 | Cryptography | No homemade cryptography: bitcoinjs-lib, bip32, **shamir-mnemonic-ts** (45 official vectors + interop with Trezor's Python reference, validated on 10/10), WebCrypto, SimpleWebAuthn | Decided | Required by the brief. `slip39` (ilap) rejected: it modifies global prototypes |
| D15 | Differentiation | Demo of refused attacks, "Swissquote is gone" shown live, banking continuity during the delay, custody invariants tested automatically | Proposed | See `05-differentiation.md` |
| D16 | Legal framing | Non-custody assumption (Swissquote cannot move the funds, alone or with the partner), to be validated by a Swiss lawyer | To validate | See the design document, legal section |
| D17 | MPC | Rejected for the hackathon | Proposed | Risky integration in 33 h; when the provider fails, many MPC wallets end up rebuilding the key |
| D18 | Safe / ERC-4337 smart account (10/10/2026) | Downgraded to an EVM option (USDC, gasless), out of scope unless there is free time | Decided | EVM only; the core is Bitcoin |
| D19 | Role of the split backup (10/10/2026) | SLIP-39 only for the backup key, never for a key used daily; Swissquote holds no share of it | Decided | Avoids collusion between a Swissquote employee and a stolen paper; the backup key is only reassembled on the client's device, then dropped |
| D20 | Client app (10/10/2026) | Mobile web app: Vite + React + TypeScript, npm monorepo | Decided | The fastest in 33 h; native WebAuthn passkeys |
| D21 | Task tracking (10/10/2026) | The file `docs/09-build-plan.md` | Decided | Nothing to set up |
| D22 | Trusted person (10/10/2026) | The client can entrust the PARTNER share to someone they choose (notary, lawyer) instead of the partner. Invitation by link or QR code, key created on that person's device, code compared by voice, then the partner re-seals the share for that key and **destroys its copy**. During a recovery, that person checks the client's identity and approves; the partner's delay still applies | Proposed | The client chooses whom to trust; after the handover the partner can no longer read the share. SLIP-39 unchanged (2 groups, threshold 2), Swissquote still holds no share, the client's app never sees the PARTNER share. Limits: if that person loses their share, the backup key is lost (the phone and Swissquote keys can still spend); after a recovery, the new wallet goes back to the partner and the person must be invited again |
| D23 | How the limit is shown (11/10/2026) | The tier-1 threshold is shown as "**Instant payments**": amount left today, a gauge, and what happens beyond it (the payment still leaves after the delay). No more "Daily limit" | Decided | "Daily limit" suggested that payments were blocked beyond it |
| D24 | Bitcoin network (11/10/2026) | `BTC_NETWORK` (regtest or signet) in the monorepo's `.env`, validated at startup and printed by each server; the local vault and the Swissquote registry keep wallets per network | Decided | A misspelled value or a misplaced `.env` made the app silently fall back to regtest |
| D25 | Animations (11/10/2026) | Rare UI components (MIT licence) ported to our CSS with `motion`: rolling balance, "gooey" tabs, alert bell, step checks; switched off with `prefers-reduced-motion` | Decided | UX and pitch criterion; no Tailwind added |
| D26 | Language (11/10/2026) | Everything in the repository is in English: code, comments, messages, documents, file names | Decided | The jury and the DoraHacks page are international. The team keeps talking in French |

## Custody invariants

They turn the decisions into checkable properties, covered by the automated tests in `packages/core/test/` (`multisig.test.ts`, `backup.test.ts`, `onboarding.test.ts`) and by the `npm run demo:*` scenarios.

| # | Invariant |
|---|---|
| I1 | Swissquote alone cannot move the funds |
| I2 | Swissquote + partner can neither move the funds nor restore the backup key |
| I3 | The client can leave without Swissquote (phone + backup key) |
| I4 | The app never holds the Swissquote key or the partner's share (separate processes and storage) |
| I5 | The backup key is only reassembled on the client's device, then dropped (sweep to a new set of keys) |
| I6 | No homemade cryptography |
| I7 | Everything mocked is labelled (UI, service responses, README) |

## Initial spike (H0–H3)

To be done before any feature:

1. 2-of-3 descriptor, address, funding, PSBT signed by the phone key and the Swissquote key (separate service), broadcast on regtest **then on signet**.
2. SLIP-39: the candidate JS library passes the official vectors and the interop with Trezor's Python reference; I2 test (Swissquote + partner cannot restore).
3. Passkey: registration and authentication against the mocked Swissquote service; test of the PRF extension on the team's browsers.
4. If step 2 fails: use the Python reference in the services and an equivalent module in the app, and document it.

## Superseded decisions (for reference)

| # | Former choice | Replaced by |
|---|---|---|
| D3 (former) | ERC-4337 smart account (Safe 1.4.1 + Safe4337Module, EntryPoint v0.7) | D3, D18 |
| D4 (former) | Passkey signing the UserOperations (P-256 on-chain) | D4 |
| D5 (former) | Base Sepolia | D5 |
| D6 (former) | 2-of-3 recovery by on-chain guardians (Candide) | D6 |
| D8 (former) | Homemade Solidity limits module | D8 |
| D9 (former) | Veto key on a second device | D9 |
| D11 (former) | ERC-4337 paymaster | D11 |
