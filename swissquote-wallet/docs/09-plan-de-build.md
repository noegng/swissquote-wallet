# Plan de build (33 h, 3 personnes)

Cocher au fur et à mesure (`- [x]`). Rôles : **A** = cœur Bitcoin et récupération (`packages/core`), **B** = web app et passkeys (`apps/web`), **C** = services mockés, docs, schéma, pitch.

Règles : P0 et P1 terminés avant tout bonus. Points d'étape à **H10, H20, H26** : si le cœur est en retard, on coupe les bonus. **Gel du code à H30.**

## Avant H0 (préparation)

- [x] Documents mis à jour pour le multisig 2 sur 3 + SLIP-39 (`03-decisions.md` fait foi)
- [x] Skills de projet dans `.claude/skills/`
- [x] Squelette du monorepo (`packages/core`, `apps/web`, `services/swissquote`, `services/partner`, `tools/`, `scripts/`) : `npm install`, `npm test`, `npm run typecheck`, `npm run dev:all` vérifiés le 10/10
- [x] Regtest Docker testé chez Noé le 10/10 (bloc 101, faucet OK, explorateur sur :5000)
- [ ] Regtest Docker lancé sur la machine de chaque coéquipier (guide : `docs/00-demarrage.md`)
- [ ] Préfinancer 3 à 5 adresses signet via le faucet (limité à 5 demandes par 24 h)

## H0–H3 : spike

- [x] **A** Descripteur 2 sur 3, adresse, PSBT signée par 2 clés, diffusion regtest (`npm run spike`, 10/10)
- [x] **A** Même chose sur **signet** : premier txid public dans `preuves.md` (`npm run spike:signet`, 10/10)
- [x] **A** SLIP-39 : `shamir-mnemonic-ts` passe les 45 vecteurs officiels ; fonctionne dans le navigateur avec `vite-plugin-node-polyfills`
- [x] **A** Interop avec la référence Python ; test I2 (Swissquote + partenaire ne restaurent pas)
- [x] **B** Squelette Vite + React, mise en page téléphone, bannière MOCK
- [x] **B** Passkey : écrans connexion (mock) + création de passkey, vérification par le service ; défi lié à chaque opération (10/10). PRF reporté (facultatif)
- [x] **C** Service Swissquote : `/wallets`, `/cosign` avec vérification indépendante de la PSBT, stockage propre (fait par Claude, 10/10)
- [x] **C** Service partenaire minimal : dépôt et libération d'une part, stockage propre

## H3–H10 : création et envoi

- [x] **A** `backup.ts` (split / combine), `sealing.ts` (ECDH + HKDF + AES-GCM, et PBKDF2 pour C2), `summary.ts` (résumé vérifié), `onboarding.ts` (matériel d'un nouveau wallet)
- [x] **A** Tests des invariants I1 à I5 (`packages/core/test/`, 74 tests) ; I5 et I3 « Swissquote arrêté » restent à couvrir en e2e
- [x] **B** Onboarding : connexion mockée → passkey → clés → Swissquote → part TIERS scellée au partenaire → C1 + vérification de 2 mots → C2 chiffrée et téléchargée ; accueil (solde, adresse, faucet regtest, kit de sortie). Testé dans Chrome jusqu'au téléchargement de C2
- [x] **B** Écran Envoyer : résumé vérifié par l'app, approbation passkey liée à la PSBT, palier 1 immédiat, palier 2 avec compte à rebours et annulation par passkey (repris après rechargement), lien explorateur ; accueil avec alertes Swissquote et adresse de réception non réutilisée. Testé dans Chrome jusqu'à l'approbation passkey
- [x] **C** Règles du cosignataire : plafond quotidien, palier 2 (délai + notification annulable), sanctions (`npm run demo:cosign`)
- [x] **B + C** Passkey exigée sur `/cosign` et `/cosign/:id/cancel` ; attaques sans passkey, PSBT échangée et rejeu refusées (`npm run demo:cosign`)
- [x] **C** Registre des wallets (Travel Rule), KYC mocké, journal d'audit ; service partenaire : clé publique, dépôt de la part TIERS (`npm run demo:create`)
- [x] **Point d'étape H10** : création → envoi de bout en bout sur regtest (scripts et app)
- [x] **Validation Windows Hello** par Noé (10/10) : passkey, création, petit et gros paiement, annulation, récupération sur un second « appareil » (fenêtre privée). Défaut trouvé et corrigé : passkey synchronisée déjà présente sur l'appareil de récupération

## H10–H18 : récupération

- [x] **A** Récupération : reconstitution de la clé de secours sur l'appareil, transfert vers un nouveau jeu de clés (`npm run demo:recover`)
- [ ] **A** Sortie sans Swissquote : téléphone + clé de secours, diffusion directe
- [x] **B** Écran Récupération (nouvel appareil) et alerte d'annulation sur l'ancien ; kit de sortie téléchargeable sur l'accueil. Testé dans Chrome jusqu'à la passkey
- [x] **B** Écran « Swissquote a disparu » (sortie avec téléphone + clé de secours, sans session) : testé de bout en bout dans Chrome avec le service Swissquote arrêté (10/10)
- [x] **C** `/recovery` Swissquote (ouvrir avec gel, annuler par passkey, nouveau wallet, transfert exigeant la clé de secours, révocation des passkeys) et `/release` partenaire (identité, délai, re-scellement pour l'appareil, annulation)
- [x] **Tests e2e regtest** (scripts séparés) : `demo:create`, `demo:cosign`, `demo:recover`, `demo:exit` (Swissquote réellement arrêté)

## H18–H22 : démo

- [ ] **A** Scripts des 3 attaques et du scénario « Swissquote a disparu », preuves dans `preuves.md`
- [ ] **B** Panneau Démo (scénarios et attaques, raisons des refus)
- [ ] **C** Schéma d'architecture FigJam (parties mockées en couleur distincte), lien dans le README
- [ ] **C** Sections menaces, juridique, Travel Rule, business finalisées
- [ ] **Point d'étape H20** : histoire complète rejouable sur signet

## H22–H26 : bonus (seulement si tout ce qui précède est coché)

- [ ] **A** Frais sponsorisés par Swissquote (entrée ajoutée avant la signature du client, quota)
- [ ] **B** Interaction conforme dans l'UI : résumé clair, refus sanctions, contrôle renforcé
- [ ] **A** Preuve de propriété BIP-322 (facultatif)
- [ ] **C** Pitch et réponses aux questions du jury
- [ ] **Point d'étape H26**

## H26–H33 : finition et soumission

- [ ] Gel du code à H30, corrections uniquement
- [ ] Revue finale avec la skill `custody-invariants` et `/code-review`
- [ ] Répétition de la démo (skill `demo-run`)
- [ ] Vidéo de secours
- [ ] Soumission DoraHacks (checklist de la skill `doc-sync`)

## Outils d'IA utilisés (à déclarer dans la soumission)

| Outil | Usage |
|---|---|
| Claude Code (Opus) | Conception, rédaction des documents, écriture du code relu par l'équipe, skills de projet |
| Claude, connecteur Exa | Recherche de bibliothèques, de précédents (Bitkey, Ledger Recover) et d'API |
| Claude, connecteur Figma | Schéma d'architecture |
| Claude in Chrome | Tests de parcours de la web app, GIF de démo |
