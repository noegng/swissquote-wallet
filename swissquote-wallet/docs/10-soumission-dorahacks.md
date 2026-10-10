# DoraHacks submission — draft (not published)

> Draft of the project description for the Swissquote Wallet Prize. To paste into the DoraHacks BUIDL page once the team agrees. Before publishing: add the demo video link, give the judges access to the GitHub repository (currently private), fill in the team section, and re-run the proofs on signet.

---

# Swissquote Wallet — collaborative self-custody for Bitcoin

**Your bitcoins, your keys, one step away from your Swissquote account. Swissquote protects you but can never act without you — and if Swissquote disappears, you leave with your funds.**

A Bitcoin-native 2-of-3 multisig wallet: the client holds two keys (phone key + backup key), Swissquote holds one (a rules-enforcing cosigner). The backup key is split with SLIP-39 so that neither Swissquote, nor Swissquote together with a partner, can ever rebuild it.

Working prototype: web app + mocked Swissquote and partner services (separate processes, own storage) + real transactions on Bitcoin (regtest for development, **signet** for public proofs).

---

## 1. Custody model decision

### The choice

**Bitcoin-native 2-of-3 multisig (`wsh(sortedmulti(2, phone, swissquote, backup))`), with the backup key backed up in SLIP-39 groups.**

| Key | Where it lives | Role |
|---|---|---|
| Phone key | On the client's device, encrypted at rest by a non-extractable key, unlocked through the passkey | Daily payments |
| Swissquote key | Swissquote cosigner (mocked; HSM in production), one BIP-48 account per client | Cosigns within rules: daily limit (amount **+ fees**), delay above the limit, sanctions, freeze |
| Backup key | Exists nowhere in one piece. SLIP-39: group CLIENT (paper words C1, same words encrypted in the client's cloud C2) **and** group PARTNER (independent third party) | Recovery after phone loss; exit if Swissquote disappears |

**Swissquote holds no share of the backup key.** Rebuilding it requires the client's share and the partner's share.

### Why this model (and not the others)

| Option | Why we did not pick it |
|---|---|
| Custodial account | Swissquote holds the keys: not self-custody, and it already exists |
| Seed phrase only | A typical bank client will not keep 24 words safe; no limits, no delay |
| Split backup only (client / Swissquote / partner, any 2 of 3) | Swissquote + partner can restore without the client (the grey zone of the brief); the seed is reassembled and then gives full, instant access with no delay or limit; a share cannot be revoked. Ledger Recover (2023) was criticised for exactly this |
| MPC / threshold signatures | Defensible and multi-chain, but risky to integrate in the time available, and many MPC wallets reconstruct the full key when the provider fails |
| Smart-contract account (ERC-4337) | Elegant on-chain rules, but EVM-only: no native Bitcoin, which is what Swissquote's crypto clients mostly hold |

We use the split backup **where it is safe**: only for the rarely used backup key, with SLIP-39 groups so that the client's share is mandatory.

### Pros and cons

**Pros:** native Bitcoin; no key is ever reassembled to sign daily; Swissquote can refuse or delay, never sign alone; the client can always leave with two keys he controls; standard descriptors, importable in Sparrow or Bitcoin Core; battle-tested model (Bitkey, Casa, Unchained); no homemade cryptography.

**Cons (assumed):** spending rules are enforced by the Swissquote cosigner, not on-chain (Bitcoin has no programmable limits) — Swissquote is trusted for delays, never for funds; the client must keep his paper share; replacing a lost key means moving funds to a new wallet; multisig is visible on-chain when spending (Taproot/MuSig2 in production).

### Short threat model

**Can Swissquote, alone or with a partner, move the funds without the client?** No. Swissquote holds 1 key of 3. Swissquote + partner = Swissquote key + partner share, which does not rebuild the backup key (the CLIENT group is missing).

**Who could lock the client out?** Nobody durably: phone key + backup key spend without Swissquote. Swissquote can refuse to cosign; that only forces the slower path.

**Who could steal funds?**

| Attacker | What they get | What stops them |
|---|---|---|
| Phone thief (unlocked phone or malware) | Phone key | Swissquote cosigns only under the daily limit, **fees included**; above it, delay + alert; the client cancels or freezes **from his Swissquote web account, without the phone** |
| Thief who pays huge fees to destroy the funds | Phone key | Fees count toward the limit: 1 000 sats + 900 000 sats of fees goes to the delayed tier |
| Phone + email | Phone key, account access | Can open a recovery, but: the wallet freezes, the real client is alerted and can cancel; without the client's paper share the backup key cannot be rebuilt; a sweep signed with the stolen phone key is refused (Swissquote requires the backup key's signature). **Demonstrated** (`npm run demo:recover`) |
| Stolen paper share | Client share | Still needs the partner (own delay and identity check) and Swissquote; the client is alerted |
| Malicious Swissquote employee | Swissquote key | 1 of 3; Swissquote has no backup share — employee + stolen paper is still not enough |
| Swissquote + partner (collusion or court order) | Swissquote key + partner share | The CLIENT share is missing |
| Compromised app showing one payment and sending another | — | The passkey challenge is bound to the hash of the exact PSBT: approval for A cannot be used for B. **Demonstrated** |
| Replay of a passkey approval | — | One-time challenges. **Demonstrated** |
| Swissquote disappears | No cosigner | Phone + backup key, exit screen without any Swissquote call. **Demonstrated with the service really stopped** |

