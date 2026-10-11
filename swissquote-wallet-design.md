# Swissquote Self-Custody Wallet — Design document

> BSA hackathon — Swissquote Wallet Prize. Team of 3, 33 hours.
> This file gathers all the context: problem, solution, threats, decisions, differentiation, path to production, team split, prior art and technical references.
> Last update: 11 October 2026 (2-of-3 Bitcoin multisig + SLIP-39 backup key, chosen on 10 October). The log `swissquote-wallet/docs/03-decisions.md` **is authoritative** in case of contradiction.
> Statuses: **Decided**, **Proposed** (to be confirmed), **To validate** (depends on a test or an outside opinion).

---

## Contents

1. The brief in short
2. The problem and the options we rejected
3. The chosen solution
4. Threat model
5. Difficulties and answers
6. Differentiation
7. Scope
8. From prototype to production
9. Business, legal and Travel Rule
10. Decisions and initial spike
11. Open points
12. Split between the 3 of us and priorities
13. Mapping to the scoring
14. Likely jury questions
15. Prior art: related projects and lessons
16. Technical references
17. Connectors, tools and working rules
18. Sources

---

## 1. The brief in short

Swissquote wants a self-custody wallet the bank could launch tomorrow: **their keys, their control**, while staying **one step away from the Swissquote account**, with the security, simplicity and compliance of a Swiss bank. The full brief is in `swissquote-wallet/docs/01-hackathon-brief.md`.

**Required demo story:** create a wallet → log in and sign a transaction → lose the wallet or its keys → recover access. The transaction must be signed and sent to a blockchain (testnet accepted).

**Six required topics:** custody model (pros, cons, short threat model: who can steal, who can lock the client out, can Swissquote alone or with a partner move the funds?), architecture (diagram, real vs mocked), wallet creation, authentication (small vs large amount), recovery (including **if Swissquote is permanently gone**), business case.

**Constraints:** no homemade cryptography; honest, labelled mocks; a mocked share holder runs as a **separate process with its own storage**, and the client app never holds its share.

**Scoring:** technical 35, security and custody 20, legal 15, business 15, UX and pitch 15, bonus up to +20 (10 gasless, 10 compliant interaction) if create → sign → recover works end to end. Extra credit if the recovery **refuses an attacker who has the phone and the email**.

---

## 2. The problem and the options we rejected

### 2.1 Today

A client who wants self-custody withdraws their crypto to an external wallet and leaves the Swissquote ecosystem. The usual recovery options are bad:

- **Seed phrase**: lost, everything is lost; badly kept, it is stolen.
- **Recovery by email or SMS**: an attacker who controls the phone or the email gets everything.
- **Seed kept by the bank**: the bank holds the key, so it is no longer self-custody.

### 2.2 Problem statement

> How can a client keep control of their bitcoins and stay one step away from their bank, without an attacker, Swissquote, or Swissquote together with a partner being able to move the funds?

### 2.3 The adversaries

1. **The outside attacker**: stolen phone, hacked email, fake identity documents, social engineering, burglary, compromised device.
2. **The bank** (or an employee, or an attacker who compromises it): it must not be able to act alone, or with a partner, for security reasons and for its legal status.
3. **An actor disappearing**: Swissquote or the partner stops operating.

### 2.4 Rejected options

| Option | Why it is rejected |
|---|---|
| **Custodial account** | Swissquote holds the keys: it is not self-custody, and it is already the existing offer |
| **Seed phrase only** | A typical bank client will not keep it properly; no limit, no delay |
| **Seed in a vault at the bank** (D2) | The bank controls the funds, single point of failure, cannot be revoked |
| **Split backup only (Shamir 2-of-3: client, Swissquote, partner)** | Swissquote + partner restore without the client (the custody grey zone the brief mentions); the seed is reassembled and then gives full, instant access with no delay or limit; a share cannot be revoked. Precedent: Ledger Recover (2023), heavily criticised for these reasons |
| **MPC / threshold signatures** (D17) | Defensible and multi-chain, but risky to integrate in 33 h, and many MPC wallets rebuild the key when the provider fails |
| **ERC-4337 smart account** (D18) | Elegant on-chain rules, but **EVM only**: no native Bitcoin. Kept as an option for USDC |

