# Swissquote Self-Custody Wallet — Document de conception (version finale)

> Hackathon BSA — Swissquote Wallet Prize. Équipe de 3, durée 33 h.
> Ce fichier regroupe tout le contexte : problème, solution, menaces, décisions, différenciation, chemin vers la production, répartition des tâches, précédents et références techniques.
> Dernière mise à jour : 10 octobre 2026. Statuts utilisés : **Décidé**, **Proposé** (à confirmer), **À valider** (dépend d'un test ou d'un avis externe).

---

## Sommaire

1. Rappel du sujet
2. Le problème
3. La solution proposée
4. Modèle de menaces
5. Difficultés et solutions
6. Différenciation
7. Périmètre
8. Du prototype à la production
9. Business et légal
10. Registre des décisions et spike de départ
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

Swissquote veut un wallet self-custody que la banque pourrait réellement lancer pour ses clients : **leurs clés, leur contrôle**, tout en restant **à un pas de leur compte Swissquote**, avec la sécurité, la simplicité et la conformité attendues d'une banque suisse. Swissquote veut porter le projet gagnant en production.

**Le prototype doit démontrer le cycle de vie complet :** création du wallet → authentification → signature de transaction → perte d'accès → récupération.

**Minimum exigé :** signer et envoyer une vraie transaction sur une blockchain (testnet accepté).

**Exigences de conception :**
- Un modèle de custody clair et défendu.
- Un modèle de menaces crédible.
- Une architecture qui dit où vivent les clés ou parts de clés.
- Une récupération qui protège l'utilisateur légitime sans offrir de chemin facile à un attaquant et sans donner à Swissquote un contrôle involontaire sur les fonds.
- Pas de cryptographie maison : bibliothèques et SDK établis.
- Ce qui ne peut pas être construit (infrastructure bancaire, fournisseurs de conformité, serveurs de parts de clés) peut être mocké si c'est documenté.

**Barème :**

| Critère | Points |
|---|---|
| Implémentation technique | 35 |
| Sécurité et design de la custody | 20 |
| Faisabilité légale | 15 |
| Business case | 15 |
| UX et pitch | 15 |
| Bonus (gasless, interaction dApp conforme) | jusqu'à 20 |

Les bonus ne comptent que si le parcours de base création → signature → récupération fonctionne de bout en bout.

**Autres points valorisés par le brief :** un flux de récupération qui distingue l'utilisateur légitime d'un attaquant ayant compromis le téléphone ou l'e-mail, un business case solide pour Swissquote, et un traitement techniquement crédible des questions réglementaires suisses (garde, vérification de la propriété du wallet).

**Parcours écarté :** Belem Capital (risque de dépendances DeFi). Le parcours Swissquote est plus réaliste en 33 h à 3, et son barème récompense la sécurité, le juridique et le pitch.

---

## 2. Le problème

### 2.1 Situation actuelle

Un client qui veut la self-custody doit retirer ses actifs vers un wallet externe et quitte l'écosystème Swissquote. Les options de récupération disponibles aujourd'hui sont mauvaises :

- **Seed phrase** : perdue, tout est perdu ; mal conservée, elle est volée.
- **Récupération par e-mail ou SMS** : un attaquant qui contrôle le téléphone ou l'e-mail peut tout récupérer.
- **Seed complète conservée par la banque** : la banque détient alors la clé, donc ce n'est plus de la self-custody.

### 2.2 Énoncé du problème

> Comment un client peut-il garder le contrôle de ses clés et rester à un pas de sa banque, sans que ni un attaquant ni Swissquote ne puisse déplacer les fonds seul ?

### 2.3 Les deux adversaires

1. **L'attaquant externe** : téléphone volé, e-mail piraté, faux documents d'identité, ingénierie sociale, appareil compromis à l'achat.
2. **La banque elle-même** (ou un de ses employés, ou un attaquant qui la compromet) : elle ne doit pas pouvoir agir seule, pour des raisons de sécurité et de qualification légale (dépositaire ou non).

### 2.4 Pourquoi la seed phrase en coffre n'est pas retenue (décision D2)

- Contraire au brief : contrôle involontaire de la banque sur les fonds.
- Risque de qualification en garde de crypto-actifs (à valider par un juriste).
- Point de défaillance unique : une fuite ou un employé malhonnête expose tous les clients.
- Une vérification d'identité seule est attaquable (faux documents, deepfakes, ingénierie sociale du support).
- Une seed ne se révoque pas et ne se limite pas en montant.

À présenter dans le modèle de menaces comme l'**option écartée**, avec ces raisons.

### 2.5 Pourquoi pas le MPC (décision D17)

