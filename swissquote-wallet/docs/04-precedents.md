# Précédents : projets proches et leçons

Recherche faite avec Exa le 10 octobre 2026. Aucun projet ne couvre exactement notre cas (wallet de banque, récupération avec KYC). Chacun couvre une partie du problème.

| Projet | Approche | Ce qu'on en retient |
|---|---|---|
| ENSignv2 | La récupération peut seulement ajouter une clé. Gardiens désignés par noms ENS. Le propriétaire peut annuler dans une courte fenêtre. Gas sponsorisé par Pimlico | Borner ce que la récupération permet |
| [AAStarCommunity/airaccount-contract](https://github.com/AAStarCommunity/airaccount-contract) | Limites par palier selon le montant. Gardiens passkey P-256. Cycle proposer / approuver / exécuter / annuler. Timelock sur l'installation de modules | Le plus proche de notre cible. Paliers et timelock à reprendre |
| [openfort-xyz/openfort-7702-account](https://github.com/openfort-xyz/openfort-7702-account/) | Gel du wallet par un gardien, récupération avec timelock, clés de session avec plafonds | Gel d'urgence |
| [koinlabs/Timelock-account-recovery](https://github.com/koinlabs/Timelock-account-recovery) (TAR, Chateau) | Récupération avec garantie confisquable. « Watch towers » qui peuvent opposer un veto sans jamais prendre le compte. Cible : une passkey | Trop lourd pour 33 h. Idée du veto qui ne peut pas prendre le compte. Un `eth_call` statique peut donner de faux positifs sur testnet pour le précompile P-256 : tester avec une vraie UserOp |
| Argent | Verrouillage par un gardien, délai de 5 jours, approbation par au moins la moitié des gardiens, vérification par emojis | Faille de 2020 (audit OpenZeppelin) : cas zéro gardien et déni de service |
| Guardian Vault | Timelock, simulation de transaction côté serveur, prêt d'urgence en PYUSD pendant l'attente | Idée de liquidité pendant le délai : base de notre « continuité bancaire » |
| [slaviquee/monolith](https://github.com/slaviquee/monolith) | Plafonds de dépense on-chain, rotation de clé en 48 h, dégel en 10 min, fork de Coinbase Smart Wallet | Durcir tout de suite, assouplir avec délai |
| [loveyuanfandj-glitch/treasury-smart-account](https://github.com/loveyuanfandj-glitch/treasury-smart-account) | Clés scopées, gel par gardien, récupération retardée, preuves sur Base Sepolia, fuzzing | Modèle de présentation avec preuves vérifiables |
| Asguard | Modules Safe, signataire OAuth, période de refroidissement | Référence secondaire |
| Para, SwissBorg | MPC (2-sur-2 avec passkey ; MiCA) | Alternative MPC, rejetée pour 33 h : plus de cryptographie à intégrer, pas de contrat visible |

## Lecture juridique (hypothèses, pas des certitudes)

Les synthèses FINMA, PwC et SW Legal vont dans le même sens : sans contrôle des clés privées par le fournisseur, il est traité comme non-dépositaire (pas de licence bancaire, éventuellement soumis à la LBA). À faire valider par un avocat suisse.

## Leçons appliquées au projet

1. La récupération ne fait qu'ajouter ou remplacer une clé, jamais déplacer des fonds.
2. Au moins un gardien obligatoire.
3. Protection contre les récupérations répétées (déni de service).
4. Gel d'urgence par un gardien.
5. Limites par paliers de montant.
6. Simulation et avertissement avant signature.
7. Liquidité d'urgence pendant le délai (extension).
8. Preuves vérifiables : adresses, tests Foundry, scénarios rejouables.
