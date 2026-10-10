// Bibliothèque partagée par l'app, les services mockés et les scripts.
// Modules restant à écrire (docs/09-plan-de-build.md) :
//   sealing.ts      chiffrement d'une part pour un appareil (WebCrypto)
//   summary.ts      résumé en clair d'une PSBT
// Skills à charger : btc-multisig, slip39-backup, custody-invariants.

export * from './network';
export * from './keys';
export * from './descriptor';
export * from './psbt';
export * from './esplora';
export * from './backup';
