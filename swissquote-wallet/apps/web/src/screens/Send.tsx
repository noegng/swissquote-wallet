// Envoi : saisie → résumé en clair vérifié par l'app → approbation passkey → résultat.
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, sq } from '../api';
import { formatBtc, formatChf, parseBtc, shortAddress, shortId } from '../format';
import { useChfRate } from '../price';
import type { PendingPayment as Pending, StoredWallet } from '../keystore';
import { preparePayment, submitPayment, type PreparedPayment } from '../payments';
import { parsePaymentCode, QrScanner } from '../qr';
import { Btn, Group, Hero, KV, Row, Screen, Title } from '../ui';
import { delayLabel, InstantLimit, useInstantLimit } from './InstantLimit';
import { PendingPaymentPanel, usePendingPayment } from './PendingPayment';

type Outcome =
  | { kind: 'sent'; url: string; txid: string }
  | { kind: 'pending'; pending: Pending }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string }
  | { kind: 'failed'; reason: string };

function explain(e: unknown): string {
  const err = e as Error;
  if (err.name === 'NotAllowedError') return 'Approval cancelled on the device.';
  // Messages du core (en français, partagés avec les scripts) traduits pour l'interface.
  const funds = /Fonds insuffisants : (\d+) sats/.exec(err.message);
  if (funds) return `Insufficient funds: ${formatBtc(funds[1])} available, fees included.`;
  if (/seuil de poussière/.test(err.message)) return 'Amount too small: the minimum is 0.0000033 BTC (330 sats).';
  return err.message;
}

function OnHold({
  wallet,
  pending,
  onBack,
  onDone,
}: {
  wallet: StoredWallet;
  pending: Pending;
  onBack: () => void;
  onDone: (o: Outcome) => void;
}) {
  const p = usePendingPayment(wallet, pending, (r) =>
    onDone(
      r.status === 'sent'
        ? { kind: 'sent', url: r.url, txid: r.txid }
        : r.status === 'failed'
          ? { kind: 'failed', reason: r.reason }
          : { kind: 'cancelled' },
    ),
  );
  return (
    <Screen
      title="Payment on hold"
      onBack={onBack}
      footer={
        <>
          <Btn icon="face" disabled={p.busy} onClick={p.cancel}>
            {p.busy ? 'Confirm on your device…' : 'Cancel payment'}
          </Btn>
          <Btn kind="text" onClick={onBack}>
            Back to wallet
          </Btn>
        </>
      }
    >
      <PendingPaymentPanel pending={pending} secondsLeft={p.secondsLeft} total={p.total} error={p.error} />
    </Screen>
  );
}

