import { describe, expect, it } from 'vitest';
import {
  exportPublicJwk,
  generateSealingKeyPair,
  openSealed,
  openWithPassphrase,
  sealFor,
  sealWithPassphrase,
} from '../src';

const secret = 'academic acid acne acquire acrobat activity actress adapt adequate adjust';

describe('sceller une part pour un destinataire (ECDH + HKDF + AES-GCM)', () => {
  it('seul le destinataire peut ouvrir', async () => {
    const partner = await generateSealingKeyPair();
    const other = await generateSealingKeyPair();
    const box = await sealFor(await exportPublicJwk(partner.publicKey), secret);
    expect(box.ct).not.toContain('academic');
    expect(await openSealed(box, partner.privateKey)).toBe(secret);
    await expect(openSealed(box, other.privateKey)).rejects.toThrow();
  });

  it('refuse une boîte modifiée', async () => {
    const partner = await generateSealingKeyPair();
    const box = await sealFor(await exportPublicJwk(partner.publicKey), secret);
    const bytes = Uint8Array.from(atob(box.ct), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    const tampered = { ...box, ct: btoa(String.fromCharCode(...bytes)) };
    await expect(openSealed(tampered, partner.privateKey)).rejects.toThrow();
  });

  it('chaque scellement est différent (clé éphémère et IV aléatoires)', async () => {
    const partner = await generateSealingKeyPair();
    const pub = await exportPublicJwk(partner.publicKey);
    const [a, b] = [await sealFor(pub, secret), await sealFor(pub, secret)];
    expect(a.ct).not.toBe(b.ct);
    expect(a.epk.x).not.toBe(b.epk.x);
  });
});

describe('copie C2 chiffrée par phrase de passe (PBKDF2 + AES-GCM)', () => {
  it('s’ouvre avec la bonne phrase de passe, pas avec une autre', async () => {
    const box = await sealWithPassphrase('cheval correct pile agrafe', secret, 1_000);
    expect(await openWithPassphrase(box, 'cheval correct pile agrafe')).toBe(secret);
    await expect(openWithPassphrase(box, 'mauvaise phrase')).rejects.toThrow();
  });
});
