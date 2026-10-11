# Du prototype à la production

Swissquote veut porter le projet gagnant en production. L'architecture vise la production ; l'implémentation de 33 h ne l'est pas. À présenter tel quel au jury.

**Règle du brief :** tout ce qui est mocké est étiqueté dans la démo et le README. Un détenteur de part mocké tourne comme processus séparé avec son propre stockage, et l'app ne détient jamais sa part.

| Sujet | Démontré au hackathon | Mocké ou simplifié | Requis en production |
|---|---|---|---|
| Multisig | 2 sur 3 P2WSH sur signet, vraies transactions | Une seule chaîne | Taproot (MuSig2 ou script) pour la confidentialité et les frais ; audit |
| Clé Swissquote | Service `services/swissquote`, processus séparé | **MOCK** : clé en fichier local | HSM ou enclave, double contrôle, politique de signature, journalisation |
| Règles de cosignature | Paliers, délai, liste de sanctions | **MOCK** : liste de sanctions partielle | Fournisseur de conformité, analyse de chaîne |
| Partenaire (part TIERS) | Service `services/partner`, processus séparé ; libération avec délai, part re-scellée pour l'appareil | **MOCK** : contrôle d'identité simulé ; annulation sans authentification | Contrat, deux partenaires indépendants, SLA, réversibilité en cas de faillite ; annulation authentifiée |
| Personne de confiance (notaire, avocat) | Invitation par lien ou QR code, remise de la part scellée pour sa clé, destruction de la copie du partenaire, approbation d'une récupération (`npm run demo:trustee`) | **MOCK** : le partenaire croit l'identité du client sans la vérifier ; le lien d'invitation sert d'authentification à la personne de confiance ; pas de délai avant la remise | Contrôle d'identité des deux parties par le partenaire, délai et notification avant la remise, authentification forte de la personne de confiance, cadre contractuel (secret professionnel, succession) |
| KYC / identité | Écran de connexion simulé | **MOCK** : pas de vrai KYC | KYC renforcé, détection de pièces falsifiées et de deepfakes, formation du support |
| Délais | 30 s (récupération), 20 s (gros paiement) | Raccourcis pour la démo (`.env`) | 7 jours pour la récupération, 24 h à 7 jours pour un gros paiement, notifications SMS, e-mail, app |
| Notifications | Boîte de réception dans l'app | **MOCK** : pas de vrais SMS ou e-mails | Canaux multiples et indépendants |
| Passkey | WebAuthn de la plateforme (Secure Enclave, TPM via Windows Hello), défi lié à chaque transaction, vérifiée par le service Swissquote | Démo sur ordinateur ; passkeys synchronisées (iCloud) acceptées | App native ; politique différente pour les passkeys synchronisées |
| Clé téléphone | Web app, clé chiffrée par une clé WebCrypto non exportable | Navigateur au lieu d'une app native ; la clé Bitcoin (secp256k1) ne peut pas vivre dans la puce (P-256 uniquement) | App native, clé chiffrée par une clé de la Secure Enclave ou dérivée par PRF |
| Authentificateur des scripts de test | Authentificateur WebAuthn logiciel (`scripts/lib/soft-authenticator.ts`) | **Test uniquement**, jamais dans l'app | — |
| Copie C2 (cloud) | Fichier chiffré | **MOCK** : pas de vrai cloud | iCloud / Google Drive, chiffrement par passkey (PRF) |
| Continuité bancaire | Écran et plafond | **MOCK** : pas de lien avec un compte | Intégration compte et carte, limites, conformité |
| Sortie sans Swissquote | Écran dédié, sans session, téléphone + clé de secours, diffusion directe ; démontré service arrêté | Partenaire mocké | Partenaire réel indépendant ; kit de sortie testé avec Sparrow et Bitcoin Core |
| Juridique | Hypothèse de non-garde | Aucune validation | Avis d'un avocat suisse (FINMA, LBA, Travel Rule) |
