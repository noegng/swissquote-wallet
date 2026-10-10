# Interop SLIP-39

Vérifie que notre wrapper `packages/core/src/backup.ts` (bibliothèque `shamir-mnemonic-ts`) est compatible avec la référence Python de Trezor (`shamir-mnemonic`), dans les deux sens. Les 45 vecteurs officiels sont testés côté JS par `npm test`.

**Validé le 10/10/2026** : JS → Python et Python → JS, avec refus d'une part de groupe seule.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS / Linux : .venv/bin/python
.venv/Scripts/python check.py
```

`slip39` (ilap) a été écartée : elle modifie `String.prototype` et `Array.prototype`.
