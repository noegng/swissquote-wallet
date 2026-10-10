// Vérification du spike : le cœur Bitcoin et SLIP-39 tournent dans le navigateur.
// Crée un wallet 2 sur 3 jetable, découpe et restaure une clé de secours.
import {
  accountOrigin,
  combineBackupShares,
  deriveAddress,
  networkConfig,
  newBackupSecret,
  randomSeed,
  rootFromSeed,
  splitBackupSecret,
  toHex,
} from '@sqw/core';

export function runCoreSpike(): string {
  const { network } = networkConfig('regtest');
  const roots = [randomSeed(), randomSeed(), randomSeed()].map((s) => rootFromSeed(s, network));
  const address = deriveAddress(
    { threshold: 2, keys: [accountOrigin(roots[0]), accountOrigin(roots[1]), accountOrigin(roots[2])] },
    0,
    0,
    network,
  ).address;
  const secret = newBackupSecret();
  const { client, tiers } = splitBackupSecret(secret);
  const ok = toHex(combineBackupShares([client, tiers])) === toHex(secret);
  return `adresse 2/3 ${address.slice(0, 14)}… · SLIP-39 ${ok ? 'OK' : 'ÉCHEC'}`;
}
