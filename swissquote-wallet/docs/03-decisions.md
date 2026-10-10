# Registre des décisions

Statuts : **Décidé** (acté par l'équipe), **Proposé** (recommandé, à confirmer), **À valider** (dépend d'un test ou d'un avis externe).
Mettre à jour ce fichier à chaque changement, avec la date et la raison. Ce fichier **fait foi** en cas de contradiction avec un autre document.

## Changement de cap du 10 octobre 2026

Le brief complet du track (voir `01-brief-hackathon.md`) met le Bitcoin au centre (la grande majorité des clients crypto de Swissquote détiennent du BTC) et exige que le client récupère ses fonds si Swissquote disparaît. Le smart account Safe / ERC-4337, limité à l'EVM, n'est plus le modèle principal. L'équipe retient une **garde collaborative en multisig Bitcoin 2 sur 3**, dont la clé de secours est sauvegardée en **SLIP-39 à groupes**. Les anciennes décisions sont conservées en bas de page pour mémoire.

## Décisions en vigueur

| # | Sujet | Choix | Statut | Raison / condition |
|---|---|---|---|---|
| D1 | Parcours | Swissquote Wallet (pas Belem Capital) | Décidé | Plus réaliste en 33 h à 3, et le barème récompense la sécurité, le juridique et le pitch |
| D2 | Seed phrase en coffre chez la banque | Rejetée | Décidé | Swissquote aurait le contrôle des fonds |
| D3 | Modèle de custody (10/10/2026) | Multisig Bitcoin natif **2 sur 3** P2WSH (`wsh(sortedmulti(2, …))`) : clé téléphone (client), clé Swissquote (cosignataire avec règles), clé de secours | Décidé | Bitcoin natif, pas de clé réassemblée pour signer, Swissquote jamais seul, client autonome avec 2 clés. Modèle éprouvé (Bitkey, Casa, Unchained) |
| D4 | Authentification (10/10/2026) | Passkey WebAuthn de la plateforme (Secure Enclave, TEE/StrongBox, TPM via Windows Hello, gérés par le navigateur) : authentifie le client auprès du cosignataire avec un **défi lié à chaque opération** (empreinte de la PSBT ou de la demande, usage unique, 2 min). La clé Bitcoin du téléphone est chiffrée par une clé WebCrypto non exportable (PRF facultatif). Démo sur ordinateur, authentificateur virtuel de Chrome en secours | Décidé | La puce ne gère que P-256, Bitcoin utilise secp256k1 : la passkey prouve l'identité, elle ne signe pas la transaction. Accès direct à la Secure Enclave = app native, hors périmètre |
| D5 | Chaîne (10/10/2026) | **Signet** pour la démo publique (API esplora de **blockstream.info**, mempool.space injoignable depuis le réseau de Noé), **regtest** (Docker, compose repris de Nigiri) pour le développement et les tests | Décidé | Signet est stable et a des faucets ; regtest donne des blocs instantanés. Spike regtest réussi le 10/10 |
| D6 | Récupération (10/10/2026) | Clé de secours découpée en SLIP-39 : groupe CLIENT (une mnémonique, stockée sur papier C1 et chiffrée dans le cloud C2) **et** groupe TIERS (partenaire indépendant). Seuil de groupes = 2 | Décidé | Swissquote + partenaire ne peuvent pas restaurer (il manque le groupe CLIENT) ; Swissquote n'a aucune part de la clé de secours |
| D7 | Délai (10/10/2026) | Récupération et gros montants : 2 à 3 min en démo, **7 jours** en production (comme Bitkey), avec notifications | Proposé | Laisse au client légitime le temps d'annuler |
| D8 | Plafonds (10/10/2026) | Appliqués par le **cosignataire Swissquote** : palier 1 (sous le plafond quotidien) immédiat ; palier 2 délai + notification annulable ; adresse sanctionnée refusée | Proposé | Pas de règles on-chain en Bitcoin ; Swissquote peut refuser de cosigner mais jamais signer seul |
| D9 | Annulation d'une récupération | Le client annule depuis son téléphone (signature de la clé téléphone) pendant le délai ; une récupération relancée après annulation passe en revue manuelle | Proposé | Un voleur du téléphone pourrait bloquer une récupération légitime : cas à documenter dans les menaces |
| D10 | Garde-fous de récupération | Une seule récupération active par wallet, délai avant d'en relancer une, transfert obligatoire vers un **nouveau** jeu de clés à la fin | Proposé | Révocation des anciennes clés et parts ; leçons d'Argent et de Bitkey |
| D11 | Sans gas (bonus) | Équivalent Bitcoin : Swissquote sponsorise les frais en ajoutant une entrée de son portefeuille de frais à la PSBT avant la signature du client, avec quota par client | Proposé | Seulement si create → sign → recover marche de bout en bout |
| D12 | Interaction conforme (bonus) | Résumé clair de la transaction avant signature, filtrage des adresses contre une liste de sanctions (mock étiqueté), contrôle renforcé au-dessus d'un seuil | Proposé | Priorité basse |
| D13 | Qui écrit le code | Écrit par Claude, relu et expliqué par l'équipe | Décidé | Chaque règle doit pouvoir être expliquée au jury |
| D14 | Cryptographie | Aucune cryptographie maison : bitcoinjs-lib, bip32, **shamir-mnemonic-ts** (45 vecteurs officiels + interop avec la référence Python de Trezor, validés le 10/10), WebCrypto, SimpleWebAuthn | Décidé | Exigé par le brief. `slip39` (ilap) écartée : elle modifie les prototypes globaux |
| D15 | Différenciation | Démo d'attaques refusées, « Swissquote a disparu » montré en direct, continuité bancaire pendant le délai, invariants de custody testés automatiquement | Proposé | Voir `05-differenciation.md` |
| D16 | Cadrage juridique | Hypothèse de non-garde (Swissquote ne peut pas déplacer les fonds, seul ni avec le partenaire), à valider par un avocat suisse | À valider | Voir le document projet, section juridique |
| D17 | MPC | Rejeté pour le hackathon | Proposé | Intégration risquée en 33 h ; en cas de faillite du fournisseur, beaucoup de wallets MPC finissent par reconstituer la clé |
| D18 | Smart account Safe / ERC-4337 (10/10/2026) | Rétrogradé en option EVM (USDC, sans gas), hors périmètre sauf temps libre | Décidé | EVM uniquement ; le cœur est Bitcoin |
| D19 | Rôle du split backup (10/10/2026) | SLIP-39 uniquement pour la clé de secours, jamais pour une clé utilisée au quotidien ; Swissquote n'en détient aucune part | Décidé | Évite la collusion employé Swissquote + vol du papier ; la clé de secours n'est réassemblée que sur l'appareil du client, puis abandonnée |
| D20 | App client (10/10/2026) | Web app mobile : Vite + React + TypeScript, monorepo npm | Décidé | Le plus rapide en 33 h ; passkeys WebAuthn natives |
| D21 | Suivi des tâches (10/10/2026) | Fichier `docs/09-plan-de-build.md` | Décidé | Rien à configurer |

## Invariants de custody

Ils traduisent les décisions en propriétés vérifiables, chacune couverte par un test automatisé (`packages/core/test/invariants.test.ts`).

| # | Invariant |
|---|---|
| I1 | Swissquote seul ne peut pas déplacer les fonds |
| I2 | Swissquote + partenaire ne peuvent pas déplacer les fonds ni restaurer la clé de secours |
| I3 | Le client peut sortir sans Swissquote (téléphone + clé de secours) |
| I4 | L'app ne détient jamais la clé Swissquote ni la part du partenaire (processus et stockage séparés) |
| I5 | La clé de secours n'est réassemblée que sur l'appareil du client, puis abandonnée (transfert vers un nouveau jeu de clés) |
| I6 | Aucune cryptographie maison |
| I7 | Tout ce qui est mocké est étiqueté (UI, réponses des services, README) |

## Spike de départ (H0–H3)

À réaliser avant toute fonctionnalité :

1. Descripteur 2 sur 3, adresse, financement, PSBT signée par la clé téléphone et la clé Swissquote (service séparé), broadcast sur regtest **puis sur signet**.
2. SLIP-39 : la bibliothèque JS candidate passe les vecteurs officiels et l'interop avec la référence Python de Trezor ; test I2 (Swissquote + partenaire ne restaurent pas).
3. Passkey : enregistrement et authentification contre le service Swissquote mocké ; test de l'extension PRF sur les navigateurs de l'équipe.
4. Si l'étape 2 échoue : utiliser la référence Python dans les services et un module équivalent côté app, et le documenter.

## Décisions remplacées (pour mémoire)

| # | Ancien choix | Remplacé par |
|---|---|---|
| D3 (ancien) | Smart account ERC-4337 (Safe 1.4.1 + Safe4337Module, EntryPoint v0.7) | D3, D18 |
| D4 (ancien) | Passkey qui signe les UserOperations (P-256 on-chain) | D4 |
| D5 (ancien) | Base Sepolia | D5 |
| D6 (ancien) | Récupération 2 sur 3 par gardiens on-chain (Candide) | D6 |
| D8 (ancien) | Module Solidity maison de plafonds | D8 |
| D9 (ancien) | Clé de veto sur un second appareil | D9 |
| D11 (ancien) | Paymaster ERC-4337 | D11 |
