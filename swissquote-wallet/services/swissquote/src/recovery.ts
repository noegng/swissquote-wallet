// [MOCK] Recovery after the phone is lost, on the Swissquote side (skill custody-invariants).
//   1. The client, on a new device, opens a recovery: stronger identity check
//      (MOCK), the wallet is FROZEN (no payment at all), notification, delay.
//   2. During the delay, the real client can cancel: passkey of the old device OR client-area
//      session (if they no longer have their phone). Cancelling protects: the session is enough.
//   3. After the delay: Swissquote creates the new wallet (new SQ key), then cosigns the
//      sweep, only if it is already signed by the BACKUP KEY (not by the lost phone,
//      which a thief could have) and if every output goes to the new wallet. This sweep
//      can be cosigned again under the same conditions (failed broadcast, funds that arrive later): it
//      can only take the funds to the new wallet.
//   4. All passkeys are revoked, except the new device's (declared when the recovery is opened).
// Swissquote alone can do nothing: without the backup key (CLIENT share + partner share), no
// sweep is possible.
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { deriveAddress, everyInputSignedBy, psbtFromBase64, signWithRoot, summarizeSpend } from '@sqw/core';
import { authorizeProtective, clientFromAuthHeader, credentialBelongsTo, revokeCredentialsExcept } from './auth';
import {
  cfg,
  createWalletRecord,
  getSigner,
  isKeyOrigin,
  notify,
  plain,
  saveWallet,
  statusOf,
  wallets,
  type WalletRecord,
} from './context';
import { audit, readJson, writeJson } from './store';

export const RECOVERY_DELAY_SECONDS = Number(process.env.RECOVERY_DELAY_SECONDS ?? 30);
const PRODUCTION_DELAY = process.env.PRODUCTION_RECOVERY_DELAY_LABEL ?? '7 days';

interface RecoveryTicket {
  id: string;
  walletId: string;
  clientId: string;
  status: 'pending' | 'cancelled' | 'completed';
  identityCheck: string;
  createdAt: string;
  executeAfter: number;
  /** Passkey of the new device: the only one kept at the end of the recovery. */
  deviceCredentialId: string;
  /** Was the wallet already frozen by the client when the recovery opened (restored if it is cancelled)? */
  wasFrozenByClient: boolean;
  newWalletId?: string;
}

const tickets = () => readJson<Record<string, RecoveryTicket>>('recoveries.json', {});
const saveTicket = (t: RecoveryTicket) => writeJson('recoveries.json', { ...tickets(), [t.id]: t });
const secondsLeft = (t: RecoveryTicket) => Math.max(0, Math.ceil((t.executeAfter - Date.now()) / 1000));

/** Addresses (receive and change) of the first indexes of the new wallet. */
function addressesOf(wallet: WalletRecord, count = 20): Set<string> {
  const out = new Set<string>();
  for (const chain of [0, 1] as const) {
    for (let i = 0; i < count; i++) out.add(deriveAddress(wallet.policy, chain, i, cfg.network).address);
  }
  return out;
}

/**
 * Freeze requested by the client while a recovery is in progress (the wallet is already frozen by
 * it): we remember it, so that cancelling the recovery leaves the wallet frozen.
 */
export function rememberClientFreeze(walletId: string): boolean {
  const t = Object.values(tickets()).find((x) => x.walletId === walletId && x.status === 'pending');
  if (!t || t.wasFrozenByClient) return false;
  saveTicket({ ...t, wasFrozenByClient: true });
  return true;
}

