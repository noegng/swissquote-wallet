// Personne de confiance (notaire, avocat) qui détient la part TIERS à la place du partenaire
// (skills slip39-backup et custody-invariants).
//   Client : invite, compare le code de la clé avec la personne, confirme la remise.
//   Personne de confiance : crée sa clé sur son appareil, reçoit la part scellée pour cette clé, puis
//   approuve les demandes de récupération en la re-scellant pour le nouvel appareil du client.
// L'app du client ne voit jamais cette part : elle passe du partenaire à la personne de confiance.
// Rien ici n'appelle Swissquote : le dispositif doit fonctionner si Swissquote a disparu.
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

/** Qui détient la part TIERS d'un wallet, vu par le partenaire. */
export interface ShareHolder {
  exists: boolean;
  holder: 'partner' | 'trustee';
  trusteeName: string | null;
  invitation: { status: Invitation['status']; trusteeName: string } | null;
}

export const shareHolder = (walletId: string) => partner<ShareHolder>(`/shares/${walletId}`);
export const invitation = (inviteId: string) => partner<Invitation>(`/invitations/${inviteId}`);
export const inviteLink = (inviteId: string) => `${location.origin}${location.pathname}?trustee=${inviteId}`;

/** Code court de la clé de la personne de confiance : le client le compare avec elle, de vive voix,
 *  avant de confirmer la remise (le lien a pu être ouvert par quelqu'un d'autre). */
export async function keyCode(key: JsonWebKey): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key.x}.${key.y}`));
  const hex = [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`.toUpperCase();
}

// --- Côté client

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

// --- Côté personne de confiance

/** Crée la clé de réception sur cet appareil (privée, non exportable) et envoie sa partie publique. */
export async function acceptInvitation(inviteId: string): Promise<void> {
  const pair = await generateSealingKeyPair(false);
  await saveTrusteeKey(inviteId, pair.privateKey);
  await partner(`/invitations/${inviteId}/accept`, { publicKey: await exportPublicJwk(pair.publicKey) });
}

/** Ouvre la part avec la clé de cet appareil. */
export async function openTrusteeShare(inviteId: string, box: SealedBox): Promise<string> {
  const key = await loadTrusteeKey(inviteId);
  if (!key) throw new Error('This device does not hold the key for this share. Use the device you accepted the invitation on.');
  return openSealed(box, key);
}

export const markCollected = (inviteId: string) => partner(`/invitations/${inviteId}/collected`, {});

/** Approuve une demande : la part est re-scellée ici pour le nouvel appareil du client. */
export async function approveRelease(inviteId: string, request: ReleaseRequest, share: string): Promise<void> {
  await partner(`/release/${request.releaseId}/fulfil`, {
    inviteId,
    sealedForDevice: await sealFor(request.devicePublicKey, share.trim().toLowerCase().split(/\s+/).join(' ')),
  });
}

export const refuseRelease = (request: ReleaseRequest) => partner(`/release/${request.releaseId}/cancel`, {});