---

## 3. The chosen solution

### 3.1 Principle

**Collaborative 2-of-3 Bitcoin custody, where the client holds two keys and Swissquote only one.** Three independent keys, two are needed to sign. The backup key, rarely used, is stored with SLIP-39 so that neither Swissquote, nor Swissquote with the partner, can rebuild it.

**Positioning line:** "Your bitcoins, your keys, one step away from your account: Swissquote protects you but can never act without you, and if Swissquote disappears, you leave with your funds."

### 3.2 The three keys

| Key | Where it lives | Who uses it | Role |
|---|---|---|---|
| **Phone key** | The client's app, encrypted at rest, unlocked with the passkey (biometrics) | The client | Daily use |
| **Swissquote key** | Cosigning server (mock: local file; production: HSM) | Swissquote, never alone | Cosigns under rules: instant amount, delays, sanctions, Travel Rule |
| **Backup key** | Exists nowhere in one piece. Split with SLIP-39 (see 3.3) | The client, with the partner | Recovery, exit if Swissquote disappears |

Script: `wsh(sortedmulti(2, xpub_phone, xpub_swissquote, xpub_backup))`, standard, importable into Sparrow or Bitcoin Core.

### 3.3 SLIP-39 backup of the backup key

```
Backup key = CLIENT group  AND  PARTNER group        (group threshold = 2)

  CLIENT group:  one mnemonic, kept in two places
                 C1 = paper or metal plate at home
                 C2 = encrypted copy in the client's cloud (key derived from the passkey, or a passphrase)
  PARTNER group: independent partner (trust company, notary), or a trusted person the client chooses;
                 two partners in production
```

- Swissquote **holds no share** of the backup key (D19): a dishonest Swissquote employee + a burglar who steals the paper can do nothing.
- C1 and C2 are the same mnemonic (the SLIP-39 spec recommends a single share per threshold-1 group): it is redundancy against loss, not extra security.
- **Never** use three groups with a threshold of 2: C1 + C2 would then be enough without the partner.
- The partner only releases its share after an identity check, a delay and a notification, encrypted for the client's device.
- **Trusted person (option, D22):** the client can entrust the PARTNER share to a notary or lawyer; the partner re-seals it for that person's key and destroys its copy.

### 3.4 Life cycle

**Creation**
1. The client logs in to Swissquote (KYC already done, mocked) and creates a passkey.
2. The app generates the phone key and the backup key; Swissquote derives its key for this client.
3. The 2-of-3 descriptor is built; Swissquote registers it: **ownership of the wallet is established at creation** (Travel Rule).
4. The backup key is split: C1 shown to be written down, C2 encrypted for the cloud, PARTNER share encrypted for the partner. Then it is **erased** from the app.

**Authentication and signing**
1. The client prepares a payment; the app shows a **plain-language summary** (amount, recipient, fee, change, CHF value) and says whether Swissquote will sign at once or after a delay.
2. The client authenticates with the passkey (biometrics). The WebAuthn challenge is **bound to this exact transaction** (PSBT hash): the biometric approves exactly this payment, not an open session. The app signs with the phone key.
3. The Swissquote cosigner checks the passkey assertion (single-use challenge, valid 3 minutes, same PSBT hash) and applies the rules:
   - **Instant payments** (within the 24 h amount, fees included): cosigned at once.
   - **Above it**: not blocked — delay + out-of-band notification, can be cancelled.
   - **Sanctioned address**: refused.
4. The transaction is finalized and broadcast; link to the explorer.