Residual risks are documented, e.g. a synced passkey (iCloud/Google) also present on the stolen phone stays valid after recovery — it can only approve Swissquote's part, never move funds alone; production would require a device-bound passkey for recovery.

---

## 2. Architecture

![Architecture](https://github.com/noegng/swissquote-wallet/blob/btc-multisig-pivot/swissquote-wallet/docs/architecture.svg)

Editable diagram: [FigJam](https://www.figma.com/board/K9aqAWBiat2GuFXFnHhvN5). Green = real, yellow = mocked.

| Component | Status |
|---|---|
| 2-of-3 multisig, PSBT build/sign/combine/finalize, broadcast | **Real** (bitcoinjs-lib, bip32), regtest + signet |
| SLIP-39 backup with groups | **Real** (shamir-mnemonic-ts, passes the 45 official Trezor vectors and two-way interop with Trezor's Python reference) |
| Share sealing (ECDH P-256 + HKDF + AES-GCM; PBKDF2 for C2) | **Real** (WebCrypto) |
| Passkeys (WebAuthn, platform authenticator: Secure Enclave, TPM via Windows Hello) | **Real** (SimpleWebAuthn), validated with Windows Hello |
| Swissquote service: KYC login, passkey verification, cosigner rules, wallet registry, notifications, recovery | **MOCK** — separate process, own storage, key in a local file (HSM in production) |
| Partner service: TIERS share deposit and release | **MOCK** — separate process, own storage; the app never holds its share outside a recovery, and then only sealed for the device |
| Sanctions list, cloud storage of C2, banking continuity | **MOCK** |

Every mocked response carries `"mock": true`; the app shows a permanent "MOCK" banner.

---

## 3. Wallet creation

1. The client logs into his Swissquote account (KYC already done by the bank — mocked) and creates a **passkey**: the private key is generated in the device's secure chip and never leaves it.
2. The device generates the phone key and the backup key. Swissquote derives a dedicated key for this client (new BIP-48 account) and **registers the descriptor** — this links the wallet to the client's verified identity (see Travel Rule).
3. The backup key is split with SLIP-39: the PARTNER share is sealed for the partner's public key and deposited; the CLIENT share is shown as 20 words to copy on paper (two words are checked), then encrypted with a passphrase and saved as a file for the client's cloud (C2). The backup secret and the shares are then erased from the app.
4. The phone key is encrypted in the device vault with a non-extractable WebCrypto key.

The secp256k1 Bitcoin key cannot live in the secure chip (P-256 only — same constraint as Bitkey); in a native app it would be wrapped by a Secure Enclave key.

## 4. Authentication — small vs large payments

- Every payment is approved with the **passkey** (face, fingerprint or PIN). The WebAuthn challenge is **bound to the hash of the exact PSBT**, single-use, 3-minute lifetime: the biometric approves this payment, not a session.
- Before approving, the app rebuilds and checks its own summary (recipient, amount, fees, change back to the wallet). Swissquote re-checks it independently: foreign inputs or fake change are refused.
- **Tier 1** — cumulative 24 h amount **including fees** under the limit (50 000 sats in the demo): cosigned immediately.
- **Tier 2** — above the limit: Swissquote holds the payment, alerts the client (amount and fees), and cosigns after a delay (30–120 s in the demo, 24 h to 7 days in production) unless the client cancels.
- **Asymmetry:** protective actions (cancel a payment, cancel a recovery, freeze the wallet) are accepted with the passkey **or** the Swissquote web session — a client whose phone was stolen has no passkey anymore. Relaxing actions (unfreeze, sign) require the passkey.

## 5. Recovery

**Phone lost or stolen** (screen "Récupérer votre wallet", `npm run demo:recover`):
1. On a new device: Swissquote login, passkey for this device (or proof of an existing synced passkey).
2. Recovery opened at Swissquote (stronger identity check — mocked): the old wallet is **frozen**, pending large payments are dropped, alerts are sent, security delay starts. In parallel, the partner applies its **own** identity check and delay — it does not depend on Swissquote.
3. During the delay, the real client can **cancel** from his old phone (passkey) or from his web account (session).
4. After the delay, the partner's share arrives sealed for a non-extractable key of the new device; the client types his paper words (or opens C2). The backup key is rebuilt **on the device only**, in memory.
5. Swissquote creates the new wallet (new Swissquote key) and cosigns **one** sweep, only if it is already signed by the **backup key**, pays only the new wallet and returns nothing to the old one.
6. Old passkeys are revoked (except the new device's), new PARTNER share deposited, new paper/C2 backup.

Duration: 60–120 s in the demo; 7 days in production (as Bitkey).

**Attacker with the client's phone and email — refused** (bonus of the brief), demonstrated step by step: wallet frozen and client alerted; partner share obtained but useless without the client's paper share; sweep signed with the stolen phone key refused; real client cancels.

**Swissquote permanently gone** (button "Swissquote est indisponible ? Sortir mes fonds" on the login screen, `npm run demo:exit`): no session needed; the app lists the wallets on the phone, asks the partner for its share (own delay), the client types his paper words and a destination address, and the **phone key + backup key** sign a sweep of all funds, broadcast directly to the Bitcoin network. The exit module does not even import the Swissquote client. Tested with the Swissquote service **actually stopped**, in a script and end to end in the browser. The **exit kit** (standard descriptors) also lets the client do it in Sparrow or Bitcoin Core without our app.

---

## 6. Legal feasibility — custody and Travel Rule

*Design reasoning for a lawyer to validate, not legal advice.*

**Custody.** Following the brief's primer, custody depends on who *can* move the funds. Swissquote holds one key of three and no share of the backup key: it cannot move funds alone, nor together with the partner. The design avoids the grey zone instead of arguing it away. The partner alone holds a share that is useless without the client's. We therefore expect Swissquote to act as a technical cosigner (software and security service) rather than a custodian — to be confirmed with a Swiss lawyer (FINMA practice, AMLA/LBA obligations of the cosigning service).

**Travel Rule / wallet ownership.** Swissquote co-creates the wallet and registers its descriptor at creation, after the client's KYC: every address of this wallet is provably the client's, so transfers between the Swissquote account and the wallet need no manual ownership proof. For third parties, the client can prove ownership with a message signature (BIP-322 — designed, not implemented).

**Is Swissquote the sending institution when the client pays a third party?** Swissquote cosigns but neither initiates nor holds the funds. Our reading: it is not the ordering institution; if a lawyer concludes otherwise, the cosigner already sees the recipient and amount and can attach the Travel Rule data before cosigning.

## 7. Business case

*Hypotheses, to be validated with Swissquote data.*

- **Retention:** today a client who wants self-custody withdraws to an external wallet and leaves. This wallet keeps him one step from his account (buy on Swissquote, withdraw to his own wallet in one gesture, come back to sell).
- **Revenue:** a "collaborative custody" subscription — the model of Casa and Unchained, which charge an annual fee for exactly this 2-of-3 service — plus cosigning above a free quota and trading flows back to the account.
- **Lower costs:** no lost-seed support cases; KYC is reused, not repeated.
- **New clients:** self-custody with a bank-grade safety net and a recovery that does not depend on a 24-word phrase — and banking continuity during the recovery delay, which only a bank can offer.

## 8. Bonus topics

- **Compliant dApp interaction — partial:** plain-language summary of every payment, verified by the app and re-verified by Swissquote; sanctions screening of recipients (mocked list); extra checks above a threshold (delay, alert, cancellation). No DeFi/dApp connection (native Bitcoin).
- **Gasless — not implemented.** Designed: Swissquote adds an input from its fee wallet to the PSBT before the client signs, with a per-client quota.

## 9. Engineering and verification

- **74 automated tests** (vitest): descriptor, PSBT, custody invariants (no single key can finalize, Swissquote included; the three legitimate pairs can; a single SLIP-39 group restores nothing), the **45 official SLIP-39 vectors**, sealing, onboarding, PSBT summary.
- **Interop** of our SLIP-39 shares with Trezor's Python reference, both directions.
- **Scripted scenarios** against the real services on regtest: `demo:create`, `demo:cosign` (tiers, cancel, sanctions, foreign inputs, missing/swapped/replayed passkey, huge-fee attack, freeze and unfreeze), `demo:recover` (phone+email attack, cancel, full recovery), `demo:exit` (Swissquote stopped).
- **Validated with real Windows Hello**: passkey creation, small and large payments, cancellation, recovery on a second device.
- **Public proof on signet:** first 2-of-3 transaction (phone key + Swissquote key, signed on separate copies then combined): [`3360d434…c534c62e`](https://blockstream.info/signet/tx/3360d434de9383653c896a925988c987110496b4c28c20f684441504c534c62e) (confirmed, block 325 752).
- Bugs found in review and fixed, each with a reproducing scenario: fees escaping the daily limit; a robbed client unable to cancel without his phone; recovery blocked when the new device already holds a synced passkey.

## 10. From prototype to production

The architecture targets production; the implementation does not. Required before launch: Swissquote key in an HSM with dual control; real KYC with deepfake detection; contracts with two independent partners; real multi-channel alerts; native app with Secure Enclave-wrapped keys and device-bound passkeys; Taproot/MuSig2 for privacy; external security audit; Swiss legal opinion.

## 11. AI tools used

| Tool | What for |
|---|---|
| Claude Code (Claude Opus) | Design discussions, documentation, writing the code (reviewed by the team), tests and demo scripts, project-specific skills (custody invariants, Bitcoin multisig, SLIP-39, mock services, demo, docs) |
| Claude — Exa connector | Research: libraries (bitcoinjs-lib, SLIP-39 implementations, SimpleWebAuthn), signet APIs and faucets, prior art (Bitkey, Ledger Recover, Nigiri) |
| Claude — Figma connector | Architecture diagram (FigJam) |
| Claude in Chrome | End-to-end testing of the web app in the browser |

## 12. Run it

```bash
cd swissquote-wallet
npm install && cp .env.example .env
npm run regtest:up        # local Bitcoin (Docker)
npm run dev:all           # Swissquote + partner (mocked) + web app → http://localhost:5173
npm test                  # 74 tests
```

Step-by-step guide (French): `docs/00-demarrage.md`. Design document (French): `swissquote-wallet-projet.md`.

## Team

*(to complete)*
