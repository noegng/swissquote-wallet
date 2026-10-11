> **Superseded on 10 October 2026.** The current design (2-of-3 Bitcoin multisig + SLIP-39 backup key) is in `../../swissquote-wallet-design.md`, and the decisions in `03-decisions.md`. This file describes the former approach (ERC-4337 smart account), kept for reference, and is no longer maintained.

# Swissquote Self-Custody Wallet — Project framing

> BSA hackathon — Swissquote Wallet Prize. Team of 3, 33 hours.
> Design document: problem, solution, difficulties and answers, open points, task split.

---

## 1. The brief in short

Swissquote wants a self-custody wallet the bank could really launch for its clients: **their keys, their control**, while staying **one step away from their Swissquote account**, with the security, simplicity and compliance expected from a Swiss bank.

**The prototype must demonstrate the full life cycle:** wallet creation → authentication → transaction signing → loss of access → recovery.

**Required minimum:** sign and send a real transaction to a blockchain (testnet accepted).

**Design requirements:**
- A clear, defended custody model.
- A credible threat model.
- An architecture that says where the keys or key shares live.
- A recovery that protects the legitimate user without giving an attacker an easy path and without giving Swissquote unintended control over the funds.
- No homemade cryptography: established libraries and SDKs.
- What cannot be built (banking infrastructure, compliance providers, key-share servers) can be mocked if it is documented.

**Scoring:**

| Criterion | Points |
|---|---|
| Technical implementation | 35 |
| Security and custody design | 20 |
| Legal feasibility | 15 |
| Business case | 15 |
| UX and pitch | 15 |
| Bonus (gasless, compliant dApp interaction) | up to 20 |

The bonuses only count if the basic creation → signing → recovery flow works end to end.

---

## 2. The problem

### 2.1 Today

A client who wants self-custody has to withdraw their assets to an external wallet and leaves the Swissquote ecosystem. The recovery options available today are bad:

- **Seed phrase**: lost, everything is lost; badly kept, it is stolen.
- **Recovery by email or SMS**: an attacker who controls the phone or the email can recover everything.
- **Full seed kept by the bank**: the bank then holds the key, so it is no longer self-custody.

### 2.2 Problem statement

> How can a client keep control of their keys and stay one step away from their bank, without an attacker or Swissquote being able to move the funds alone?

### 2.3 The two adversaries

1. **The outside attacker**: stolen phone, hacked email, fake identity documents, social engineering.
2. **The bank itself** (or one of its employees, or an attacker who compromises it): it must not be able to act alone, for security reasons and for its legal status (custodian or not).

### 2.4 Why a seed phrase in a vault is not chosen

- Against the brief: unintended control of the bank over the funds.
- Risk of being treated as crypto-asset custody (to be validated by a lawyer).
- Single point of failure: a leak or a dishonest employee exposes every client.
- An identity check alone can be attacked (fake documents, deepfakes, social engineering of the support).
- A seed cannot be revoked or limited in amount.

To be presented in the threat model as the **rejected option**, with these reasons.

---

## 3. The proposed solution

### 3.1 Principle

**A wallet where the rules live in the contract.** Security does not rely only on protecting the key, but on what the account agrees to execute. A stolen phone or a compromised app cannot go beyond the limits written in the smart account.

Inspiration: Zodiac's "smart custody" approach (policies enforced on-chain, not by a server). This source is a commercial page comparing itself to competitors; we take the principle, not its claims of superiority.

### 3.2 General architecture

- **Account**: ERC-4337 smart account on testnet.
- **Signing**: passkey (WebAuthn) bound to the device, never exported.
- **On-chain rules**: daily limit, list of approved recipients or dApps, delay (timelock) on large amounts, harden/relax asymmetry.
- **Recovery**: 2 guardians out of 3 plus a security delay plus a veto through an independent channel.
- **Gasless** (bonus): a paymaster that sponsors some operations (sending USDC).
- **"Swissquote" server**: mocked, plays the role of a guardian and of the veto channel.

### 3.3 Where the keys live

