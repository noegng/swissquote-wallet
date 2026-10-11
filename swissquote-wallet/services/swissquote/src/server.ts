// [MOCK] Swissquote service: login (simulated KYC), passkeys, wallet registry (Travel Rule),
// rule-enforcing cosigner, "out-of-band" notifications. Separate process with its own
// storage (data/). Recovery lives in recovery.ts. See the mock-service skill.
import './env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { psbtFromBase64, signWithRoot, summarizeSpend, deriveAddress } from '@sqw/core';
import { audit, readJson, resetData, SERVICE, writeJson } from './store';
import {
  authorizeProtective,
  clientFromAuthHeader,
  deviceProofOptions,
  verifyDeviceProof,
  hasPasskey,
  login,
  operationOptions,
  registrationOptions,
  verifyOperation,
  verifyRegistration,
  type Purpose,
} from './auth';
import {
  DAILY_LIMIT_SATS,
  decide,
  HIGH_VALUE_DELAY_SECONDS,
  outgoing,
  recordSpend,
  sanctionedAddresses,
  spentLast24h,
} from './rules';
import {
  btcAmount,
  cfg,
  createWalletRecord,
  getSigner,
  isKeyOrigin,
  notify,
  plain,
  resetSigner,
  saveWallet,
  statusOf,
  wallets,
  type WalletRecord,
} from './context';
import { registerRecoveryRoutes, rememberClientFreeze } from './recovery';

interface CosignRequest {
  id: string;
  walletId: string;
  psbt: string;
  summary: Record<string, unknown>;
  status: 'pending' | 'signed' | 'cancelled';
  reason: string;
  createdAt: number;
  executeAfter: number;
}

const requests = () => readJson<Record<string, CosignRequest>>('requests.json', {});
const saveRequest = (r: CosignRequest) => writeJson('requests.json', { ...requests(), [r.id]: r });

/** Decodes the PSBT and checks that it only uses the wallet's funds, change included. */
function cosign(wallet: WalletRecord, psbtBase64: string) {
  const psbt = psbtFromBase64(psbtBase64, cfg.network);
  const summary = summarizeSpend(psbt, wallet.policy, cfg.network, wallet.policy.keys[1]);
  return { psbt, summary };
}

const frozenReason = (w: WalletRecord) =>
  statusOf(w) === 'recovered'
    ? 'Wallet recovered: the funds were moved to a new wallet'
    : w.frozenBy === 'client'
      ? 'Wallet frozen by the client (phone lost or stolen): unfreeze with the passkey, or recover'
      : 'Wallet frozen: a recovery is in progress (the client can cancel it)';

/** Cancels every pending large payment of a wallet (freeze). Returns how many. */
function cancelPendingRequests(walletId: string, reason: string): number {
  const all = requests();
  const pending = Object.values(all).filter((r) => r.walletId === walletId && r.status === 'pending');
  for (const r of pending) all[r.id] = { ...r, status: 'cancelled' };
  writeJson('requests.json', all);
  for (const r of pending) audit('cosign.cancelled', { walletId, requestId: r.id, reason });
  return pending.length;
}

const app = Fastify();
await app.register(cors, { origin: process.env.ORIGIN ?? 'http://localhost:5173' });

app.get('/health', async () => ({ mock: true, service: SERVICE, ok: true, network: cfg.name }));

// Login to the Swissquote client area. MOCK: KYC is assumed to be done by the bank already.
app.post('/kyc/login', async (req, reply) => {
  const clientId = (req.body as { clientId?: string })?.clientId?.trim().toLowerCase() ?? '';
  const token = login(clientId);
  if (!token) return reply.code(400).send({ mock: true, error: 'Invalid client ID (3 to 40 characters: a-z, 0-9, -)' });
  return { mock: true, token, clientId, hasPasskey: hasPasskey(clientId) };
});

// Creation of the client's passkey (session required). The private key stays in the device's chip.
app.post('/webauthn/register/options', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session required' });
  return registrationOptions(clientId);
});

app.post('/webauthn/register/verify', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session required' });
  try {
    const info = await verifyRegistration(clientId, (req.body as { response: never }).response);
    return { mock: true, verified: true, ...info };
  } catch (e) {
    audit('passkey.refused', { clientId, reason: String(e) });
    return reply.code(400).send({ mock: true, verified: false, error: (e as Error).message });
  }
});

// Proof that a device already holds one of the client's passkeys (recovery on a device where the passkey
// is synced: the browser refuses to create a second one).
app.post('/webauthn/device/options', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session required' });
  if (!hasPasskey(clientId)) return reply.code(404).send({ mock: true, error: 'No passkey for this client' });
  return deviceProofOptions(clientId);
});

