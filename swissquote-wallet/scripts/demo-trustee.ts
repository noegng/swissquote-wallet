// Personne de confiance (notaire, avocat) : invitation, remise de la part TIERS, puis approbation
// d'une demande de récupération. Contre le service partenaire lancé, SANS Swissquote ni réseau
// Bitcoin : ce dispositif ne dépend que du partenaire.
//   npm run demo:trustee
// Le script joue trois rôles, chacun avec ses propres clés : le client, la personne de confiance
// et le nouvel appareil du client.
import {
  accountOrigin,
  backupRootFromShares,
  createWalletMaterial,
  exportPublicJwk,
  generateSealingKeyPair,
  networkConfig,
  openSealed,
  sealFor,
} from '../packages/core/src/index';
import { call, PARTNER, sleep } from './lib/http';

const cfg = networkConfig('regtest');
let step = 0;
const ok = (text: string) => console.log(`  OK  ${text}`);
const title = (text: string) => console.log(`\n${++step}. ${text}`);

function expect(condition: unknown, text: string) {
  if (!condition) throw new Error(`ÉCHEC : ${text}`);
  ok(text);
}

const walletId = `demo-trustee-${Date.now()}`;
const clientId = `client-trustee-${Date.now()}`;
const trusteeName = 'Me Dupont, notaire';

title('Création : la part TIERS part chez le partenaire, comme aujourd’hui');
const m = createWalletMaterial(cfg.network);
const partnerKey = (await call('GET', `${PARTNER}/public-key`)).json.publicKey;
const deposit = await call('POST', `${PARTNER}/shares`, {
  walletId,
  clientId,
  sealedShare: await sealFor(partnerKey, m.shares.tiers),
});
expect(deposit.code === 200, 'part TIERS déposée, scellée pour le partenaire');

title('Invitation de la personne de confiance');
const stranger = await call('POST', `${PARTNER}/invitations`, { walletId, clientId: 'someone-else', trusteeName });
expect(stranger.code === 404, 'un autre client ne peut pas inviter pour ce wallet');
const invited = await call('POST', `${PARTNER}/invitations`, { walletId, clientId, trusteeName });
expect(invited.code === 200 && invited.json.inviteId, 'invitation créée par le client');
const inviteId: string = invited.json.inviteId;
const status = await call('GET', `${PARTNER}/shares/${walletId}`);
expect(!JSON.stringify(status.json).includes(inviteId), 'le lien d’invitation n’est pas exposé par le statut public');
expect(status.json.holder === 'partner', 'le partenaire détient encore la part');

title('La personne de confiance accepte avec une clé créée sur son appareil');
const trustee = await generateSealingKeyPair(false);
const accepted = await call('POST', `${PARTNER}/invitations/${inviteId}/accept`, {
  publicKey: await exportPublicJwk(trustee.publicKey),
});
expect(accepted.code === 200, 'invitation acceptée');
const early = await call('GET', `${PARTNER}/invitations/${inviteId}`);
expect(early.json.sealedForTrustee === null, 'aucune part remise avant la confirmation du client');

title('Le client confirme après avoir comparé le code de la clé');
const wrong = await call('POST', `${PARTNER}/invitations/${inviteId}/confirm`, { clientId: 'someone-else' });
expect(wrong.code === 403, 'un autre que le client ne peut pas confirmer');
const confirmed = await call('POST', `${PARTNER}/invitations/${inviteId}/confirm`, { clientId });
expect(confirmed.code === 200, 'remise confirmée par le client');

title('La personne de confiance récupère sa part');
const ready = await call('GET', `${PARTNER}/invitations/${inviteId}`);
const collectedShare = await openSealed(ready.json.sealedForTrustee, trustee.privateKey);
expect(collectedShare === m.shares.tiers, 'part ouverte avec sa clé : c’est bien la part TIERS du wallet');
const outsider = await generateSealingKeyPair(false);
const unreadable = await openSealed(ready.json.sealedForTrustee, outsider.privateKey).then(
  () => false,
  () => true,
);
expect(unreadable, 'illisible avec une autre clé');
const collected = await call('POST', `${PARTNER}/invitations/${inviteId}/collected`, {});
expect(collected.code === 200, 'réception confirmée');
const after = await call('GET', `${PARTNER}/shares/${walletId}`);
expect(after.json.holder === 'trustee' && after.json.trusteeName === trusteeName, 'le partenaire a détruit sa copie');
const again = await call('POST', `${PARTNER}/invitations`, { walletId, clientId, trusteeName: 'Quelqu’un d’autre' });
expect(again.code === 409, 'la part ne peut plus être confiée une seconde fois par le partenaire');

title('Téléphone perdu : le nouvel appareil du client demande la part');
const device = await generateSealingKeyPair(false);
const release = await call('POST', `${PARTNER}/release`, {
  walletId,
  clientId,
  devicePublicKey: await exportPublicJwk(device.publicKey),
});
expect(release.code === 200, 'demande de libération ouverte');
const releaseId: string = release.json.releaseId;
const waiting = await call('GET', `${PARTNER}/release/${releaseId}`);
expect(
  waiting.json.status === 'pending' && waiting.json.awaiting === 'trustee' && !waiting.json.sealedForDevice,
  'le partenaire ne peut rien libérer seul : il attend la personne de confiance',
);

title('La personne de confiance vérifie l’identité du client, puis approuve');
const requests = (await call('GET', `${PARTNER}/invitations/${inviteId}`)).json.requests;
expect(requests.length === 1 && requests[0].releaseId === releaseId, 'la demande apparaît dans son portail');
const forged = await call('POST', `${PARTNER}/release/${releaseId}/fulfil`, {
  inviteId: 'not-the-invitation',
  sealedForDevice: await sealFor(requests[0].devicePublicKey, collectedShare),
});
expect(forged.code === 404, 'sans le lien d’invitation, impossible d’approuver à sa place');
const approved = await call('POST', `${PARTNER}/release/${releaseId}/fulfil`, {
  inviteId,
  sealedForDevice: await sealFor(requests[0].devicePublicKey, collectedShare),
});
expect(approved.code === 200, 'part re-scellée sur son appareil pour le nouvel appareil du client');

title('Le délai de sécurité du partenaire s’applique quand même');
let delivered = await call('GET', `${PARTNER}/release/${releaseId}`);
expect(
  approved.json.secondsLeft === 0 || delivered.json.status === 'pending',
  `part retenue pendant le délai (${approved.json.secondsLeft} s restantes)`,
);
while (delivered.json.status === 'pending') {
  process.stdout.write(`\r  …   ${delivered.json.secondsLeft} s `);
  await sleep(2000);
  delivered = await call('GET', `${PARTNER}/release/${releaseId}`);
}
process.stdout.write('\r');
expect(delivered.json.status === 'released', 'part transmise après le délai');

title('Sur le nouvel appareil : les deux moitiés redonnent la clé de secours');
const tiers = await openSealed(delivered.json.sealedForDevice, device.privateKey);
expect(tiers === m.shares.tiers, 'part de la personne de confiance ouverte avec la clé de l’appareil');
const alone = (() => {
  try {
    backupRootFromShares([tiers], cfg.network);
    return false;
  } catch {
    return true;
  }
})();
expect(alone, 'seule, cette part ne restaure rien (I2)');
const root = backupRootFromShares([m.shares.client, tiers], cfg.network);
expect(accountOrigin(root).xpub === m.backupKey.xpub, 'part du client + part de la personne de confiance = clé de secours du wallet');

console.log('\nPersonne de confiance : toutes les vérifications passent.');
