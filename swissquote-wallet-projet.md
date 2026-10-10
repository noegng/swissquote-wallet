# Swissquote Self-Custody Wallet — Document de conception

> Hackathon BSA — Swissquote Wallet Prize. Équipe de 3, durée 33 h.
> Ce fichier regroupe tout le contexte : problème, solution, menaces, décisions, différenciation, chemin vers la production, répartition, précédents et références techniques.
> Dernière mise à jour : 10 octobre 2026 (changement de cap : multisig Bitcoin 2 sur 3 + clé de secours SLIP-39). Le registre `swissquote-wallet/docs/03-decisions.md` **fait foi** en cas de contradiction.
> Statuts : **Décidé**, **Proposé** (à confirmer), **À valider** (dépend d'un test ou d'un avis externe).

---

## Sommaire

1. Rappel du sujet
2. Le problème et les options écartées
3. La solution retenue
4. Modèle de menaces
5. Difficultés et solutions
6. Différenciation
7. Périmètre
8. Du prototype à la production
9. Business, juridique et Travel Rule
10. Décisions et spike de départ
11. Points ouverts
12. Répartition à 3 et priorités
13. Correspondance avec le barème
14. Questions probables du jury
15. Précédents : projets proches et leçons
16. Références techniques
17. Connecteurs, outils et règles de travail
18. Sources

---

## 1. Rappel du sujet

Swissquote veut un wallet self-custody que la banque pourrait lancer demain : **leurs clés, leur contrôle**, tout en restant **à un pas du compte Swissquote**, avec la sécurité, la simplicité et la conformité d'une banque suisse. Le brief complet est dans `swissquote-wallet/docs/01-brief-hackathon.md`.

**Histoire de démo exigée :** créer un wallet → se connecter et signer une transaction → perdre le wallet ou ses clés → récupérer l'accès. La transaction doit être signée et envoyée sur une blockchain (testnet accepté).

**Six sujets obligatoires :** modèle de custody (pour, contre, mini modèle de menaces : qui peut voler, qui peut bloquer le client, Swissquote seul ou avec un partenaire peut-il déplacer les fonds ?), architecture (schéma, réel vs mocké), création du wallet, authentification (petit vs gros montant), récupération (y compris **si Swissquote a définitivement disparu**), business case.

**Contraintes :** pas de cryptographie maison ; mocks honnêtes et étiquetés ; un détenteur de part mocké tourne comme **processus séparé avec son propre stockage**, et l'app cliente ne détient jamais sa part.

**Barème :** technique 35, sécurité et custody 20, juridique 15, business 15, UX et pitch 15, bonus jusqu'à +20 (10 sans gas, 10 interaction conforme) si create → sign → recover marche de bout en bout. Crédit en plus si la récupération **refuse un attaquant qui a le téléphone et l'e-mail**.

---

## 2. Le problème et les options écartées

### 2.1 Situation actuelle

Un client qui veut la self-custody retire ses cryptos vers un wallet externe et quitte l'écosystème Swissquote. Les options de récupération habituelles sont mauvaises :

- **Seed phrase** : perdue, tout est perdu ; mal conservée, elle est volée.
- **Récupération par e-mail ou SMS** : un attaquant qui contrôle le téléphone ou l'e-mail récupère tout.
- **Seed conservée par la banque** : la banque détient la clé, ce n'est plus de la self-custody.

### 2.2 Énoncé

> Comment un client peut-il garder le contrôle de ses bitcoins et rester à un pas de sa banque, sans que ni un attaquant, ni Swissquote, ni Swissquote avec un partenaire ne puisse déplacer les fonds ?

### 2.3 Les adversaires

1. **L'attaquant externe** : téléphone volé, e-mail piraté, faux documents d'identité, ingénierie sociale, cambriolage, appareil compromis.
2. **La banque** (ou un employé, ou un attaquant qui la compromet) : elle ne doit pas pouvoir agir seule, ni avec un partenaire, pour des raisons de sécurité et de qualification juridique.
3. **La disparition d'un acteur** : Swissquote ou le partenaire cesse son activité.

