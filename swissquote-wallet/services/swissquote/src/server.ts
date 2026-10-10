// [MOCK] Service Swissquote : connexion (KYC simulé), passkeys, registre des wallets (Travel Rule),
// cosignataire avec règles, notifications « hors bande ». Processus séparé avec son propre
// stockage (data/). À venir : récupération. Voir la skill mock-service.
import './env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import {
  descriptorString,
  deriveAddress,
  networkConfig,
  psbtFromBase64,
  signWithRoot,
  summarizeSpend,
  type BtcNetworkName,
  type KeyOrigin,
  type SpendSummary,
  type WalletPolicy,
} from '@sqw/core';
import { audit, readJson, resetData, SERVICE, writeJson } from './store';
import { SwissquoteSigner } from './signer';
import {
  clientFromAuthHeader,
  hasPasskey,
  login,
  operationOptions,
  registrationOptions,
  verifyOperation,
  verifyRegistration,
  type Purpose,
} from './auth';
import { DAILY_LIMIT_SATS, decide, HIGH_VALUE_DELAY_SECONDS, recordSpend, sanctionedAddresses } from './rules';

const cfg = networkConfig(
  (process.env.BTC_NETWORK ?? 'regtest') as BtcNetworkName,
  process.env.BTC_NETWORK === 'signet' ? process.env.ESPLORA_URL_SIGNET : process.env.ESPLORA_URL_REGTEST,
);
let signer = new SwissquoteSigner(cfg);

interface WalletRecord {
  walletId: string;
  clientId: string;
  account: number;
  network: BtcNetworkName;
  policy: WalletPolicy;
  descriptor: string;
  createdAt: string;
}

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

const wallets = () => readJson<Record<string, WalletRecord>>('wallets.json', {});
const requests = () => readJson<Record<string, CosignRequest>>('requests.json', {});
const saveRequest = (r: CosignRequest) => writeJson('requests.json', { ...requests(), [r.id]: r });

function notify(walletId: string, text: string) {
  const all = readJson<Record<string, { at: string; text: string }[]>>('notifications.json', {});
  (all[walletId] ??= []).push({ at: new Date().toISOString(), text });
  writeJson('notifications.json', all);
  audit('notification', { walletId, text });
}

function plain(summary: SpendSummary) {
  return {
    inputTotal: summary.inputTotal.toString(),
    sentExternal: summary.sentExternal.toString(),
    change: summary.change.toString(),
    fee: summary.fee.toString(),
    external: summary.external.map((o) => ({ address: o.address, value: o.value.toString() })),
  };
}

function isKeyOrigin(k: unknown): k is KeyOrigin {
  const o = k as KeyOrigin;
  return !!o && typeof o.fingerprint === 'string' && typeof o.path === 'string' && typeof o.xpub === 'string';
}

/** Signe la PSBT avec la clé SQ du wallet, après avoir vérifié qu'elle n'utilise que ses fonds. */
function cosign(wallet: WalletRecord, psbtBase64: string) {
  const psbt = psbtFromBase64(psbtBase64, cfg.network);
  const summary = summarizeSpend(psbt, wallet.policy, cfg.network, wallet.policy.keys[1]);
  return { psbt, summary };
}

const app = Fastify();
await app.register(cors, { origin: process.env.ORIGIN ?? 'http://localhost:5173' });

app.get('/health', async () => ({ mock: true, service: SERVICE, ok: true, network: cfg.name }));

// Connexion à l'espace client Swissquote. MOCK : le KYC est supposé déjà fait par la banque.
app.post('/kyc/login', async (req, reply) => {
  const clientId = (req.body as { clientId?: string })?.clientId?.trim().toLowerCase() ?? '';
  const token = login(clientId);
  if (!token) return reply.code(400).send({ mock: true, error: 'Identifiant client invalide (3 à 40 caractères a-z, 0-9, -)' });
  return { mock: true, token, clientId, hasPasskey: hasPasskey(clientId) };
});

