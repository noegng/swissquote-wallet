// Wallet home, in four tabs matching what the app can do:
//   Wallet (balance), Transfers (send, receive), Activity (transactions read from the chain and
//   Swissquote alerts), Recovery (keys, freeze, lost phone, exit kit).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { deriveAddress, descriptorString, type WalletTx } from '@sqw/core';
import { ApiError, sq, type Session } from '../api';
import { btc } from '../config';
import { btcDigits, formatBtc, formatChf } from '../format';
import { RollingNumber } from '../anim/RollingNumber';
import { deleteWallet, loadPending, type PendingPayment as Pending, type StoredWallet } from '../keystore';
import { approve, esplora } from '../payments';
import { cancelPartnerRelease } from '../recovery';
import { useChfRate } from '../price';
import { QrCode } from '../qr';
import { Brand, Btn, Callout, Group, Icon, Row, Screen, Timeline, Title, formatClock, type TabName } from '../ui';
import { shareHolder, type ShareHolder } from '../trustee';
import { InstantLimit, useInstantLimit } from './InstantLimit';
import { PendingPaymentPanel, usePendingPayment, type Done } from './PendingPayment';

function downloadExitKit(wallet: StoredWallet) {
  const kit = {
    type: 'swissquote-wallet/exit-kit',
    note:
      'Exit kit: import these descriptors into a standard multisig wallet (Sparrow, Bitcoin Core). ' +
      'With the phone key and the backup key (paper share or cloud copy + the partner share), ' +
      'you can spend without Swissquote.',
    network: wallet.network,
    receive: descriptorString(wallet.policy, 0),
    change: descriptorString(wallet.policy, 1),
    keys: { phone: wallet.policy.keys[0], swissquote: wallet.policy.keys[1], backup: wallet.policy.keys[2] },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: 'swissquote-wallet-exit-kit.json' }).click();
  // Revoking right away can interrupt the download (Safari, Firefox).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface Notification {
  at: string;
  text: string;
}

interface RecoveryInfo {
  status: 'active' | 'frozen' | 'recovered';
  recovery: { recoveryId: string; secondsLeft: number } | null;
}

type ActivityItem = { at: number; key: string } & ({ tx: WalletTx } | { text: string });

const shortTx = (txid: string) => `${txid.slice(0, 6)}…${txid.slice(-6)}`;

const NETWORK_DOWN = 'Bitcoin network unreachable (is regtest running? `npm run regtest:up`)';

// Refresh: each pass queries dozens of addresses. On signet the public API
// rate-limits requests, so passes are spaced out.
const REFRESH_MS = btc.name === 'regtest' ? 5_000 : 20_000;

const SIGNET_FAUCET = 'https://bitcoinsignetfaucet.com';

