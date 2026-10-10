// Portail de la personne de confiance (notaire, avocat), ouvert depuis le lien d'invitation.
// Sans compte Swissquote et sans aucun appel à Swissquote : uniquement le service partenaire.
// Elle y accepte l'invitation, récupère sa part, puis approuve ou refuse les demandes de récupération.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { loadTrusteeKey } from '../keystore';
import {
  acceptInvitation,
  approveRelease,
  invitation,
  keyCode,
  markCollected,
  openTrusteeShare,
  refuseRelease,
  type Invitation,
  type ReleaseRequest,
} from '../trustee';
import { Btn, Callout, Group, Hero, Row, Screen, Title, WordList } from '../ui';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function Trustee({ inviteId, onClose }: { inviteId: string; onClose: () => void }) {
  const [inv, setInv] = useState<Invitation | null>(null);
  const [missing, setMissing] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [words, setWords] = useState<string[] | null>(null);
  // Part saisie à la main, si cet appareil n'a pas la clé (invitation acceptée sur un autre appareil).
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setInv(await invitation(inviteId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError((e as Error).message);
    }
  }, [inviteId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    loadTrusteeKey(inviteId).then((k) => setHasKey(!!k));
  }, [inviteId, inv?.status]);

  const keyX = inv?.trusteeKey?.x;
  useEffect(() => {
    if (inv?.trusteeKey) keyCode(inv.trusteeKey).then(setCode);
  }, [keyX]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const showShare = () =>
    run(async () => setWords((await openTrusteeShare(inviteId, inv!.sealedForTrustee!)).split(' ')));

  const approve = (request: ReleaseRequest) =>
    run(async () => {
      const share = hasKey ? await openTrusteeShare(inviteId, inv!.sealedForTrustee!) : typed;
      await approveRelease(inviteId, request, share);
      setTyped('');
    });

  if (missing || inv?.status === 'cancelled') {
    return (
      <Screen title="Trusted person" onBack={onClose}>
        <Title
          title={missing ? 'Invitation not found' : 'Invitation cancelled'}
          lead={
            missing
              ? 'This link does not match any invitation. Ask the person who invited you for a new one.'
              : 'The client cancelled this invitation. You hold nothing and there is nothing to do.'
          }
        />
      </Screen>
    );
  }

  if (!inv) {
    return (
      <Screen title="Trusted person" onBack={onClose}>
        <p className="note">{error || 'Loading…'}</p>
      </Screen>
    );
  }

  if (inv.status === 'invited') {
    return (
      <Screen
        title="Trusted person"
        onBack={onClose}
        footer={
          <Btn disabled={busy} onClick={() => run(() => acceptInvitation(inviteId))}>
            {busy ? 'Creating your key…' : 'Accept the invitation'}
          </Btn>
        }
      >
        <Title
          title="You are invited to keep a backup share"
          lead={`${inv.clientId} asks you, ${inv.trusteeName}, to hold half of the backup key of their Bitcoin wallet.`}
        />
        <Group label="What this means">
          <Row icon="key" title="You keep a list of words" sub="Half of a backup key. The client holds the other half." />
          <Row icon="lock" title="Alone, it opens nothing" sub="Your half cannot move any bitcoin, and neither can Swissquote." />
          <Row
            icon="lifebuoy"
            title="You release it on request"
            sub="If the client loses their phone, you check their identity, then approve."
          />
        </Group>
        {error && <p className="error">{error}</p>}
        <p className="note">
          Accepting creates a key on this device. Use the device you will keep: the share is encrypted for it.
        </p>
      </Screen>
    );
  }

  if (inv.status === 'accepted') {
    return (
      <Screen title="Trusted person" onBack={onClose}>
        <Title
          title="Give this code to the client"
          lead={`Read it to ${inv.clientId} by phone or in person. They hand over the share only if it matches what they see.`}
        />
        <div className="code-card">{code || '…'}</div>
        <p className="note">Waiting for {inv.clientId} to confirm. This page updates by itself.</p>
        {hasKey === false && (
          <Callout tone="danger" title="Accepted on another device">
            The key for this share is not on this device. Come back on the device you accepted the invitation with.
          </Callout>
        )}
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  if (words) {
    const collected = inv.status === 'collected';
    return (
      <Screen
        title="Trusted person"
        onBack={() => setWords(null)}
        footer={
          collected ? (
            <Btn kind="secondary" onClick={() => setWords(null)}>
              Hide the words
            </Btn>
          ) : (
            <Btn disabled={busy} onClick={() => run(async () => (await markCollected(inviteId), setWords(null)))}>
              I have written them down
            </Btn>
          )
        }
      >
        <Title
          title={`Write down these ${words.length} words`}
          lead={`They are your half of ${inv.clientId}’s backup key. Keep them where you keep your clients’ documents.`}
        />
        <WordList words={words} />
        {error && <p className="error">{error}</p>}
        <p className="note">
          Decrypted on this device only. Once you confirm, the partner that held this share destroys its copy.
        </p>
      </Screen>
    );
  }

  if (inv.status === 'confirmed') {
    return (
      <Screen
        title="Trusted person"
        onBack={onClose}
        footer={
          <Btn icon="key" disabled={busy || !hasKey} onClick={showShare}>
            Show my share
          </Btn>
        }
      >
        <Title
          title="Your share is ready"
          lead={`${inv.clientId} confirmed your code. The share is encrypted for this device: only you can read it.`}
        />
        {hasKey === false && (
          <Callout tone="danger" title="Accepted on another device">
            The key for this share is not on this device. Come back on the device you accepted the invitation with.
          </Callout>
        )}
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  // Part récupérée : la personne de confiance traite les demandes de récupération du client.
  const open = inv.requests.filter((r) => !r.fulfilled);
  const approved = inv.requests.filter((r) => r.fulfilled);
  return (
    <Screen title="Trusted person" onBack={onClose}>
      <Hero tone="success" />
      <Title
        center
        title="You hold this share"
        lead={`Half of ${inv.clientId}’s backup key is in your care. The partner’s copy has been destroyed.`}
      />
      {open.map((r) => (
        <Callout key={r.releaseId} tone="danger" title="The client asks for the share">
          Requested on {when(r.createdAt)}, from a new device. Check {inv.clientId}’s identity yourself before
          approving: this is what protects them from an impostor.
          {!hasKey && (
            <label className="field">
              <span>Your words (this device does not hold your key)</span>
              <textarea rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          )}
          <Btn disabled={busy || (!hasKey && typed.trim().split(/\s+/).length < 20)} onClick={() => approve(r)}>
            Identity checked: approve
          </Btn>
          <Btn kind="secondary" disabled={busy} onClick={() => run(() => refuseRelease(r))}>
            Refuse
          </Btn>
        </Callout>
      ))}
      {approved.map((r) => (
        <p className="note" key={r.releaseId}>
          Request of {when(r.createdAt)} approved. The share reaches the client’s new device, encrypted for it, after
          the partner’s security delay.
        </p>
      ))}
      {inv.requests.length === 0 && (
        <p className="note">
          Nothing to do for now. If {inv.clientId} loses their phone, their request will be listed here.
        </p>
      )}
      {hasKey && (
        <Group>
          <Row icon="key" title="Show my share again" trail="chevR" disabled={busy} onClick={showShare} />
        </Group>
      )}
      {error && <p className="error">{error}</p>}
      <p className="note">
        Mock: this page stands for the trusted person’s own tool. In production they would sign in with strong
        authentication, and identity checks would follow their professional rules.
      </p>
    </Screen>
  );
}