app.post('/webauthn/device/verify', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session required' });
  try {
    const credentialId = await verifyDeviceProof(clientId, (req.body as { response?: never })?.response);
    return { mock: true, verified: true, credentialId };
  } catch (e) {
    return reply.code(401).send({ mock: true, verified: false, error: (e as Error).message });
  }
});

// Passkey challenge bound to an operation: PSBT hash (cosign) or request id (cancel).
app.post('/webauthn/operation/options', async (req, reply) => {
  const body = req.body as { walletId?: string; purpose?: Purpose; payload?: string };
  const wallet = body?.walletId ? wallets()[body.walletId] : undefined;
  if (body?.walletId && !wallet) {
    return reply.code(404).send({ mock: true, error: 'Wallet unknown to Swissquote (was the service data reset?)' });
  }
  if (!wallet || !body.payload || !['cosign', 'cancel', 'unfreeze'].includes(body.purpose ?? '')) {
    return reply.code(400).send({ mock: true, error: 'walletId, purpose (cosign|cancel|unfreeze) and payload are required' });
  }
  return operationOptions(wallet.clientId, body.purpose!, body.payload);
});

// Wallet creation: Swissquote derives its key for this client and registers the descriptor.
// The registration proves that the addresses belong to the client (Travel Rule, with no extra step).
app.post('/wallets', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session required' });
  if (!hasPasskey(clientId)) return reply.code(403).send({ mock: true, error: 'Create a passkey before the wallet' });
  const body = req.body as { phoneKey?: unknown; backupKey?: unknown };
  if (!isKeyOrigin(body?.phoneKey) || !isKeyOrigin(body?.backupKey)) {
    return reply.code(400).send({ mock: true, error: 'phoneKey and backupKey are required' });
  }
  const record = createWalletRecord(clientId, body.phoneKey, body.backupKey);
  audit('wallet.created', { walletId: record.walletId, clientId, account: record.account });
  return {
    mock: true,
    walletId: record.walletId,
    swissquoteKey: record.policy.keys[1],
    policy: record.policy,
    descriptor: record.descriptor,
    firstAddress: deriveAddress(record.policy, 0, 0, cfg.network).address,
  };
});

app.get('/wallets/:id', async (req, reply) => {
  const w = wallets()[(req.params as { id: string }).id];
  return w ? { mock: true, ...w } : reply.code(404).send({ mock: true, error: 'Unknown wallet' });
});

// Cosigning: requires a fresh passkey assertion whose challenge carries this PSBT's hash.
app.post('/cosign', async (req, reply) => {
  const body = req.body as { walletId?: string; psbt?: string; authentication?: never };
  const wallet = body?.walletId ? wallets()[body.walletId] : undefined;
  if (!wallet || !body.psbt) return reply.code(400).send({ mock: true, error: 'walletId and psbt are required' });
  if (statusOf(wallet) !== 'active') {
    audit('cosign.refused', { walletId: wallet.walletId, reason: frozenReason(wallet) });
    return reply.code(423).send({ mock: true, status: 'refused', reason: frozenReason(wallet) });
  }
  try {
    await verifyOperation(wallet.clientId, 'cosign', body.psbt, body.authentication);
  } catch (e) {
    audit('cosign.unauthenticated', { walletId: wallet.walletId, reason: String(e) });
    return reply.code(401).send({ mock: true, status: 'unauthenticated', reason: (e as Error).message });
  }

  let analysed;
  try {
    analysed = cosign(wallet, body.psbt);
  } catch (e) {
    audit('cosign.refused', { walletId: wallet.walletId, reason: String(e) });
    return reply.code(403).send({ mock: true, status: 'refused', reason: (e as Error).message });
  }
  const decision = decide(wallet.walletId, analysed.summary);
  const summary = plain(analysed.summary);

  if (decision.kind === 'refuse') {
    audit('cosign.refused', { walletId: wallet.walletId, reason: decision.reason, summary });
    notify(wallet.walletId, `Payment refused: ${decision.reason}`);
    return reply.code(403).send({ mock: true, status: 'refused', reason: decision.reason, summary });
  }

  if (decision.kind === 'hold') {
    const request: CosignRequest = {
      id: randomUUID(),
      walletId: wallet.walletId,
      psbt: body.psbt,
      summary,
      status: 'pending',
      reason: decision.reason,
      createdAt: Date.now(),
      executeAfter: Date.now() + HIGH_VALUE_DELAY_SECONDS * 1000,
    };
    saveRequest(request);
    audit('cosign.held', { walletId: wallet.walletId, requestId: request.id, reason: decision.reason, summary });
    notify(
      wallet.walletId,
      `Large payment on hold: ${btcAmount(summary.sentExternal)} sent + ${btcAmount(summary.fee)} network fee. ` +
        `It will leave in ${HIGH_VALUE_DELAY_SECONDS} s unless cancelled. If this is not you, cancel now ` +
        `(from the app or your Swissquote client area).`,
    );
    return reply.code(202).send({
      mock: true,
      status: 'pending',
      tier: 2,
      requestId: request.id,
      executeAfter: new Date(request.executeAfter).toISOString(),
      reason: decision.reason,
      summary,
    });
  }

  signWithRoot(analysed.psbt, getSigner().root);
  recordSpend(wallet.walletId, outgoing(analysed.summary));
  audit('cosign.signed', { walletId: wallet.walletId, tier: 1, summary });
  return {
    mock: true,
    status: 'signed',
    tier: 1,
    psbt: analysed.psbt.toBase64(),
    summary,
  };
});

