// JS side of the SLIP-39 interop (called by check.py, do not run it alone).
// Reads JSON on stdin, answers JSON on stdout.
//   {"op":"split"}                      → {"secret": hex, "client": m, "tiers": m}
//   {"op":"combine","mnemonics":[...]}  → {"secret": hex} or {"error": "..."}
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
