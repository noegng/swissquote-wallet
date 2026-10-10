"""Interop SLIP-39 entre notre wrapper JS (packages/core/src/backup.ts) et la référence
Python de Trezor (shamir-mnemonic). Les vecteurs officiels sont testés côté JS (npm test).

Usage (depuis ce dossier) : .venv/Scripts/python check.py   (Windows)
                            .venv/bin/python check.py       (macOS, Linux)
"""

import json
import os
import shutil
import subprocess
import sys

import shamir_mnemonic

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
# Notre configuration : seuil de groupes 2, groupes CLIENT et TIERS de 1 part chacun.
GROUP_THRESHOLD = 2
GROUPS = [(1, 1), (1, 1)]


def js(request):
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    out = subprocess.run(
        [npx, "tsx", os.path.join(HERE, "js-side.ts")],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=True,
    )
    return json.loads(out.stdout.strip().splitlines()[-1])


def check(label, ok):
    print(("OK    " if ok else "ECHEC ") + label)
    return ok


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    results = []

    # 1. Parts générées par JS, restaurées par la référence Python.
    split = js({"op": "split"})
    restored = shamir_mnemonic.combine_mnemonics([split["client"], split["tiers"]]).hex()
    results.append(check("JS -> Python : CLIENT + TIERS restaurent le secret", restored == split["secret"]))
    try:
        shamir_mnemonic.combine_mnemonics([split["tiers"]])
        results.append(check("JS -> Python : TIERS seul est refusé", False))
    except shamir_mnemonic.MnemonicError:
        results.append(check("JS -> Python : TIERS seul est refusé", True))

    # 2. Parts générées par la référence Python, restaurées par JS.
    secret = os.urandom(16)
    groups = shamir_mnemonic.generate_mnemonics(GROUP_THRESHOLD, GROUPS, secret)
    client, tiers = groups[0][0], groups[1][0]
    out = js({"op": "combine", "mnemonics": [client, tiers]})
    results.append(check("Python -> JS : CLIENT + TIERS restaurent le secret", out.get("secret") == secret.hex()))
    out = js({"op": "combine", "mnemonics": [client]})
    results.append(check("Python -> JS : CLIENT seul est refusé", "error" in out))

    print()
    if all(results):
        print("Interop SLIP-39 validée.")
        return 0
    print("Interop SLIP-39 en échec.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
