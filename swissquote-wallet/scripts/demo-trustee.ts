// Trusted person (notary, lawyer): invitation, handover of the PARTNER share, then approval
// of a recovery request. Against the running partner service, WITHOUT Swissquote or the Bitcoin
// network: this scheme depends on the partner only.
//   npm run demo:trustee
// The script plays three roles, each with its own keys: the client, the trusted person
// and the client's new device.
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
  if (!condition) throw new Error(`FAIL: ${text}`);
  ok(text);
}

const walletId = `demo-trustee-${Date.now()}`;
const clientId = `client-trustee-${Date.now()}`;
const trusteeName = 'Me Dupont, notaire';

title('Creation: the PARTNER share goes to the partner, as today');
const m = createWalletMaterial(cfg.network);
const partnerKey = (await call('GET', `${PARTNER}/public-key`)).json.publicKey;
const deposit = await call('POST', `${PARTNER}/shares`, {
  walletId,
  clientId,
  sealedShare: await sealFor(partnerKey, m.shares.tiers),
});
expect(deposit.code === 200, 'PARTNER share deposited, sealed for the partner');

title('Invitation of the trusted person');
const stranger = await call('POST', `${PARTNER}/invitations`, { walletId, clientId: 'someone-else', trusteeName });
expect(stranger.code === 404, 'another client cannot invite for this wallet');
const invited = await call('POST', `${PARTNER}/invitations`, { walletId, clientId, trusteeName });
expect(invited.code === 200 && invited.json.inviteId, 'invitation created by the client');
const inviteId: string = invited.json.inviteId;
const status = await call('GET', `${PARTNER}/shares/${walletId}`);
expect(!JSON.stringify(status.json).includes(inviteId), 'the invitation link is not exposed by the public status');
expect(status.json.holder === 'partner', 'the partner still holds the share');

title('The trusted person accepts with a key created on their device');
const trustee = await generateSealingKeyPair(false);
const accepted = await call('POST', `${PARTNER}/invitations/${inviteId}/accept`, {
  publicKey: await exportPublicJwk(trustee.publicKey),
});
expect(accepted.code === 200, 'invitation accepted');
const early = await call('GET', `${PARTNER}/invitations/${inviteId}`);
expect(early.json.sealedForTrustee === null, 'no share handed over before the client confirms');

title('The client confirms after comparing the key code');
const wrong = await call('POST', `${PARTNER}/invitations/${inviteId}/confirm`, { clientId: 'someone-else' });
expect(wrong.code === 403, 'nobody but the client can confirm');
const confirmed = await call('POST', `${PARTNER}/invitations/${inviteId}/confirm`, { clientId });
expect(confirmed.code === 200, 'handover confirmed by the client');

title('The trusted person collects their share');
const ready = await call('GET', `${PARTNER}/invitations/${inviteId}`);
const collectedShare = await openSealed(ready.json.sealedForTrustee, trustee.privateKey);
expect(collectedShare === m.shares.tiers, 'share opened with their key: it is the wallet’s PARTNER share');
const outsider = await generateSealingKeyPair(false);
const unreadable = await openSealed(ready.json.sealedForTrustee, outsider.privateKey).then(
  () => false,
  () => true,
);
expect(unreadable, 'unreadable with another key');
const collected = await call('POST', `${PARTNER}/invitations/${inviteId}/collected`, {});
expect(collected.code === 200, 'receipt confirmed');
const after = await call('GET', `${PARTNER}/shares/${walletId}`);
expect(after.json.holder === 'trustee' && after.json.trusteeName === trusteeName, 'the partner destroyed its copy');
const again = await call('POST', `${PARTNER}/invitations`, { walletId, clientId, trusteeName: 'Quelqu’un d’autre' });
expect(again.code === 409, 'the partner can no longer entrust the share a second time');

title('Lost phone: the client’s new device requests the share');
const device = await generateSealingKeyPair(false);
const release = await call('POST', `${PARTNER}/release`, {
  walletId,
  clientId,
  devicePublicKey: await exportPublicJwk(device.publicKey),
});
expect(release.code === 200, 'release request opened');
const releaseId: string = release.json.releaseId;
const waiting = await call('GET', `${PARTNER}/release/${releaseId}`);
expect(
  waiting.json.status === 'pending' && waiting.json.awaiting === 'trustee' && !waiting.json.sealedForDevice,
  'the partner cannot release anything alone: it waits for the trusted person',
);

title('The trusted person checks the client’s identity, then approves');
const requests = (await call('GET', `${PARTNER}/invitations/${inviteId}`)).json.requests;
expect(requests.length === 1 && requests[0].releaseId === releaseId, 'the request appears in their portal');
const forged = await call('POST', `${PARTNER}/release/${releaseId}/fulfil`, {
  inviteId: 'not-the-invitation',
  sealedForDevice: await sealFor(requests[0].devicePublicKey, collectedShare),
});
expect(forged.code === 404, 'without the invitation link, nobody can approve in their place');
const approved = await call('POST', `${PARTNER}/release/${releaseId}/fulfil`, {
  inviteId,
  sealedForDevice: await sealFor(requests[0].devicePublicKey, collectedShare),
});
expect(approved.code === 200, 'share re-sealed on their device for the client’s new device');

title('The partner’s security delay still applies');
let delivered = await call('GET', `${PARTNER}/release/${releaseId}`);
expect(
  approved.json.secondsLeft === 0 || delivered.json.status === 'pending',
  `share held during the delay (${approved.json.secondsLeft} s left)`,
);
while (delivered.json.status === 'pending') {
  process.stdout.write(`\r  …   ${delivered.json.secondsLeft} s `);
  await sleep(2000);
  delivered = await call('GET', `${PARTNER}/release/${releaseId}`);
}
process.stdout.write('\r');
expect(delivered.json.status === 'released', 'share sent after the delay');

title('On the new device: both halves give back the backup key');
const tiers = await openSealed(delivered.json.sealedForDevice, device.privateKey);
expect(tiers === m.shares.tiers, 'the trusted person’s share opened with the device key');
const alone = (() => {
  try {
    backupRootFromShares([tiers], cfg.network);
    return false;
  } catch {
    return true;
  }
})();
expect(alone, 'alone, this share restores nothing (I2)');
const root = backupRootFromShares([m.shares.client, tiers], cfg.network);
expect(accountOrigin(root).xpub === m.backupKey.xpub, 'client share + trusted person share = the wallet’s backup key');

console.log('\nTrusted person: all checks pass.');
