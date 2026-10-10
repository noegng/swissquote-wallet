// « Swissquote a disparu » : sortie avec la clé du téléphone et la clé de secours, sans aucun service
// Swissquote (accessible depuis l'écran de connexion, sans session).
import { useEffect, useState } from 'react';
import { config } from '../config';
import { exitWithoutSwissquote, partnerStatus, requestPartnerShare, walletBalance } from '../exit';
import { formatBtc, formatChf } from '../format';
import { listLocalWallets, loadExit, type ExitState, type StoredWallet } from '../keystore';
import { useChfRate } from '../price';
import { Btn, Callout, Checklist, Countdown, Group, Hero, Row, Screen, Title } from '../ui';
import { useClientShareInput } from './ClientShareInput';

type Step = 'choose' | 'intro' | 'waiting' | 'share' | 'finishing' | 'done';

export function Exit({ onBack }: { onBack: () => void }) {
  const [wallets, setWallets] = useState<StoredWallet[] | null>(null);
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [state, setState] = useState<ExitState | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [awaiting, setAwaiting] = useState<string | undefined>(undefined);
  const [to, setTo] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ url: string; amount: bigint } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [swissquoteUp, setSwissquoteUp] = useState<boolean | null>(null);
  const rate = useChfRate();

  useEffect(() => {
    listLocalWallets().then(setWallets).catch(() => setWallets([]));
    // Simple constat pour la démo : le service Swissquote répond-il encore ? (rien n'en dépend)
    fetch(`${config.swissquoteUrl}/health`)
      .then(() => setSwissquoteUp(true))
      .catch(() => setSwissquoteUp(false));
  }, []);

  async function select(w: StoredWallet) {
    setWallet(w);
    setError('');
    walletBalance(w).then(setBalance).catch(() => setBalance(null));
    const existing = await loadExit(w.clientId);
    if (existing && existing.walletId === w.walletId) {
      setState(existing);
      setStep('waiting');
    } else {
      setStep('intro');
    }
  }

  useEffect(() => {
    if (step !== 'waiting' || !state) return;
    let stop = false;
    async function tick() {
      try {
        const s = await partnerStatus(state!);
        if (stop) return;
        if (s.status === 'released') return setStep('share');
        if (s.status === 'cancelled') return setError('The release was cancelled by our partner.');
        setSecondsLeft(s.secondsLeft);
        setAwaiting(s.trusteeName);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [step, state]);

  async function request() {
    setBusy(true);
    setError('');
    try {
      setState(await requestPartnerShare(wallet!));
      setStep('waiting');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exit(share: string) {
    setBusy(true);
    setError('');
    setLog([]);
    setStep('finishing');
    try {
      const r = await exitWithoutSwissquote(wallet!, state!, share, to.trim(), (l) => setLog((x) => [...x, l]));
      setResult(r);
      setStep('done');
    } catch (e) {
      const msg = (e as Error).message;
      setError(/Invalid|prefix|checksum|has no matching/i.test(msg) ? 'Invalid destination address for this network.' : msg);
    } finally {
      setBusy(false);
    }
  }

  const share = useClientShareInput(exit);

  // Constat pour la démo : cet écran n'appelle jamais Swissquote, qu'il réponde ou non.
  const status =
    swissquoteUp === null ? null : swissquoteUp ? (
      <p className="note">Swissquote is reachable right now, but nothing on this screen uses it.</p>
    ) : (
      <Callout tone="danger" title="Swissquote is currently unavailable">
        You can still access your funds.
      </Callout>
    );

  if (step === 'done' && result) {
    return (
      <Screen
        footer={
          <>
            <a className="btn secondary" href={result.url} target="_blank" rel="noreferrer">
              View transaction
            </a>
            <Btn kind="text" onClick={onBack}>
              Back
            </Btn>
          </>
        }
      >
        <Hero tone="success" />
        <Title
          center
          title="Your funds are out"
          lead={`${formatBtc(result.amount)} sent with your phone key and your backup key. No Swissquote service was contacted.`}
        />
        <Group label="Signed with">
          <Row icon="phone" title="Your phone key" chip={['Signed', 'success']} />
          <Row icon="key" title="Backup key" chip={['Signed', 'success']} />
          <Row icon="bank" title="Swissquote key" chip={['Not needed', 'neutral']} />
        </Group>
      </Screen>
    );
  }

  if (step === 'finishing') {
    return (
      <Screen
        title="Exit kit"
        footer={
          error ? (
            <Btn kind="secondary" onClick={() => (setError(''), setStep('share'))}>
              Try again
            </Btn>
          ) : undefined
        }
      >
        <Title title="Sending your funds" />
        <Checklist lines={log} />
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  if (step === 'share') {
    const hasDestination = to.trim().length > 20;
    return (
      <Screen
        title="Exit kit"
        onBack={() => setStep('choose')}
        footer={
          <Btn icon="up" disabled={busy || !hasDestination || !share.ready} onClick={share.submit}>
            Send bitcoin
          </Btn>
        }
      >
        {status}
        <Title
          title="Where should your funds go?"
          lead="Our partner’s share has arrived. Yours is the missing half of the backup key."
        />
        <label className="field">
          <span>Destination address (another wallet of yours)</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="bcrt1… or tb1…" autoComplete="off" />
        </label>
        {error && <p className="error">{error}</p>}
        {hasDestination && share.fields}
      </Screen>
    );
  }

  if (step === 'waiting') {
    return (
      <Screen title="Exit kit" onBack={() => setStep('choose')}>
        {status}
        <Title
          title="Our partner is preparing its share"
          lead="The independent partner applies its own security delay, without going through Swissquote, then sends its share encrypted for this device."
        />
        <Countdown
          caption="Partner security delay"
          secondsLeft={secondsLeft}
          footnote="before the share is released"
        />
        {awaiting && (
          <Callout title={`${awaiting} has to approve`}>
            This person holds the share. Contact them: they check your identity, then approve your request.
          </Callout>
        )}
        <p className="note">Shortened for this demo. In production: several days, with an identity check by the partner.</p>
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  if (step === 'intro' && wallet) {
    return (
      <Screen
        title="Exit kit"
        onBack={() => setStep('choose')}
        footer={
          <Btn disabled={busy} onClick={request}>
            Request our partner’s share
          </Btn>
        }
      >
        {status}
        <Title
          title="Use your wallet without Swissquote"
          lead="Your wallet needs 2 signatures out of 3. Without Swissquote you still hold the other two."
        />
        <Group label="Keys used">
          <Row icon="phone" title="Phone key" sub="On this phone" chip={['Ready', 'success']} />
          <Row icon="key" title="Backup key" sub="Your words and our partner’s share" chip={['To restore', 'accent']} />
          <Row icon="bank" title="Swissquote key" chip={['Not needed', 'neutral']} />
        </Group>
        <Group>
          <Row
            title="Balance"
            value={balance === null ? '…' : formatBtc(balance)}
            sub={balance === null ? undefined : formatChf(balance, rate) || undefined}
          />
        </Group>
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  return (
    <Screen title="Exit kit" onBack={onBack}>
      {status}
      <Title
        title="Use your wallet without Swissquote"
        lead="If Swissquote’s services are gone for good, you can still move your bitcoin from this phone. Choose your wallet."
      />
      {wallets === null ? (
        <p className="note">Loading…</p>
      ) : wallets.length === 0 ? (
        <p className="note">
          No wallet on this device. Leaving without Swissquote needs the phone that holds the phone key. Failing
          that, the exit kit file lets you do it in a standard wallet (Sparrow, Bitcoin Core).
        </p>
      ) : (
        <Group label="Wallets on this device">
          {wallets.map((w) => (
            <Row
              key={w.walletId}
              icon="wallet"
              title={w.clientId}
              sub={`Created on ${new Date(w.createdAt).toLocaleDateString('en-GB')}, ${w.network}`}
              trail="chevR"
              onClick={() => select(w)}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}
