> **Document remplacé le 10 octobre 2026.** La conception à jour (multisig Bitcoin 2 sur 3 + clé de secours SLIP-39) est dans `../../swissquote-wallet-projet.md`, et les décisions dans `03-decisions.md`. Ce fichier décrit l'ancienne approche (smart account ERC-4337) et n'est plus maintenu.

# Swissquote Self-Custody Wallet — Cadrage du projet

> Hackathon BSA — Swissquote Wallet Prize. Équipe de 3, durée 33 h.
> Document de conception : problème, solution, difficultés et réponses, points ouverts, répartition des tâches.

---

## 1. Rappel du sujet

Swissquote veut un wallet self-custody que la banque pourrait réellement lancer pour ses clients : **leurs clés, leur contrôle**, tout en restant **à un pas de leur compte Swissquote**, avec la sécurité, la simplicité et la conformité attendues d'une banque suisse.

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

---

## 2. Le problème

### 2.1 Situation actuelle

Un client qui veut la self-custody doit retirer ses actifs vers un wallet externe et quitte l'écosystème Swissquote. Les options de récupération disponibles aujourd'hui sont mauvaises :

- **Seed phrase** : perdue, tout est perdu ; mal conservée, elle est volée.
- **Récupération par email ou SMS** : un attaquant qui contrôle le téléphone ou l'email peut tout récupérer.
- **Seed complète conservée par la banque** : la banque détient alors la clé, donc ce n'est plus de la self-custody.

### 2.2 Énoncé du problème

> Comment un client peut-il garder le contrôle de ses clés et rester à un pas de sa banque, sans que ni un attaquant ni Swissquote ne puisse déplacer les fonds seul ?

### 2.3 Les deux adversaires

1. **L'attaquant externe** : téléphone volé, email piraté, faux documents d'identité, ingénierie sociale.
2. **La banque elle-même** (ou un de ses employés, ou un attaquant qui la compromet) : elle ne doit pas pouvoir agir seule, pour des raisons de sécurité et de qualification légale (dépositaire ou non).

### 2.4 Pourquoi la seed phrase en coffre n'est pas retenue

- Contraire au brief : contrôle involontaire de la banque sur les fonds.
- Risque de qualification en garde de crypto-actifs (à valider par un juriste).
- Point de défaillance unique : une fuite ou un employé malhonnête expose tous les clients.
- Une vérification d'identité seule est attaquable (faux documents, deepfakes, ingénierie sociale du support).
- Une seed ne se révoque pas et ne se limite pas en montant.

À présenter dans le modèle de menaces comme l'**option écartée**, avec ces raisons.

---

## 3. La solution proposée

### 3.1 Principe

**Un wallet où les règles sont dans le contrat.** La sécurité ne repose pas seulement sur la protection de la clé, mais sur ce que le compte accepte d'exécuter. Un téléphone volé ou une application compromise ne peut pas dépasser les limites inscrites dans le smart account.

Inspiration : l'approche « smart custody » de Zodiac (politiques appliquées on-chain, pas par un serveur). Cette source est une page commerciale qui se compare à ses concurrents ; on reprend le principe, pas ses affirmations de supériorité.

### 3.2 Architecture générale

