// Accueil du wallet : solde, adresse de réception, état de la sauvegarde, kit de sortie.
import { useCallback, useEffect, useState } from 'react';
import { deriveAddress, descriptorString, Esplora } from '@sqw/core';
import { partner } from '../api';
import { btc } from '../config';
import type { StoredWallet } from '../keystore';

const esplora = new Esplora(btc);

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

export function Home({ wallet, onLogout }: { wallet: StoredWallet; onLogout: () => void }) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [backupDeposited, setBackupDeposited] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const address = deriveAddress(wallet.policy, 0, 0, btc.network).address;

  const refresh = useCallback(async () => {
    try {
      const utxos = await esplora.scanWallet(wallet.policy, btc.network, 5);
      setBalance(utxos.reduce((s, u) => s + u.value, 0n));
    } catch {
      setMessage('Réseau Bitcoin injoignable (regtest lancé ? `npm run regtest:up`)');
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
    partner<{ exists: boolean }>(`/shares/${wallet.walletId}`)
      .then((r) => setBackupDeposited(r.exists))
      .catch(() => setBackupDeposited(false));
  }, [refresh, wallet.walletId]);

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
        <strong>{balance === null ? '…' : `${(Number(balance) / 1e8).toFixed(8)} BTC`}</strong>
        <small>{balance === null ? '' : `${balance.toLocaleString('fr-CH')} sats`}</small>
      </div>

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