// Tracking a large payment: signed automatically once the delay is over, unless cancelled.
app.get('/cosign/:id', async (req, reply) => {
  const request = requests()[(req.params as { id: string }).id];
  if (!request) return reply.code(404).send({ mock: true, error: 'Unknown request' });
  if (!wallets()[request.walletId]) return reply.code(404).send({ mock: true, error: 'Unknown wallet' });
  if (request.status === 'pending' && statusOf(wallets()[request.walletId]) !== 'active') {
    // A pending large payment does not leave if the wallet was frozen in the meantime (recovery).
    saveRequest({ ...request, status: 'cancelled' });
    audit('cosign.cancelled', { requestId: request.id, reason: 'wallet frozen' });
    return { mock: true, status: 'cancelled', reason: frozenReason(wallets()[request.walletId]) };
  }
  if (request.status === 'pending' && Date.now() >= request.executeAfter) {
    const wallet = wallets()[request.walletId];
    let analysed;
    try {
      analysed = cosign(wallet, request.psbt);
    } catch (e) {
      saveRequest({ ...request, status: 'cancelled' });
      audit('cosign.cancelled', { requestId: request.id, reason: String(e) });
      return { mock: true, status: 'cancelled', reason: (e as Error).message };
    }
    const { psbt, summary } = analysed;
    signWithRoot(psbt, getSigner().root);
    recordSpend(wallet.walletId, outgoing(summary));
    const signed = { ...request, status: 'signed' as const, psbt: psbt.toBase64() };
    saveRequest(signed);
    audit('cosign.signed', { walletId: wallet.walletId, tier: 2, requestId: request.id });
    notify(wallet.walletId, `Large payment of ${btcAmount(request.summary.sentExternal)} signed after the security delay.`);
    return { mock: true, status: 'signed', tier: 2, psbt: signed.psbt, summary: request.summary };
  }
  const { psbt: _psbt, ...rest } = request;
  return {
    mock: true,
    ...rest,
    ...(request.status === 'signed' ? { psbt: request.psbt } : {}),
    secondsLeft: Math.max(0, Math.ceil((request.executeAfter - Date.now()) / 1000)),
  };
});

// Cancelling a large payment: a protective action, accepted with the passkey (challenge bound to the
// request) OR with the client-area session (a client whose phone was stolen).
app.post('/cosign/:id/cancel', async (req, reply) => {
  const request = requests()[(req.params as { id: string }).id];
  if (!request) return reply.code(404).send({ mock: true, error: 'Unknown request' });
  let via: 'session' | 'passkey';
  try {
    const clientId = wallets()[request.walletId].clientId;
    via = await authorizeProtective(
      clientId,
      req.headers.authorization,
      request.id,
      (req.body as { authentication?: never })?.authentication,
    );
  } catch (e) {
    audit('cancel.unauthenticated', { requestId: request.id, reason: String(e) });
    return reply.code(401).send({ mock: true, status: 'unauthenticated', reason: (e as Error).message });
  }
  if (request.status !== 'pending') {
    return reply.code(409).send({ mock: true, error: `Request already ${request.status}` });
  }
  saveRequest({ ...request, status: 'cancelled' });
  audit('cosign.cancelled', { walletId: request.walletId, requestId: request.id, via });
  notify(request.walletId, `Payment of ${btcAmount(request.summary.sentExternal)} cancelled (${via === 'session' ? 'client area' : 'passkey'}).`);
  return { mock: true, status: 'cancelled', requestId: request.id, via };
});