| Item | Location | Who can use it |
|---|---|---|
| Main passkey | Client's device (secure enclave) | The client |
| Backup passkey | Client's second device | The client |
| Guardian 1 | Swissquote (after a strong identity check, outside phone and email) | Swissquote, never alone |
| Guardian 2 | Second device / second passkey of the client | The client |
| Guardian 3 (optional) | Trusted contact | The contact, never alone |

Swissquote **never** has the full key and can neither move the funds nor impose a key on its own.

### 3.4 Life cycle

**Creation**
1. The client authenticates in the Swissquote app.
2. Passkey created on the device and smart account deployed.
3. Default guardians and default rules set up (limits, delay).

**Authentication and signing**
1. The client starts a transaction.
2. The on-chain rules check recipient, amount, limit.
3. Within the limit and to an allowed address: executed at once. Above: through the delay with a notification.

**Loss of access and recovery**
1. The client reports the loss and proposes a new passkey.
2. Approval by 2 guardians out of 3. Swissquote only gives its approval after a strong identity check.
3. Security delay before the new key takes effect.
4. During the delay, a veto is possible through an independent channel (Swissquote client area or another guardian).
5. Amounts stay capped during and just after the recovery.

### 3.5 The three demo scenarios

1. **Normal use**: create the wallet, sign, send a real transaction on testnet.
2. **Blocked attack**: a thief with the phone tries a large withdrawal or a rule change → refused by the rules and the delay.
3. **Lost phone**: full recovery with guardians, delay and veto.

---

## 4. Threat model

| Threat | What the attacker gets | What stops them |
|---|---|---|
| Stolen phone | Access to the passkey (depending on the lock) | Limits, allow list, delay on large amounts |
| Hacked email | Notifications and recovery links | Veto through an independent channel, 2 guardians out of 3 |
| Stolen phone and email | Device and notifications | Swissquote veto through an independent login, delay |
| Fake identity document | The Swissquote guardian's approval | A second guardian is needed, plus the delay |
| Malicious guardian (including the bank) | One share out of three | 2-of-3 threshold, limits, delay |
| Bank and another guardian compromised | Threshold reached | Limits, security delay, the client's veto |
| Passkey's cloud account compromised | A copy of the key if the passkey is synced | Device-bound passkey, backup passkey |
| Rule change by an attacker | Limit raised, address added | Relaxing = the same delay and veto as large transfers |
| Paymaster abuse | Gas budget drained | Sponsoring limited to some operations and per account |

---

## 5. Difficulties and answers

### 5.1 Verifying a passkey on-chain
- **Difficulty:** passkeys sign with P-256, not natively supported by the EVM. Reimplementing everything would be long and risky.
- **Answer:** a smart account SDK that already handles passkeys, on a test chain supporting P-256 verification (to check in the docs). No homemade cryptography.

### 5.2 An attacker changes the rules themselves
- **Difficulty:** with the phone, they raise the limit or add their own address.
- **Answer:** asymmetry. Hardening is immediate; relaxing goes through the same delay and veto as large transfers.

### 5.3 A 24 h delay cannot be demonstrated
- **Difficulty:** the jury will not wait a day.
- **Answer:** a configurable delay (e.g. 2 minutes in the demo). Say explicitly that the real value would be 24 h or more and show the parameter in the contract.

### 5.4 The independent veto channel
- **Difficulty:** it is what makes the recovery credible, and it is easy to mock naively (a simple box to click).
- **Answer:** a fake "Swissquote" server with its own authentication, separate from the device, which signs a veto checked by the contract. Document clearly that it is mocked.

### 5.5 Swissquote as a collusion point
- **Difficulty:** a compromised or manipulated bank must not be enough.
- **Answer:** a 2-of-3 threshold, so never alone. Document the "bank plus another compromised guardian" case and what limits it (limits, delay).

### 5.6 A passkey synced in the cloud
- **Difficulty:** stealing the client's cloud account gives the key.
- **Answer:** offer a device-bound passkey and a second backup passkey. Document the comfort / security trade-off.

