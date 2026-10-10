---
name: slip39-backup
description: Sauvegarde et reconstitution de la clé de secours du Swissquote Wallet en SLIP-39 à groupes (groupes CLIENT et TIERS, chiffrement d'une part pour un appareil, reconstitution uniquement sur l'appareil du client, vecteurs officiels et interop avec la référence Python de Trezor). À charger pour tout code de création de wallet, de récupération, de chiffrement de parts, ou pour choisir et valider la bibliothèque SLIP-39.
---

# Clé de secours en SLIP-39

## Configuration (ne pas changer sans revoir `custody-invariants`)

```
seuil de groupes = 2
groupes = [[1, 1], [1, 1]]     # [CLIENT, TIERS]
CLIENT : une mnémonique, stockée deux fois (C1 papier, C2 copie chiffrée « cloud »)
TIERS  : une mnémonique, chiffrée pour le service partenaire
Swissquote : aucune part
```

- La spec recommande une seule part par groupe de seuil 1 : C1 et C2 sont la **même** mnémonique (redondance contre la perte).
- **Interdit** : 3 groupes avec seuil 2 (C1 + C2 restaureraient sans partenaire).
- Le secret maître SLIP-39 (16 ou 32 octets) sert de seed BIP-32 pour la clé de secours.

## Bibliothèque

- Candidates : `shamir-mnemonic-ts`, `slip39` (ilap). Référence : `shamir-mnemonic` (Python, Trezor).
- **Porte d'entrée** (spike) : la bibliothèque JS doit passer les vecteurs officiels `vectors.json` de https://github.com/trezor/python-shamir-mnemonic, et ses parts doivent se restaurer avec la référence Python (et inversement). Commande : `python tools/slip39-interop/check.py`.
- Toujours passer par le wrapper `packages/core/src/backup.ts` : le reste du code n'importe jamais la bibliothèque directement (changement de bibliothèque possible sans toucher au reste).

## Chiffrement d'une part pour un appareil (`sealing.ts`)

- WebCrypto uniquement : ECDH P-256 éphémère + HKDF-SHA-256 + AES-GCM. Rien d'écrit à la main.
- L'appareil génère une paire de clés éphémère et envoie sa clé publique ; le partenaire renvoie la part TIERS chiffrée pour cette clé.
- C2 est chiffrée avec une clé dérivée de la passkey (extension PRF) ou, à défaut, d'une phrase de passe (PBKDF2 WebCrypto, nombre d'itérations élevé).

## Cycle de vie

1. **Création** : l'app génère le secret, découpe, affiche C1, chiffre C2, chiffre TIERS pour le partenaire, envoie TIERS au service partenaire, puis **efface** secret et parts en mémoire.
2. **Récupération** : l'app obtient C1 (saisie) ou C2 (déchiffrée) + TIERS (déchiffrée avec la clé éphémère) → `combine` → clé de secours en mémoire → signature du transfert vers un nouveau jeu de clés → nouvelle clé de secours re-découpée → l'ancienne est effacée.
3. Jamais : persister la clé reconstituée, la logger, l'envoyer à un service.

## Tests attendus (`packages/core/test/`)

- Vecteurs officiels.
- {CLIENT, TIERS} restaure ; {CLIENT} seul échoue ; {TIERS} seul échoue ; {C1, C2} échoue (même groupe).
- Aller-retour chiffrement / déchiffrement d'une part ; échec avec une mauvaise clé.
