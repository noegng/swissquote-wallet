# Brief officiel du hackathon BSA (DoraHacks)

Texte fourni par l'équipe, conservé tel quel. Le parcours retenu est **Swissquote**. Le parcours Belem Capital est conservé pour mémoire.

```text
Belem Capital Track

Prize Pool

1st Prize: $1,200 USD
2nd Prize: $600 USD
3rd Prize: $300 USD
The Belem Capital Prize 🏆

In the DeFi Risk Dependency Challenge, we want teams to build a working risk system that can automatically uncover the hidden dependencies behind an on-chain position and quantify what happens when one of those dependencies fails.

A single DeFi position may rely on multiple layers,including the settlement chain, underlying assets or yield sources, oracles, liquidity venues, lending markets, and other protocols, so the goal is to turn this complex dependency graph into a clear, defensible risk signal that a portfolio manager can actually use.

Your prototype should identify dependencies, estimate the potential economic impact of a security incident, market disruption, or technical failure, and ultimately help answer the real decision: is the expected loss from staying in the position high enough to justify exiting despite slippage and execution costs?

You are free to use graph analysis, simulations, statistical models, agent-based approaches, or any other methodology, across EVM, Solana, Canton, Tempo, or other ecosystems with the emphasis being on sound reasoning, accurate dependency discovery, defensible impact estimation, and a working implementation using real data.

The strongest submissions will go beyond simply flagging that an incident occurred. They should explain how that incident propagates through the position's dependency stack and what the resulting portfolio impact could be. As illustrated by the Pendle PT example in the challenge brief, even one portfolio position can depend on five distinct layers, from the settlement chain and underlying yield source through the oracle, AMM market, and lending venue.

What we expect

Build a working prototype, not just an architecture or slide deck. It should operate on real data and produce an output that a risk or portfolio manager could realistically act on. Projects will be judged on dependency discovery (30%), impact estimation (30%), decision usefulness: stay or exit, and why (25%), and the quality of the working demo on real data (15%).

More informations here.
Swissquote Track

Prize Pool

1st Prize: $1,800 USD
2nd Prize: $1,100 USD
3rd Prize: $700 USD
The Swissquote Wallet Prize 🏆

In the Swissquote Wallet Challenge, we want teams to build the self-custody wallet Swissquote could realistically launch for its clients. The goal is to give users full control of their crypto and keys while preserving the security, simplicity, compliance, and user experience they expect from a Swiss bank. Today, clients who want self-custody must withdraw their assets to an external wallet and leave the Swissquote ecosystem. Your challenge is to create a better alternative: their keys, their control, while remaining one step away from their Swissquote account.

Your prototype should demonstrate the complete wallet lifecycle, from wallet creation to authentication, transaction signing, loss of access, and recovery. Teams must make and defend a clear custody model, define a credible threat model, design the wallet architecture, explain where keys or key shares live, and show how users authenticate securely before signing transactions. The recovery mechanism should protect legitimate users without creating an easy path for attackers or giving Swissquote unintended control over client funds. At minimum, your demo must sign and send a real transaction to a blockchain, with testnet deployments fully accepted.

You are free to explore approaches such as MPC or threshold signatures, passkeys and WebAuthn, smart contract accounts using ERC-4337, seed phrases, or split-backup systems such as Shamir or SLIP-39. Use established cryptographic libraries and SDKs rather than implementing your own cryptography. Parts that cannot realistically be built during the hackathon, such as banking infrastructure, compliance providers, or key-share servers, may be mocked as long as the distinction is clearly documented and the system architecture remains credible.

Bonus points if your project:

implements gasless transactions, so users can transfer assets such as USDC without first acquiring the network's native gas token
enables compliant dApp interaction, such as approved dApp lists, sanctions screening, transaction simulation, or additional checks for high-value transactions
provides a recovery flow that can distinguish a legitimate user from an attacker who has compromised their phone or email
creates a strong business case for Swissquote through revenue, client retention, new users, or lower operational costs
addresses Swiss regulatory considerations around custody and wallet ownership verification in a technically credible way
How we will judge

Projects will be evaluated on technical implementation (35 points), security and custody design (20 points), legal feasibility (15 points), business case (15 points), and user experience and pitch (15 points). Teams can earn up to 20 additional bonus points for well-executed gasless transactions and compliant dApp interaction, provided the core create → sign → recover experience works end to end.```