### 5.7 Gasless can drain the budget
- **Difficulty:** a paymaster that pays for everything can be exploited.
- **Answer:** only sponsor some operations (sending USDC) with a per-account limit. Bonus: only if the core works before hour 20.

### 5.8 Time and fragile infrastructure
- **Difficulty:** bundler, paymaster or testnet down, limited faucet, recovery = the longest part.
- **Answer:** a single stack chosen from the start, an end-to-end transaction within the first 3 hours, pre-funded accounts, a backup video of the demo.

### 5.9 The legal argument stays an assumption
- **Difficulty:** claiming "Swissquote is not a custodian" without knowing it can hurt credibility (15 pts).
- **Answer:** present it as a design assumption (the bank cannot move the funds alone). List what a lawyer should validate: the definition of custody, wallet ownership verification. Do not claim compliance that is not guaranteed.

### 5.10 Standing out and putting figures on the business
- **Difficulty:** many teams will do "smart account plus passkey", and fake figures are easy to spot.
- **Answer:** the difference is the three-scenario demo and the threat model. A business case with labelled assumptions (e.g. "if X % of clients adopt…"), no fake figures.

### 5.11 Recovery UX for a retail client
- **Difficulty:** asking the client to choose guardians is bad UX.
- **Answer:** simple defaults (Swissquote, second device, optional contact), a guided flow in a few screens, non-technical words.

---

## 6. Scope

**To build**
- Smart account and passkey creation.
- Signing and sending a real transaction on testnet.
- On-chain rules (limit, allow list, delay).
- Recovery by guardians with a delay and a veto.
- Demo interface for the three scenarios.

**To mock and document**
- KYC and identity checks.
- Banking infrastructure and link with the Swissquote account.
- Swissquote guardian server and veto channel.
- Compliance provider (sanctions).

**Bonus (if the core is stable)**
- Gasless USDC sending.
- List of approved dApps, transaction simulation, stronger checks for large amounts.

---

## 7. Business and legal

**Value for Swissquote (assumptions, labelled as such)**
- Retention: clients no longer leave the ecosystem for an external wallet.
- Revenue: fees on swaps and transfers, possibly a premium tier.
- Lower costs: less support for lost funds.
- New clients attracted by supervised self-custody.

**Legal (to be validated by a lawyer)**
- Assumption: Swissquote is one guardian among others and can never move the funds alone, so it does not hold custody of the assets.
- To validate: the definition of custody in Swiss law, wallet ownership verification, anti-money-laundering obligations.

---

## 8. Open points (ways forward)

Undecided points, deliberately left open so that the design can evolve.

**Cryptography and custody**
- **Passkey only, or hybrid MPC / key share?** Should the bank eventually hold a key share, with which threshold?
- **Guardians: number and nature.** Move from 2-of-3 to a configurable threshold? Allow a third-party institutional guardian (notary, another bank)?
- **Rotating and revoking guardians**: how to replace a guardian without opening a gap?
- **Multi-chain**: extend beyond one EVM chain?

**Recovery**
- **Delay length**: fixed, or depending on the amount and the risk level?
- **Veto channel**: beyond the client area, add an out-of-band confirmation (call, letter, branch)?
- **Anomaly detection**: automatic freeze on unusual behaviour (time, recipient, amount)?
- **What happens if the client loses every factor?** Is there a last-resort path that does not give control to the bank?

**Rules and compliance**
- **List of approved dApps and addresses**: who keeps it, how is it updated, is it on-chain?
- **Sanctions and simulation**: where does the check run, and can it be bypassed?
- **Risk levels per client**: different limits (retail, premium, professional).

**Product and business**
- **Revenue model**: per-transaction fees, subscription, or a margin on swaps?
- **Gasless**: who funds gas at scale, and under which limits?
- **Portability**: can the client leave Swissquote with their wallet without losing their rules or their recovery?

**Legal and governance**
- Exact status depending on the jurisdiction (Switzerland, EU) and on how regulation evolves.
- Liability after a successful fraudulent recovery: who bears the loss?
- External audit of the contracts before any production launch.

