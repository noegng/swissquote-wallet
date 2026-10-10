// Accueil du wallet, en trois onglets qui correspondent à ce que l'app sait faire :
//   Wallet (solde, alertes), Transfers (envoyer, recevoir), Recovery (clés, gel, téléphone perdu,
//   kit de sortie).
import { useCallback, useEffect, useState } from 'react';
import { deriveAddress, descriptorString } from '@sqw/core';
import { partner, sq, type Session } from '../api';
import { btc } from '../config';
import { formatBtc, formatSats } from '../format';
import { loadPending, type PendingPayment as Pending, type StoredWallet } from '../keystore';
import { approve, esplora } from '../payments';
import { Brand, Btn, Callout, Group, Icon, Row, Screen, Timeline, Title, formatClock, type TabName } from '../ui';
import { PendingPaymentPanel, usePendingPayment } from './PendingPayment';

function downloadExitKit(wallet: StoredWallet) {
  const kit = {
    type: 'swissquote-wallet/exit-kit',
    note:
      'Kit de sortie : importez ces descripteurs dans un wallet multisig standard (Sparrow, Bitcoin Core). ' +
      'Avec la clé du téléphone et la clé de secours (part papier ou copie cloud + part du partenaire), ' +
      'vous dépensez sans Swissquote.',
    network: wallet.network,
    receive: descriptorString(wallet.policy, 0),
    change: descriptorString(wallet.policy, 1),
    keys: { phone: wallet.policy.keys[0], swissquote: wallet.policy.keys[1], backup: wallet.policy.keys[2] },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: 'swissquote-wallet-kit-de-sortie.json' }).click();
  URL.revokeObjectURL(url);
}

interface Notification {
  at: string;
  text: string;
}

interface RecoveryInfo {
  status: 'active' | 'frozen' | 'recovered';
  recovery: { recoveryId: string; secondsLeft: number } | null;
}

const initials = (clientId: string) =>
  clientId
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

function HomePending({
  wallet,
  pending,
  onDone,
}: {
  wallet: StoredWallet;
  pending: Pending;
  onDone: (r: { status: 'sent' | 'cancelled' }) => void;
}) {
  const p = usePendingPayment(wallet, pending, onDone);
  return (
    <>
      <PendingPaymentPanel pending={pending} secondsLeft={p.secondsLeft} total={p.total} error={p.error} />
      <Btn kind="secondary" disabled={p.busy} onClick={p.cancel}>
        {p.busy ? 'Confirm on your device…' : 'Cancel payment'}
      </Btn>
    </>
  );
}