const clock = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function dayLabel(at: number): string {
  const day = new Date(at).toDateString();
  if (day === new Date().toDateString()) return 'Today';
  if (day === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// Last alert seen, per wallet: only used for the Activity tab badge.
const seenKey = (walletId: string) => `sqw.activity.seen.${walletId}`;

function readSeen(walletId: string): string {
  try {
    return localStorage.getItem(seenKey(walletId)) ?? '';
  } catch {
    return '';
  }
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
  onDone: (r: Done) => void;
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
  onTrustee,
  onLogout,
  onDiscard,
}: {
  wallet: StoredWallet;
  session: Session;
  onSend: () => void;
  onTrustee: () => void;
  onLogout: () => void;
  /** Empty, never backed-up wallet dropped: the app offers to create a new one. */
  onDiscard: () => void;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [address, setAddress] = useState(() => deriveAddress(wallet.policy, 0, 0, btc.network).address);
  const [backupDeposited, setBackupDeposited] = useState<boolean | null>(null);
  // Who holds the PARTNER share: the partner, or a trusted person chosen by the client.
  const [holder, setHolder] = useState<ShareHolder | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [message, setMessage] = useState('');
  const [recoveryInfo, setRecoveryInfo] = useState<RecoveryInfo | null>(null);
  // Wallet on the device but unknown to the Swissquote service (mock data reset):
  // no cosigning is possible, so say so instead of letting every payment fail.
  const [unknownRemote, setUnknownRemote] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [busyFreeze, setBusyFreeze] = useState(false);
  const [tab, setTab] = useState<TabName>('wallet');
  const [showLost, setShowLost] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [history, setHistory] = useState<WalletTx[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(wallet.walletId));
  const rate = useChfRate();
  // Re-read whenever the balance or the pending payment changes (a payment was just signed).
  const instant = useInstantLimit(wallet.walletId, `${balance}/${pending?.requestId}`);

  const refresh = useCallback(async () => {
    try {
      const { utxos, nextReceive: index } = await esplora.walletState(wallet.policy, btc.network, 20);
      setBalance(utxos.reduce((s, u) => s + u.value, 0n));
      setAddress(deriveAddress(wallet.policy, 0, index, btc.network).address);
      setMessage((m) => (m === NETWORK_DOWN ? '' : m));
    } catch {
      setMessage(NETWORK_DOWN);
    }
    loadPending(wallet.walletId).then((p) => setPending(p ?? null));
    sq<RecoveryInfo>(`/wallets/${wallet.walletId}/recovery`)
      .then((r) => {
        setRecoveryInfo(r);
        setUnknownRemote(false);
      })
      .catch((e) => {
        setRecoveryInfo(null);
        setUnknownRemote(e instanceof ApiError && e.status === 404);
      });
    sq<{ notifications: Notification[] }>(`/notifications/${wallet.walletId}`)
      .then((r) => setNotifications([...r.notifications].reverse()))
      .catch(() => setNotifications([]));
  }, [wallet]);

  useEffect(() => {
    refresh();
    shareHolder(wallet.walletId)
      .then((r) => {
        setBackupDeposited(r.exists);
        setHolder(r);
      })
      .catch(() => setBackupDeposited(false));
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, wallet.walletId]);

  // History read from the chain, when the tab opens and then whenever the balance changes.
  useEffect(() => {
    if (tab !== 'activity') return;
    let stale = false;
    esplora
      .walletTxs(wallet.policy, btc.network, 20)
      .then((txs) => {
        if (stale) return;
        setHistory(txs);
        setHistoryError(false);
      })
      .catch(() => {
        if (!stale) setHistoryError(true);
      });
    return () => {
      stale = true;
    };
  }, [tab, balance, wallet]);

  const latestAlert = notifications[0]?.at ?? '';
  // Alerts that arrived since the Activity tab was last opened (the bell's count).
  const unseen = notifications.filter((n) => n.at > seen).length;
  useEffect(() => {
    if (tab !== 'activity' || !latestAlert || latestAlert <= seen) return;
    setSeen(latestAlert);
    try {
      localStorage.setItem(seenKey(wallet.walletId), latestAlert);
    } catch {
      // Storage unavailable: the badge comes back on the next load, with no other effect.
    }
  }, [tab, latestAlert, seen, wallet.walletId]);

  // Transactions and alerts in a single feed, grouped by day, most recent first.
  const days = useMemo(() => {
    const items: ActivityItem[] = [
      ...(history ?? []).map((tx) => ({ at: tx.blockTime ? tx.blockTime * 1000 : Date.now(), key: tx.txid, tx })),
      ...notifications.map((n) => ({ at: Date.parse(n.at), key: n.at + n.text, text: n.text })),
    ].sort((a, b) => b.at - a.at);
    const groups: { label: string; items: ActivityItem[] }[] = [];
    for (const item of items) {
      const label = dayLabel(item.at);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [history, notifications]);

  // Recovery started from another device: the real owner cancels it with their passkey.
  async function cancelRecovery(recoveryId: string) {
    setCancelling(true);
    try {
      const authentication = await approve(wallet.walletId, 'cancel', recoveryId);
      await sq(`/recovery/${recoveryId}/cancel`, { authentication });
      // The partner's share must not go to the device that started this recovery.
      await cancelPartnerRelease(wallet.walletId, wallet.clientId).catch(() => {});
      setMessage('Recovery cancelled.');
      refresh();
    } catch (e) {
      setMessage((e as Error).name === 'NotAllowedError' ? 'Cancellation interrupted on the device.' : (e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  // Freeze: a protective action, the session is enough. Unfreeze: relaxes the protection, passkey required.
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
    if (wallet.network === 'signet') {
      // Public signet faucet: show the address, copy it, and open the faucet in a new tab.
      setShowReceive(true);
      navigator.clipboard?.writeText(address).catch(() => {});
      window.open(SIGNET_FAUCET, '_blank', 'noopener,noreferrer');
      return setMessage('Your address is copied: paste it in the signet faucet. The balance updates within about 20 seconds.');
    }
    setMessage('Requesting test bitcoin from the regtest faucet…');
    try {
      const res = await fetch(`${btc.esploraUrl}/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      return setMessage('The regtest faucet did not answer (is regtest running? `npm run regtest:up`).');
    }
    setTimeout(async () => {
      await refresh();
      setMessage('');
    }, 1500);
  }

  const frozen = recoveryInfo?.status === 'frozen';
  const frozenByClient = frozen && !recoveryInfo?.recovery;
  const sendBlocked = unknownRemote
    ? 'Wallet unknown to Swissquote'
    : !balance
      ? 'No funds yet'
      : pending
        ? 'A payment is on hold'
        : frozen
          ? 'Wallet frozen'
          : null;
  const keyChip = (ok: boolean | null): [string, 'success' | 'danger' | 'neutral'] =>
    ok === null ? ['Checking', 'neutral'] : ok ? ['Active', 'success'] : ['Share missing', 'danger'];

  return (
    <Screen tabs={{ value: tab, onChange: setTab, badges: { activity: unseen } }}>
      {tab === 'wallet' ? (
        <div className="home-head" key="head">
          <Brand />
          <h1 className="web-title">Wallet</h1>
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
          title={tab === 'transfers' ? 'Transfers' : tab === 'activity' ? 'Activity' : 'Recovery'}
          lead={
            tab === 'transfers'
              ? 'Send and receive bitcoin.'
              : tab === 'activity'
                ? 'Your transactions, read from the Bitcoin network, and the alerts Swissquote sent you.'
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

      {unknownRemote && (
        <Callout key="unknown" tone="danger" title="Swissquote does not know this wallet">
          This device holds a wallet that the Swissquote service no longer knows (its demo data was reset), so
          Swissquote cannot co-sign its payments.
          {(balance === 0n || btc.name === 'regtest') && (
            <Btn
              kind="secondary"
              onClick={async () => {
                await deleteWallet(wallet.clientId);
                onDiscard();
              }}
            >
              {balance ? 'Remove it (its regtest test coins are abandoned)' : 'Remove it and create a new wallet'}
            </Btn>
          )}
          {!!balance && btc.name !== 'regtest' && (
            <strong>It holds bitcoin: move it out with your phone key and backup key (exit kit, from the login screen).</strong>
          )}
        </Callout>
      )}

      {!wallet.backupConfirmed && !unknownRemote && (
        <Callout key="backup" tone="danger" title="Backup incomplete">
          Wallet creation stopped before your backup words were checked. If you did not write them down, this wallet
          cannot be recovered if you lose your phone. Do not fund it: create a new one.
          {balance === 0n && !pending && (
            <Btn
              kind="secondary"
              onClick={async () => {
                await deleteWallet(wallet.clientId);
                onDiscard();
              }}
            >
              Create a new wallet
            </Btn>
          )}
          {balance !== null && balance > 0n && (
            <strong>This wallet holds bitcoin: send it out first, then you can replace it with a new wallet.</strong>
          )}
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
          <strong>{balance === null ? '…' : <RollingNumber value={btcDigits(balance)} suffix=" BTC" />}</strong>
          <span className="cap">{balance === null ? '' : formatChf(balance, rate)}</span>
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
          <Row
            icon="plus"
            title="Get test bitcoin"
            sub={wallet.network === 'regtest' ? 'Regtest faucet, for the demo' : 'Signet faucet: your address is copied'}
            trail="chevR"
            onClick={faucet}
          />
        </Group>
      )}

      {tab === 'transfers' && showReceive && (
        <Group key="receive" label="Your receive address">
          <div className="sheet padded">
            <QrCode value={`bitcoin:${address}`} label="QR code of your receive address" />
            <span className="address">{address}</span>
            <Btn kind="secondary" small icon="copy" onClick={() => navigator.clipboard?.writeText(address)}>
              Copy address
            </Btn>
          </div>
        </Group>
      )}

      {/* Always mounted, whatever the tab: a single tracking loop per pending payment. */}
      {pending && (
        <div key="pending" className="stack" hidden={tab === 'recovery' || tab === 'activity'}>
          <HomePending
            wallet={wallet}
            pending={pending}
            onDone={(r) => {
              setPending(null);
              setMessage(
                r.status === 'sent'
                  ? 'Large payment sent after the security delay.'
                  : r.status === 'failed'
                    ? `Large payment not sent. ${r.reason}`
                    : 'Payment cancelled.',
              );
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

      {(tab === 'wallet' || tab === 'transfers') && (
        <InstantLimit key="limit" limit={instant} rate={rate} />
      )}

      {tab === 'activity' &&
        days.map((day) => (
          <Group key={day.label} label={day.label}>
            {day.items.map((item) =>
              'tx' in item ? (
                <Row
                  key={item.key}
                  icon={item.tx.net < 0n ? 'up' : 'down'}
                  title={item.tx.net < 0n ? 'Sent' : 'Received'}
                  sub={
                    <>
                      {item.tx.confirmed ? clock(item.at) : 'Waiting for a block'}
                      <br />
                      <span className="txlink">
                        Tx {shortTx(item.tx.txid)}
                        <Icon name="external" size={14} />
                      </span>
                    </>
                  }
                  value={
                    <>
                      {item.tx.net < 0n ? `−${formatBtc(-item.tx.net)}` : `+${formatBtc(item.tx.net)}`}
                      <small>{formatChf(item.tx.net < 0n ? -item.tx.net : item.tx.net, rate)}</small>
                    </>
                  }
                  valueTone={item.tx.net < 0n ? undefined : 'success'}
                  label={`${item.tx.net < 0n ? 'Sent' : 'Received'} ${formatBtc(item.tx.net < 0n ? -item.tx.net : item.tx.net)}, open the transaction in a block explorer`}
                  onClick={() => window.open(btc.explorerTxUrl(item.tx.txid), '_blank', 'noopener,noreferrer')}
                />
              ) : (
                <Row key={item.key} icon="bell" title={`Swissquote alert, ${clock(item.at)}`} sub={item.text} />
              ),
            )}
          </Group>
        ))}

      {tab === 'activity' && history === null && !historyError && (
        <p className="note" key="history-loading">
          Reading your transactions from the Bitcoin network…
        </p>
      )}

      {tab === 'activity' && historyError && (
        <p className="note" key="history-error">
          Bitcoin network unreachable: transactions cannot be listed right now.
        </p>
      )}

      {tab === 'activity' && history !== null && days.length === 0 && (
        <p className="note" key="history-empty">
          Nothing yet. Your transactions and Swissquote alerts will be listed here.
        </p>
      )}

      {tab === 'activity' && days.length > 0 && (
        <p className="note" key="history-note">
          Tap a transaction to check it in a block explorer: amounts come from the Bitcoin network, not from
          Swissquote. Sent amounts include the network fee. Alerts come from the mock Swissquote service (SMS, email
          and client area). CHF values use today’s Bitcoin rate; coins on this test network have no real value.
        </p>
      )}

      {tab === 'recovery' && (
        <Group key="keys" label="Your three keys">
          <Row icon="phone" title="Phone key" sub="On this device" chip={['Active', 'success']} />
          <Row
            icon="bank"
            title="Swissquote key"
            sub="Signs at once up to a daily amount, after a delay above it"
            chip={frozen ? ['Frozen', 'accent'] : ['Active', 'success']}
          />
          <Row
            icon="key"
            title="Backup key"
            sub={`Your words and ${holder?.trusteeName ?? 'our partner'}’s share`}
            chip={keyChip(backupDeposited)}
          />
        </Group>
      )}

      {tab === 'recovery' && backupDeposited && (
        <Group key="trustee" label="Who holds the other half of your backup key">
          <Row
            icon="face"
            title={holder?.trusteeName ?? 'Our independent partner'}
            sub={
              holder?.holder === 'trustee'
                ? 'Trusted person you chose'
                : holder?.invitation
                  ? `Invitation to ${holder.invitation.trusteeName} in progress`
                  : 'Entrust it to a notary or a lawyer instead'
            }
            trail="chevR"
            onClick={onTrustee}
          />
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