---

## 9. Theoretical task split for 3

Proposed roles (to adjust to the real skills):

- **Person A — Contracts and on-chain security**: smart account, rules, recovery.
- **Person B — Front end, passkey and integration**: demo app, passkeys, gasless, transactions.
- **Person C — Threats, legal, business, mocks and pitch**: documents, mocked server, demo and presentation.

### 9.1 Implementation priorities

| Priority | Feature | Owner | Note |
|---|---|---|---|
| P0 | Stack choice and end-to-end transaction (smart account, bundler, testnet) | A + B | Within the first 3 hours |
| P0 | Wallet creation with a passkey and a real signed transaction | A + B | Minimum required by the brief |
| P1 | Recovery by 2-of-3 guardians with a delay | A | Core of the differentiation |
| P1 | Mocked "Swissquote" server and veto channel | C (with A) | Makes the recovery credible |
| P1 | Interface for the three demo scenarios | B | Demo = 15 pts UX and pitch |
| P2 | Daily limit and list of allowed recipients | A | "Blocked attack" scenario |
| P2 | Harden / relax asymmetry and configurable delay | A | Answer to difficulties 5.2 and 5.3 |
| P2 | Threat model and legal section written | C | 35 pts combined (security plus legal) |
| P3 | Gasless USDC (limited paymaster) | B | Bonus, only if P0 and P1 are stable before hour 20 |
| P3 | Approved dApps, simulation, stronger checks | A + B | Bonus |
| P3 | Business case with labelled assumptions | C | Can be written in parallel |

### 9.2 Indicative 33-hour plan

| Slot | A — Contracts | B — Front end / integration | C — Docs / mocks / pitch |
|---|---|---|---|
| H0–H3 | Stack choice, test deployment | Passkey, first transaction | Plan, threat model v1 |
| H3–H10 | Rules (limit, list, delay) | Creation and signing flow | Mocked Swissquote server |
| H10–H18 | Guardian recovery and veto | Recovery UI | Legal section, business |
| H18–H22 | Tests of the 3 scenarios, fixes | Full integration | Demo script, slides |
| H22–H26 | Bonus (dApp list) if stable | Gasless if stable | Pitch, jury questions |
| H26–H30 | Code freeze, fixes | UX polish | Demo rehearsal |
| H30–H33 | Backup video, final upload | Backup video | Submission and final pitch |

Sleep slots to be added in turns: about 20 hours of real work out of 33.

### 9.3 Steering rules

- Every P0 and P1 priority is finished before starting a P3.
- A checkpoint at hours 10, 20 and 26: if a P1 is late, the P3s are cut.
- Code freeze at hour 30.

---

## 10. Mapping to the scoring

| Criterion | Points | What covers it |
|---|---|---|
| Technical implementation | 35 | Creation, real signing, end-to-end recovery |
| Security and custody | 20 | Threat model, on-chain rules, 2-of-3 threshold, veto |
| Legal feasibility | 15 | Swissquote never alone, assumptions and points to validate |
| Business case | 15 | Retention, fees, less support, labelled assumptions |
| UX and pitch | 15 | Three-scenario demo, simple flow, backup video |
| Bonus | 20 | Gasless USDC, approved dApps, simulation (after the core) |

---

## 11. Likely jury questions

- Why not a seed phrase in a vault? → Section 2.4.
- What can a thief do with the phone? → Scenario 2, section 4.
- Can Swissquote move the funds? → No, 2-of-3 threshold, never alone.
- What happens if the bank is compromised? → Section 5.5.
- What is real and what is mocked? → Section 6.
- Why is it legally defensible? → Section 7, presented as an assumption to validate.

---

## Sources of inspiration

- Zodiac, "smart custody" approach (policies enforced on-chain): https://www.zodiac.eco/ and https://www.zodiac.eco/vs/mpc
- Brief of the Swissquote Wallet Prize (BSA hackathon, DoraHacks).
