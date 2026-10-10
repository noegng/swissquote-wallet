# Du prototype à la production

Swissquote veut porter le projet gagnant en production. L'architecture est de niveau production ; l'implémentation de 33 h ne l'est pas. À présenter tel quel au jury : il note la faisabilité juridique et le business case.

| Sujet | Démontré au hackathon | Mocké ou simplifié | Requis en production |
|---|---|---|---|
| Compte | Safe + ERC-4337 + passkey sur testnet | Une seule chaîne | Plusieurs chaînes, plan de migration des modules |
| Règles et plafonds | Module maison écrit par Opus, tests Foundry | Non audité | Audit externe, ou modules déjà audités (Safe, Rhinestone, Openfort) |
| Gardien Swissquote | Service mocké | Clé en clair côté mock, KYC simulé | Clé en HSM ou MPC, double contrôle, politique de signature, journalisation |
| Contrôle d'identité | Écran simulé | Pas de vrai KYC | KYC renforcé, détection de pièces falsifiées et de vidéos générées, formation du service client (vecteur d'ingénierie sociale) |
| Délai de récupération | 3 minutes | Raccourci pour la démo | 24 h minimum, notification sur plusieurs canaux |
| Veto | Clé de veto sur second appareil | Un seul canal | Canaux multiples, alertes, surveillance continue |
| Passkeys | Passkey WebAuthn | Passkeys synchronisées dans le cloud acceptées | Règles différentes pour les passkeys liées à l'appareil et celles synchronisées (un compte Apple ou Google compromis reste un risque) |
| Infrastructure | Bundler et paymaster de testnet | Fournisseur unique | Redondance, supervision, plan de repli, précompile P-256 confirmé sur la chaîne cible |
| Juridique | Hypothèse de non-garde | Aucune validation | Avis d'un avocat suisse sur la qualification (FINMA, LBA) selon la façon dont la récupération est réellement opérée |
| Continuité bancaire | Écran et plafond simulés | Pas de lien avec un vrai compte | Intégration avec le compte et la carte du client, limites et conformité |
