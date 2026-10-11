---
name: demo-run
description: Lancer, réinitialiser, tester de bout en bout et répéter la démo du Swissquote Wallet (regtest Docker et signet, services mockés, web app, scénarios et attaques scriptés, collecte des txid et liens explorateur dans docs/preuves.md). À charger quand on veut démarrer le projet, lancer les tests e2e, préparer ou répéter la démo, ou produire des preuves vérifiables.
---

# Lancer et répéter la démo

Tous les chemins sont relatifs à `swissquote-wallet/` (le dossier qui contient `package.json`).

## Démarrage

```bash
npm install
npm run regtest:up        # Nigiri (bitcoind + esplora) dans Docker ; nécessite Docker Desktop lancé
npm run dev:all           # services/swissquote, services/partner, apps/web en parallèle
```

Réseau choisi par `BTC_NETWORK=regtest|signet` dans `.env` (voir `.env.example`). La web app indique le réseau et affiche la bannière MOCK.

## Tests

```bash
HIGH_VALUE_DELAY_SECONDS=8 npm run start -w services/swissquote   # délai court pour tester (PowerShell : $env:HIGH_VALUE_DELAY_SECONDS=8)
npm run demo:create      # création complète : passkey, wallet, part TIERS chez le partenaire, C2
npm run demo:cosign      # paliers 1 et 2, annulation, sanctions, fonds d'un autre wallet, attaques passkey, I1
npm run demo:recover     # attaque téléphone + e-mail refusée, annulation, récupération complète (RECOVERY_DELAY_SECONDS=6 conseillé)
npm run demo:exit -- create   # puis arrêter le service Swissquote (port 4001), puis :
npm run demo:exit -- exit     # sortie téléphone + secours, vérifie que Swissquote est injoignable
npm run spike:signet     # transaction publique 2 sur 3 sur signet
```

```bash
npm test                  # unitaires + invariants I1–I5 (packages/core)
python tools/slip39-interop/check.py   # interop SLIP-39 avec la référence Trezor
```

## Réinitialiser entre deux répétitions

```bash
npm run reset             # vide services/*/data et le stockage local de l'app (instructions dans la console)
```

## Scénarios de démo (ordre du pitch)

1. Création du wallet (C1 affichée, C2 chiffrée, part TIERS envoyée).
2. Petit envoi immédiat (palier 1) → txid signet.
3. Gros envoi → palier 2, notification, délai visible.
4. Attaque : voleur du téléphone déverrouillé → palier 2, annulé par le client.
5. Attaque : téléphone + e-mail lance une récupération → refusée (pas de part CLIENT).
6. Attaque : Swissquote + partenaire tentent de restaurer → combinaison rejetée.
7. Téléphone perdu → récupération, transfert vers un nouveau jeu de clés.
8. Swissquote a disparu → on arrête `services/swissquote` (fermer son terminal ou tuer le port 4001), écran de connexion → « Swissquote unavailable? Use your exit kit ».

Chaque scénario est aussi un script : `npm run demo:create`, `demo:cosign`, `demo:recover`, `demo:exit` (deux phases : `-- create` puis, Swissquote arrêté, `-- exit`), `demo:trustee`.

## Preuves

- Noter chaque txid signet dans `docs/preuves.md` avec le lien `https://blockstream.info/signet/tx/<txid>` et la date.
- Vérifier la confirmation : `GET https://blockstream.info/signet/api/tx/<txid>/status` (WebFetch) → `confirmed: true`.
- Avant la démo : préfinancer 3 à 5 adresses signet (faucet limité à 5 demandes par 24 h), enregistrer une **vidéo de secours** et un GIF du parcours (Claude in Chrome, `gif_creator`).

## Si quelque chose casse le jour J

- Signet lent ou faucet vide → basculer sur regtest (`BTC_NETWORK=regtest`), montrer les txid signet déjà dans `preuves.md`.
- Passkey indisponible sur la machine de démo → utiliser le navigateur et l'appareil testés pendant la répétition.
- Rien ne marche → vidéo de secours.