**Lost phone** (implemented: `npm run demo:recover`, screen "Recover your wallet")
1. New device: Swissquote login, then **a passkey for this new device**.
2. The client opens a recovery at Swissquote (stronger identity check, mocked): the wallet is **frozen** (no payment at all, even small; a pending large payment is dropped), alerts, **delay**. In parallel, they request the PARTNER share from the partner, which applies **its own** identity check and **its own** delay (it does not depend on Swissquote).
3. During the delay, the real client can **cancel from their old phone** (old device passkey) or from their client area (session). Cancelling also cancels the partner's release; a freeze the client requested stays in place.
4. After the delay, the partner's share arrives **sealed for a non-extractable key of the new device**. The client types their paper share C1 (or opens their C2 copy with the passphrase). The backup key is rebuilt **on the device only**, in memory.
5. The **new wallet is prepared first**: new keys, a new SQ key, a new PARTNER share at the partner, a new C1 / C2 backup; only then is it stored on the device. **No funds move before the new wallet is backed up.** Swissquote then cosigns the sweep, under three conditions: it is **already signed by the backup key** (the lost phone's key is not enough), it pays **only** the new wallet, and nothing comes back to the old one. It can be cosigned again under the same conditions (failed broadcast, funds that arrive later).
6. All the old passkeys are **revoked** (only the new device's, declared when the recovery opened, is kept).
7. **Banking continuity** (mocked): during the delay, the client keeps capped access through their Swissquote account.

**Swissquote is gone** (implemented: `npm run demo:exit`, button "Swissquote unavailable? Use your exit kit" on the login screen; demonstrated with the Swissquote service really stopped)
1. Available **without a session**: the app lists the wallets on the phone (local vault).
2. The client requests the PARTNER share from the partner, which applies its own delay and does not depend on Swissquote; the share arrives sealed for a non-extractable key of the device.
3. They type their paper share C1 (or open C2) and the address of another wallet of theirs; the backup key is rebuilt in memory.
4. Phone key + backup key sign a sweep of all funds (2 of 3, without Swissquote); the transaction is broadcast directly to the Bitcoin network. The exit flow only uses the partner and the Bitcoin API.
5. **Exit kit**: the standard descriptor, importable into a market wallet (Sparrow, Bitcoin Core), to do the same without our app.

### 3.5 Demo scenarios

1. **Normal use**: creation, small payment signed at once, real txid on signet.
2. **Large amount**: above the instant amount, notification, visible delay.
3. **Refused attacks** (live, with the reason):
   - a thief with the unlocked phone who tries to empty the wallet → held, the client cancels;
   - an attacker with the **phone and the email** who starts a recovery → they have neither C1 nor C2, the backup key cannot be rebuilt → **refused** (brief bonus);
   - Swissquote + partner trying to restore the backup key → SLIP-39 combination rejected.
4. **Lost phone**: full recovery, sweep to a new set of keys.
5. **Swissquote is gone**: Swissquote services stopped live, exit with phone + backup key.

---

## 4. Threat model

**Direct answers to the brief's questions**

| Question | Answer |
|---|---|
| Can Swissquote alone move the funds? | No: 1 key out of 3 (I1) |
| Swissquote + a partner? | No: Swissquote key + PARTNER share do not rebuild the backup key (I2) |
| Can Swissquote lock the client out? | No: phone + backup key are enough (I3). It can refuse to cosign, which delays but does not block |
| Where is the seed reassembled? | The signing keys never are (multisig). Only the backup key is, on the client's device, then dropped (I5) |

**Threat table**

| Threat | What the attacker gets | What stops them |
|---|---|---|
| Stolen phone (locked) | Nothing usable | Encrypted key, unlocked by the biometric passkey |
| Stolen and unlocked phone, or malware | Phone key | Swissquote cosigns at once only up to the instant amount (amount **+ fees**); above it, delay + notification; the client cancels or **freezes from their client area**, without the phone |
| Thief paying huge fees to destroy the funds | Phone key | Fees count toward the limit: 1,000 sats + 900,000 sats of fees go to the delayed tier (delay, alert, cancellation) |
| Hacked email | Notifications | No key; notifications on several channels |
| **Phone + email** | Phone key, account access | Can open a recovery, but: the wallet freezes, the real client is alerted and can cancel; without the CLIENT share the backup key cannot be rebuilt; a sweep signed with the stolen phone key is refused (Swissquote requires the backup key). Demonstrated by `npm run demo:recover` |
| Stolen paper C1 | CLIENT share | The partner (identity + delay + notification) and Swissquote are needed too |
| Stolen paper + phone | Phone key + CLIENT share | Partner: identity, delay, notification to the client; can be cancelled. Documented residual risk |
| Compromised cloud account (C2) | Encrypted copy | Useless without the passkey or passphrase, and the partner is needed |
| Fake identity document | Passes KYC | Only gives an approval; a CLIENT share is missing |
| Dishonest Swissquote employee | Swissquote key | 1 key of 3; no share of the backup key |
| Swissquote employee + stolen paper | Swissquote key + CLIENT share | The PARTNER share is missing (this is why Swissquote has no share) |
| Swissquote + partner (collusion or court order) | Swissquote key + PARTNER share | The CLIENT share is missing |
| Partner goes bankrupt | PARTNER share lost | Daily use unchanged; second partner in production; re-split of the backup key |
| Swissquote disappears | No more cosigner | Phone + backup key, exit kit |
| Phone thief cancelling a legitimate recovery | Temporary block | Recovery restarted under manual review (stronger identity); documented. On the partner side, cancellation is not authenticated in the mock (only a delay, never a loss) |
| Lost phone's passkey after recovery | Attempt to approve or cancel | Revoked at the end of the recovery: "Unknown passkey" |
| **Synced** passkey (iCloud, Google) also on the stolen phone | The new device reuses that passkey (the browser refuses to create a second one), so it stays valid | It only approves Swissquote's part: without the new phone's key, no payment; at worst cancel or freeze (delay). In production: require a device-bound passkey for recovery |
| Repeated recoveries (denial of service) | Looping notifications | One active recovery at a time |
| Client loses phone, C1 and C2 | — | Funds lost: the price for nobody else being able to take them. Yearly reminders to check C1 |
| Compromised signing interface | Malicious transaction shown to the client | Plain-language summary; the cosigner checks recipient and amount independently of the app |
| Chain analysis | The multisig is visible when spending | No personal data on-chain; Taproot/MuSig2 in production to hide the script |

---

## 5. Difficulties and answers

### 5.1 No on-chain rules in Bitcoin
- **Difficulty:** Bitcoin cannot enforce a programmable limit or delay the way a smart contract does.
- **Answer:** the rules are enforced by the Swissquote cosigner. The bank is trusted for **delays**, never for **funds**: it can refuse, not sign alone. Say it clearly.

### 5.2 The passkey, the Secure Enclave and the Bitcoin key
- **A passkey already is the secure chip.** With WebAuthn, the browser has the key generated in the device's chip: Secure Enclave (iPhone, Mac), TEE or StrongBox (Android), TPM through Windows Hello (PC). The private key never leaves it. Direct Secure Enclave access would need a native iOS app: impossible from a web app and useless in 24 h.
- **Difficulty:** the chip only handles P-256, while Bitcoin uses secp256k1. So the phone's Bitcoin key cannot live in the chip (the same problem as Bitkey).
- **Hackathon answer:** the passkey **authenticates** the client to the Swissquote cosigner, with a challenge bound to each transaction; the phone's Bitcoin key is encrypted with a non-extractable WebCrypto key stored in the browser.
- **In production:** a native app; the Bitcoin key is encrypted with a Secure Enclave P-256 key (or derived from the passkey through the PRF extension).
- **Limits to state:** iCloud Keychain passkeys are synced (end-to-end encrypted), so not strictly bound to a device; the PRF extension is not available everywhere, it stays optional.
- **Demo:** on a computer (Windows Hello or Touch ID, in phone layout), which works on `localhost` with no setup. A real phone needs HTTPS and a domain matching the passkey: too risky on the day. Safety net: Chrome's virtual authenticator (F12 → WebAuthn menu).

### 5.3 Where is the backup key rebuilt?
- **Difficulty:** it is the brief's trick question about split backups.
- **Answer:** only on the client's device; the partner's share is encrypted for an ephemeral key of that device; immediate sweep to a new set of keys, once the new wallet is backed up.

### 5.4 Revoking a lost key
- **Difficulty:** a key or a share cannot be revoked.
- **Answer:** like Bitkey, the recovery moves the funds to a **new** descriptor; the old key no longer controls anything.

### 5.5 A 7-day delay cannot be demonstrated
- **Answer:** a delay set by an environment variable (30 s for recovery and 20 s for a large payment in the demo), with the production value shown.

### 5.6 SLIP-39 library in JavaScript
- **Difficulty:** JS libraries are less proven than Trezor's Python reference.
- **Answer:** an entry gate at the spike: official vectors + interop with the Python reference. Otherwise, the Python reference in the services.

### 5.7 Time and infrastructure
- **Answer:** the demo runs on signet through a public API, with no Docker; regtest (Docker) to develop fast and run the scenario scripts; a real signet transaction within the first 3 hours; a backup video.

### 5.8 The legal argument stays an assumption
- **Answer:** present "Swissquote cannot move the funds, alone or with the partner" as a design assumption to be validated by a Swiss lawyer.

### 5.9 UX for a retail client
- **Answer:** no seed to type daily; a single mnemonic (C1) to store, with an automatic encrypted copy (C2); simple words; yearly reminders; a gauge of the instant payments left today.

---

## 6. Differentiation

1. **A demo of refused attacks**, including the phone + email attacker (explicit bonus credit in the brief).
2. **"Swissquote is gone" shown live**: the service is stopped and the client still leaves.
3. **Custody invariants tested automatically** (I1 to I7): the threat model is executable.
4. **Banking continuity** during the recovery delay (mocked): only a bank can offer it.
5. **Split backup used where it is safe**: we answer the brief's two trick questions instead of suffering them.

---

## 7. Scope

**Built (real)**
- 2-of-3 descriptor, PSBTs, signatures, broadcast on signet.
- SLIP-39 backup with groups, share encryption, rebuilding on the device.
- Mobile web app: creation, sending, recovery, exit kit, trusted person. (A dedicated demo panel was planned but not built: the attacks are shown through the scripts.)
- Passkeys (registration and authentication).
- Cosigner rules (instant amount, delay, sanctions) and recovery delays.

**Mocked and labelled**
- Swissquote service (KYC, cosigner, wallet registry, notifications): separate process, own storage, key in a local file.
- Partner service (PARTNER share, identity check): separate process, own storage.
- Sanctions list (sample), banking continuity, cloud storage of C2.

**Bonus (if the core is stable)**
- Fees sponsored by Swissquote (the Bitcoin equivalent of "gasless") — not built.
- Compliant interaction: plain-language summary, sanctions, stronger checks above a threshold — built.
- BIP-322 ownership proof — not built.

---

## 8. From prototype to production

| Topic | Demonstrated at the hackathon | Mocked or simplified | Required in production |
|---|---|---|---|
| Multisig | 2-of-3 P2WSH on signet | A single chain | Taproot (MuSig2 or script), audit, fee policy |
| Swissquote key | Mocked service | Key in a local file | HSM or enclave, dual control, logging |
| Cosigning rules | Tiers, delay, sanctions | Partial sanctions list | Compliance provider, chain analysis |
| Partner | Mocked service | Simulated identity check | Contract, two independent partners, SLA, reversibility |
| Identity check | Simulated screen | No real KYC | Stronger KYC, deepfake detection, support training |
| Delays | 30 s (recovery), 20 s (large payment) | Shortened | 7 days for recovery, multi-channel notifications |
| Passkey | Platform WebAuthn (Secure Enclave, TPM through Windows Hello), challenge bound to each transaction | Demo on a computer; synced passkeys accepted | Native app; a different policy for synced passkeys |
| Phone key | Browser, encrypted with a non-extractable WebCrypto key | Web app | Native app, key encrypted by the Secure Enclave or derived through PRF |
| C2 (cloud) | Simulated file | No real cloud | iCloud / Google Drive, encryption with the passkey (PRF) |
| Legal | Non-custody assumption | No validation | Opinion from a Swiss lawyer (FINMA, AMLA, Travel Rule) |
| Banking continuity | Simulated screen | No link to an account | Account and card integration |

Full table: `swissquote-wallet/docs/06-prototype-to-production.md`.

---

## 9. Business, legal and Travel Rule

**Value for Swissquote (assumptions, to be labelled as such)**
- **Retention**: a client who wants self-custody stays in the ecosystem instead of withdrawing to an external wallet.
- **Revenue**: a "collaborative custody" subscription (market reference: Casa and Unchained charge for this service), cosigning fees above a quota, buying and selling from the account to the wallet in one gesture.
- **Costs**: less support for lost funds; KYC already done.
- **Acquisition**: self-custody with a bank safety net, an argument for careful BTC holders.

**Legal (assumption, to be validated by a lawyer)**
- Swissquote holds 1 key of 3 and no share of the backup key: it can move the funds neither alone nor with the partner. The design avoids the grey zone the brief mentions.
- The partner holds a share that, alone or with the Swissquote key, allows nothing.
- To validate: the cosigner's legal status (plain "software" or an AMLA-regulated provider), liability in case of a fraudulent recovery, the contract with the partner.

**Travel Rule**
- **Swissquote wallet ↔ Swissquote account**: Swissquote co-created the descriptor and holds one of the keys: ownership is verified automatically, with no step for the client.
- **Proof towards a third party**: a BIP-322 message signature by the client.
- **Payment from the client to a third party**: Swissquote cosigns but neither initiates nor holds the funds. Is it the ordering institution? A question for the lawyer; our reading: no, but the cosigner can pass on the Travel Rule information if the answer is yes.

---

## 10. Decisions and initial spike

The full log is in `swissquote-wallet/docs/03-decisions.md`. Summary: D3 2-of-3 multisig, D4 passkey for authentication, D5 signet (demo, no Docker) + regtest (development), D6 SLIP-39 backup key with groups, D7 delays, D8 cosigner rules, D10 recovery safeguards, D17 MPC rejected, D18 smart account as an option, D19 Swissquote without a share of the backup key, D20 web app, D21 tracking in `docs/09-build-plan.md`, D22 trusted person, D23 "Instant payments", D24 network setting, D25 animations, D26 English everywhere.

**Spike H0–H3**
1. 2-of-3 descriptor + PSBT signed by the phone key and the Swissquote service, broadcast on regtest then signet.
2. SLIP-39: official vectors + Python interop + I2 test.
3. Passkey against the Swissquote service; test of the PRF extension.

---

## 11. Open points

- **Real partner**: who (trust company, notary, another bank)? Cost, contract, two partners?
- **Delay length**: fixed (7 days) or depending on the amount?
- **Cancellation by a phone thief**: which manual review process?
- **Loss of every factor**: should there be a last-resort path (very long Miniscript timelock, the Liana model), at the cost of a grey zone?
- **Taproot / MuSig2** for privacy and fees.
- **EVM assets** (USDC): reuse the same three keys as owners of a 2-of-3 Safe?
- **Legal status** of the cosigner and Travel Rule for payments to third parties.
- **Revenue model**: subscription, fees, or included in a premium tier?

---

## 12. Split between the 3 of us and priorities

Roles: **A** = Bitcoin core and recovery (`packages/core`); **B** = web app and passkeys (`apps/web`); **C** = mocked services, docs, architecture diagram, pitch.

The hour-by-hour plan and the checkable tasks are in `swissquote-wallet/docs/09-build-plan.md`.

| Priority | Feature | Owner |
|---|---|---|
| P0 | Spike: real 2-of-3 signet tx, SLIP-39 validated, passkey | A + B + C |
| P0 | Creation → sending end to end | A + B |
| P1 | Recovery (lost phone) and exit without Swissquote | A + C |
| P1 | Cosigner rules (tiers, delay) | C |
| P1 | Demo of the 3 attacks | B |
| P2 | Architecture diagram, threats, legal, Travel Rule, business | C |
| P3 | Bonus: sponsored fees, plain summary, sanctions, BIP-322 | A + B |

Rules: P0 and P1 done before any P3; checkpoints at H10, H20, H26; code freeze at H30.

---

## 13. Mapping to the scoring

| Criterion | Points | What covers it |
|---|---|---|
| Technical implementation | 35 | Full story on signet, clean code, invariant tests, regtest e2e scenarios |
| Security and custody | 20 | Argued 2-of-3 model, threats, refused attacks, Swissquote + partner collusion impossible |
| Legal | 15 | Argued non-custody, automatic Travel Rule, points to validate |
| Business | 15 | Retention, subscription, costs, banking continuity |
| UX and pitch | 15 | No seed day to day, guided flows, plain summaries, demo in scenarios |
| Bonus | 20 | Plain summary + sanctions + stronger checks; sponsored fees designed, not built |

---

## 14. Likely jury questions

- Can Swissquote move the funds, alone or with the partner? → No (section 4, I1–I2).
- Where is the seed reassembled? → Never to sign; the backup key only on the client's device, then dropped (3.3, 5.3).
- And if Swissquote disappears? → Phone + backup key, demonstrated live (3.4).
- What can a thief with the phone and the email do? → Spend up to the instant amount at most; the recovery is refused (section 4).
- Why not MPC? Why not a smart account? → Section 2.4.
- How is the Travel Rule handled? → Section 9.
- Are the rules really enforced if they live on the server? → The bank can refuse, never sign alone (5.1).
- What is real and what is mocked? → Sections 7 and 8.
- How does Swissquote make money? → Section 9.

---

## 15. Prior art: related projects and lessons

| Project | Approach | What we take from it |
|---|---|---|
| **Bitkey** (Block) | 2-of-3 multisig: app key, hardware key, server key (enclave). Limit without the hardware. 7-day "Delay + Notify" recovery, then a move to a new set of keys. Exit kit if Block disappears | Our reference model: delay + notification, sweep, exit kit |
| **Casa, Unchained, Nunchuk** | Collaborative multisig custody: the client holds 2 keys, the provider 1 | Business model (subscription) and the non-custody argument |
| **Ledger Recover** (2023) | Seed split into 3 shares (Ledger, Coincover, EscrowTech), recovery through an identity check | Counter-example: possible collusion between providers, a seed that leaves the device |
| **Liana** (Wizardsardine) | Miniscript with a recovery path after a timelock | A lead for the "last resort" (open point) |
| Argent | Guardians, delay, 2020 flaw (zero guardians, denial of service) | One recovery at a time |
| Guardian Vault | Emergency loan during the delay | Basis of banking continuity |

Details: `swissquote-wallet/docs/04-prior-art.md`.

---

## 16. Technical references

- **Libraries**: `bitcoinjs-lib` (PSBT, p2wsh/p2ms), `bip32`, `ecpair`, `@bitcoinerlab/secp256k1`; SLIP-39: `shamir-mnemonic-ts`, validated against the official vectors; Python reference `shamir-mnemonic` (Trezor); `@simplewebauthn/browser` and `/server`; WebCrypto (ECDH P-256 + AES-GCM); `motion` for the animations.
- **Signet**: API `https://blockstream.info/signet/api` (mempool.space exposes the same API, unreachable from some networks) (`GET /address/:a/utxo`, `POST /tx` as `text/plain`, `GET /tx/:id/status`, `GET /fee-estimates`); faucet `https://bitcoinsignetfaucet.com` (1,000 to 10,000 sats, 5 requests per 24 h).
- **Regtest** (optional): Nigiri (Docker: bitcoind + esplora), the same API.
- **SLIP-39**: spec `https://github.com/satoshilabs/slips/blob/master/slip-0039.md`; two-level groups; a threshold-1 group must have a single share.
- Details in `swissquote-wallet/docs/08-technical-references.md`.

---

## 17. Connectors, tools and working rules

- **Exa**: research on libraries and documentation. **Figma**: architecture diagram (FigJam). **Claude in Chrome**: walking through the web app and backup GIFs. **blockstream.info**: checking transactions. Etherscan is no longer useful for the core of the project.
- **Project skills** in `swissquote-wallet/.claude/skills/`: `custody-invariants`, `btc-multisig`, `slip39-backup`, `mock-service`, `demo-run`, `doc-sync`.
- Rules: no homemade cryptography; labelled mocks; create → sign → recover before any bonus; every chain behaviour checked by a test; legal points are assumptions; never claim the prototype is ready for production; everything in the repository in English.

---

## 18. Sources

- Brief of the Swissquote Wallet Prize (BSA hackathon, DoraHacks), full version of 10 October 2026.
- Bitkey: https://bitkey.world/learning-hub/how-bitkey-works and https://support.bitkey.world (Delay + Notify).
- SLIP-39: https://github.com/satoshilabs/slips/blob/master/slip-0039.md
- Zodiac, smart custody vs MPC comparison: https://www.zodiac.eco/vs/mpc (commercial page).
- FINMA, PwC and SW Legal summaries on the custody status (research of 10 October 2026, assumptions).