Le MPC découpe la clé en parts et confie les règles à un serveur du fournisseur. Notre approche (« smart custody ») inscrit les règles dans le smart account. Comparaison faite à partir de la page de Zodiac (https://www.zodiac.eco/vs/mpc), une page commerciale : on reprend ses arguments vérifiables, pas ses affirmations de supériorité.

**Pourquoi la smart custody convient mieux à une banque suisse**
- **Argument juridique** : avec un MPC où Swissquote détient une part et cosigne chaque transaction, la banque participe à chaque mouvement de fonds, ce qui se rapproche d'une garde ou d'un co-contrôle. Ici, Swissquote n'est qu'un gardien de récupération borné par le code (hypothèse de non-garde, section 9).
- **Vérifiabilité** : les règles sont lisibles on-chain par un auditeur, la FINMA ou le client. Avec le MPC, elles sont dans la configuration d'un serveur.
- **Sortie du fournisseur** : si Swissquote arrête le service ou si le client part, le compte continue de fonctionner. Avec le MPC, la signature dépend du fournisseur.
- **Règles sur la transaction, pas seulement sur la clé** : un voleur du téléphone reste borné par les plafonds.
- **Compatibilité HSM** : la clé du gardien Swissquote peut vivre dans un HSM (section 8).
- **Pas de cryptographie maison** : briques auditées (Safe). Le MPC a lui aussi connu des failles d'implémentation (ex. BitForge, Fireblocks, 2023).

**Limites assumées**
- **EVM uniquement** : pas de Bitcoin natif, alors qu'une grande part des avoirs crypto des clients Swissquote est en BTC. Point ouvert (section 11).
- **Transparence on-chain** : plafonds et gardiens sont publics, ce qui pose un problème de confidentialité (section 4).
- **Risque de smart contract** : un bug touche tous les comptes ; notre module n'est pas audité (5.13).
- **Contrôle des sanctions** : un serveur MPC peut filtrer avant de cosigner ; on-chain, seulement une liste autorisée ou un oracle.
- **Le smart account ne protège pas de la signature aveugle.** Le hack Bybit (février 2025) visait un multisig Safe via son interface compromise. Sans règles qui bornent l'action, rien ne l'aurait arrêté : la simulation avant signature (D12) et les plafonds (D8) sont indispensables.
- **Le produit Zodiac ne suffit pas** : Zodiac Roles ne borne pas les propriétaires du Safe (5.12). On reprend le principe, pas le module.

**Position** : smart custody pour le hackathon et pour les actifs EVM. En production, une solution hybride est probable : autre solution pour le BTC natif (MPC ou multisig Bitcoin, avec un argument de non-garde à retravailler), et MPC ou HSM en interne pour protéger la clé du gardien Swissquote.

---

## 3. La solution proposée

### 3.1 Principe

**Un wallet où les règles sont dans le contrat.** La sécurité ne repose pas seulement sur la protection de la clé, mais sur ce que le compte accepte d'exécuter. Un téléphone volé ou une application compromise ne peut pas dépasser les limites inscrites dans le smart account.

Inspiration : l'approche « smart custody » de Zodiac (politiques appliquées on-chain, pas par un serveur). Cette source est une page commerciale qui se compare à ses concurrents ; on reprend le principe, pas ses affirmations de supériorité.

**Phrase de positionnement :** « Une récupération de wallet où la banque est un gardien borné, dont chaque action est vérifiable en chaîne, et que nous avons attaqué en direct pour le prouver. »

### 3.2 Architecture générale

- **Compte** (D3, proposé) : smart account ERC-4337, Safe 1.4.1 avec Safe4337Module, EntryPoint v0.7, sur **Base Sepolia** (id 84532, D5).
- **Signature** (D4) : passkey WebAuthn (P-256) liée à l'appareil, jamais exportée. Vérification via le précompile P-256 de la chaîne s'il est présent, sinon via un vérifieur Solidity existant (Daimo ou FCL). **À valider par une vraie UserOperation** sur la chaîne cible.
- **Règles on-chain** (D8) : petit module ou garde maison, écrit par Opus et testé avec Foundry. Plafonds par paliers de montant, liste de destinataires ou dApps approuvés, délai (timelock) sur les gros montants, asymétrie durcir immédiatement / assouplir avec délai.
- **Récupération** (D6, D7) : 2 gardiens sur 3 + délai de sécurité. Délai configurable : 3 minutes en démo, 24 h minimum en réel.
- **Veto indépendant** (D9) : clé de veto enregistrée à l'avance sur un second appareil. Elle peut geler le compte ou annuler une récupération, mais jamais déplacer des fonds.
- **Garde-fous de récupération** (D10) : au moins un gardien obligatoire, une seule récupération active à la fois, délai avant d'en relancer une, gel d'urgence par un gardien.
- **Gasless** (bonus, D11) : paymaster qui sponsorise certaines opérations (envoi d'USDC).
- **Serveur « Swissquote »** : mocké. Il joue le rôle d'un gardien et envoie des alertes hors bande (espace client). Il ne détient jamais seul le pouvoir de déplacer des fonds.

### 3.3 Où vivent les clés

| Élément | Emplacement | Qui peut s'en servir |
|---|---|---|
| Passkey principale | Appareil du client (enclave sécurisée) | Le client |
| Passkey de secours / clé de veto | Second appareil du client | Le client |
| Gardien 1 | Swissquote (après vérification d'identité forte, hors téléphone et e-mail) | Swissquote, jamais seul |
| Gardien 2 | Second appareil / seconde passkey du client | Le client |
| Gardien 3 (optionnel) | Contact de confiance | Le contact, jamais seul |

Swissquote n'a **jamais** la clé complète et ne peut ni déplacer les fonds ni imposer une clé à lui seul.

### 3.4 Cycle de vie

**Création**
1. Le client s'authentifie dans l'app Swissquote.
2. Création de la passkey sur l'appareil et déploiement du smart account (déploiement contrefactuel).
3. Enregistrement des gardiens (au moins un) et de la clé de veto sur un second appareil.
4. Règles par défaut : plafonds par paliers, délais.

**Authentification et signature**
1. Le client déclenche une transaction.
2. Les règles on-chain vérifient destinataire, montant, plafond.
3. Palier 1 (petit montant, adresse autorisée) : exécution immédiate avec la passkey. Palier 2 : délai avec notification. Palier 3 : délai long, avec possibilité de veto. Les seuils sont des paramètres du contrat, pas des chiffres figés.
4. Avant la signature, l'app affiche une simulation et un avertissement (destinataire inconnu, montant inhabituel).

**Perte d'accès et récupération**
1. Le client déclare la perte et propose une nouvelle passkey.
2. Approbation de 2 gardiens sur 3. Swissquote ne donne sa part qu'après vérification d'identité forte. La récupération ne peut qu'**ajouter ou remplacer une clé**, jamais déplacer des fonds.
3. Délai de sécurité avant l'entrée en vigueur de la nouvelle clé. Le client et ses gardiens sont notifiés par plusieurs canaux.
4. Pendant le délai, la clé de veto (second appareil) peut geler ou annuler la récupération. L'ancienne passkey ne peut pas annuler une récupération déjà approuvée par 2 gardiens (règle à valider lors du spike).
5. Les montants restent plafonnés pendant et juste après la récupération.
6. **Continuité bancaire** (extension, mockée) : pendant le délai, le client garde un accès plafonné via son compte bancaire Swissquote (fiat, carte).

### 3.5 Les scénarios de démo

1. **Usage normal** : créer le wallet, signer, envoyer une vraie transaction sur testnet.
2. **Attaques bloquées** (trois attaques rejouées en direct, visibles sur l'explorateur avec la raison du rejet) :
   - un voleur avec le téléphone tente un gros retrait ou un changement de règles ;
   - un attaquant avec téléphone et e-mail piratés tente une récupération ;
   - une banque ou un gardien malveillant tente d'agir seul.
3. **Perte du téléphone** : récupération complète avec gardiens, délai et veto.

---

## 4. Modèle de menaces

| Menace | Ce que l'attaquant obtient | Ce qui l'arrête |
|---|---|---|
| Téléphone volé | Accès à la passkey (selon verrouillage) | Plafonds par paliers, liste autorisée, délai sur gros montants |
| E-mail piraté | Notifications et liens de récupération | 2 gardiens sur 3, clé de veto sur un autre appareil |
| Téléphone et e-mail volés | Appareil et notifications | Clé de veto sur second appareil, alerte hors bande, délai |
| Faux document d'identité | Part du gardien Swissquote | Il faut un second gardien, plus le délai |
| Gardien malveillant (dont la banque) | Une part sur trois | Seuil 2 sur 3, plafonds, délai |
| Banque et un autre gardien compromis | Seuil atteint | Plafonds, délai de sécurité, veto du client |
| Compte cloud de la passkey compromis | Copie de la clé si passkey synchronisée | Passkey liée à l'appareil, passkey de secours |
| Changement de règles par un attaquant | Plafond relevé, adresse ajoutée | Assouplir = même délai et veto que les gros transferts |
| Abus du paymaster | Épuisement du budget de gaz | Sponsoring limité à certaines opérations et par compte |
| Annulation d'une récupération légitime par le voleur du téléphone | Blocage du client | L'ancienne passkey ne peut pas annuler une récupération approuvée par 2 gardiens ; seule la clé de veto le peut |
| Récupérations répétées (déni de service) | Compte bloqué en permanence | Une seule récupération active à la fois, délai avant d'en relancer une |
| Aucun gardien configuré | Récupération impossible ou détournée (faille historique d'Argent) | Au moins un gardien obligatoire à la création |
| Appareil compromis à l'achat (cas d'actualité Ledger, octobre 2026, d'après CoinDesk et Bitcoin.com ; **détail à relire avant de citer**) | Contrôle d'un appareil neuf | Ne pas dépendre d'un seul appareil non vérifié : second appareil, plafonds, délai |
| Analyse de la chaîne (confidentialité) | Plafonds, gardiens et adresse du gardien Swissquote publics : identification des clients Swissquote et de leurs avoirs (secret bancaire, nLPD) | En production : adresse de gardien distincte par client (dérivée côté HSM), pas de donnée personnelle on-chain |
| Interface de signature compromise (signature aveugle, type Bybit 2025) | Transaction malveillante signée par le client | Simulation avant signature (D12), plafonds et liste autorisée on-chain |
| Seed phrase en coffre (option écartée) | Banque détentrice de la clé | Option non retenue, voir 2.4 |
| MPC avec part détenue par la banque (option écartée) | Banque cosignataire de chaque transaction | Option non retenue, voir 2.5 |

---

## 5. Difficultés et solutions

### 5.1 Vérifier une passkey on-chain
- **Difficulté :** les passkeys signent en P-256, non supporté nativement par l'EVM. Tout réimplémenter serait long et risqué.
- **Solution :** module de passkey de Safe sur une chaîne supportant le précompile P-256, avec vérifieur Solidity (Daimo) en repli. Aucune cryptographie maison. **Validation :** une vraie UserOperation, car un `eth_call` statique peut donner de faux positifs sur testnet.

### 5.2 Un attaquant change les règles lui-même
- **Difficulté :** avec le téléphone, il relève le plafond ou ajoute sa propre adresse.
- **Solution :** asymétrie. Durcir est immédiat ; assouplir passe par le même délai et le même veto que les gros transferts.

### 5.3 Un délai de 24 h est impossible à démontrer
- **Difficulté :** le jury n'attendra pas un jour.
- **Solution :** délai configurable (3 minutes en démo, avec le module Candide de test). Dire explicitement que la valeur réelle serait de 24 h ou plus et montrer le paramètre dans le contrat.

### 5.4 Le canal de veto indépendant
- **Difficulté :** il rend la récupération crédible, et il est facile de le mocker naïvement. De plus, le module de récupération Candide ne permet l'annulation qu'au propriétaire du compte : un voleur de téléphone pourrait annuler une récupération légitime. Le « veto » ne peut donc pas reposer sur Candide.
- **Solution :** clé de veto sur un second appareil, vérifiée par le module maison, qui peut geler ou annuler mais jamais déplacer des fonds. Le serveur mocké « Swissquote » envoie en plus une alerte hors bande. Documenter clairement ce qui est mocké. Idée proche : les « watch towers » du projet TAR (en plus simple).

### 5.5 Swissquote comme point de collusion
- **Difficulté :** une banque compromise ou manipulée ne doit pas suffire.
- **Solution :** seuil 2 sur 3, donc jamais seule. Refuser de signer est le seul « veto » de la banque. Documenter le cas « banque plus un autre gardien compromis » et ce qui le limite (plafonds, délai, clé de veto).

### 5.6 La passkey synchronisée dans le cloud
- **Difficulté :** voler le compte cloud du client donne la clé.
- **Solution :** proposer une passkey liée à l'appareil et une seconde passkey de secours. Documenter le compromis confort / sécurité. En production, règles différentes pour les passkeys synchronisées.

### 5.7 Le gasless peut vider le budget
- **Difficulté :** un paymaster qui paie tout est exploitable.
- **Solution :** ne sponsoriser que certaines opérations (envoi USDC) avec une limite par compte. Bonus : seulement si le cœur marche avant la 20e heure.

### 5.8 Temps et infrastructure fragile
- **Difficulté :** bundler, paymaster ou testnet en panne, faucet limité, récupération = morceau le plus long.
- **Solution :** une seule pile choisie dès le début, une transaction de bout en bout dans les 3 premières heures (spike), comptes préfinancés, vidéo de secours de la démo.

### 5.9 L'argument légal reste une hypothèse
- **Difficulté :** affirmer « Swissquote n'est pas dépositaire » sans le savoir peut décrédibiliser (15 pts).
- **Solution :** présenter comme hypothèse de conception (la banque ne peut pas déplacer seule les fonds). Lister ce qu'un juriste devrait valider. Ne pas affirmer une conformité non garantie.

### 5.10 Se différencier et chiffrer le business
- **Difficulté :** beaucoup d'équipes feront « smart account plus passkey plus gardiens », et de faux chiffres se détectent.
- **Solution :** voir la section 6. Business avec hypothèses étiquetées, pas de faux chiffres.

### 5.11 UX de la récupération pour un client retail
- **Difficulté :** demander de choisir des gardiens est une mauvaise UX.
- **Solution :** valeurs par défaut simples (Swissquote, second appareil, contact optionnel), parcours guidé en quelques écrans, vocabulaire non technique, vérification par emojis (approche d'Argent) pour confirmer une récupération.

### 5.12 Où vivent les plafonds
- **Difficulté :** Zodiac Roles borne les membres d'un rôle, pas les propriétaires du Safe. La passkey quotidienne étant propriétaire, elle ne serait pas bornée.
- **Solution (D8) :** petit module ou garde maison, écrit par Opus, avec plafonds par paliers. Tests Foundry obligatoires, fuzzing inclus. Fallback si le spike échoue ou dépasse 3 h : plafond annoncé seulement au niveau du contrat de récupération, et le dire.

### 5.13 Le contrat maison n'est pas audité
- **Difficulté :** un module écrit en quelques heures n'est pas prêt pour la production.
- **Solution :** garder son périmètre minimal (logique de règles uniquement, aucune cryptographie), le tester à fond, relire chaque fonction, faire une relecture croisée par un second modèle sur les fonctions sensibles, et présenter l'audit comme étape de production (section 8).

### 5.14 Récupérations répétées et cas sans gardien
- **Difficulté :** failles historiques d'Argent (audit OpenZeppelin, 2020) : zéro gardien et déni de service.
- **Solution (D10) :** au moins un gardien obligatoire, une seule récupération active à la fois, délai avant d'en relancer une, gel d'urgence.

---

## 6. Différenciation

Risque : la plupart des équipes arriveront à Safe + passkey + gardiens + paymaster. La technologie de base reste standard pour que le flux de bout en bout marche. La différenciation vient de ce que les autres traiteront en surface.

**Trois axes, par priorité :**

1. **Démo d'attaques qui échouent.** En plus du chemin heureux, trois attaques rejouées en direct et rejetées par le contrat (voir 3.5). Coût faible : les tests Foundry servent de base. Vise les 20 points de sécurité.
2. **Veto indépendant.** Comble une limite du module Candide (annulation réservée au propriétaire). Contribution de conception visible par un jury technique.
3. **Continuité bancaire.** Pendant le délai de récupération, accès plafonné via le compte bancaire (fiat, carte), mocké en démo. Aucune équipe de crypto purs ne peut le proposer. Pèse sur le business case et le pitch, à coupler avec le récit juridique (FINMA, LBA, KYC déjà réalisé par la banque).

**À éviter :** MPC, preuves ZK, multi-chaînes. Coût élevé, risque de casser le flux de bout en bout, et ce n'est pas ce que Swissquote cherche à mettre en production.

---

## 7. Périmètre

**À construire**
- Création du smart account et de la passkey.
- Signature et envoi d'une vraie transaction sur testnet.
- Règles on-chain (plafonds par paliers, liste autorisée, délai).
- Récupération par gardiens avec délai, garde-fous et clé de veto.
- Interface de démo des scénarios (dont les trois attaques bloquées).

**À mocker et documenter**
- KYC et vérification d'identité.
- Infrastructure bancaire et lien avec le compte Swissquote (dont la continuité bancaire).
- Serveur du gardien Swissquote et alertes hors bande.
- Fournisseur de conformité (sanctions).

**Bonus (si le cœur est stable)**
- Gasless sur l'envoi d'USDC.
- Liste de dApps approuvées, simulation de transaction, vérification renforcée pour les gros montants.

---

## 8. Du prototype à la production

L'architecture est de niveau production ; l'implémentation de 33 h ne l'est pas. À présenter tel quel au jury : il note la faisabilité juridique et le business case.

| Sujet | Démontré au hackathon | Mocké ou simplifié | Requis en production |
|---|---|---|---|
| Compte | Safe + ERC-4337 + passkey sur testnet | Une seule chaîne | Plusieurs chaînes, plan de migration des modules |
| Règles et plafonds | Module maison écrit par Opus, tests Foundry | Non audité | Audit externe, ou modules déjà audités (Safe, Rhinestone, Openfort) |
| Gardien Swissquote | Service mocké | Clé en clair côté mock, KYC simulé | Clé en HSM ou MPC, double contrôle, politique de signature, journalisation |
| Contrôle d'identité | Écran simulé | Pas de vrai KYC | KYC renforcé, détection de pièces falsifiées et de vidéos générées, formation du service client (vecteur d'ingénierie sociale) |
| Délai de récupération | 3 minutes | Raccourci pour la démo | 24 h minimum, notification sur plusieurs canaux |
| Veto | Clé de veto sur second appareil | Un seul canal | Canaux multiples, alertes, surveillance continue |
| Passkeys | Passkey WebAuthn | Passkeys synchronisées dans le cloud acceptées | Règles différentes pour les passkeys liées à l'appareil et celles synchronisées |
| Infrastructure | Bundler et paymaster de testnet | Fournisseur unique | Redondance, supervision, plan de repli, précompile P-256 confirmé sur la chaîne cible |
| Juridique | Hypothèse de non-garde | Aucune validation | Avis d'un avocat suisse sur la qualification (FINMA, LBA) selon la façon dont la récupération est réellement opérée |
| Continuité bancaire | Écran et plafond simulés | Pas de lien avec un vrai compte | Intégration avec le compte et la carte du client, limites et conformité |

---

## 9. Business et légal

**Valeur pour Swissquote (hypothèses à étiqueter comme telles)**
- Rétention : les clients ne quittent plus l'écosystème pour un wallet externe.
- Revenus : frais sur swaps et transferts, éventuel palier premium.
- Réduction des coûts : moins de support pour fonds perdus.
- Nouveaux clients attirés par la self-custody encadrée.
- Différenciation bancaire : la continuité pendant la récupération, que seuls un acteur avec un bilan et des comptes peuvent offrir.

**Légal (à valider par un juriste)**
- Hypothèse : Swissquote est un gardien parmi d'autres et ne peut jamais déplacer les fonds seul, donc ne détient pas la garde des actifs.
- Lecture des synthèses FINMA, PwC et SW Legal : sans contrôle des clés privées par le fournisseur, il est traité comme non-dépositaire (pas de licence bancaire, éventuellement soumis à la LBA). Ce sont des hypothèses, pas un avis.
- Points à faire valider : définition de la garde en droit suisse, vérification de la propriété du wallet, obligations de lutte contre le blanchiment, qualification selon la façon dont la récupération est opérée.
- Référence de comparaison : SwissBorg (MPC, MiCA) pour la garde dans l'UE.

---

## 10. Registre des décisions et spike de départ

| # | Sujet | Choix | Statut | Raison / condition |
|---|---|---|---|---|
| D1 | Parcours | Swissquote Wallet | Décidé | Plus réaliste en 33 h à 3 |
| D2 | Seed phrase en coffre | Rejetée | Décidé | Contrôle de la banque sur les fonds, point de défaillance unique |
| D3 | Type de compte | Safe 1.4.1 + Safe4337Module, EntryPoint v0.7 | Proposé | Briques éprouvées |
| D4 | Authentification | Passkey WebAuthn (P-256) | Proposé | Précompile ou vérifieur Solidity ; **à valider par une vraie UserOp** |
| D5 | Chaîne | Base Sepolia (84532) | Proposé | Candide, Safe passkeys, Zodiac, paymasters, Etherscan la couvrent |
| D6 | Récupération | 2 sur 3, Swissquote jamais seul | Proposé | Argument de non-garde, à valider par un juriste |
| D7 | Délai | 3 min en démo, 24 h minimum en réel | Proposé | Module Candide de 3 minutes pour les tests |
| D8 | Plafonds | Module maison, paliers de montant, écrit par Opus, tests Foundry et fuzzing | Proposé | Zodiac Roles ne borne pas les propriétaires ; fallback décrit en 5.12 |
| D9 | Veto | Clé de veto sur second appareil : gel ou annulation, jamais de déplacement de fonds | Proposé | L'annulation Candide est réservée au propriétaire |
| D10 | Garde-fous | Au moins un gardien, une récupération active à la fois, délai avant relance, gel d'urgence | Proposé | Failles historiques d'Argent |
| D11 | Gasless | Paymaster (Pimlico, Coinbase ou Circle), gas en USDC | Proposé | Seulement si le cœur marche |
| D12 | dApp conforme | Liste approuvée + simulation avant signature | Proposé | Priorité basse |
| D13 | Qui écrit le code | Contrats écrits par Opus, relus et expliqués par l'équipe | Décidé | Chaque règle doit être explicable au jury |
| D14 | Cryptographie | Aucune cryptographie maison | Décidé | Exigé par le brief |
| D15 | Différenciation | Démo d'attaques, veto indépendant, continuité bancaire, section « Du prototype à la production » | Proposé | Section 6 |
| D16 | Cadrage juridique | Hypothèse de non-garde | À valider | Section 9 |
| D17 | MPC | Rejeté au profit de la smart custody (règles on-chain) | Proposé | Argument de non-garde, vérifiabilité, sortie du fournisseur. Limites : EVM uniquement (BTC en point ouvert), confidentialité on-chain. Section 2.5 |

### Spike de départ (H0–H3)

À réaliser avant toute fonctionnalité :

1. Safe + passkey + une vraie transaction sur Base Sepolia.
2. Récupération Candide avec le module de 3 minutes, vers une nouvelle passkey.
3. Test d'un plafond appliqué à la passkey quotidienne (module maison, D8) et de la règle d'annulation (D9).
4. Si l'étape 3 échoue ou dépasse 3 h : bascule sur le fallback de 5.12.

---

## 11. Points ouverts (pistes d'évolution)

Décisions non tranchées, volontairement laissées ouvertes pour pouvoir faire évoluer la conception.

**Cryptographie et custody**
- **Passkey seule ou hybride MPC / part de clé ?** Faut-il à terme une part de clé côté banque, avec quel seuil ?
- **Gardiens : nombre et nature.** Passer de 2 sur 3 à un seuil configurable ? Autoriser un gardien institutionnel tiers (notaire, autre banque) ?
- **Rotation et révocation des gardiens** : comment remplacer un gardien sans ouvrir une brèche ?
- **Multi-chaînes** : étendre au-delà d'une chaîne EVM ?
- **Bitcoin natif** : la smart custody ne couvre pas le BTC, alors qu'une grande part des avoirs crypto des clients Swissquote est en BTC. Options : multisig Bitcoin avec délais (Miniscript), MPC, ou BTC wrappé (risque de contrepartie). Quel argument de non-garde dans chaque cas ? (voir 2.5)

**Récupération**
- **Durée du délai** : fixe, ou variable selon le montant et le niveau de risque ?
- **Veto** : au-delà de la clé de veto et de l'espace client, ajouter une confirmation hors bande (appel, courrier, agence) ?
- **Règle d'annulation** : que faire si le client perd à la fois son téléphone et son second appareil (donc la clé de veto) ?
- **Détection d'anomalies** : gel automatique sur comportement inhabituel (heure, destinataire, montant) ?
- **Que se passe-t-il si le client perd tous ses facteurs ?** Un chemin de dernier recours existe-t-il sans donner le contrôle à la banque ?
- **Liquidité d'urgence réelle** pendant le délai (prêt ou accès plafonné), au-delà du mock.

**Règles et conformité**
- **Liste de dApps et d'adresses approuvées** : qui la tient, comment est-elle mise à jour, est-elle on-chain ?
- **Sanctions et simulation** : où s'exécute le contrôle, et peut-il être contourné ?
- **Niveaux de risque par client** : plafonds différenciés (particulier, premium, professionnel).

**Produit et business**
- **Modèle de revenus** : frais à la transaction, abonnement, ou marge sur les swaps ?
- **Gasless** : qui finance le gaz à grande échelle, et sous quelles limites ?
- **Portabilité** : le client peut-il quitter Swissquote avec son wallet sans perdre ses règles ni sa récupération ?

**Légal et gouvernance**
- Qualification précise selon la juridiction (Suisse, UE) et l'évolution de la réglementation.
- Responsabilité en cas de récupération frauduleuse réussie : qui supporte la perte ?
- Audit externe des contrats avant toute mise en production.

---

## 12. Répartition à 3 et priorités

Rôles proposés (à ajuster selon les compétences réelles) :

- **Personne A — Contrats et sécurité on-chain** : smart account, module de règles, récupération. Contrats écrits par Opus ; A les relit et les explique.
- **Personne B — Front, passkey et intégration** : app de démo, passkeys, gasless, transactions.
- **Personne C — Menaces, légal, business, mocks et pitch** : documents, serveur mocké, démo et présentation.

### 12.1 Ordre de priorité des implémentations

| Priorité | Fonctionnalité | Responsable | Remarque |
|---|---|---|---|
| P0 | Spike H0–H3 : pile, Safe + passkey, vraie transaction, test récupération et plafond | A + B | Dans les 3 premières heures |
| P0 | Création du wallet avec passkey et signature d'une vraie transaction | A + B | Minimum exigé par le brief |
| P1 | Récupération par gardiens 2 sur 3 avec délai et garde-fous | A | Cœur de la différenciation |
| P1 | Serveur mocké « Swissquote » et alertes hors bande | C (avec A) | Rend la récupération crédible |
| P1 | Clé de veto sur second appareil | A | Axe de différenciation 2 |
| P1 | Interface des scénarios de démo, dont les trois attaques bloquées | B | Démo = 15 pts UX et pitch ; sécurité = 20 pts |
| P2 | Plafonds par paliers et liste de destinataires autorisés | A | Scénario « attaque bloquée » |
| P2 | Asymétrie durcir / assouplir et délai configurable | A | Réponse aux difficultés 5.2 et 5.3 |
| P2 | Modèle de menaces et section légale rédigés | C | 35 pts cumulés (sécurité plus légal) |
| P2 | Section « Du prototype à la production » | C | Axe de différenciation, section 8 |
| P3 | Continuité bancaire (mock) | B + C | Axe de différenciation 3 |
| P3 | Gasless sur USDC (paymaster limité) | B | Bonus, seulement si P0 et P1 stables avant la 20e heure |
| P3 | Liste de dApps approuvées, simulation, contrôle renforcé | A + B | Bonus |
| P3 | Business case avec hypothèses étiquetées | C | Peut être rédigé en parallèle |

### 12.2 Planning indicatif sur 33 h

| Plage | A — Contrats | B — Front / intégration | C — Docs / mocks / pitch |
|---|---|---|---|
| H0–H3 | Spike : Safe, passkey, récupération, plafond | Passkey, première transaction | Plan, modèle de menaces v1 |
| H3–H10 | Règles (plafonds, liste, délai) | Parcours création et signature | Serveur mocké Swissquote |
| H10–H18 | Récupération, garde-fous et veto | UI récupération | Section légale, business |
| H18–H22 | Tests des scénarios et des attaques, corrections | Intégration complète | Scénario de démo, slides |
| H22–H26 | Bonus (liste dApps) si stable | Gasless si stable, continuité bancaire (mock) | Pitch, questions du jury |
| H26–H30 | Gel du code, corrections | Polissage UX | Répétition de la démo |
| H30–H33 | Vidéo de secours, dépôt final | Vidéo de secours | Soumission et pitch final |

Les créneaux de sommeil sont à insérer par roulement : environ 20 h de travail réel sur 33 h.

### 12.3 Règles de pilotage

- Chaque priorité P0 et P1 est terminée avant de commencer une P3.
- Un point d'étape à la 10e, la 20e et la 26e heure : si une P1 est en retard, on coupe les P3.
- Gel du code à la 30e heure.

---

## 13. Correspondance avec le barème

| Critère | Points | Ce qui le couvre |
|---|---|---|
| Implémentation technique | 35 | Création, signature réelle, récupération de bout en bout, tests Foundry |
| Sécurité et custody | 20 | Modèle de menaces, règles on-chain, seuil 2 sur 3, veto indépendant, démo d'attaques |
| Faisabilité légale | 15 | Swissquote jamais seule, hypothèses et points à valider |
| Business case | 15 | Rétention, frais, réduction du support, continuité bancaire, hypothèses étiquetées |
| UX et pitch | 15 | Démo en scénarios, parcours simple, section « Du prototype à la production », vidéo de secours |
| Bonus | 20 | Gasless USDC, dApps approuvées, simulation (après le cœur) |

---

## 14. Questions probables du jury

- Pourquoi pas une seed phrase en coffre ? → Section 2.4.
- Pourquoi pas du MPC ? Et le Bitcoin ? → Section 2.5 et section 11.
- Que peut faire un voleur avec le téléphone ? → Scénario 2, section 4.
- Swissquote peut-elle déplacer les fonds ? → Non, seuil 2 sur 3, jamais seule.
- Que se passe-t-il si la banque est compromise ? → Section 5.5.
- Un voleur peut-il annuler une récupération légitime ? → Section 5.4 (clé de veto séparée).
- Qu'est-ce qui est réel et qu'est-ce qui est mocké ? → Sections 7 et 8.
- Le contrat est-il audité ? → Non. Section 5.13 et section 8.
- Pourquoi est-ce légalement défendable ? → Section 9, présenté comme hypothèse à valider.
- Qu'est-ce qui vous distingue des autres wallets à récupération sociale ? → Section 6.

---

## 15. Précédents : projets proches et leçons

Recherche faite le 10 octobre 2026. Aucun projet ne couvre exactement notre cas (wallet de banque, récupération avec KYC).

| Projet | Approche | Ce qu'on en retient |
|---|---|---|
| ENSignv2 | La récupération peut seulement ajouter une clé. Gardiens par noms ENS. Le propriétaire peut annuler dans une courte fenêtre | Borner ce que la récupération permet |
| [AAStarCommunity/airaccount-contract](https://github.com/AAStarCommunity/airaccount-contract) | Limites par palier selon le montant. Gardiens passkey P-256. Cycle proposer / approuver / exécuter / annuler. Timelock sur l'installation de modules | Le plus proche de notre cible. Paliers et timelock à reprendre |
| [openfort-xyz/openfort-7702-account](https://github.com/openfort-xyz/openfort-7702-account/) | Gel du wallet par un gardien, récupération avec timelock, clés de session avec plafonds | Gel d'urgence |
| [koinlabs/Timelock-account-recovery](https://github.com/koinlabs/Timelock-account-recovery) (TAR, Chateau) | Récupération avec garantie confisquable. « Watch towers » qui peuvent opposer un veto sans jamais prendre le compte | Trop lourd pour 33 h. Idée du veto qui ne peut pas prendre le compte |
| Argent | Verrouillage par un gardien, délai de 5 jours, approbation par au moins la moitié des gardiens, vérification par emojis | Faille de 2020 : cas zéro gardien et déni de service |
| Guardian Vault | Timelock, simulation de transaction, prêt d'urgence en PYUSD pendant l'attente | Base de notre « continuité bancaire » |
| [slaviquee/monolith](https://github.com/slaviquee/monolith) | Plafonds de dépense on-chain, rotation de clé en 48 h, dégel en 10 min | Durcir tout de suite, assouplir avec délai |
| [loveyuanfandj-glitch/treasury-smart-account](https://github.com/loveyuanfandj-glitch/treasury-smart-account) | Clés scopées, gel par gardien, récupération retardée, preuves sur Base Sepolia, fuzzing | Modèle de présentation avec preuves vérifiables |
| Asguard | Modules Safe, signataire OAuth, période de refroidissement | Référence secondaire |
| Para, SwissBorg | MPC (2-sur-2 avec passkey ; MiCA) | Alternative rejetée pour 33 h : plus de cryptographie à intégrer, pas de contrat visible |

**Leçons appliquées :** la récupération ne fait qu'ajouter ou remplacer une clé ; au moins un gardien ; protection contre les récupérations répétées ; gel d'urgence ; limites par paliers ; simulation avant signature ; liquidité d'urgence pendant le délai (extension) ; preuves vérifiables (adresses, tests, scénarios rejouables).

---

## 16. Références techniques

Adresses relevées dans les documentations officielles lors de la recherche. **À revérifier sur Etherscan (Base Sepolia, id 84532) avant usage.**

| Brique | Adresse |
|---|---|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Candide SocialRecoveryModule, délai 3 minutes (tests) | `0x949d01d424bE050D09C16025dd007CB59b3A8c66` |
| Candide SocialRecoveryModule, 3 jours | `0x38275826E1933303E508433dD5f289315Da2541c` |
| Candide SocialRecoveryModule, 7 jours | `0x088f6cfD8BB1dDb1BB069CCb3fc1A98927D233f2` |
| Candide SocialRecoveryModule, 14 jours | `0x9BacD92F4687Db306D7ded5d4513a51EA05df25b` |
| Safe passkeys v0.2.1, SafeWebAuthnSharedSigner | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` |
| Safe passkeys v0.2.1, SignerSingleton | `0x4E27b51350e6c2083EE19011120F50DAfEc5CA50` |
| Safe passkeys v0.2.1, SignerFactory | `0x1d31F259eE307358a26dFb23EB365939E8641195` |
| DaimoP256Verifier | `0xc2b78104907F722DABAc4C69f826a522B2754De4` |
| Zodiac Roles 2.1.1, mastercopy | `0xF2964CE6161ce0e75964Fe7927cE114cb0B283D5` |
| Module Proxy Factory 1.2.0 | `0x000000000000aDdB49795b0f9bA5BC298cDda236` |
| Pimlico, paymaster ERC-20 | `0x777777777777AeC03fd955926DbF81597e66834C` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

**Notes techniques**
- Précompile P-256 (RIP-7212 / EIP-7951) à l'adresse `0x100`. Présent sur Base d'après la documentation consultée ; à confirmer sur Base Sepolia par une vraie UserOp.
- Safe passkeys : le module partagé lie l'adresse à une passkey qui peut être perdue ; prévoir un second moyen d'accès.
- Candide SocialRecoveryModule : confirmer / exécuter / finaliser (appelable par n'importe qui) / annuler (réservé au compte).
- Zodiac Roles v2.1.1 et Delay Modifier : composition Safe → Delay → Roles. Les rôles ne s'appliquent pas aux propriétaires du Safe.
- Outils : Foundry (`forge`, `cast`, `anvil`), `viem`, `permissionless.js` ou `abstractionkit`.

---

## 17. Connecteurs, outils et règles de travail

**Connecteurs claude.ai (rattachés au compte, pas au dépôt) :** Etherscan (lire transactions, contrats, logs, gas ; vérifier les adresses), Exa (recherche web et de code), Figma (schéma d'architecture, maquettes). Google Drive et Linear : connexion non terminée.

**Règles de travail**
- Aucune cryptographie maison. Bibliothèques et contrats éprouvés uniquement.
- Les contrats sont écrits par Opus, mais chaque règle est relue et expliquée par l'équipe. Tests Foundry obligatoires, avec fuzzing sur les plafonds et sur les récupérations répétées.
- Ce qui est mocké est documenté comme tel.
- Le flux création → signature → récupération marche de bout en bout avant tout bonus.
- Les adresses et comportements de chaîne se vérifient avant usage.
- Le cadrage juridique est une hypothèse, jamais un avis.
- Ne pas affirmer que le prototype est prêt pour la production.

---

## 18. Sources

- Zodiac, approche « smart custody » : https://www.zodiac.eco/ et https://www.zodiac.eco/vs/mpc
- Brief du Swissquote Wallet Prize (hackathon BSA, DoraHacks).
- Projets cités en section 15 : liens GitHub dans le tableau ; ENSignv2, Argent, Guardian Vault, Asguard, Para, SwissBorg et les synthèses FINMA / PwC / SW Legal proviennent de la recherche du 10 octobre 2026.
