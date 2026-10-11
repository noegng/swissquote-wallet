---
name: doc-sync
description: Keep the Swissquote Wallet documentation consistent after a decision or a design change (order in which files are updated, writing rules, everything in English), and prepare the DoraHacks submission (checklist of the six required topics, AI tools used). Load it when a decision changes, when a document in docs/ or the design document is edited, or when writing the submission or the pitch.
---

# Keeping the documents in sync

## Update order after a decision

1. `docs/03-decisions.md`: **authoritative**. Change the decision's row with the date and the reason; move the former choice to "Superseded decisions".
2. `../swissquote-wallet-design.md`: the affected sections (solution, threats, scope, production, jury questions).
3. `CLAUDE.md`: summary of the model and rules, if they change.
4. `README.md`: real / mocked table.
5. `docs/06-prototype-to-production.md`: any new mock.
6. `docs/09-build-plan.md`: tasks added, removed or ticked.
7. If an invariant changes: the `custody-invariants` skill and the tests in `packages/core/test/` (`multisig.test.ts`, `backup.test.ts`, `onboarding.test.ts`).
8. What the jury reads: `../README.md` (repository root) and `docs/10-dorahacks-submission.md`.

Then re-read the changed files to check that none contradicts `03-decisions.md` (search for the former terms: "Safe", "ERC-4337", "Base Sepolia", "Candide", "guardian").

## Writing rules

- **English** for everything in the repository (documents, code, messages, file names). Short sentences, non-technical words when possible.
- Label: **Decided**, **Proposed**, **To validate**. Legal points are always assumptions.
- Never claim the prototype is ready for production; do not invent figures (market, revenue): mark them as assumptions.

## DoraHacks submission checklist

The description must cover (brief requirements):

- [ ] Chosen custody model, pros and cons, short threat model (who can steal, who can lock out, Swissquote alone or with a partner)
- [ ] Architecture diagram (Mermaid in the root README, FigJam link), mocked parts marked
- [ ] Wallet creation: where keys and shares are generated and stored, link with the Swissquote identity
- [ ] Authentication: passkey, small vs large amount
- [ ] Recovery: who, how long, what stops an attacker, **exit if Swissquote disappears**, refusal of the phone + email attacker
- [ ] Custody and Travel Rule (legal section)
- [ ] Concrete business case
- [ ] Bonus topics covered
- [ ] **AI tools used and what for** (table at the bottom of `docs/09-build-plan.md`)
- [ ] Links: repository, video, signet txids (`docs/proofs.md`)
