# Differentiation

Many teams will propose an EVM smart account or a plain split backup. Our base (2-of-3 Bitcoin multisig, the Bitkey model) is proven; the differentiation comes from what we demonstrate and from how we answer the brief's trick questions.

## The angles, by priority

1. **A demo of refused attacks**, replayed live with the reason for each refusal:
   - a thief with the unlocked phone who tries to empty the wallet → above the instant amount, delay, the client cancels;
   - an attacker with the **phone and the email** who starts a recovery → no CLIENT share, refused (explicit bonus credit in the brief);
   - Swissquote + partner trying to restore the backup key → SLIP-39 combination rejected.
2. **"Swissquote is gone" shown live**: the Swissquote service is stopped, and the client leaves with phone + backup key. The brief requires it; few teams will really show it.
3. **Custody invariants tested automatically** (I1 to I7, see `03-decisions.md`): the threat model is executable, not just written.
4. **Split backup used where it is safe**: Swissquote holds no share, the backup key is rebuilt only on the client's device. We answer the brief's two trick questions instead of suffering them.
5. **Banking continuity** during the recovery delay (mocked): capped access through the Swissquote account. Only a bank can offer it.
6. **Automatic Travel Rule**: Swissquote co-creates the wallet, so ownership is proven from creation.

## To avoid

MPC, ZK proofs, multi-chain at the core of the project: high cost, risk of breaking the end-to-end story.

## Positioning line

"Your bitcoins, your keys, one step away from your account: Swissquote protects you but can never act without you, and if Swissquote disappears, you leave with your funds."
