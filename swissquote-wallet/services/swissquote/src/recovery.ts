// [MOCK] Récupération après perte du téléphone, côté Swissquote (skill custody-invariants).
//   1. Le client, sur un nouvel appareil, ouvre une récupération : vérification d'identité renforcée
//      (MOCK), le wallet est GELÉ (plus aucun paiement), notification, délai.
//   2. Pendant le délai, le vrai client peut annuler : passkey de l'ancien appareil OU session de
//      l'espace client (s'il n'a plus son téléphone). Annuler protège : la session suffit.
//   3. Après le délai : Swissquote crée le nouveau wallet (nouvelle clé SQ), puis cosigne le
//      transfert, seulement s'il est déjà signé par la CLÉ DE SECOURS (pas par le téléphone perdu,
//      qu'un voleur pourrait avoir) et si toutes les sorties vont au nouveau wallet. Ce transfert
//      peut être recosigné aux mêmes conditions (diffusion échouée, fonds arrivés plus tard) : il ne
//      peut mener les fonds que vers le nouveau wallet.
//   4. Toutes les passkeys sont révoquées, sauf celle du nouvel appareil (déclarée à l'ouverture).
// Swissquote seul ne peut rien : sans la clé de secours (part CLIENT + part du partenaire), pas de
// transfert possible.
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
  /** Passkey du nouvel appareil : la seule conservée à la fin de la récupération. */
  deviceCredentialId: string;
  /** Le wallet était-il déjà gelé par le client à l'ouverture (rétabli si la récupération est annulée) ? */
  wasFrozenByClient: boolean;
  newWalletId?: string;
}

const tickets = () => readJson<Record<string, RecoveryTicket>>('recoveries.json', {});
const saveTicket = (t: RecoveryTicket) => writeJson('recoveries.json', { ...tickets(), [t.id]: t });
const secondsLeft = (t: RecoveryTicket) => Math.max(0, Math.ceil((t.executeAfter - Date.now()) / 1000));

/** Adresses (réception et change) des premiers index du nouveau wallet. */
function addressesOf(wallet: WalletRecord, count = 20): Set<string> {
  const out = new Set<string>();
  for (const chain of [0, 1] as const) {
    for (let i = 0; i < count; i++) out.add(deriveAddress(wallet.policy, chain, i, cfg.network).address);
  }
  return out;
}

/**
 * Gel demandé par le client pendant une récupération déjà en cours (le wallet est déjà gelé par
 * celle-ci) : on le retient, pour que l'annulation de la récupération laisse le wallet gelé.
 */
export function rememberClientFreeze(walletId: string): boolean {
  const t = Object.values(tickets()).find((x) => x.walletId === walletId && x.status === 'pending');
  if (!t || t.wasFrozenByClient) return false;
  saveTicket({ ...t, wasFrozenByClient: true });
  return true;
}

