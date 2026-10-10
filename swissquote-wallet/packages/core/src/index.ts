// Bibliothèque partagée par l'app, les services mockés et les scripts.
// Modules prévus (à écrire pendant le hackathon, voir docs/09-plan-de-build.md) :
//   keys.ts         génération bip32 (clé téléphone, clé de secours), chemins BIP-48
//   descriptor.ts   wsh(sortedmulti(2, …)), adresses, export pour le kit de sortie
//   psbt.ts         créer, signer, combiner, finaliser
//   esplora.ts      UTXO, frais, diffusion, statut
//   backup.ts       SLIP-39 à groupes (wrapper de la bibliothèque retenue)
//   sealing.ts      chiffrement d'une part pour un appareil (WebCrypto)
//   summary.ts      résumé en clair d'une PSBT
// Skills à charger : btc-multisig, slip39-backup, custody-invariants.

export * from './network';
