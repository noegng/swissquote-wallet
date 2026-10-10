# Du prototype à la production

Swissquote veut porter le projet gagnant en production. L'architecture vise la production ; l'implémentation de 33 h ne l'est pas. À présenter tel quel au jury.

**Règle du brief :** tout ce qui est mocké est étiqueté dans la démo et le README. Un détenteur de part mocké tourne comme processus séparé avec son propre stockage, et l'app ne détient jamais sa part.

| Sujet | Démontré au hackathon | Mocké ou simplifié | Requis en production |
|---|---|---|---|
| Multisig | 2 sur 3 P2WSH sur signet, vraies transactions | Une seule chaîne | Taproot (MuSig2 ou script) pour la confidentialité et les frais ; audit |
| Clé Swissquote | Service `services/swissquote`, processus séparé | **MOCK** : clé en fichier local | HSM ou enclave, double contrôle, politique de signature, journalisation |
| Règles de cosignature | Paliers, délai, liste de sanctions | **MOCK** : liste de sanctions partielle | Fournisseur de conformité, analyse de chaîne |
| Partenaire (part TIERS) | Service `services/partner`, processus séparé | **MOCK** : contrôle d'identité simulé | Contrat, deux partenaires indépendants, SLA, réversibilité en cas de faillite |
| KYC / identité | Écran de connexion simulé | **MOCK** : pas de vrai KYC | KYC renforcé, détection de pièces falsifiées et de deepfakes, formation du support |
| Délais | 2 à 3 minutes | Raccourcis pour la démo | 7 jours pour la récupération, notifications SMS, e-mail, app |
| Notifications | Boîte de réception dans l'app | **MOCK** : pas de vrais SMS ou e-mails | Canaux multiples et indépendants |
| Clé téléphone | Web app, clé chiffrée, déverrouillée par passkey | Navigateur au lieu d'une app native | App native, puce sécurisée |
| Copie C2 (cloud) | Fichier chiffré | **MOCK** : pas de vrai cloud | iCloud / Google Drive, chiffrement par passkey (PRF) |
| Continuité bancaire | Écran et plafond | **MOCK** : pas de lien avec un compte | Intégration compte et carte, limites, conformité |
| Juridique | Hypothèse de non-garde | Aucune validation | Avis d'un avocat suisse (FINMA, LBA, Travel Rule) |