export function Home({
  wallet,
  session,
  onSend,
  onLogout,
}: {
  wallet: StoredWallet;
  session: Session;
  onSend: () => void;
  onLogout: () => void;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [address, setAddress] = useState(() => deriveAddress(wallet.policy, 0, 0, btc.network).address);
  const [backupDeposited, setBackupDeposited] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState('');
  const [recoveryInfo, setRecoveryInfo] = useState<RecoveryInfo | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [busyFreeze, setBusyFreeze] = useState(false);
  const [tab, setTab] = useState<TabName>('wallet');
  const [showLost, setShowLost] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [utxos, index] = await Promise.all([
        esplora.scanWallet(wallet.policy, btc.network, 20),
        esplora.firstUnusedIndex(wallet.policy, btc.network, 0),
      ]);
      setBalance(utxos.reduce((s, u) => s + u.value, 0n));
      setAddress(deriveAddress(wallet.policy, 0, index, btc.network).address);
    } catch {
      setMessage('Bitcoin network unreachable (is regtest running? `npm run regtest:up`)');
    }
    loadPending(wallet.walletId).then((p) => setPending(p ?? null));
    sq<RecoveryInfo>(`/wallets/${wallet.walletId}/recovery`)
      .then(setRecoveryInfo)
      .catch(() => setRecoveryInfo(null));
    sq<{ notifications: Notification[] }>(`/notifications/${wallet.walletId}`)
      .then((r) => setNotifications(r.notifications.slice(-3).reverse()))
      .catch(() => setNotifications([]));
  }, [wallet]);

  useEffect(() => {
    refresh();
    partner<{ exists: boolean }>(`/shares/${wallet.walletId}`)
      .then((r) => setBackupDeposited(r.exists))
      .catch(() => setBackupDeposited(false));
    sq<{ dailyLimitSats: string }>('/rules')
      .then((r) => setLimit(r.dailyLimitSats))
      .catch(() => setLimit(null));
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh, wallet.walletId]);

  // Récupération lancée depuis un autre appareil : le vrai propriétaire l'annule avec sa passkey.
  async function cancelRecovery(recoveryId: string) {
    setCancelling(true);
    try {
      const authentication = await approve(wallet.walletId, 'cancel', recoveryId);
      await sq(`/recovery/${recoveryId}/cancel`, { authentication });
      setMessage('Recovery cancelled. Your wallet is unfrozen.');
      refresh();
    } catch (e) {
      setMessage((e as Error).name === 'NotAllowedError' ? 'Cancellation interrupted on the device.' : (e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  // Gel : action de protection, la session suffit. Dégel : assouplit la protection, passkey exigée.
  async function freeze() {
    setBusyFreeze(true);
    try {
      const r = await sq<{ cancelledPayments: number }>(`/wallets/${wallet.walletId}/freeze`, {}, session.token);
      setMessage(`Wallet frozen. ${r.cancelledPayments} pending payment(s) cancelled.`);
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusyFreeze(false);
    }
  }

  async function unfreeze() {
    setBusyFreeze(true);
    try {
      const authentication = await approve(wallet.walletId, 'unfreeze', wallet.walletId);
      await sq(`/wallets/${wallet.walletId}/unfreeze`, { authentication });
      setMessage('Wallet unfrozen.');
      refresh();
    } catch (e) {
      setMessage((e as Error).name === 'NotAllowedError' ? 'Unfreeze interrupted on the device.' : (e as Error).message);
    } finally {
      setBusyFreeze(false);
    }
  }

  if (recoveryInfo?.status === 'recovered') {
    return (
      <Screen
        footer={
          <Btn kind="secondary" onClick={onLogout}>
            Log out
          </Btn>
        }
      >
        <Title
          title="This wallet was recovered on another device"
          lead="The funds were moved to a new wallet and this device’s passkey was revoked. This device no longer has access to anything."
        />
      </Screen>
    );
  }

  async function faucet() {
    setMessage('Requesting test bitcoin from the regtest faucet…');
    await fetch(`${btc.esploraUrl}/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    setTimeout(async () => {
      await refresh();
      setMessage('');
    }, 1500);
  }

  const frozen = recoveryInfo?.status === 'frozen';
  const frozenByClient = frozen && !recoveryInfo?.recovery;
  const sendBlocked = !balance ? 'No funds yet' : pending ? 'A payment is on hold' : frozen ? 'Wallet frozen' : null;
  const keyChip = (ok: boolean | null): [string, 'success' | 'danger' | 'neutral'] =>
    ok === null ? ['Checking', 'neutral'] : ok ? ['Active', 'success'] : ['Share missing', 'danger'];

  return (
    <Screen tabs={{ value: tab, onChange: setTab }}>
      {tab === 'wallet' ? (
        <div className="home-head" key="head">
          <Brand />
          <button
            type="button"
            className="avatar"
            onClick={() => setShowProfile((v) => !v)}
            title="Account"
            aria-label="Account"
            aria-expanded={showProfile}
          >
            {initials(wallet.clientId)}
          </button>
        </div>
      ) : (
        <Title
          key="head"
          title={tab === 'transfers' ? 'Transfers' : 'Recovery'}
          lead={
            tab === 'transfers'
              ? 'Send and receive bitcoin.'
              : 'What protects your wallet, and what to do if something goes wrong.'
          }
        />
      )}

      {tab === 'wallet' && showProfile && (
        <Group key="profile" label="Account">
          <Row icon="bank" title={wallet.clientId} sub="Swissquote client (mock login)" />
          <Row icon="wallet" title="Wallet" sub={`${wallet.walletId.slice(0, 8)}… · ${wallet.network}`} />
          <Row icon="lifebuoy" title="Recovery and protection" trail="chevR" onClick={() => (setShowProfile(false), setTab('recovery'))} />
          <Row icon="logout" title="Log out" sub="Your wallet stays on this device" trail="chevR" onClick={onLogout} />
        </Group>
      )}

      {!wallet.backupConfirmed && (
        <Callout key="backup" tone="danger" title="Backup incomplete">
          Wallet creation stopped before your backup words were checked. If you did not write them down, this wallet
          cannot be recovered if you lose your phone. Do not fund it: create a new one.
        </Callout>
      )}

      {recoveryInfo?.recovery && (
        <Callout key="foreign" tone="danger" title="Recovery requested from another device">
          Your wallet is frozen. If this is you, do nothing. If it is not you, cancel it: without your backup words
          nobody can recover this wallet anyway.
          <strong>
            {recoveryInfo.recovery.secondsLeft > 0
              ? `Completes in ${formatClock(recoveryInfo.recovery.secondsLeft)}`
              : 'Delay over: it can complete at any moment'}
          </strong>
          <Btn disabled={cancelling} icon="face" onClick={() => cancelRecovery(recoveryInfo.recovery!.recoveryId)}>
            {cancelling ? 'Confirm on your device…' : 'This is not me: cancel'}
          </Btn>
        </Callout>
      )}

      {frozenByClient && (
        <Callout key="frozen" title="Wallet frozen">
          No payment can leave this wallet until you unfreeze it with your passkey.
          <Btn kind="secondary" icon="face" disabled={busyFreeze} onClick={unfreeze}>
            {busyFreeze ? 'Confirm on your device…' : 'Unfreeze wallet'}
          </Btn>
        </Callout>
      )}

      {tab === 'wallet' && (
        <div className="balance-card" key="balance">
          <span className="cap">
            Bitcoin wallet, {wallet.network === 'signet' ? 'signet (public test network)' : 'regtest (local)'}
          </span>
          <strong>{balance === null ? '…' : formatBtc(balance)}</strong>
          <span className="cap">{balance === null ? '' : formatSats(balance)}</span>
        </div>
      )}

      {tab === 'wallet' && (
        <div className="quick" key="quick">
          <button type="button" disabled={!!sendBlocked} onClick={onSend}>
            <span className="disc dark">
              <Icon name="up" size={24} />
            </span>
            Send
          </button>
          <button type="button" onClick={() => (setShowReceive(true), setTab('transfers'))}>
            <span className="disc">
              <Icon name="down" size={24} />
            </span>
            Receive
          </button>
        </div>
      )}

      {tab === 'transfers' && (
        <Group key="actions">
          <Row
            icon="up"
            title="Send bitcoin"
            sub={sendBlocked ?? 'To any Bitcoin address'}
            trail="chevR"
            disabled={!!sendBlocked}
            onClick={onSend}
          />
          <Row
            icon="down"
            title="Receive bitcoin"
            sub={showReceive ? 'Hide your address' : 'Show your address'}
            trail="chevR"
            onClick={() => setShowReceive((v) => !v)}
          />
          {wallet.network === 'regtest' && (
            <Row icon="plus" title="Get test bitcoin" sub="Regtest faucet, for the demo" trail="chevR" onClick={faucet} />
          )}
        </Group>
      )}

      {tab === 'transfers' && showReceive && (
        <Group key="receive" label="Your receive address">
          <div className="sheet padded">
            <span className="address">{address}</span>
            <Btn kind="secondary" small icon="copy" onClick={() => navigator.clipboard?.writeText(address)}>
              Copy address
            </Btn>
          </div>
        </Group>
      )}

      {/* Toujours monté, quel que soit l'onglet : une seule boucle de suivi par paiement en attente. */}
      {pending && (
        <div key="pending" className="stack" hidden={tab === 'recovery'}>
          <HomePending
            wallet={wallet}
            pending={pending}
            onDone={(r) => {
              setPending(null);
              setMessage(r.status === 'sent' ? 'Large payment sent after the security delay.' : 'Payment cancelled.');
              refresh();
            }}
          />
        </div>
      )}

      {message && (
        <p className="note" key="message">
          {message}
        </p>
      )}

      {tab !== 'recovery' && (
        <div className="sheet padded" key="limit">
          <div className="limit-head">
            <strong>Daily limit</strong>
            <span>{limit === null ? '…' : formatSats(limit)}</span>
          </div>
          <p className="note">Payments above your daily limit are held for a security delay.</p>
        </div>
      )}

      {tab !== 'recovery' && notifications.length > 0 && (
        <Group key="alerts" label="Swissquote alerts (mock SMS, email and client area)">
          {notifications.map((n) => (
            <Row
              key={n.at + n.text}
              icon="bell"
              title={new Date(n.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              sub={n.text}
            />
          ))}
        </Group>
      )}

      {tab === 'recovery' && (
        <Group key="keys" label="Your three keys">
          <Row icon="phone" title="Phone key" sub="On this device" chip={['Active', 'success']} />
          <Row
            icon="bank"
            title="Swissquote key"
            sub="Signs with you up to your daily limit"
            chip={frozen ? ['Frozen', 'accent'] : ['Active', 'success']}
          />
          <Row icon="key" title="Backup key" sub="Your words and our partner’s share" chip={keyChip(backupDeposited)} />
        </Group>
      )}

      {tab === 'recovery' && (
        <Group key="help" label="If something goes wrong">
          {!frozen && (
            <Row
              icon="lock"
              title={busyFreeze ? 'Freezing…' : 'Freeze wallet'}
              sub="Phone stolen? Blocks every payment at once"
              trail="chevR"
              disabled={busyFreeze}
              onClick={freeze}
            />
          )}
          <Row
            icon="lifebuoy"
            title="Lost your phone?"
            sub={showLost ? 'Hide the steps' : 'How recovery works'}
            trail="chevR"
            onClick={() => setShowLost((v) => !v)}
          />
          <Row
            icon="download"
            title="Exit kit"
            sub="Use your wallet without Swissquote"
            trail="chevR"
            onClick={() => downloadExitKit(wallet)}
          />
        </Group>
      )}

      {tab === 'recovery' && showLost && (
        <Timeline
          key="lost"
          items={[
            {
              state: 'todo',
              title: 'Log in on your new device',
              desc: 'With your Swissquote account. Recovery starts from there.',
            },
            { state: 'todo', title: 'Wait for the security delay', desc: 'This phone is alerted and can still cancel.' },
            {
              state: 'todo',
              title: 'Enter your backup words',
              desc: 'Your paper copy, or your encrypted copy and passphrase.',
            },
            {
              state: 'todo',
              title: 'Get your new keys',
              desc: 'Your bitcoin moves to a new wallet and this phone stops working.',
            },
          ]}
        />
      )}

      {tab === 'recovery' && (
        <Group key="session">
          <Row icon="logout" title="Log out" trail="chevR" onClick={onLogout} />
        </Group>
      )}
    </Screen>
  );
}
