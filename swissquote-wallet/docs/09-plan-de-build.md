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
- [ ] **C** Service partenaire minimal : dépôt et libération d'une part, stockage propre

## H3–H10 : création et envoi

- [ ] **A** `backup.ts` (split / combine), `sealing.ts` (chiffrement pour un appareil), `summary.ts` (résumé clair)
- [ ] **A** Tests des invariants I1 à I5
- [ ] **B** Onboarding : connexion mockée → passkey → clés → cérémonie C1 / C2 → enregistrement
- [ ] **B** Écran Envoyer : résumé clair, palier affiché, lien explorateur
- [x] **C** Règles du cosignataire : plafond quotidien, palier 2 (délai + notification annulable), sanctions (`npm run demo:cosign`)
- [x] **B + C** Passkey exigée sur `/cosign` et `/cosign/:id/cancel` ; attaques sans passkey, PSBT échangée et rejeu refusées (`npm run demo:cosign`)
- [ ] **C** Registre des wallets (Travel Rule), KYC mocké, journal d'audit
- [ ] **Point d'étape H10** : création → envoi de bout en bout sur regtest

## H10–H18 : récupération

- [ ] **A** Récupération : reconstitution de la clé de secours sur l'appareil, transfert vers un nouveau jeu de clés
- [ ] **A** Sortie sans Swissquote : téléphone + clé de secours, diffusion directe
- [ ] **B** Écrans Récupération et Kit de sortie
- [ ] **C** `/recovery` Swissquote (ouvrir, annuler, statut, délai) et `/release` partenaire (identité, délai, annulation)
- [ ] **Test e2e regtest** : création → envoi → perte du téléphone → récupération → Swissquote arrêté → sortie

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
