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

Projects will be evaluated on technical implementation (35 points), security and custody design (20 points), legal feasibility (15 points), business case (15 points), and user experience and pitch (15 points). Teams can earn up to 20 additional bonus points for well-executed gasless transactions and compliant dApp interaction, provided the core create → sign → recover experience works end to end.
```

## Détails du track Swissquote (version complète, reçue le 10 octobre 2026)

Cette version précise la précédente et **fait foi** pour le parcours Swissquote. Points nouveaux à retenir :

- **Six sujets obligatoires** : modèle de custody (avec pour, contre et mini modèle de menaces), architecture (schéma, réel vs mocké), création du wallet, authentification (petit vs gros montant), récupération (dont « Swissquote a disparu »), business case.
- **Mock d'un détenteur de part** : il doit tourner comme **processus séparé avec son propre stockage**, et l'app cliente ne doit **jamais** détenir sa part.
- **Bonus** : jusqu'à 10 points chacun pour les transactions sans gas et l'interaction dApp conforme ; crédit en plus si la démo montre la récupération **refusant un attaquant qui a le téléphone et l'e-mail**.
- **Juridique** : la garde dépend de qui **peut** déplacer les fonds ; un contrôle partagé Swissquote + partenaire est une zone grise. Travel Rule : la banque ne peut envoyer ou recevoir vers un wallet externe qu'après avoir vérifié son propriétaire.
- **Soumission** : modèle de custody et menaces, schéma d'architecture avec mocks marqués, custody et Travel Rule, business, bonus traités, **outils d'IA utilisés et pour quoi**.

```text
Build the Swissquote Wallet

The challenge
Build the self-custody wallet Swissquote could launch tomorrow. In this Swissquote track, design and build a working prototype that lets a Swissquote client hold their own keys without losing the safety, simplicity and compliance they expect from a Swiss bank.
Today, clients who want self-custody withdraw their crypto to an external wallet and leave the Swissquote ecosystem. Your wallet should give them a better option: their keys, their control, but one step away from their Swissquote account.
The topic is deliberately open. We value engineering first, but the best projects will also show that their wallet could legally exist in Switzerland and that it makes business sense for Swissquote.

Technical constraints
- Don't reinvent cryptography. Use established open-source libraries and SDKs (MPC/threshold-signature libraries, Safe, ERC-4337 tooling, WebAuthn/passkeys). Homemade crypto will be penalized, not rewarded.
- Mocking is fine if it's honest. Anything you can't build during the hackathon (a bank backend, a compliance provider, a key-share server) can be mocked, as long as it's clearly labeled in your demo and README. A mocked share holder must run as a separate process with its own storage, and the client app must never hold its share.

Required topics
Every team must cover the six topics below. Your demo must show one end-to-end story: create a wallet -> log in and sign a transaction -> lose the wallet or its keys -> recover access.
1. Custody model decision. Choose a model and defend it. There is no single right answer; we judge the quality of the reasoning. Include pros, cons and a short threat model: who could steal funds, who could lock the client out, and could Swissquote, alone or together with a partner, move the funds without the client?
2. Architecture. A diagram of your components (client app, backend services, key storage, smart contracts, chain) and what talks to what. Make clear which parts are real and which are mocked.
3. Wallet creation. How a Swissquote client gets a wallet: where keys or key shares are generated, where they live, and how the wallet is linked to the client's existing identity.
4. Authentication. How the client proves who they are before signing: passkeys, biometrics, device binding, 2FA, or a mix. Show how a high-value transaction differs from a small one, if it does.
5. Recovery. What happens when the wallet or its keys are lost, stolen or destroyed, whether it lives in a phone app, a browser or a hardware device. Who is involved, how long it takes, and what stops an attacker from using the same process. Also show how the client gets their funds back if Swissquote's services are permanently gone. Bonus credit if your demo shows the recovery process refusing an attacker who has stolen the client's phone and email.
6. Business case. What Swissquote gains from offering this wallet: revenue, keeping assets in its ecosystem, new clients or lower costs. A paragraph is enough, but it has to be concrete.
At minimum, the transaction in that story must be signed and sent to a blockchain (a testnet is fine). Everything beyond that is where you stand out.

Common custody models (combinations are allowed and often stronger)
- Custodial account: Swissquote holds the keys. Is it still a "wallet"? What does the client gain?
- Seed phrase: 12 or 24 words generate the keys; the client stores them. Will a typical Swissquote client keep the phrase safe?
- MPC / threshold signatures: the key is split into shares (client, Swissquote, backup); no one holds it whole. Who holds which share? Does Bitcoin work too? (Hint: yes. MPC signs for any chain, unlike ERC-4337, which is EVM-only.)
- Smart-contract account (ERC-4337): an on-chain account controlled by passkeys and rules. EVM-only? Who pays gas? What does recovery look like on-chain?
- Split backup (Shamir / SLIP-39): the seed is split into shares (for example, client paper, Swissquote, an independent partner); any two of the three restore it. Can Swissquote and the partner restore it without the client? Where is the seed put back together?

Bonus topics (optional; count only if create -> sign -> recover works end to end)
- Gasless transactions. Clients shouldn't need to buy the chain's native token (like ETH) just to move their USDC. Sponsor fees with a paymaster, meta-transactions, EIP-7702 or the equivalent on your chain, and explain who pays and how abuse is prevented.
- Compliant dApp interaction. Let clients use DeFi without exposing them, or Swissquote, to scams and sanctions risk. Ideas: an approved list of dApps, screening addresses against sanctions lists, simulating a transaction and showing its effects in plain language before signing, extra checks above a threshold.

Legal primer for engineers (simplified, not legal advice)
- Custody depends on who can move the funds. If Swissquote can move the client's crypto on its own, it is custody, with the capital and segregation rules of a bank. If it cannot act alone, the wallet is closer to software. Your custody model decides which side you are on, so say which and why. Control shared with a third party (Swissquote plus a partner together) is a grey zone. If your design allows it, argue why it is or isn't custody.
- Self-hosted wallets need proven ownership. The Travel Rule requires crypto transfers to carry information about who sends and who receives. Switzerland applies it strictly: under FINMA's rules, a Swiss bank may only send crypto to, or receive it from, an external wallet after verifying who owns it. A wallet that Swissquote provides could make this check automatic. How would yours do it? And when the client pays a third party from your wallet, is Swissquote the sending institution at all?

What your submission should cover
- your custody model decision and threat model;
- the architecture diagram, with mocked parts marked;
- how your wallet handles custody and the Travel Rule (see the legal primer);
- how Swissquote would make money from it, or what it would gain;
- which bonus topics you tackled;
- which AI tools you used, and what you used each one for.

How we judge (out of 100, plus up to 20 bonus points)
- Technical implementation, 35: the create -> sign -> recover story works end to end; clean, sensible code
- Security and custody design, 20: a well-argued custody model, a credible threat model and recovery that can't be abused
- Legal feasibility, 15: realistic reasoning about custody and wallet ownership verification
- Business case, 15: clear value for clients and for Swissquote: revenue, retention or cost savings
- User experience and pitch, 15: a non-technical client could use it; the demo tells a clear story
- Bonus topics, up to +20: up to 10 points each for gasless transactions and compliant dApp interaction; only awarded if the core story works end to end
```