### 2.4 Options écartées

| Option | Pourquoi elle est écartée |
|---|---|
| **Compte custodial** | Swissquote détient les clés : ce n'est pas de la self-custody, et c'est déjà l'offre existante |
| **Seed phrase seule** | Un client bancaire type ne la conservera pas correctement ; aucune limite, aucun délai |
| **Seed en coffre chez la banque** (D2) | Contrôle de la banque sur les fonds, point de défaillance unique, impossible à révoquer |
| **Split backup seul (Shamir 2 sur 3 : client, Swissquote, partenaire)** | Swissquote + partenaire restaurent sans le client (zone grise de garde citée par le brief) ; la seed est réassemblée puis donne un accès total et immédiat, sans délai ni plafond ; une part ne se révoque pas. Précédent : Ledger Recover (2023), très critiqué pour ces raisons |
| **MPC / signatures à seuil** (D17) | Défendable et multi-chaînes, mais intégration risquée en 33 h, et beaucoup de wallets MPC reconstituent la clé en cas de faillite du fournisseur |
| **Smart account ERC-4337** (D18) | Règles on-chain élégantes, mais **EVM uniquement** : pas de Bitcoin natif. Gardé en option pour USDC |

---

## 3. La solution retenue

### 3.1 Principe

**Une garde collaborative Bitcoin 2 sur 3, où le client détient deux clés et Swissquote une seule.** Trois clés indépendantes, il en faut deux pour signer. La clé de secours, rarement utilisée, est sauvegardée en SLIP-39 de façon que ni Swissquote, ni Swissquote avec le partenaire, ne puisse la reconstituer.

**Phrase de positionnement :** « Vos bitcoins, vos clés, à un pas de votre compte : Swissquote vous protège sans jamais pouvoir agir sans vous, et si Swissquote disparaît, vous partez avec vos fonds. »

### 3.2 Les trois clés

| Clé | Où elle vit | Qui l'utilise | Rôle |
|---|---|---|---|
| **Clé téléphone** | App du client, chiffrée au repos, déverrouillée par passkey (biométrie) | Le client | Usage quotidien |
| **Clé Swissquote** | Serveur cosignataire (mock : fichier local ; production : HSM) | Swissquote, jamais seul | Cosigne selon des règles : plafonds, délais, sanctions, Travel Rule |
| **Clé de secours** | N'existe nulle part en entier. Découpée en SLIP-39 (voir 3.3) | Le client, avec le partenaire | Récupération, sortie si Swissquote disparaît |

Script : `wsh(sortedmulti(2, xpub_téléphone, xpub_swissquote, xpub_secours))`, standard, importable dans Sparrow ou Bitcoin Core.

### 3.3 La sauvegarde SLIP-39 de la clé de secours

```
Clé de secours = groupe CLIENT  ET  groupe TIERS        (seuil de groupes = 2)

  Groupe CLIENT : une mnémonique, stockée à deux endroits
                  C1 = papier ou plaque métal à la maison
                  C2 = copie chiffrée dans le cloud du client (clé dérivée de la passkey ou phrase de passe)
  Groupe TIERS  : partenaire indépendant (fiduciaire, notaire) ; deux partenaires en production
```

- Swissquote **n'a aucune part** de la clé de secours (D19) : un employé Swissquote malhonnête + un cambrioleur qui vole le papier ne peuvent rien.
- C1 et C2 sont la même mnémonique (la spec SLIP-39 recommande une seule part par groupe de seuil 1) : c'est de la redondance contre la perte, pas une sécurité supplémentaire.
- **Ne jamais** faire trois groupes avec un seuil de 2 : C1 + C2 suffiraient alors sans partenaire.
- Le partenaire ne libère sa part qu'après vérification d'identité, délai et notification, chiffrée pour l'appareil du client.

### 3.4 Cycle de vie