export function registerRecoveryRoutes(app: FastifyInstance): void {
  // Wallets du client connecté : un nouvel appareil retrouve ainsi son wallet à récupérer.
  app.get('/clients/me/wallets', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    if (!clientId) return reply.code(401).send({ mock: true, error: 'Session requise' });
    const mine = Object.values(wallets())
      // Wallets de ce réseau seulement : un wallet regtest n'a rien à faire dans une session signet.
      .filter((w) => w.clientId === clientId && w.network === cfg.name)
      .map((w) => ({ walletId: w.walletId, status: statusOf(w), policy: w.policy, createdAt: w.createdAt }));
    return { mock: true, wallets: mine };
  });

  app.post('/recovery', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    if (!clientId) return reply.code(401).send({ mock: true, error: 'Session requise' });
    const { walletId, deviceCredentialId } = (req.body ?? {}) as { walletId?: string; deviceCredentialId?: string };
    const wallet = walletId ? wallets()[walletId] : undefined;
    if (!wallet || wallet.clientId !== clientId) return reply.code(404).send({ mock: true, error: 'Wallet inconnu' });
    if (!deviceCredentialId || !credentialBelongsTo(clientId, deviceCredentialId)) {
      return reply.code(400).send({ mock: true, error: 'Passkey du nouvel appareil requise (deviceCredentialId)' });
    }
    const frozenByClient = statusOf(wallet) === 'frozen' && wallet.frozenBy === 'client';
    if (statusOf(wallet) === 'frozen' && !frozenByClient) {
      return reply.code(409).send({
        mock: true,
        error:
          'Une récupération est déjà en cours pour ce wallet (lancée depuis un autre appareil). ' +
          'Si ce n’est pas vous, annulez-la depuis votre téléphone ; sinon, attendez qu’elle soit annulée ou terminée.',
      });
    }
    if (statusOf(wallet) === 'recovered') {
      return reply.code(409).send({ mock: true, error: 'Ce wallet a déjà été récupéré vers un nouveau wallet' });
    }
    const ticket: RecoveryTicket = {
      id: randomUUID(),
      walletId: wallet.walletId,
      clientId,
      status: 'pending',
      identityCheck: 'MOCK : vérification d’identité renforcée (vidéo) supposée réussie',
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

  // État public d'un wallet : l'ancien appareil voit qu'une récupération est en cours et peut l'annuler.
  app.get('/wallets/:id/recovery', async (req, reply) => {
    const wallet = wallets()[(req.params as { id: string }).id];
    if (!wallet) return reply.code(404).send({ mock: true, error: 'Wallet inconnu' });
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
    if (!t) return reply.code(404).send({ mock: true, error: 'Récupération inconnue' });
    return { mock: true, status: t.status, secondsLeft: secondsLeft(t), walletId: t.walletId, newWalletId: t.newWalletId };
  });

  // Annulation par le vrai client : passkey de l'ancien appareil (défi lié à cette récupération) OU
  // session de l'espace client (téléphone volé). Le wallet revient à son état d'avant.
  app.post('/recovery/:id/cancel', async (req, reply) => {
    const t = tickets()[(req.params as { id: string }).id];
    if (!t) return reply.code(404).send({ mock: true, error: 'Récupération inconnue' });
    if (t.status !== 'pending') return reply.code(409).send({ mock: true, error: `Récupération déjà ${t.status}` });
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

  // Après le délai : nouveau wallet avec les nouvelles clés de l'appareil et une nouvelle clé Swissquote.
  app.post('/recovery/:id/new-wallet', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    const t = tickets()[(req.params as { id: string }).id];
    if (!t || t.clientId !== clientId) return reply.code(404).send({ mock: true, error: 'Récupération inconnue' });
    if (t.status !== 'pending') return reply.code(409).send({ mock: true, error: `Récupération ${t.status}` });
    if (secondsLeft(t) > 0) {
      return reply.code(425).send({ mock: true, error: 'Délai de sécurité en cours', secondsLeft: secondsLeft(t) });
    }
    const body = req.body as { phoneKey?: unknown; backupKey?: unknown };
    if (!isKeyOrigin(body?.phoneKey) || !isKeyOrigin(body?.backupKey)) {
      return reply.code(400).send({ mock: true, error: 'phoneKey et backupKey requis' });
    }
    const record = createWalletRecord(t.clientId, body.phoneKey, body.backupKey);
    saveTicket({ ...t, newWalletId: record.walletId });
    audit('recovery.new-wallet', { recoveryId: t.id, oldWalletId: t.walletId, newWalletId: record.walletId });
    return { mock: true, newWalletId: record.walletId, policy: record.policy, descriptor: record.descriptor };
  });

  // Transfert de tous les fonds vers le nouveau wallet, sous conditions. La première cosignature clôt
  // la récupération ; les suivantes (mêmes conditions) servent à réessayer une diffusion échouée ou
  // à rapatrier des fonds arrivés ensuite sur l'ancien wallet, qui sinon y resteraient bloqués.
  app.post('/recovery/:id/sweep', async (req, reply) => {
    const clientId = clientFromAuthHeader(req.headers.authorization);
    const t = tickets()[(req.params as { id: string }).id];
    if (!t || t.clientId !== clientId) return reply.code(404).send({ mock: true, error: 'Récupération inconnue' });
    if (t.status === 'cancelled' || !t.newWalletId) {
      return reply.code(409).send({ mock: true, error: 'Récupération non prête (nouveau wallet absent) ou annulée' });
    }
    if (secondsLeft(t) > 0) return reply.code(425).send({ mock: true, error: 'Délai de sécurité en cours' });
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
    if (summary.change > 0n) return refuse('Le transfert ne doit rien renvoyer vers l’ancien wallet');
    const allowed = addressesOf(newWallet);
    const stray = summary.external.find((o) => !allowed.has(o.address));
    if (stray) return refuse(`Sortie hors du nouveau wallet : ${stray.address}`);
    if (!everyInputSignedBy(psbt, oldWallet.policy.keys[2])) {
      return refuse('Signature de la clé de secours requise (la clé du téléphone perdu ne suffit pas)');
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
