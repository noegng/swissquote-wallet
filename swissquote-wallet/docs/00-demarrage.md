# Démarrage pas à pas

Guide pour mettre en place le projet sur sa machine, sans prérequis Bitcoin. Testé sous Windows le 10 octobre 2026.

## 1. Installer les outils (une seule fois)

| Outil | Pourquoi | Vérifier dans un terminal |
|---|---|---|
| **Git** | Récupérer le code | `git --version` |
| **Node.js 22** (https://nodejs.org, version LTS) | Faire tourner l'app et les services | `node -v` → `v22.x` |
| **Docker Desktop** (https://www.docker.com/products/docker-desktop) | Faire tourner un Bitcoin local de test | `docker info` ne doit pas afficher d'erreur |
| Python 3 (facultatif) | Test d'interop SLIP-39 seulement | `python --version` |

Docker Desktop doit être **ouvert** (icône de baleine dans la barre des tâches) à chaque fois qu'on travaille.

## 2. Récupérer le projet

```bash
git clone https://github.com/noegng/swissquote-wallet.git
cd swissquote-wallet
cd swissquote-wallet          # le dossier du code (celui qui contient package.json)
```

**Attention, le dépôt contient un dossier `swissquote-wallet/` dans `swissquote-wallet/`.** Toutes les commandes `npm` se lancent dans le dossier intérieur.

Si le dépôt est dans OneDrive : exclure `node_modules` de la synchronisation, ou cloner ailleurs (ex. `C:\dev\`). Sinon l'installation est lente et OneDrive peut créer des conflits.

## 3. Installer et configurer

```bash
npm install                   # installe toutes les dépendances (1 à 2 minutes)
cp .env.example .env          # Windows PowerShell : Copy-Item .env.example .env
```

Le fichier `.env` contient les réglages locaux (réseau, ports, délais). Les valeurs par défaut conviennent. Il se place **dans le dossier intérieur**, à côté de `.env.example` (à défaut, un niveau au-dessus est accepté). Au lancement de `npm run dev:all`, chaque serveur affiche le réseau et le fichier `.env` qu'il utilise ; une modification du `.env` relance les serveurs automatiquement.

## 4. Lancer le Bitcoin de test local (regtest)

```bash
npm run regtest:up
```

La première fois, Docker télécharge les images (quelques minutes). Ensuite c'est instantané.

Ce que ça lance :
- un nœud Bitcoin privé, sur ta machine uniquement (« regtest ») : les bitcoins n'ont aucune valeur et les blocs sont créés à la demande ;
- une API sur http://localhost:3000 (la même que mempool.space) ;
- un explorateur web sur http://localhost:5000.

Vérifier :

```bash
curl localhost:3000/blocks/tip/height     # affiche un nombre (ex. 101)
```

Recevoir des bitcoins de test sur une adresse regtest (`bcrt1…`) :

```bash
npm run regtest:faucet -- bcrt1q...
```

Un bloc est créé automatiquement : les fonds sont confirmés tout de suite.

## 5. Lancer l'app et les services

```bash
npm run dev:all
```

Ça lance trois programmes en même temps (un préfixe de couleur par programme) :

| Programme | Adresse | Rôle |
|---|---|---|
| `sq` | http://localhost:4001 | Service Swissquote **mocké** (cosignataire) |
| `partner` | http://localhost:4002 | Service partenaire **mocké** (part de secours) |
| `web` | http://localhost:5173 | L'app, à ouvrir dans le navigateur |

Ouvrir http://localhost:5173 : les deux services doivent apparaître « en ligne ». Pour simuler un téléphone : DevTools (F12) → icône téléphone (mode appareil).

`Ctrl + C` arrête les trois.

## 6. La passkey (Windows Hello, Touch ID)

L'app crée une passkey : c'est la puce sécurisée de l'ordinateur qui la garde (TPM via Windows Hello sur PC, Secure Enclave sur Mac). Sur PC, Windows Hello demande le code PIN ou le visage. Rien à configurer : ça marche sur `localhost`.

Si Windows Hello ne marche pas (machine de démo, PIN non configuré) : authentificateur virtuel de Chrome.
1. F12 → menu ⋮ → **More tools** → **WebAuthn**.
2. Cocher **Enable virtual authenticator environment**, puis **Add** (protocole `ctap2`, transport `internal`, cocher *resident key* et *user verification*).
3. Recharger l'app : la passkey est créée dans cet authentificateur virtuel.

## 7. Vérifier que tout va bien

```bash
npm test             # 79 tests, dont les invariants de custody
npm run typecheck    # vérification des types TypeScript
```

## 8. Commandes du quotidien

| Je veux… | Commande |
|---|---|
| Démarrer ma session | Ouvrir Docker Desktop, puis `npm run regtest:up` et `npm run dev:all` |
| Remettre la démo à zéro | `npm run reset` (services lancés), puis dans le navigateur : F12 → Application → Clear site data (efface le wallet local) |
| Arrêter le Bitcoin local | `npm run regtest:down` |
| Repartir d'une chaîne vierge | `npm run regtest:down`, supprimer `tools/regtest/volumes/`, `npm run regtest:up` |
| Récupérer le travail des autres | `git pull`, puis `npm install` si `package.json` a changé |

## 9. Signet (le vrai réseau de test public, pour la démo)

Le regtest sert à développer vite. Pour la démo, on utilise **signet**, un réseau de test public où tout le monde peut vérifier nos transactions sur https://blockstream.info/signet.

- Dans `.env` : `BTC_NETWORK=signet` (les serveurs redémarrent seuls et affichent « réseau Bitcoin : signet »). Docker n'est pas nécessaire.
- Créer un **nouveau** wallet : ses adresses commencent par `tb1…` (les wallets regtest restent de côté et reviennent si on repasse en regtest).
- Obtenir des sats de test : https://bitcoinsignetfaucet.com (5 demandes par 24 h maximum : ne pas les gaspiller ; alimenter le wallet une heure avant la démo).
- Les faucets donnent peu : baisser le seuil pour pouvoir montrer un paiement retenu, par exemple `DAILY_LIMIT_SATS=3000`.

## 10. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `open //./pipe/dockerDesktopLinuxEngine` ou `Cannot connect to the Docker daemon` | Docker Desktop n'est pas lancé : l'ouvrir et attendre qu'il soit prêt |
| `port is already allocated` / `EADDRINUSE` | Un ancien programme tourne encore : fermer les autres terminaux, ou redémarrer Docker |
| `curl localhost:3000/...` ne répond pas juste après le lancement | Attendre 10 à 20 secondes que le nœud démarre |
| L'app affiche les services « hors ligne » | `npm run dev:all` n'est pas lancé, ou a planté : regarder les messages `[sq]` et `[partner]` |
| `npm install` très lent | Dépôt dans OneDrive : voir la section 2 |
| La création de passkey échoue ou ne propose rien | Windows Hello non configuré : Paramètres → Comptes → Options de connexion → PIN. Sinon, authentificateur virtuel de Chrome (section 6) |

## 11. Travailler avec Claude Code

Ouvrir Claude Code dans le dossier `swissquote-wallet/` (l'intérieur). Il lit `CLAUDE.md` et charge les skills du projet automatiquement (`custody-invariants`, `btc-multisig`, `slip39-backup`, `mock-service`, `demo-run`, `doc-sync`). Pour savoir quoi faire : `docs/09-plan-de-build.md`.