**Création**
1. Le client se connecte à Swissquote (KYC déjà fait, mocké) et crée une passkey.
2. L'app génère la clé téléphone et la clé de secours ; Swissquote dérive sa clé pour ce client.
3. Le descripteur 2 sur 3 est construit ; Swissquote l'enregistre : **la propriété du wallet est établie dès la création** (Travel Rule).
4. La clé de secours est découpée : C1 affichée pour être recopiée, C2 chiffrée vers le cloud, part TIERS chiffrée pour le partenaire. Puis elle est **effacée** de l'app.

**Authentification et signature**
1. Le client prépare un envoi ; l'app affiche un **résumé clair** (montant, destinataire, frais).
2. Le client s'authentifie par passkey (biométrie). Le défi WebAuthn est **lié à cette transaction précise** (empreinte de la PSBT) : la biométrie approuve exactement ce paiement, pas une session ouverte. L'app signe avec la clé téléphone.
3. Le cosignataire Swissquote vérifie l'assertion passkey (défi à usage unique, valable 2 minutes, empreinte de la PSBT identique) et applique les règles :
   - **Palier 1** (sous le plafond quotidien) : cosignature immédiate.
   - **Palier 2** (au-dessus) : délai + notification hors bande, annulable.
   - **Adresse sanctionnée** : refus.
4. Transaction finalisée et diffusée ; lien vers l'explorateur.

**Perte du téléphone**
1. Nouvel appareil ; le client saisit C1 ou déchiffre C2.
2. Il ouvre une récupération chez Swissquote et demande la part TIERS au partenaire. Les deux appliquent vérification d'identité, **délai** et **notifications** (le client peut annuler depuis son ancien téléphone s'il l'a encore).
3. La part du partenaire arrive chiffrée pour l'appareil ; la clé de secours est reconstituée **sur l'appareil uniquement**.
4. Clé de secours + Swissquote signent le **transfert vers un nouveau jeu de clés** (nouvelle clé téléphone, nouvelle clé de secours re-découpée). Les anciennes clés et parts ne protègent plus rien.
5. **Continuité bancaire** (mockée) : pendant le délai, le client garde un accès plafonné via son compte Swissquote.

**Swissquote a disparu**
1. Le client a toujours son téléphone, C1 ou C2, et le partenaire.
2. Clé téléphone + clé de secours signent seules ; la transaction est diffusée directement sur le réseau.
3. **Kit de sortie** : le descripteur standard, importable dans un wallet du marché.

### 3.5 Scénarios de démo

1. **Usage normal** : création, petit envoi immédiat, vrai txid sur signet.
2. **Gros montant** : palier 2, notification, délai visible.
3. **Attaques refusées** (en direct, avec la raison) :
   - voleur avec le téléphone déverrouillé qui tente de tout vider → palier 2, le client annule ;
   - attaquant avec le **téléphone et l'e-mail** qui lance une récupération → il n'a ni C1 ni C2, la clé de secours ne se reconstitue pas → **refus** (bonus du brief) ;
   - Swissquote + partenaire qui tentent de restaurer la clé de secours → combinaison SLIP-39 rejetée.
4. **Téléphone perdu** : récupération complète, transfert vers un nouveau jeu de clés.
5. **Swissquote a disparu** : services Swissquote arrêtés en direct, sortie avec téléphone + clé de secours.

---

## 4. Modèle de menaces

**Réponses directes aux questions du brief**

| Question | Réponse |
|---|---|
| Swissquote seul peut-il déplacer les fonds ? | Non : 1 clé sur 3 (I1) |
| Swissquote + un partenaire ? | Non : clé Swissquote + part TIERS ne reconstituent pas la clé de secours (I2) |
| Swissquote peut-il bloquer le client ? | Non : téléphone + clé de secours suffisent (I3). Il peut refuser de cosigner, ce qui retarde mais ne bloque pas |
| Où la seed est-elle réassemblée ? | Les clés de signature ne le sont jamais (multisig). Seule la clé de secours l'est, sur l'appareil du client, puis abandonnée (I5) |

**Tableau des menaces**