export function Send({ wallet, onBack }: { wallet: StoredWallet; onBack: () => void }) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [prepared, setPrepared] = useState<PreparedPayment | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Seuil de signature immédiate et déjà dépensé sur 24 h : décident du délai de sécurité.
  const instant = useInstantLimit(wallet.walletId);
  const [sanctioned, setSanctioned] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const rate = useChfRate();

  useEffect(() => {
    sq('/rules')
      .then((r) => setSanctioned(r.sanctionedAddresses ?? []))
      .catch(() => setSanctioned([]));
  }, []);

  async function review(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setPrepared(await preparePayment(wallet, to.trim(), parseBtc(amount)));
    } catch (err) {
      const msg = explain(err);
      setError(/Invalid|network|prefix|checksum|has no matching/i.test(msg) && !/amount/i.test(msg) ? 'Invalid address for this network.' : msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const r = await submitPayment(wallet, prepared!);
      setOutcome(r.status === 'sent' ? { kind: 'sent', url: r.url, txid: r.txid } : { kind: 'pending', pending: r.pending });
    } catch (err) {
      // 403 : refus des règles (sanctions, PSBT étrangère). 423 : wallet gelé.
      if (err instanceof ApiError && (err.status === 403 || err.status === 423)) {
        setOutcome({ kind: 'refused', reason: err.message });
      } else {
        setError(explain(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (outcome?.kind === 'sent') {
    return (
      <Screen
        footer={
          <>
            <a className="btn secondary" href={outcome.url} target="_blank" rel="noreferrer">
              View transaction
            </a>
            <Btn kind="text" onClick={onBack}>
              Back to wallet
            </Btn>
          </>
        }
      >
        <Hero tone="success" />
        <Title
          center
          title="Payment sent"
          lead={
            prepared
              ? `${formatBtc(prepared.summary.sentExternal)} is on its way to ${shortAddress(prepared.to)}.`
              : 'Your payment has been signed and sent to the Bitcoin network.'
          }
        />
        <Group label="Signed with">
          <Row icon="phone" title="Your phone key" chip={['Signed', 'success']} />
          <Row icon="bank" title="Swissquote key" chip={['Signed', 'success']} />
          <Row icon="key" title="Backup key" chip={['Not needed', 'neutral']} />
        </Group>
        <Group>
          <Row
            title="Transaction ID"
            sub={shortId(outcome.txid)}
            trail="copy"
            onClick={() => navigator.clipboard?.writeText(outcome.txid)}
          />
        </Group>
      </Screen>
    );
  }

  if (outcome?.kind === 'cancelled') {
    return (
      <Screen
        footer={
          <Btn kind="secondary" onClick={onBack}>
            Back to wallet
          </Btn>
        }
      >
        <Hero tone="danger" />
        <Title
          center
          title="Payment cancelled"
          lead="Swissquote did not sign, so no bitcoin has left your wallet."
        />
      </Screen>
    );
  }

  if (outcome?.kind === 'failed') {
    return (
      <Screen
        footer={
          <Btn kind="secondary" onClick={onBack}>
            Back to wallet
          </Btn>
        }
      >
        <Hero tone="danger" />
        <Title center title="Payment not sent" lead={outcome.reason} />
      </Screen>
    );
  }

  if (outcome?.kind === 'refused') {
    return (
      <Screen
        footer={
          <>
            <Btn kind="secondary" onClick={onBack}>
              Back to wallet
            </Btn>
            <Btn kind="text" onClick={() => (setOutcome(null), setPrepared(null))}>
              Edit payment
            </Btn>
          </>
        }
      >
        <Hero tone="danger" />
        <Title center title="Payment refused" lead="This payment was not sent. Your balance has not changed." />
        <Group label="Reason">
          <Row icon="alert" iconTone="danger" title="Swissquote did not sign" sub={outcome.reason} />
        </Group>
        <p className="note">
          A payment needs two keys, and Swissquote did not sign this one. The sanctions list is simulated for this
          demo.
        </p>
      </Screen>
    );
  }

  if (outcome?.kind === 'pending') {
    return <OnHold wallet={wallet} pending={outcome.pending} onBack={onBack} onDone={setOutcome} />;
  }

  if (prepared) {
    const s = prepared.summary;
    const overLimit = instant !== null && instant.spent + s.sentExternal + s.fee > instant.limit;
    const flagged = sanctioned.some((a) => a.toLowerCase() === prepared.to.toLowerCase());
    return (
      <Screen
        title="Confirm payment"
        onBack={() => setPrepared(null)}
        footer={
          <>
            <Btn icon="face" disabled={busy} onClick={confirm}>
              {busy ? 'Confirm on your device…' : 'Approve with passkey'}
            </Btn>
            <Btn kind="text" disabled={busy} onClick={() => setPrepared(null)}>
              Edit
            </Btn>
          </>
        }
      >
        <div className="amount static">
          <strong>{formatBtc(s.sentExternal)}</strong>
          <span className="sub">{formatChf(s.sentExternal, rate)}</span>
        </div>
        <Group>
          <KV k="To">{prepared.to}</KV>
          <KV k="Network fee">
            {formatBtc(s.fee)}
            {rate !== null && ` (${formatChf(s.fee, rate)})`}
          </KV>
          <KV k="Returned to your wallet">{formatBtc(s.change)}</KV>
        </Group>
        <Group label="Swissquote checks">
          <Row
            title="Recipient address"
            chip={flagged ? ['On a sanctions list', 'danger'] : ['Not on the sanctions list', 'success']}
          />
          <Row
            title="Swissquote signature"
            chip={overLimit ? [`After a ${delayLabel(instant!.delaySeconds)} delay`, 'accent'] : ['Immediate', 'success']}
          />
        </Group>
        {overLimit && instant && (
          <p className="note">
            This payment goes beyond what Swissquote signs at once today ({formatBtc(instant.limit)} a day, fees
            included{instant.spent > 0n && <>, {formatBtc(instant.spent)} already used</>}). It is not blocked: it
            leaves after a {delayLabel(instant.delaySeconds)} security delay, and you get an alert so you can cancel
            it.
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  if (scanning) {
    return (
      <Screen title="Scan a QR code" onBack={() => setScanning(false)}>
        <Title
          title="Scan the recipient’s code"
          lead="Point the camera at the QR code of the wallet you are paying."
        />
        <QrScanner
          onResult={(text) => {
            const code = parsePaymentCode(text);
            setTo(code.address);
            if (code.amount) setAmount(code.amount);
            setError('');
            setScanning(false);
          }}
        />
        <p className="note">The address is checked on the next screen before anything is signed.</p>
      </Screen>
    );
  }

  let sats: bigint | null = null;
  try {
    sats = amount ? parseBtc(amount) : null;
  } catch {
    sats = null;
  }

  return (
    <Screen
      title="Send bitcoin"
      onBack={onBack}
      onSubmit={review}
      footer={<Btn disabled={busy || !to || !amount}>{busy ? 'Preparing…' : 'Review payment'}</Btn>}
    >
      <div className="amount">
        <label className="value">
          <input
            aria-label="Amount in BTC"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            style={{ width: `${Math.max(1, amount.length)}ch` }}
          />
          <span className="unit">BTC</span>
        </label>
        <span className="sub">{sats === null ? 'Enter an amount' : formatChf(sats, rate)}</span>
      </div>
      <label className="field">
        <span>Recipient address</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="bcrt1… or tb1…" autoComplete="off" />
      </label>
      <Btn kind="secondary" icon="qr" type="button" onClick={() => setScanning(true)}>
        Scan a QR code
      </Btn>
      <InstantLimit limit={instant} rate={rate} />
      {error && <p className="error">{error}</p>}
    </Screen>
  );
}