export function registerRecoveryRoutes(app: FastifyInstance): void {
  // Wallets of the logged-in client: this is how a new device finds the wallet to recover.
  app.get('/clients/me/wallets', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    if (!clientId) return reply.code(401).send({ mock: true, error: 'Session required' });
    const mine = Object.values(wallets())
      // Wallets of this network only: a regtest wallet has no place in a signet session.
      .filter((w) => w.clientId === clientId && w.network === cfg.name)
      .map((w) => ({ walletId: w.walletId, status: statusOf(w), policy: w.policy, createdAt: w.createdAt }));
    return { mock: true, wallets: mine };
  });

  app.post('/recovery', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    if (!clientId) return reply.code(401).send({ mock: true, error: 'Session required' });
    const { walletId, deviceCredentialId } = (req.body ?? {}) as { walletId?: string; deviceCredentialId?: string };
    const wallet = walletId ? wallets()[walletId] : undefined;
    if (!wallet || wallet.clientId !== clientId) return reply.code(404).send({ mock: true, error: 'Unknown wallet' });
    if (!deviceCredentialId || !credentialBelongsTo(clientId, deviceCredentialId)) {
      return reply.code(400).send({ mock: true, error: 'The new device passkey is required (deviceCredentialId)' });
    }
    const frozenByClient = statusOf(wallet) === 'frozen' && wallet.frozenBy === 'client';
    if (statusOf(wallet) === 'frozen' && !frozenByClient) {
      return reply.code(409).send({
        mock: true,
        error:
          'A recovery is already in progress for this wallet (started from another device). ' +
          'If this is not you, cancel it from your phone; otherwise, wait until it is cancelled or complete.',
      });
    }
    if (statusOf(wallet) === 'recovered') {
      return reply.code(409).send({ mock: true, error: 'This wallet was already recovered to a new wallet' });
    }
    const ticket: RecoveryTicket = {
      id: randomUUID(),
      walletId: wallet.walletId,
      clientId,
      status: 'pending',
      identityCheck: 'MOCK: stronger identity check (video) assumed successful',
      createdAt: new Date().toISOString(),
      executeAfter: Date.now() + RECOVERY_DELAY_SECONDS * 1000,
      deviceCredentialId,
      wasFrozenByClient: frozenByClient,
    };
    saveTicket(ticket);
    saveWallet({ ...wallet, status: 'frozen', frozenBy: 'recovery' });
    audit('recovery.opened', { walletId: wallet.walletId, recoveryId: ticket.id, identityCheck: ticket.identityCheck });
    notify(
      wallet.walletId,
      `Recovery of your wallet requested from a new device. Payments are frozen. It will complete in ` +
        `${RECOVERY_DELAY_SECONDS} s (${PRODUCTION_DELAY} in production). If this is not you, cancel from your phone ` +
        `or your Swissquote client area.`,
    );
    return {
      mock: true,
      recoveryId: ticket.id,
      executeAfter: new Date(ticket.executeAfter).toISOString(),
      delaySeconds: RECOVERY_DELAY_SECONDS,
      productionDelay: PRODUCTION_DELAY,
    };
  });

  // Public state of a wallet: the old device sees that a recovery is in progress and can cancel it.
  app.get('/wallets/:id/recovery', async (req, reply) => {
    const wallet = wallets()[(req.params as { id: string }).id];
    if (!wallet) return reply.code(404).send({ mock: true, error: 'Unknown wallet' });
    const active = Object.values(tickets()).find((t) => t.walletId === wallet.walletId && t.status === 'pending');
    return {
      mock: true,
      status: statusOf(wallet),
      recoveredTo: wallet.recoveredTo ?? null,
      recovery: active ? { recoveryId: active.id, secondsLeft: secondsLeft(active) } : null,
    };
  });

  app.get('/recovery/:id', async (req, reply) => {
    const t = tickets()[(req.params as { id: string }).id];
    if (!t) return reply.code(404).send({ mock: true, error: 'Unknown recovery' });
    return { mock: true, status: t.status, secondsLeft: secondsLeft(t), walletId: t.walletId, newWalletId: t.newWalletId };
  });

  // Cancellation by the real client: passkey of the old device (challenge bound to this recovery) OR
  // client-area session (stolen phone). The wallet goes back to its previous state.
  app.post('/recovery/:id/cancel', async (req, reply) => {
    const t = tickets()[(req.params as { id: string }).id];
    if (!t) return reply.code(404).send({ mock: true, error: 'Unknown recovery' });
    if (t.status !== 'pending') return reply.code(409).send({ mock: true, error: `Recovery already ${t.status}` });
    let via: 'session' | 'passkey';
    try {
      via = await authorizeProtective(
        t.clientId,
        req.headers.authorization,
        t.id,
        (req.body as { authentication?: never })?.authentication,
      );
    } catch (e) {
      audit('recovery.cancel.unauthenticated', { recoveryId: t.id, reason: String(e) });
      return reply.code(401).send({ mock: true, status: 'unauthenticated', reason: (e as Error).message });
    }
    saveTicket({ ...t, status: 'cancelled' });
    const wallet = wallets()[t.walletId];
    saveWallet(
      t.wasFrozenByClient
        ? { ...wallet, status: 'frozen', frozenBy: 'client' }
        : { ...wallet, status: 'active', frozenBy: undefined },
    );
    audit('recovery.cancelled', { walletId: t.walletId, recoveryId: t.id, via });
    notify(
      t.walletId,
      `Recovery cancelled (${via === 'session' ? 'client area' : 'passkey'}). ` +
        (t.wasFrozenByClient ? 'The wallet stays frozen, as you asked.' : 'Payments unfrozen.'),
    );
    return { mock: true, status: 'cancelled', via };
  });

  // After the delay: a new wallet with the device's new keys and a new Swissquote key.
  app.post('/recovery/:id/new-wallet', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    const t = tickets()[(req.params as { id: string }).id];
    if (!t || t.clientId !== clientId) return reply.code(404).send({ mock: true, error: 'Unknown recovery' });
    if (t.status !== 'pending') return reply.code(409).send({ mock: true, error: `Recovery ${t.status}` });
    if (secondsLeft(t) > 0) {
      return reply.code(425).send({ mock: true, error: 'Security delay in progress', secondsLeft: secondsLeft(t) });
    }
    const body = req.body as { phoneKey?: unknown; backupKey?: unknown };
    if (!isKeyOrigin(body?.phoneKey) || !isKeyOrigin(body?.backupKey)) {
      return reply.code(400).send({ mock: true, error: 'phoneKey and backupKey are required' });
    }
    const record = createWalletRecord(t.clientId, body.phoneKey, body.backupKey);
    saveTicket({ ...t, newWalletId: record.walletId });
    audit('recovery.new-wallet', { recoveryId: t.id, oldWalletId: t.walletId, newWalletId: record.walletId });
    return { mock: true, newWalletId: record.walletId, policy: record.policy, descriptor: record.descriptor };
  });

  // Sweep of all funds to the new wallet, under conditions. The first cosignature closes
  // the recovery; later ones (same conditions) retry a failed broadcast or
  // bring back funds that arrived later on the old wallet, which would otherwise stay stuck there.
  app.post('/recovery/:id/sweep', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    const t = tickets()[(req.params as { id: string }).id];
    if (!t || t.clientId !== clientId) return reply.code(404).send({ mock: true, error: 'Unknown recovery' });
    if (t.status === 'cancelled' || !t.newWalletId) {
      return reply.code(409).send({ mock: true, error: 'Recovery not ready (no new wallet yet) or cancelled' });
    }
    if (secondsLeft(t) > 0) return reply.code(425).send({ mock: true, error: 'Security delay in progress' });
    const oldWallet = wallets()[t.walletId];
    const newWallet = wallets()[t.newWalletId];

    const refuse = (reason: string) => {
      audit('recovery.sweep.refused', { recoveryId: t.id, reason });
      return reply.code(403).send({ mock: true, status: 'refused', reason });
    };
    let psbt;
    let summary;
    try {
      psbt = psbtFromBase64((req.body as { psbt?: string })?.psbt ?? '', cfg.network);
      summary = summarizeSpend(psbt, oldWallet.policy, cfg.network, oldWallet.policy.keys[1]);
    } catch (e) {
      return refuse((e as Error).message);
    }
    if (summary.change > 0n) return refuse('The sweep must not send anything back to the old wallet');
    const allowed = addressesOf(newWallet);
    const stray = summary.external.find((o) => !allowed.has(o.address));
    if (stray) return refuse(`Output outside the new wallet: ${stray.address}`);
    if (!everyInputSignedBy(psbt, oldWallet.policy.keys[2])) {
      return refuse('Backup key signature required (the lost phone key is not enough)');
    }

    signWithRoot(psbt, getSigner().root);
    if (t.status === 'completed') {
      audit('recovery.sweep.repeated', { recoveryId: t.id, newWalletId: newWallet.walletId, summary: plain(summary) });
      return { mock: true, status: 'signed', psbt: psbt.toBase64(), revokedPasskeys: 0 };
    }
    saveTicket({ ...t, status: 'completed' });
    saveWallet({ ...oldWallet, status: 'recovered', recoveredTo: newWallet.walletId });
    const revoked = revokeCredentialsExcept(t.clientId, t.deviceCredentialId);
    audit('recovery.completed', { recoveryId: t.id, oldWalletId: oldWallet.walletId, newWalletId: newWallet.walletId, revokedPasskeys: revoked, summary: plain(summary) });
    notify(oldWallet.walletId, `Recovery complete: funds moved to your new wallet. ${revoked} old passkey(s) revoked.`);
    notify(newWallet.walletId, 'New wallet active after recovery. Remember to store your new backup share.');
    return { mock: true, status: 'signed', psbt: psbt.toBase64(), revokedPasskeys: revoked };
  });
}
