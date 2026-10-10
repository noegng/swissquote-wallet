# Interop SLIP-39

Vérifie que la bibliothèque JS retenue est compatible avec la référence Python de Trezor (`shamir-mnemonic`), dans les deux sens, et qu'elle passe les vecteurs officiels. Porte d'entrée du spike (voir la skill `slip39-backup`).

```bash
python -m venv .venv && .venv/Scripts/activate   # Windows (Git Bash) ; source .venv/bin/activate ailleurs
pip install -r requirements.txt
python check.py
```

`check.py` est à écrire au spike :
1. Télécharger `vectors.json` depuis https://github.com/trezor/python-shamir-mnemonic et le faire passer par la bibliothèque JS (test vitest dans `packages/core`).
2. Générer des parts avec notre configuration (seuil de groupes 2, groupes CLIENT et TIERS) côté JS, les restaurer côté Python, et inversement.
3. Vérifier qu'une seule part de groupe ne restaure rien.
