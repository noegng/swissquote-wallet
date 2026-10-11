# Prior art: related projects and lessons

Research done with Exa on 10 October 2026, completed the same day after the move to Bitcoin multisig (Bitkey, Casa, Ledger Recover, Liana). The EVM projects below remain useful for the USDC option. No project covers exactly our case (a bank's wallet, recovery with KYC). Each covers part of the problem.

| Project | Approach | What we take from it |
|---|---|---|
| **Bitkey** (Block) | 2-of-3 multisig: app key, hardware key, server key in an enclave. Limit without the hardware. 7-day "Delay + Notify" recovery, then a move to a new set of keys. Exit kit if Block disappears | **Reference model since 10/10/2026**: delay + notification, sweep, exit kit |
| **Casa, Unchained, Nunchuk** | Collaborative multisig custody: the client holds 2 keys, the provider 1 | Subscription business model, non-custody argument |
| **Ledger Recover** (2023) | Seed split into 3 shares (Ledger, Coincover, EscrowTech), recovery through an identity check | Counter-example: collusion between providers, a seed that leaves the device |
| **Liana** (Wizardsardine) | Miniscript with a recovery path after a timelock | A lead for a last resort (open point) |
| ENSignv2 | Recovery can only add a key. Guardians named by ENS names. The owner can cancel within a short window. Gas sponsored by Pimlico | Bound what recovery allows |
| [AAStarCommunity/airaccount-contract](https://github.com/AAStarCommunity/airaccount-contract) | Tiered limits by amount. P-256 passkey guardians. Propose / approve / execute / cancel cycle. Timelock on module installation | The closest to our target. Tiers and timelock worth reusing |
| [openfort-xyz/openfort-7702-account](https://github.com/openfort-xyz/openfort-7702-account/) | Wallet freeze by a guardian, recovery with a timelock, session keys with limits | Emergency freeze |
| [koinlabs/Timelock-account-recovery](https://github.com/koinlabs/Timelock-account-recovery) (TAR, Chateau) | Recovery with a forfeitable bond. "Watch towers" that can veto without ever taking the account. Target: a passkey | Too heavy for 33 h. The idea of a veto that cannot take the account. A static `eth_call` can give false positives on testnet for the P-256 precompile: test with a real UserOp |
| Argent | Lock by a guardian, 5-day delay, approval by at least half of the guardians, emoji verification | 2020 flaw (OpenZeppelin audit): the zero-guardian case and denial of service |
| Guardian Vault | Timelock, server-side transaction simulation, emergency PYUSD loan during the wait | Liquidity during the delay: the basis of our "banking continuity" |
| [slaviquee/monolith](https://github.com/slaviquee/monolith) | On-chain spending limits, 48 h key rotation, 10 min unfreeze, a fork of Coinbase Smart Wallet | Harden at once, relax with a delay |
| [loveyuanfandj-glitch/treasury-smart-account](https://github.com/loveyuanfandj-glitch/treasury-smart-account) | Scoped keys, guardian freeze, delayed recovery, proofs on Base Sepolia, fuzzing | A presentation model with verifiable proofs |
| Asguard | Safe modules, OAuth signer, cooling-off period | Secondary reference |
| Para, SwissBorg | MPC (2-of-2 with a passkey; MiCA) | MPC alternative, rejected for 33 h: more cryptography to integrate, no visible contract |

## Legal reading (assumptions, not certainties)

The FINMA, PwC and SW Legal summaries point the same way: if the provider does not control the private keys, it is treated as non-custodial (no banking licence, possibly subject to the AMLA). To be confirmed by a Swiss lawyer.

## Lessons applied to the project

1. Recovery only adds or replaces a key; it never moves funds anywhere but to the client's new wallet.
2. At least one independent party besides Swissquote (the partner, or a trusted person).
3. Protection against repeated recoveries (denial of service).
4. Emergency freeze.
5. Limits by amount tier.
6. A plain-language summary and warning before signing.
7. Emergency liquidity during the delay (extension).
8. Verifiable proofs: addresses, tests, replayable scenarios.