- **Compte** : smart account ERC-4337 sur testnet.
- **Signature** : passkey (WebAuthn) liée à l'appareil, jamais exportée.
- **Règles on-chain** : plafond journalier, liste de destinataires ou dApps approuvés, délai (timelock) sur les gros montants, asymétrie durcir/assouplir.
- **Récupération** : 2 gardiens sur 3 plus un délai de sécurité plus un veto par un canal indépendant.
- **Gasless** (bonus) : paymaster qui sponsorise certaines opérations (envoi d'USDC).
- **Serveur « Swissquote »** : mocké, joue le rôle d'un gardien et du canal de veto.

### 3.3 Où vivent les clés

| Élément | Emplacement | Qui peut s'en servir |
|---|---|---|
| Passkey principale | Appareil du client (enclave sécurisée) | Le client |
| Passkey de secours | Second appareil du client | Le client |
| Gardien 1 | Swissquote (après vérification d'identité forte, hors téléphone et email) | Swissquote, jamais seul |
| Gardien 2 | Second appareil / seconde passkey du client | Le client |
| Gardien 3 (optionnel) | Contact de confiance | Le contact, jamais seul |

Swissquote n'a **jamais** la clé complète et ne peut ni déplacer les fonds ni imposer une clé à lui seul.

### 3.4 Cycle de vie

**Création**
1. Le client s'authentifie dans l'app Swissquote.
2. Création de la passkey sur l'appareil et déploiement du smart account.
3. Configuration des gardiens par défaut et des règles par défaut (plafonds, délai).

**Authentification et signature**
1. Le client déclenche une transaction.
2. Les règles on-chain vérifient destinataire, montant, plafond.
3. Sous le plafond et vers une adresse autorisée : exécution immédiate. Au-dessus : passage par le délai avec notification.

**Perte d'accès et récupération**
1. Le client déclare la perte et propose une nouvelle passkey.
2. Approbation de 2 gardiens sur 3. Swissquote ne donne sa part qu'après vérification d'identité forte.
3. Délai de sécurité avant l'entrée en vigueur de la nouvelle clé.
4. Pendant le délai, veto possible via un canal indépendant (espace client Swissquote ou autre gardien).
5. Les montants restent plafonnés pendant et juste après la récupération.

### 3.5 Les trois scénarios de démo

1. **Usage normal** : créer le wallet, signer, envoyer une vraie transaction sur testnet.
2. **Attaque bloquée** : un voleur avec le téléphone tente un gros retrait ou un changement de règles → refusé par les règles et le délai.
3. **Perte du téléphone** : récupération complète avec gardiens, délai et veto.

---

## 4. Modèle de menaces

| Menace | Ce que l'attaquant obtient | Ce qui l'arrête |
|---|---|---|
| Téléphone volé | Accès à la passkey (selon verrouillage) | Plafonds, liste autorisée, délai sur gros montants |
| Email piraté | Notifications et liens de récupération | Veto par canal indépendant, 2 gardiens sur 3 |
| Téléphone et email volés | Appareil et notifications | Veto Swissquote par connexion indépendante, délai |
| Faux document d'identité | Part du gardien Swissquote | Il faut un second gardien, plus le délai |
| Gardien malveillant (dont la banque) | Une part sur trois | Seuil 2 sur 3, plafonds, délai |
| Banque et un autre gardien compromis | Seuil atteint | Plafonds, délai de sécurité, veto du client |
| Compte cloud de la passkey compromis | Copie de la clé si passkey synchronisée | Passkey liée à l'appareil, passkey de secours |
| Changement de règles par un attaquant | Plafond relevé, adresse ajoutée | Assouplir = même délai et veto que les gros transferts |
| Abus du paymaster | Épuisement du budget de gaz | Sponsoring limité à certaines opérations et par compte |

---

## 5. Difficultés et solutions

### 5.1 Vérifier une passkey on-chain
- **Difficulté :** les passkeys signent en P-256, non supporté nativement par l'EVM. Tout réimplémenter serait long et risqué.
- **Solution :** SDK de smart account gérant déjà les passkeys, sur une chaîne de test supportant la vérification P-256 (à vérifier dans la doc). Aucune cryptographie maison.

### 5.2 Un attaquant change les règles lui-même
- **Difficulté :** avec le téléphone, il relève le plafond ou ajoute sa propre adresse.
- **Solution :** asymétrie. Durcir est immédiat ; assouplir passe par le même délai et le même veto que les gros transferts.

### 5.3 Un délai de 24 h est impossible à démontrer
- **Difficulté :** le jury n'attendra pas un jour.
- **Solution :** délai configurable (par exemple 2 minutes en démo). Dire explicitement que la valeur réelle serait de 24 h ou plus et montrer le paramètre dans le contrat.

### 5.4 Le canal de veto indépendant
- **Difficulté :** c'est ce qui rend la récupération crédible, et il est facile de le mocker naïvement (simple case à cliquer).
- **Solution :** faux serveur « Swissquote » avec sa propre authentification, séparée de l'appareil, qui signe un veto vérifié par le contrat. Documenter clairement que c'est mocké.

### 5.5 Swissquote comme point de collusion
- **Difficulté :** une banque compromise ou manipulée ne doit pas suffire.
- **Solution :** seuil 2 sur 3, donc jamais seule. Documenter le cas « banque plus un autre gardien compromis » et ce qui le limite (plafonds, délai).

### 5.6 La passkey synchronisée dans le cloud
- **Difficulté :** voler le compte cloud du client donne la clé.
- **Solution :** proposer une passkey liée à l'appareil et une seconde passkey de secours. Documenter le compromis confort / sécurité.

### 5.7 Le gasless peut vider le budget
- **Difficulté :** un paymaster qui paie tout est exploitable.
- **Solution :** ne sponsoriser que certaines opérations (envoi USDC) avec une limite par compte. Bonus : seulement si le cœur marche avant la 20e heure.

### 5.8 Temps et infrastructure fragile
- **Difficulté :** bundler, paymaster ou testnet en panne, faucet limité, récupération = morceau le plus long.
- **Solution :** une seule pile choisie dès le début, une transaction de bout en bout dans les 3 premières heures, comptes préfinancés, vidéo de secours de la démo.

### 5.9 L'argument légal reste une hypothèse
- **Difficulté :** affirmer « Swissquote n'est pas dépositaire » sans le savoir peut décrédibiliser (15 pts).
- **Solution :** présenter comme hypothèse de conception (la banque ne peut pas déplacer seule les fonds). Lister ce qu'un juriste devrait valider : définition de la garde, vérification de la propriété du wallet. Ne pas affirmer une conformité non garantie.

### 5.10 Se différencier et chiffrer le business
- **Difficulté :** beaucoup d'équipes feront « smart account plus passkey », et de faux chiffres se détectent.
- **Solution :** la différence est la démo en trois scénarios et le modèle de menaces. Business avec hypothèses étiquetées (par exemple « si X % de clients adoptent… »), pas de faux chiffres.

### 5.11 UX de la récupération pour un client retail
- **Difficulté :** demander de choisir des gardiens est une mauvaise UX.
- **Solution :** valeurs par défaut simples (Swissquote, second appareil, contact optionnel), parcours guidé en quelques écrans, vocabulaire non technique.

---

## 6. Périmètre

**À construire**
- Création du smart account et de la passkey.
- Signature et envoi d'une vraie transaction sur testnet.
- Règles on-chain (plafond, liste autorisée, délai).
- Récupération par gardiens avec délai et veto.
- Interface de démo des trois scénarios.

**À mocker et documenter**
- KYC et vérification d'identité.
- Infrastructure bancaire et lien avec le compte Swissquote.
- Serveur du gardien Swissquote et canal de veto.
- Fournisseur de conformité (sanctions).

**Bonus (si le cœur est stable)**
- Gasless sur l'envoi d'USDC.
- Liste de dApps approuvées, simulation de transaction, vérification renforcée pour les gros montants.

---

## 7. Business et légal

**Valeur pour Swissquote (hypothèses à étiqueter comme telles)**
- Rétention : les clients ne quittent plus l'écosystème pour un wallet externe.
- Revenus : frais sur swaps et transferts, éventuel palier premium.
- Réduction des coûts : moins de support pour fonds perdus.
- Nouveaux clients attirés par la self-custody encadrée.

**Légal (à valider par un juriste)**
- Hypothèse : Swissquote est un gardien parmi d'autres et ne peut jamais déplacer les fonds seul, donc ne détient pas la garde des actifs.
- Points à faire valider : définition de la garde en droit suisse, vérification de la propriété du wallet, obligations de lutte contre le blanchiment.

---

## 8. Points ouverts (pistes d'évolution)

Décisions non tranchées, volontairement laissées ouvertes pour pouvoir faire évoluer la conception.

**Cryptographie et custody**
- **Passkey seule ou hybride MPC / part de clé ?** Faut-il à terme une part de clé côté banque, avec quel seuil ?
- **Gardiens : nombre et nature.** Passer de 2 sur 3 à un seuil configurable ? Autoriser un gardien institutionnel tiers (notaire, autre banque) ?
- **Rotation et révocation des gardiens** : comment remplacer un gardien sans ouvrir une brèche ?
- **Multi-chaînes** : étendre au-delà d'une chaîne EVM ?

**Récupération**
- **Durée du délai** : fixe, ou variable selon le montant et le niveau de risque ?
- **Canal de veto** : au-delà de l'espace client, ajouter une confirmation hors bande (appel, courrier, agence) ?
- **Détection d'anomalies** : gel automatique sur comportement inhabituel (heure, destinataire, montant) ?
- **Que se passe-t-il si le client perd tous ses facteurs ?** Un chemin de dernier recours existe-t-il sans donner le contrôle à la banque ?

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

## 9. Répartition théorique des tâches à 3

Rôles proposés (à ajuster selon les compétences réelles) :

- **Personne A — Contrats et sécurité on-chain** : smart account, règles, récupération.
- **Personne B — Front, passkey et intégration** : app de démo, passkeys, gasless, transactions.
- **Personne C — Menaces, légal, business, mocks et pitch** : documents, serveur mocké, démo et présentation.

### 9.1 Ordre de priorité des implémentations

| Priorité | Fonctionnalité | Responsable | Remarque |
|---|---|---|---|
| P0 | Choix de la pile et transaction de bout en bout (smart account, bundler, testnet) | A + B | À faire dans les 3 premières heures |
| P0 | Création du wallet avec passkey et signature d'une vraie transaction | A + B | Minimum exigé par le brief |
| P1 | Récupération par gardiens 2 sur 3 avec délai | A | Cœur de la différenciation |
| P1 | Serveur mocké « Swissquote » et canal de veto | C (avec A) | Rend la récupération crédible |
| P1 | Interface des trois scénarios de démo | B | Démo = 15 pts UX et pitch |
| P2 | Plafond journalier et liste de destinataires autorisés | A | Scénario « attaque bloquée » |
| P2 | Asymétrie durcir / assouplir et délai configurable | A | Réponse aux difficultés 5.2 et 5.3 |
| P2 | Modèle de menaces et section légale rédigés | C | 35 pts cumulés (sécurité plus légal) |
| P3 | Gasless sur USDC (paymaster limité) | B | Bonus, seulement si P0 et P1 stables avant la 20e heure |
| P3 | Liste de dApps approuvées, simulation, contrôle renforcé | A + B | Bonus |
| P3 | Business case avec hypothèses étiquetées | C | Peut être rédigé en parallèle |

### 9.2 Planning indicatif sur 33 h

| Plage | A — Contrats | B — Front / intégration | C — Docs / mocks / pitch |
|---|---|---|---|
| H0–H3 | Choix pile, déploiement test | Passkey, première transaction | Plan, modèle de menaces v1 |
| H3–H10 | Règles (plafond, liste, délai) | Parcours création et signature | Serveur mocké Swissquote |
| H10–H18 | Récupération gardiens et veto | UI récupération | Section légale, business |
| H18–H22 | Tests des 3 scénarios, corrections | Intégration complète | Scénario de démo, slides |
| H22–H26 | Bonus (liste dApps) si stable | Gasless si stable | Pitch, questions du jury |
| H26–H30 | Gel du code, corrections | Polissage UX | Répétition de la démo |
| H30–H33 | Vidéo de secours, dépôt final | Vidéo de secours | Soumission et pitch final |

Les créneaux de sommeil sont à insérer par roulement : environ 20 h de travail réel sur 33 h.

### 9.3 Règles de pilotage

- Chaque priorité P0 et P1 est terminée avant de commencer une P3.
- Un point d'étape à la 10e, la 20e et la 26e heure : si une P1 est en retard, on coupe les P3.
- Gel du code à la 30e heure.

---

## 10. Correspondance avec le barème

| Critère | Points | Ce qui le couvre |
|---|---|---|
| Implémentation technique | 35 | Création, signature réelle, récupération de bout en bout |
| Sécurité et custody | 20 | Modèle de menaces, règles on-chain, seuil 2 sur 3, veto |
| Faisabilité légale | 15 | Swissquote jamais seul, hypothèses et points à valider |
| Business case | 15 | Rétention, frais, réduction du support, hypothèses étiquetées |
| UX et pitch | 15 | Démo en trois scénarios, parcours simple, vidéo de secours |
| Bonus | 20 | Gasless USDC, dApps approuvées, simulation (après le cœur) |

---

## 11. Questions probables du jury

- Pourquoi pas une seed phrase en coffre ? → Section 2.4.
- Que peut faire un voleur avec le téléphone ? → Scénario 2, section 4.
- Swissquote peut-elle déplacer les fonds ? → Non, seuil 2 sur 3, jamais seule.
- Que se passe-t-il si la banque est compromise ? → Section 5.5.
- Qu'est-ce qui est réel et qu'est-ce qui est mocké ? → Section 6.
- Pourquoi est-ce légalement défendable ? → Section 7, présenté comme hypothèse à valider.

---

## Sources d'inspiration

- Zodiac, approche « smart custody » (politiques appliquées on-chain) : https://www.zodiac.eco/ et https://www.zodiac.eco/vs/mpc
- Brief du Swissquote Wallet Prize (hackathon BSA, DoraHacks).
