// Trusted person (notary, lawyer) who holds the PARTNER share instead of the partner
// (skills slip39-backup and custody-invariants).
//   Client: invites, compares the key code with the person, confirms the handover.
//   Trusted person: creates their key on their device, receives the share sealed for that key, then
//   approves recovery requests by re-sealing it for the client's new device.
// The client's app never sees this share: it goes from the partner to the trusted person.
// Nothing here calls Swissquote: the scheme must work if Swissquote has disappeared.
import { exportPublicJwk, generateSealingKeyPair, openSealed, sealFor, type SealedBox } from '@sqw/core';
import { partner } from './api';
import { clearInvite, loadTrusteeKey, saveInvite, saveTrusteeKey, type StoredWallet } from './keystore';

export interface ReleaseRequest {
  releaseId: string;
  createdAt: string;
  devicePublicKey: JsonWebKey;
  fulfilled: boolean;
  identityCheck: string;
}

export interface Invitation {
  status: 'invited' | 'accepted' | 'confirmed' | 'collected' | 'cancelled';
  clientId: string;
  walletId: string;
  trusteeName: string;
  trusteeKey: JsonWebKey | null;
  sealedForTrustee: SealedBox | null;
  requests: ReleaseRequest[];
}

/** Who holds a wallet's PARTNER share, as seen by the partner. */
export interface ShareHolder {
  exists: boolean;
  holder: 'partner' | 'trustee';
  trusteeName: string | null;
  invitation: { status: Invitation['status']; trusteeName: string } | null;
}

export const shareHolder = (walletId: string) => partner<ShareHolder>(`/shares/${walletId}`);
export const invitation = (inviteId: string) => partner<Invitation>(`/invitations/${inviteId}`);
export const inviteLink = (inviteId: string) => `${location.origin}${location.pathname}?trustee=${inviteId}`;

/** Short code of the trusted person's key: the client compares it with them, by voice,
 *  before confirming the handover (someone else may have opened the link). */
export async function keyCode(key: JsonWebKey): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key.x}.${key.y}`));
  const hex = [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`.toUpperCase();
}

// --- Client side

export async function inviteTrustee(wallet: StoredWallet, trusteeName: string): Promise<string> {
  const r = await partner<{ inviteId: string }>('/invitations', {
    walletId: wallet.walletId,
    clientId: wallet.clientId,
    trusteeName,
  });
  await saveInvite(wallet.walletId, { inviteId: r.inviteId, trusteeName });
  return r.inviteId;
}

export const confirmTrustee = (wallet: StoredWallet, inviteId: string) =>
  partner(`/invitations/${inviteId}/confirm`, { clientId: wallet.clientId });

export async function cancelInvite(wallet: StoredWallet, inviteId: string): Promise<void> {
  await partner(`/invitations/${inviteId}/cancel`, { clientId: wallet.clientId });
  await clearInvite(wallet.walletId);
}

// --- Trusted person side

/** Creates the receiving key on this device (private, non-extractable) and sends its public part. */
export async function acceptInvitation(inviteId: string): Promise<void> {
  const pair = await generateSealingKeyPair(false);
  await saveTrusteeKey(inviteId, pair.privateKey);
  await partner(`/invitations/${inviteId}/accept`, { publicKey: await exportPublicJwk(pair.publicKey) });
}

/** Opens the share with this device's key. */
export async function openTrusteeShare(inviteId: string, box: SealedBox): Promise<string> {
  const key = await loadTrusteeKey(inviteId);
  if (!key) throw new Error('This device does not hold the key for this share. Use the device you accepted the invitation on.');
  return openSealed(box, key);
}

export const markCollected = (inviteId: string) => partner(`/invitations/${inviteId}/collected`, {});

/** Approves a request: the share is re-sealed here for the client's new device. */
export async function approveRelease(inviteId: string, request: ReleaseRequest, share: string): Promise<void> {
  await partner(`/release/${request.releaseId}/fulfil`, {
    inviteId,
    sealedForDevice: await sealFor(request.devicePublicKey, share.trim().toLowerCase().split(/\s+/).join(' ')),
  });
}

export const refuseRelease = (request: ReleaseRequest) => partner(`/release/${request.releaseId}/cancel`, {});
