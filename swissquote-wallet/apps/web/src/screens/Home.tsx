// Accueil du wallet : solde, envoi, paiement en attente, alertes Swissquote, réception, sauvegarde,
// kit de sortie.
import { useCallback, useEffect, useState } from 'react';
import { deriveAddress, descriptorString } from '@sqw/core';
import { partner, sq } from '../api';
import { btc } from '../config';
import { formatBtc, formatSats } from '../format';
import { loadPending, type PendingPayment as Pending, type StoredWallet } from '../keystore';
import { approve, esplora } from '../payments';
import { PendingPayment } from './PendingPayment';

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

export function Home({
  wallet,
  onSend,
  onLogout,
}: {
  wallet: StoredWallet;
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

  const refresh = useCallback(async () => {
    try {
      const [utxos, index] = await Promise.all([
        esplora.scanWallet(wallet.policy, btc.network, 20),
        esplora.firstUnusedIndex(wallet.policy, btc.network, 0),
      ]);
      setBalance(utxos.reduce((s, u) => s + u.value, 0n));
      setAddress(deriveAddress(wallet.policy, 0, index, btc.network).address);
    } catch {
      setMessage('Réseau Bitcoin injoignable (regtest lancé ? `npm run regtest:up`)');
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
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh, wallet.walletId]);

  // Récupération lancée depuis un autre appareil : le vrai propriétaire l'annule avec sa passkey.
  async function cancelRecovery(recoveryId: string) {
    setCancelling(true);
    try {
      const authentication = await approve(wallet.walletId, 'cancel', recoveryId);
      await sq(`/recovery/${recoveryId}/cancel`, { authentication });
      setMessage('Récupération annulée : votre wallet est dégelé.');
      refresh();
    } catch (e) {
      setMessage((e as Error).name === 'NotAllowedError' ? 'Annulation interrompue sur l’appareil.' : (e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  if (recoveryInfo?.status === 'recovered') {
    return (
      <div className="screen">
        <p className="eyebrow">Wallet récupéré</p>
        <h1>Ce wallet a été récupéré sur un autre appareil</h1>
        <p>
          Les fonds ont été transférés vers un nouveau wallet et la passkey de cet appareil a été révoquée.
          Cet appareil n’a plus accès à rien.
        </p>
        <button className="secondary" onClick={onLogout}>
          Se déconnecter
        </button>
      </div>
    );
  }

  async function faucet() {
    setMessage('Demande au faucet regtest…');
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

  return (
    <div className="screen">
      <p className="eyebrow">
        Wallet Bitcoin · {wallet.network === 'signet' ? 'signet (réseau de test public)' : 'regtest (local)'}
      </p>
      {!wallet.backupConfirmed && (
        <div className="card warning">
          <strong>Sauvegarde incomplète</strong>
          <span>
            La création a été interrompue avant la vérification de votre part de secours. Si vous ne
            l’avez pas recopiée, ce wallet ne pourra pas être récupéré en cas de perte du téléphone :
            n’y déposez pas de fonds et créez-en un nouveau.
          </span>
        </div>
      )}
      <div className="balance">
        <span>Solde</span>
        <strong>{balance === null ? '…' : formatBtc(balance)}</strong>
        <small>{balance === null ? '' : formatSats(balance)}</small>
      </div>
      {recoveryInfo?.recovery && (
        <div className="card warning">
          <strong>Récupération demandée depuis un autre appareil</strong>
          <span>
            Votre wallet est gelé. Si c’est vous, ne faites rien. Si ce n’est pas vous, annulez : sans votre
            part papier, personne ne peut de toute façon récupérer ce wallet.
          </span>
          <span className="countdown">
            {recoveryInfo.recovery.secondsLeft > 0
              ? `Aboutit dans ${recoveryInfo.recovery.secondsLeft} s`
              : 'Délai écoulé : elle peut aboutir à tout moment'}
          </span>
          <button className="primary" disabled={cancelling} onClick={() => cancelRecovery(recoveryInfo.recovery!.recoveryId)}>
            {cancelling ? 'Validation sur l’appareil…' : 'Ce n’est pas moi : annuler'}
          </button>
        </div>
      )}
      <button className="primary" disabled={!balance || !!pending || recoveryInfo?.status === 'frozen'} onClick={onSend}>
        Envoyer
      </button>

      {pending && (
        <PendingPayment
          wallet={wallet}
          pending={pending}
          onDone={(r) => {
            setPending(null);
            setMessage(r.status === 'sent' ? 'Gros paiement envoyé après le délai de sécurité.' : 'Paiement annulé.');
            refresh();
          }}
        />
      )}

      {notifications.length > 0 && (
        <div className="card">
          <span className="label">Alertes Swissquote (MOCK : SMS, e-mail, espace client)</span>
          <ul className="inbox">
            {notifications.map((n) => (
              <li key={n.at + n.text}>
                <time>{new Date(n.at).toLocaleTimeString('fr-CH')}</time> {n.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <span className="label">Adresse de réception</span>
        <code className="address">{address}</code>
        <button className="secondary" onClick={() => navigator.clipboard?.writeText(address)}>
          Copier l’adresse
        </button>
        {wallet.network === 'regtest' && (
          <button className="secondary" onClick={faucet}>
            Recevoir des BTC de test (regtest)
          </button>
        )}
      </div>

      <div className="card">
        <span className="label">Protection</span>
        <ul className="facts">
          <li>Multisig 2 sur 3 : téléphone, Swissquote, secours.</li>
          <li>
            Part de secours chez le partenaire :{' '}
            {backupDeposited === null ? '…' : backupDeposited ? 'déposée ✓' : 'introuvable ⚠'}
          </li>
          <li>Votre part papier et sa copie chiffrée : chez vous.</li>
        </ul>
        <button className="secondary" onClick={() => downloadExitKit(wallet)}>
          Télécharger le kit de sortie
        </button>
      </div>

      {message && <p className="note">{message}</p>}
      <button className="secondary" onClick={onLogout}>
        Se déconnecter
      </button>
    </div>
  );
}
