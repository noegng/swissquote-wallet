// Côté JS de l'interop SLIP-39 (appelé par check.py, ne pas lancer seul).
// Lit du JSON sur stdin, répond du JSON sur stdout.
//   {"op":"split"}                      → {"secret": hex, "client": m, "tiers": m}
//   {"op":"combine","mnemonics":[...]}  → {"secret": hex} ou {"error": "..."}
import { combineBackupShares, newBackupSecret, splitBackupSecret, toHex } from '../../packages/core/src/index';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const req = JSON.parse(input);

if (req.op === 'split') {
  const secret = newBackupSecret();
  console.log(JSON.stringify({ secret: toHex(secret), ...splitBackupSecret(secret) }));
} else {
  try {
    console.log(JSON.stringify({ secret: toHex(combineBackupShares(req.mnemonics)) }));
  } catch (e) {
    console.log(JSON.stringify({ error: String(e) }));
  }
}