// Emergency freeze (phone lost or stolen): a protective action, session OR passkey. Blocks all
// cosigning and cancels pending large payments. Does not prevent a recovery.
app.post('/wallets/:id/freeze', async (req, reply) => {
  const wallet = wallets()[(req.params as { id: string }).id];
  if (!wallet) return reply.code(404).send({ mock: true, error: 'Unknown wallet' });
  if (statusOf(wallet) === 'recovered') return reply.code(409).send({ mock: true, error: frozenReason(wallet) });
  let via: 'session' | 'passkey';
  try {
    via = await authorizeProtective(
      wallet.clientId,
      req.headers.authorization,
      `freeze:${wallet.walletId}`,
      (req.body as { authentication?: never })?.authentication,
    );
  } catch (e) {
    audit('freeze.unauthenticated', { walletId: wallet.walletId, reason: String(e) });
    return reply.code(401).send({ mock: true, status: 'unauthenticated', reason: (e as Error).message });
  }
  if (statusOf(wallet) === 'active') saveWallet({ ...wallet, status: 'frozen', frozenBy: 'client' });
  // Already frozen by a recovery: the client's freeze must survive its cancellation.
  else rememberClientFreeze(wallet.walletId);
  const cancelled = cancelPendingRequests(wallet.walletId, 'gel par le client');
  audit('wallet.frozen', { walletId: wallet.walletId, via, cancelledPayments: cancelled });
  notify(
    wallet.walletId,
    `Wallet frozen from ${via === 'session' ? 'your client area' : 'your phone'}. ` +
      `${cancelled} pending payment(s) cancelled. No payment can leave until it is unfrozen or recovered.`,
  );
  return { mock: true, status: 'frozen', cancelledPayments: cancelled, via };
});

// Unfreeze: RELAXES the protection, so the passkey is mandatory (the session alone is not enough).
app.post('/wallets/:id/unfreeze', async (req, reply) => {
  const wallet = wallets()[(req.params as { id: string }).id];
  if (!wallet) return reply.code(404).send({ mock: true, error: 'Unknown wallet' });
  if (wallet.frozenBy !== 'client' || statusOf(wallet) !== 'frozen') {
    return reply.code(409).send({ mock: true, error: 'Only a freeze requested by the client can be lifted here' });
  }
  try {
    await verifyOperation(wallet.clientId, 'unfreeze', wallet.walletId, (req.body as { authentication?: never })?.authentication);
  } catch (e) {
    audit('unfreeze.unauthenticated', { walletId: wallet.walletId, reason: String(e) });
    return reply.code(401).send({ mock: true, status: 'unauthenticated', reason: (e as Error).message });
  }
  saveWallet({ ...wallet, status: 'active', frozenBy: undefined });
  audit('wallet.unfrozen', { walletId: wallet.walletId });
  notify(wallet.walletId, 'Wallet unfrozen with your passkey.');
  return { mock: true, status: 'active' };
});

// "Out-of-band" notification inbox (mock of SMS, emails and client-area alerts).
app.get('/notifications/:walletId', async (req) => {
  const all = readJson<Record<string, unknown[]>>('notifications.json', {});
  return { mock: true, notifications: all[(req.params as { walletId: string }).walletId] ?? [] };
});

app.get('/rules', async () => ({
  mock: true,
  dailyLimitSats: DAILY_LIMIT_SATS.toString(),
  highValueDelaySeconds: HIGH_VALUE_DELAY_SECONDS,
  productionDelay: process.env.PRODUCTION_RECOVERY_DELAY_LABEL ?? '7 days',
  sanctionedAddresses: sanctionedAddresses(),
}));

// Remaining instant amount of a wallet (amounts + fees over the last 24 hours), so that the app
// correctly announces a possible delay before signing.
app.get('/wallets/:id/limit', async (req, reply) => {
  const w = wallets()[(req.params as { id: string }).id];
  if (!w) return reply.code(404).send({ mock: true, error: 'Unknown wallet' });
  return { mock: true, dailyLimitSats: DAILY_LIMIT_SATS.toString(), spentLast24hSats: spentLast24h(w.walletId).toString() };
});

// Demo only: adds an address to the mocked sanctions list.
app.post('/admin/sanctions', async (req, reply) => {
  const address = (req.body as { address?: string })?.address;
  if (!address) return reply.code(400).send({ mock: true, error: 'address is required' });
  // bech32 addresses are case-insensitive: stored in lowercase (as bitcoinjs writes them).
  writeJson('sanctions.json', [...new Set([...sanctionedAddresses(), address.trim().toLowerCase()])]);
  audit('sanctions.added', { address });
  return { mock: true, sanctionedAddresses: sanctionedAddresses() };
});

// Demo only: empties the service storage (a new master key is generated).
app.post('/admin/reset', async () => {
  resetData();
  resetSigner();
  audit('reset');
  return { mock: true, reset: true };
});

registerRecoveryRoutes(app);

const port = Number(process.env.SWISSQUOTE_PORT ?? 4001);
await app.listen({ port, host: '127.0.0.1' });
console.log(`[MOCK ${SERVICE}] listening on http://localhost:${port} (network ${cfg.name})`);