| Menace | Ce que l'attaquant obtient | Ce qui l'arrête |
|---|---|---|
| Téléphone volé (verrouillé) | Rien d'utilisable | Clé chiffrée, déverrouillage par passkey biométrique |
| Téléphone volé et déverrouillé, ou malware | Clé téléphone | Swissquote cosigne seulement sous le plafond ; au-dessus, délai + notification ; le client fait geler le cosignataire |
| E-mail piraté | Notifications | Aucune clé ; notifications sur plusieurs canaux |
| **Téléphone + e-mail** | Clé téléphone, notifications | La récupération exige une part CLIENT (C1 ou C2) qu'il n'a pas ; dépenses limitées au plafond |
| Vol du papier C1 | Part CLIENT | Il faut aussi le partenaire (identité + délai + notification) et Swissquote |
| Vol du papier + téléphone | Clé téléphone + part CLIENT | Partenaire : identité, délai, notification au client ; annulation possible. Risque résiduel documenté |
| Compte cloud compromis (C2) | Copie chiffrée | Inutile sans la passkey ou la phrase de passe, et il faut le partenaire |
| Faux document d'identité | Passage du KYC | Ne donne qu'une approbation ; il manque une part CLIENT |
| Employé Swissquote malhonnête | Clé Swissquote | 1 clé sur 3 ; aucune part de la clé de secours |
| Employé Swissquote + vol du papier | Clé Swissquote + part CLIENT | Il manque la part TIERS (c'est pourquoi Swissquote n'a pas de part) |
| Swissquote + partenaire (collusion ou décision de justice) | Clé Swissquote + part TIERS | Il manque la part CLIENT |
| Partenaire en faillite | Part TIERS perdue | Usage quotidien inchangé ; second partenaire en production ; re-découpage de la clé de secours |
| Swissquote disparu | Plus de cosignataire | Téléphone + clé de secours, kit de sortie |
| Voleur du téléphone qui annule une récupération légitime | Blocage temporaire | Récupération relancée en revue manuelle (identité renforcée) ; documenté |
| Récupérations répétées (déni de service) | Notifications en boucle | Une récupération active à la fois, délai avant relance |
| Client qui perd téléphone, C1 et C2 | — | Fonds perdus : c'est le prix pour que personne d'autre ne puisse les prendre. Rappels annuels de vérification de C1 |
| Interface de signature compromise | Transaction malveillante présentée au client | Résumé clair, le cosignataire vérifie destinataire et montant indépendamment de l'app |
| Analyse de la chaîne | Le multisig est visible lors d'une dépense | Pas de donnée personnelle on-chain ; Taproot/MuSig2 en production pour masquer le script |

---

## 5. Difficultés et solutions

### 5.1 Aucune règle on-chain en Bitcoin
- **Difficulté :** Bitcoin ne permet pas de plafond ou de délai programmable comme un smart contract.
- **Solution :** les règles sont appliquées par le cosignataire Swissquote. La banque est de confiance pour les **délais**, jamais pour les **fonds** : elle peut refuser, pas signer seule. Le dire clairement.