// Création de la passkey du client (session requise). La clé privée reste dans la puce de l'appareil.
app.post('/webauthn/register/options', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session requise' });
  return registrationOptions(clientId);
});

app.post('/webauthn/register/verify', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session requise' });
  try {
    const info = await verifyRegistration(clientId, (req.body as { response: never }).response);
    return { mock: true, verified: true, ...info };
  } catch (e) {
    audit('passkey.refused', { clientId, reason: String(e) });
    return reply.code(400).send({ mock: true, verified: false, error: (e as Error).message });
  }
});

// Défi passkey lié à une opération : empreinte de la PSBT (cosign) ou identifiant de demande (cancel).
app.post('/webauthn/operation/options', async (req, reply) => {
  const body = req.body as { walletId?: string; purpose?: Purpose; payload?: string };
  const wallet = body?.walletId ? wallets()[body.walletId] : undefined;
  if (!wallet || !body.payload || !['cosign', 'cancel'].includes(body.purpose ?? '')) {
    return reply.code(400).send({ mock: true, error: 'walletId, purpose (cosign|cancel) et payload requis' });
  }
  return operationOptions(wallet.clientId, body.purpose!, body.payload);
});

// Création du wallet : Swissquote dérive sa clé pour ce client et enregistre le descripteur.
// L'enregistrement prouve que l'adresse appartient au client (Travel Rule, sans démarche).
app.post('/wallets', async (req, reply) => {
  const clientId = clientFromAuthHeader(req.headers.authorization);
  if (!clientId) return reply.code(401).send({ mock: true, error: 'Session requise' });
  if (!hasPasskey(clientId)) return reply.code(403).send({ mock: true, error: 'Créer une passkey avant le wallet' });
  const body = req.body as { phoneKey?: unknown; backupKey?: unknown };
  if (!isKeyOrigin(body?.phoneKey) || !isKeyOrigin(body?.backupKey)) {
    return reply.code(400).send({ mock: true, error: 'phoneKey et backupKey requis' });
  }
  const all = wallets();
  const account = Object.keys(all).length + 1;
  const policy: WalletPolicy = {
    threshold: 2,
    keys: [body.phoneKey, signer.keyForAccount(account), body.backupKey],
  };
  const record: WalletRecord = {
    walletId: randomUUID(),
    clientId,
    account,
    network: cfg.name,
    policy,
    descriptor: descriptorString(policy, 0),
    createdAt: new Date().toISOString(),
  };
  writeJson('wallets.json', { ...all, [record.walletId]: record });
  audit('wallet.created', { walletId: record.walletId, clientId, account });
  return {
    mock: true,
    walletId: record.walletId,
    swissquoteKey: policy.keys[1],
    policy,
    descriptor: record.descriptor,
    firstAddress: deriveAddress(policy, 0, 0, cfg.network).address,
  };
});

app.get('/wallets/:id', async (req, reply) => {
  const w = wallets()[(req.params as { id: string }).id];
  return w ? { mock: true, ...w } : reply.code(404).send({ mock: true, error: 'Wallet inconnu' });
});

// Cosignature : exige une assertion passkey fraîche dont le défi porte l'empreinte de cette PSBT.
app.post('/cosign', async (req, reply) => {
  const body = req.body as { walletId?: string; psbt?: string; authentication?: never };
  const wallet = body?.walletId ? wallets()[body.walletId] : undefined;
  if (!wallet || !body.psbt) return reply.code(400).send({ mock: true, error: 'walletId et psbt requis' });
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
    notify(wallet.walletId, `Paiement refusé : ${decision.reason}`);
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
      `Gros paiement de ${summary.sentExternal} sats en attente. Il partira dans ${HIGH_VALUE_DELAY_SECONDS} s ` +
        `sauf annulation. Si ce n'est pas vous, annulez maintenant.`,
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

  signWithRoot(analysed.psbt, signer.root);
  recordSpend(wallet.walletId, analysed.summary.sentExternal);
  audit('cosign.signed', { walletId: wallet.walletId, tier: 1, summary });
  return {
    mock: true,
    status: 'signed',
    tier: 1,
    psbt: analysed.psbt.toBase64(),
    summary,
  };
});

