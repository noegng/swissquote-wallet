# From prototype to production

Swissquote wants to take the winning project to production. The architecture targets production; the 33-hour implementation does not. To be presented as such to the jury.

**Brief rule:** everything mocked is labelled in the demo and the README. A mocked share holder runs as a separate process with its own storage, and the app never holds its share.

| Topic | Demonstrated at the hackathon | Mocked or simplified | Required in production |
|---|---|---|---|
| Multisig | 2-of-3 P2WSH on signet, real transactions | A single chain | Taproot (MuSig2 or script) for privacy and fees; audit |
| Swissquote key | `services/swissquote` service, separate process | **MOCK**: key in a local file | HSM or enclave, dual control, signing policy, logging |
| Cosigning rules | Tiers, delay, sanctions list | **MOCK**: partial sanctions list | Compliance provider, chain analysis |
| Partner (PARTNER share) | `services/partner` service, separate process; release with a delay, share re-sealed for the device | **MOCK**: simulated identity check; cancellation without authentication | Contract, two independent partners, SLA, reversibility in case of bankruptcy; authenticated cancellation |
| Trusted person (notary, lawyer) | Invitation by link or QR code, handover of the share sealed for their key, destruction of the partner's copy, approval of a recovery (`npm run demo:trustee`) | **MOCK**: the partner trusts the client's identity without checking it; the invitation link authenticates the trusted person; no delay before the handover | Identity check of both parties by the partner, delay and notification before the handover, strong authentication of the trusted person, contractual framework (professional secrecy, inheritance) |
| KYC / identity | Simulated login screen | **MOCK**: no real KYC | Stronger KYC, detection of forged documents and deepfakes, support training |
| Delays | 30 s (recovery), 20 s (large payment) | Shortened for the demo (`.env`) | 7 days for recovery, 24 h to 7 days for a large payment, SMS, email and app notifications |
| Notifications | Inbox in the app | **MOCK**: no real SMS or email | Several independent channels |
| Passkey | Platform WebAuthn (Secure Enclave, TPM through Windows Hello), challenge bound to each transaction, verified by the Swissquote service | Demo on a computer; synced passkeys (iCloud) accepted | Native app; a different policy for synced passkeys |
| Phone key | Web app, key encrypted with a non-extractable WebCrypto key | Browser instead of a native app; the Bitcoin key (secp256k1) cannot live in the chip (P-256 only) | Native app, key encrypted with a Secure Enclave key or derived through PRF |
| Test-script authenticator | Software WebAuthn authenticator (`scripts/lib/soft-authenticator.ts`) | **Test only**, never in the app | — |
| C2 copy (cloud) | Encrypted file | **MOCK**: no real cloud | iCloud / Google Drive, encryption with the passkey (PRF) |
| Banking continuity | Screen and limit | **MOCK**: no link to an account | Account and card integration, limits, compliance |
| Exit without Swissquote | Dedicated screen, no session, phone + backup key, direct broadcast; demonstrated with the service stopped | Mocked partner | A real independent partner; exit kit tested with Sparrow and Bitcoin Core |
| Legal | Non-custody assumption | No validation | Opinion from a Swiss lawyer (FINMA, AMLA, Travel Rule) |