### 5.2 La passkey, la Secure Enclave et la clé Bitcoin
- **Une passkey, c'est déjà la puce sécurisée.** Avec WebAuthn, le navigateur fait générer la clé dans la puce de l'appareil : Secure Enclave (iPhone, Mac), TEE ou StrongBox (Android), TPM via Windows Hello (PC). La clé privée n'en sort jamais. Accéder directement à la Secure Enclave demanderait une app iOS native : impossible depuis une web app et inutile en 24 h.
- **Difficulté :** la puce ne gère que P-256, alors que Bitcoin utilise secp256k1. La clé Bitcoin du téléphone ne peut donc pas vivre dans la puce (même problème chez Bitkey).
- **Solution au hackathon :** la passkey **authentifie** le client auprès du cosignataire Swissquote, avec un défi lié à chaque transaction ; la clé Bitcoin du téléphone est chiffrée par une clé WebCrypto non exportable, stockée dans le navigateur.
- **En production :** app native ; la clé Bitcoin est chiffrée par une clé P-256 de la Secure Enclave (ou dérivée de la passkey via l'extension PRF).
- **Limites à dire :** les passkeys iCloud Keychain sont synchronisées (chiffrées de bout en bout), donc pas strictement liées à un appareil ; l'extension PRF n'est pas disponible partout, elle reste facultative.
- **Démo :** sur ordinateur (Windows Hello ou Touch ID, en affichage téléphone), qui marche sur `localhost` sans configuration. Un vrai téléphone demande HTTPS et un domaine correspondant à la passkey : trop risqué le jour J. Filet de sécurité : l'authentificateur virtuel de Chrome (F12 → menu WebAuthn).

### 5.3 Où la clé de secours est-elle reconstituée ?
- **Difficulté :** c'est la question piège du brief sur le split backup.
- **Solution :** uniquement sur l'appareil du client ; la part du partenaire est chiffrée pour une clé éphémère de cet appareil ; transfert immédiat vers un nouveau jeu de clés.

### 5.4 Révocation d'une clé perdue
- **Difficulté :** une clé ou une part ne se révoque pas.
- **Solution :** comme Bitkey, la récupération transfère les fonds vers un **nouveau** descripteur ; l'ancienne clé ne contrôle plus rien.

### 5.5 Un délai de 7 jours est impossible à démontrer
- **Solution :** délai configurable par variable d'environnement (2 à 3 min en démo), valeur de production affichée.

### 5.6 Bibliothèque SLIP-39 en JavaScript
- **Difficulté :** les bibliothèques JS sont moins éprouvées que la référence Python de Trezor.
- **Solution :** porte d'entrée au spike : vecteurs officiels + interop avec la référence Python. Sinon, la référence Python dans les services.

### 5.7 Temps et infrastructure
- **Solution :** regtest (Docker) pour développer vite, signet pour les preuves publiques ; une vraie transaction signet dans les 3 premières heures ; vidéo de secours.

### 5.8 L'argument juridique reste une hypothèse
- **Solution :** présenter « Swissquote ne peut pas déplacer les fonds, seul ou avec le partenaire » comme une hypothèse de conception à faire valider par un avocat suisse.

### 5.9 UX pour un client retail
- **Solution :** pas de seed à noter au quotidien ; une seule mnémonique (C1) à ranger, avec une copie chiffrée automatique (C2) ; vocabulaire simple ; rappels annuels.

---

## 6. Différenciation

1. **Démo d'attaques refusées**, dont l'attaquant téléphone + e-mail (crédit bonus explicite du brief).
2. **« Swissquote a disparu » montré en direct** : on arrête le service et le client sort quand même.
3. **Invariants de custody testés automatiquement** (I1 à I7) : le modèle de menaces est exécutable.
4. **Continuité bancaire** pendant le délai de récupération (mockée) : seul un acteur bancaire peut l'offrir.
5. **Split backup utilisé là où il est sûr** : on répond aux deux questions pièges du brief au lieu de les subir.

---

## 7. Périmètre

**À construire (réel)**
- Descripteur 2 sur 3, PSBT, signatures, diffusion sur signet.
- Sauvegarde SLIP-39 à groupes, chiffrement des parts, reconstitution sur l'appareil.
- Web app mobile : création, envoi, récupération, kit de sortie, panneau de démo.
- Passkeys (enregistrement et authentification).
- Règles du cosignataire (paliers, délai, sanctions) et délais de récupération.

**Mocké et étiqueté**
- Service Swissquote (KYC, cosignataire, registre des wallets, notifications) : processus séparé, stockage propre, clé en fichier local.
- Service partenaire (part TIERS, contrôle d'identité) : processus séparé, stockage propre.
- Liste de sanctions (échantillon), continuité bancaire, stockage cloud de C2.

**Bonus (si le cœur est stable)**
- Frais sponsorisés par Swissquote (équivalent Bitcoin du « sans gas »).
- Interaction conforme : résumé clair, sanctions, contrôle renforcé au-dessus d'un seuil.
- Preuve de propriété BIP-322.

---

## 8. Du prototype à la production

| Sujet | Démontré au hackathon | Mocké ou simplifié | Requis en production |
|---|---|---|---|
| Multisig | 2 sur 3 P2WSH sur signet | Une seule chaîne | Taproot (MuSig2 ou script), audit, politique de frais |
| Clé Swissquote | Service mocké | Clé en fichier local | HSM ou enclave, double contrôle, journalisation |
| Règles de cosignature | Paliers, délai, sanctions | Liste de sanctions partielle | Fournisseur de conformité, analyse de chaîne |
| Partenaire | Service mocké | Contrôle d'identité simulé | Contrat, deux partenaires indépendants, SLA, réversibilité |
| Contrôle d'identité | Écran simulé | Pas de vrai KYC | KYC renforcé, détection de deepfakes, formation du support |
| Délais | 2 à 3 minutes | Raccourcis | 7 jours pour la récupération, notifications multicanal |
| Passkey | WebAuthn de la plateforme (Secure Enclave, TPM via Windows Hello), défi lié à chaque transaction | Démo sur ordinateur ; passkeys synchronisées acceptées | App native ; politique différente pour les passkeys synchronisées |
| Clé téléphone | Navigateur, chiffrée par une clé WebCrypto non exportable | Web app | App native, clé chiffrée par la Secure Enclave ou dérivée par PRF |
| C2 (cloud) | Fichier simulé | Pas de vrai cloud | iCloud / Google Drive, chiffrement par passkey (PRF) |
| Juridique | Hypothèse de non-garde | Aucune validation | Avis d'un avocat suisse (FINMA, LBA, Travel Rule) |
| Continuité bancaire | Écran simulé | Pas de lien avec un compte | Intégration compte et carte |

---

## 9. Business, juridique et Travel Rule

**Valeur pour Swissquote (hypothèses à étiqueter)**
- **Rétention** : le client qui veut la self-custody reste dans l'écosystème au lieu de retirer vers un wallet externe.
- **Revenus** : abonnement « garde collaborative » (référence marché : Casa, Unchained facturent ce service), frais de cosignature au-delà d'un quota, achats et ventes depuis le compte vers le wallet en un geste.
- **Coûts** : moins de support pour fonds perdus ; KYC déjà fait.
- **Acquisition** : self-custody avec filet de sécurité bancaire, argument pour les détenteurs de BTC prudents.

**Juridique (hypothèse, à valider par un juriste)**
- Swissquote détient 1 clé sur 3 et aucune part de la clé de secours : il ne peut déplacer les fonds ni seul, ni avec le partenaire. Le design évite la zone grise citée par le brief.
- Le partenaire détient une part qui, seule ou avec la clé Swissquote, ne permet rien.
- Points à valider : qualification du cosignataire (simple « logiciel » ou prestataire LBA), responsabilité en cas de récupération frauduleuse, contrat avec le partenaire.

**Travel Rule**
- **Wallet Swissquote ↔ compte Swissquote** : Swissquote a co-créé le descripteur et détient une des clés : la propriété est vérifiée automatiquement, sans démarche du client.
- **Preuve vers un tiers** : signature de message BIP-322 par le client.
- **Paiement du client vers un tiers** : Swissquote cosigne mais n'initie pas et ne détient pas les fonds. Est-il l'institution émettrice ? Question à poser au juriste ; notre lecture : non, mais le cosignataire peut transmettre les informations Travel Rule si la réponse est oui.

---

## 10. Décisions et spike de départ

Le registre complet est dans `swissquote-wallet/docs/03-decisions.md`. Résumé : D3 multisig 2 sur 3, D4 passkey pour l'authentification, D5 signet + regtest, D6 clé de secours SLIP-39 à groupes, D7 délais, D8 règles du cosignataire, D17 MPC écarté, D18 smart account en option, D19 Swissquote sans part de la clé de secours, D20 web app, D21 suivi dans `docs/09-plan-de-build.md`.

**Spike H0–H3**
1. Descripteur 2 sur 3 + PSBT signée par la clé téléphone et le service Swissquote, broadcast regtest puis signet.
2. SLIP-39 : vecteurs officiels + interop Python + test I2.
3. Passkey contre le service Swissquote ; test de l'extension PRF.

---

## 11. Points ouverts

- **Partenaire réel** : qui (fiduciaire, notaire, autre banque) ? Coût, contrat, deux partenaires ?
- **Durée du délai** : fixe (7 jours) ou selon le montant ?
- **Annulation par un voleur du téléphone** : quel processus de revue manuelle ?
- **Perte de tous les facteurs** : faut-il un chemin de dernier recours (timelock Miniscript à très long terme, modèle Liana), au prix d'une zone grise ?
- **Taproot / MuSig2** pour la confidentialité et les frais.
- **Actifs EVM** (USDC) : réutiliser les mêmes trois clés comme owners d'un Safe 2 sur 3 ?
- **Qualification juridique** du cosignataire et Travel Rule pour les paiements à des tiers.
- **Modèle de revenus** : abonnement, frais, ou inclus dans un palier premium ?

---

## 12. Répartition à 3 et priorités

Rôles : **A** = cœur Bitcoin et récupération (`packages/core`) ; **B** = web app et passkeys (`apps/web`) ; **C** = services mockés, docs, schéma d'architecture, pitch.

Le planning heure par heure et les tâches cochables sont dans `swissquote-wallet/docs/09-plan-de-build.md`.

| Priorité | Fonctionnalité | Responsable |
|---|---|---|
| P0 | Spike : vraie tx signet 2 sur 3, SLIP-39 validé, passkey | A + B + C |
| P0 | Création → envoi de bout en bout | A + B |
| P1 | Récupération (perte du téléphone) et sortie sans Swissquote | A + C |
| P1 | Règles du cosignataire (paliers, délai) | C |
| P1 | Panneau de démo avec les 3 attaques | B |
| P2 | Schéma d'architecture, menaces, juridique, Travel Rule, business | C |
| P3 | Bonus : frais sponsorisés, résumé clair, sanctions, BIP-322 | A + B |

Règles : P0 et P1 terminés avant toute P3 ; points d'étape à H10, H20, H26 ; gel du code à H30.

---

## 13. Correspondance avec le barème

| Critère | Points | Ce qui le couvre |
|---|---|---|
| Implémentation technique | 35 | Histoire complète sur signet, code propre, tests des invariants, e2e regtest |
| Sécurité et custody | 20 | Modèle 2 sur 3 argumenté, menaces, attaques refusées, collusion Swissquote + partenaire impossible |
| Juridique | 15 | Non-garde argumentée, Travel Rule automatique, points à valider |
| Business | 15 | Rétention, abonnement, coûts, continuité bancaire |
| UX et pitch | 15 | Pas de seed au quotidien, parcours guidé, démo en scénarios |
| Bonus | 20 | Frais sponsorisés, résumé clair + sanctions + contrôle renforcé |

---

## 14. Questions probables du jury

- Swissquote peut-il déplacer les fonds, seul ou avec le partenaire ? → Non (section 4, I1–I2).
- Où la seed est-elle réassemblée ? → Jamais pour signer ; la clé de secours seulement sur l'appareil du client, puis abandonnée (3.3, 5.3).
- Et si Swissquote disparaît ? → Téléphone + clé de secours, démontré en direct (3.4).
- Que peut faire un voleur avec le téléphone et l'e-mail ? → Dépenser sous le plafond au plus ; la récupération est refusée (section 4).
- Pourquoi pas MPC ? Pourquoi pas un smart account ? → Section 2.4.
- Comment la Travel Rule est-elle gérée ? → Section 9.
- Les règles sont-elles vraiment appliquées si elles sont sur le serveur ? → La banque peut refuser, jamais signer seule (5.1).
- Qu'est-ce qui est réel et qu'est-ce qui est mocké ? → Sections 7 et 8.
- Comment Swissquote gagne de l'argent ? → Section 9.

---

## 15. Précédents : projets proches et leçons

| Projet | Approche | Ce qu'on en retient |
|---|---|---|
| **Bitkey** (Block) | Multisig 2 sur 3 : clé app, clé matérielle, clé serveur (enclave). Plafond sans matériel. Récupération « Delay + Notify » de 7 jours, puis transfert vers un nouveau jeu de clés. Kit de sortie si Block disparaît | Notre modèle de référence : délai + notification, transfert, kit de sortie |
| **Casa, Unchained, Nunchuk** | Garde collaborative multisig : le client détient 2 clés, le prestataire 1 | Modèle économique (abonnement) et argument de non-garde |
| **Ledger Recover** (2023) | Seed découpée en 3 parts (Ledger, Coincover, EscrowTech), récupération par vérification d'identité | Contre-exemple : collusion possible entre prestataires, seed qui quitte l'appareil |
| **Liana** (Wizardsardine) | Miniscript avec chemin de récupération après timelock | Piste pour le « dernier recours » (point ouvert) |
| Argent | Gardiens, délai, faille de 2020 (zéro gardien, déni de service) | Une récupération à la fois, délai avant relance |
| Guardian Vault | Prêt d'urgence pendant le délai | Base de la continuité bancaire |

---

## 16. Références techniques

- **Bibliothèques** : `bitcoinjs-lib` (PSBT, p2wsh/p2ms), `bip32`, `ecpair`, `@bitcoinerlab/secp256k1` ; SLIP-39 : `shamir-mnemonic-ts` ou `slip39` (ilap), à valider par les vecteurs officiels ; référence Python `shamir-mnemonic` (Trezor) ; `@simplewebauthn/browser` et `/server` ; WebCrypto (ECDH P-256 + AES-GCM).
- **Signet** : API `https://mempool.space/signet/api` (`GET /address/:a/utxo`, `POST /tx` en `text/plain`, `GET /tx/:id/status`, `GET /v1/fees/recommended`) ; faucet `https://bitcoinsignetfaucet.com` (1 000 à 10 000 sats, 5 demandes par 24 h).
- **Regtest** : Nigiri (Docker : bitcoind + esplora), même API que mempool.space.
- **SLIP-39** : spec `https://github.com/satoshilabs/slips/blob/master/slip-0039.md` ; groupes à deux niveaux ; un groupe de seuil 1 doit avoir une seule part.
- Détails dans `swissquote-wallet/docs/08-references-techniques.md`.

---

## 17. Connecteurs, outils et règles de travail

- **Exa** : recherche de bibliothèques et de documentation. **Figma** : schéma d'architecture (FigJam). **Claude in Chrome** : parcours de la web app et GIF de secours. **mempool.space** : vérification des transactions. Etherscan n'est plus utile au cœur du projet.
- **Skills de projet** dans `swissquote-wallet/.claude/skills/` : `custody-invariants`, `btc-multisig`, `slip39-backup`, `mock-service`, `demo-run`, `doc-sync`.
- Règles : aucune cryptographie maison ; mocks étiquetés ; create → sign → recover avant tout bonus ; chaque comportement de chaîne se vérifie par un test ; le juridique est une hypothèse ; ne pas affirmer que le prototype est prêt pour la production.

---

## 18. Sources

- Brief du Swissquote Wallet Prize (hackathon BSA, DoraHacks), version complète du 10 octobre 2026.
- Bitkey : https://bitkey.world/learning-hub/how-bitkey-works et https://support.bitkey.world (Delay + Notify).
- SLIP-39 : https://github.com/satoshilabs/slips/blob/master/slip-0039.md
- Zodiac, comparaison smart custody / MPC : https://www.zodiac.eco/vs/mpc (page commerciale).
- Synthèses FINMA, PwC, SW Legal sur la qualification de la garde (recherche du 10 octobre 2026, hypothèses).