// Suivi d'un gros paiement : signé automatiquement une fois le délai écoulé, sauf annulation.
app.get('/cosign/:id', async (req, reply) => {
  const request = requests()[(req.params as { id: string }).id];
  if (!request) return reply.code(404).send({ mock: true, error: 'Demande inconnue' });
  if (request.status === 'pending' && Date.now() >= request.executeAfter) {
    const wallet = wallets()[request.walletId];
    const { psbt, summary } = cosign(wallet, request.psbt);
    signWithRoot(psbt, signer.root);
    recordSpend(wallet.walletId, summary.sentExternal);
    const signed = { ...request, status: 'signed' as const, psbt: psbt.toBase64() };
    saveRequest(signed);
    audit('cosign.signed', { walletId: wallet.walletId, tier: 2, requestId: request.id });
    notify(wallet.walletId, `Gros paiement de ${request.summary.sentExternal} sats signé après le délai.`);
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

// Annulation d'un gros paiement : exige la passkey du client (défi lié à l'identifiant de la demande).
app.post('/cosign/:id/cancel', async (req, reply) => {
  const request = requests()[(req.params as { id: string }).id];
  if (!request) return reply.code(404).send({ mock: true, error: 'Demande inconnue' });
  try {
    const clientId = wallets()[request.walletId].clientId;
    await verifyOperation(clientId, 'cancel', request.id, (req.body as { authentication?: never })?.authentication);
  } catch (e) {
    audit('cancel.unauthenticated', { requestId: request.id, reason: String(e) });
    return reply.code(401).send({ mock: true, status: 'unauthenticated', reason: (e as Error).message });
  }
  if (request.status !== 'pending') {
    return reply.code(409).send({ mock: true, error: `Demande déjà ${request.status}` });
  }
  saveRequest({ ...request, status: 'cancelled' });
  audit('cosign.cancelled', { walletId: request.walletId, requestId: request.id });
  notify(request.walletId, `Paiement de ${request.summary.sentExternal} sats annulé.`);
  return { mock: true, status: 'cancelled', requestId: request.id };
});

// Boîte de notifications « hors bande » (mock des SMS, e-mails et alertes de l'espace client).
app.get('/notifications/:walletId', async (req) => {
  const all = readJson<Record<string, unknown[]>>('notifications.json', {});
  return { mock: true, notifications: all[(req.params as { walletId: string }).walletId] ?? [] };
});

app.get('/rules', async () => ({
  mock: true,
  dailyLimitSats: DAILY_LIMIT_SATS.toString(),
  highValueDelaySeconds: HIGH_VALUE_DELAY_SECONDS,
  productionDelay: process.env.PRODUCTION_RECOVERY_DELAY_LABEL ?? '7 jours',
  sanctionedAddresses: sanctionedAddresses(),
}));

// Démo uniquement : ajoute une adresse à la liste de sanctions mockée.
app.post('/admin/sanctions', async (req, reply) => {
  const address = (req.body as { address?: string })?.address;
  if (!address) return reply.code(400).send({ mock: true, error: 'address requis' });
  writeJson('sanctions.json', [...new Set([...sanctionedAddresses(), address])]);
  audit('sanctions.added', { address });
  return { mock: true, sanctionedAddresses: sanctionedAddresses() };
});

// Démo uniquement : vide le stockage du service (une nouvelle clé maître est générée).
app.post('/admin/reset', async () => {
  resetData();
  signer = new SwissquoteSigner(cfg);
  audit('reset');
  return { mock: true, reset: true };
});

const port = Number(process.env.SWISSQUOTE_PORT ?? 4001);
await app.listen({ port, host: '127.0.0.1' });
console.log(`[MOCK ${SERVICE}] écoute sur http://localhost:${port} (réseau ${cfg.name})`);
