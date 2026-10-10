// Confier la part TIERS à une personne de confiance (notaire, avocat) à la place du partenaire :
// invitation par lien ou QR code, comparaison d'un code avec cette personne, puis remise.
// La part passe du partenaire à la personne de confiance : cette app ne la voit jamais (I4).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { clearInvite, loadInvite, type StoredWallet, type TrusteeInvite } from '../keystore';
import { QrCode } from '../qr';
import {
  cancelInvite,
  confirmTrustee,
  invitation,
  inviteLink,
  inviteTrustee,
  keyCode,
  shareHolder,
  type Invitation,
  type ShareHolder,
} from '../trustee';
import { Btn, Callout, Group, Hero, Row, Screen, Title } from '../ui';

export function InviteTrustee({ wallet, onBack }: { wallet: StoredWallet; onBack: () => void }) {
  const [holder, setHolder] = useState<ShareHolder | null>(null);
  const [invite, setInvite] = useState<TrusteeInvite | null | undefined>(undefined);
  const [inv, setInv] = useState<Invitation | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setHolder(await shareHolder(wallet.walletId));
      const local = (await loadInvite(wallet.walletId)) ?? null;
      setInvite(local);
      if (!local) return setInv(null);
      const remote = await invitation(local.inviteId);
      if (remote.status === 'cancelled') {
        await clearInvite(wallet.walletId);
        setInvite(null);
        return setInv(null);
      }
      setInv(remote);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wallet.walletId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

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

  function create(e: FormEvent) {
    e.preventDefault();
    run(() => inviteTrustee(wallet, name.trim()));
  }

  const cancel = (
    <Btn kind="text" disabled={busy} onClick={() => run(() => cancelInvite(wallet, invite!.inviteId))}>
      Cancel the invitation
    </Btn>
  );

  if (holder?.holder === 'trustee') {
    return (
      <Screen title="Trusted person" onBack={onBack}>
        <Hero tone="success" />
        <Title
          center
          title={`${holder.trusteeName} holds the share`}
          lead="They collected the second half of your backup key. Our partner destroyed its copy."
        />
        <Group label="If you lose your phone">
          <Row icon="lifebuoy" title="Start a recovery" sub="From your new device, with your Swissquote login" />
          <Row icon="face" title={`${holder.trusteeName} checks your identity`} sub="Then approves the release of their half" />
          <Row icon="key" title="You enter your own words" sub="Both halves meet on your device only" />
        </Group>
        <p className="note">
          On its own their half does nothing: your backup words are needed too, and Swissquote holds neither.
        </p>
      </Screen>
    );
  }

  if (invite && inv?.status === 'invited') {
    const link = inviteLink(invite.inviteId);
    return (
      <Screen title="Trusted person" onBack={onBack} footer={cancel}>
        <Title
          title={`Send this invitation to ${inv.trusteeName}`}
          lead="They open it on their own device, by scanning the code or with the link."
        />
        <div className="sheet padded">
          <QrCode value={link} label="QR code of the invitation link" />
          <span className="address">{link}</span>
          <Btn
            kind="secondary"
            small
            icon="copy"
            onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </Btn>
        </div>
        <p className="note">Waiting for {inv.trusteeName} to accept. This page updates by itself.</p>
        {error && <p className="error">{error}</p>}
        <p className="note">
          Mock: you send the link yourself. In production our partner would verify this person’s identity and apply
          a security delay before handing over anything.
        </p>
      </Screen>
    );
  }

  if (invite && inv?.status === 'accepted') {
    return (
      <Screen
        title="Trusted person"
        onBack={onBack}
        footer={
          <>
            <Btn disabled={busy || !code} onClick={() => run(() => confirmTrustee(wallet, invite.inviteId))}>
              The code matches: hand over the share
            </Btn>
            {cancel}
          </>
        }
      >
        <Title
          title={`Check this code with ${inv.trusteeName}`}
          lead="Call them or meet them, and compare it with the code on their screen."
        />
        <div className="code-card">{code || '…'}</div>
        <Callout title="Why this check">
          Anyone who got the link could have accepted it. A matching code proves the share goes to the device of the
          person you chose.
        </Callout>
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  if (invite && inv?.status === 'confirmed') {
    return (
      <Screen title="Trusted person" onBack={onBack} footer={cancel}>
        <Title
          title={`Waiting for ${inv.trusteeName} to collect the share`}
          lead="It is encrypted for their device. Our partner keeps its copy until they confirm they have it."
        />
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  return (
    <Screen
      title="Trusted person"
      onBack={onBack}
      onSubmit={create}
      footer={<Btn disabled={busy || invite === undefined || !name.trim() || !holder?.exists}>Create the invitation</Btn>}
    >
      <Title
        title="Entrust a share to someone you trust"
        lead="Today our independent partner holds the second half of your backup key. A notary or a lawyer you choose can hold it instead."
      />
      <Group>
        <Row icon="key" title="They keep half of the backup key" sub="You keep the other half: your backup words" />
        <Row icon="lock" title="Alone, their half opens nothing" sub="Swissquote holds no part of it" />
        <Row icon="lifebuoy" title="They release it if you lose your phone" sub="After checking your identity themselves" />
      </Group>
      <label className="field">
        <span>Name of the person (for example: Me Dupont, notary)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      {holder?.invitation && !invite && (
        <p className="note">
          An invitation to {holder.invitation.trusteeName} is already open, created from another device.
        </p>
      )}
      {holder && !holder.exists && <p className="note">This wallet has no third-party share to entrust.</p>}
      {error && <p className="error">{error}</p>}
    </Screen>
  );
}
