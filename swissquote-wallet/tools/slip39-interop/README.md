# SLIP-39 interop

Checks that our wrapper `packages/core/src/backup.ts` (library `shamir-mnemonic-ts`) is compatible with Trezor's Python reference (`shamir-mnemonic`), in both directions. The 45 official vectors are tested on the JS side by `npm test`.

**Validated on 10/10/2026**: JS → Python and Python → JS, including the refusal of a single group's share.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS / Linux: .venv/bin/python
.venv/Scripts/python check.py
```

`slip39` (ilap) was rejected: it modifies `String.prototype` and `Array.prototype`.
