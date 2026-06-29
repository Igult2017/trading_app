import { useState } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { connectCtraderPopup } from './connectCtraderPopup';

interface PendingAcct {
  ctidTraderAccountId: string;
  traderLogin: string;
  brokerName?: string;
  isLive?: boolean;
  balance?: number;
  currency?: string;
}

/**
 * "Add a new cTrader account" — runs the whole OAuth in a popup so the wizard is never left.
 * On success it calls onConnected(accountId). If the cTrader login has multiple trading
 * accounts, it shows an inline picker right here (no Accounts-page detour).
 */
export default function AddCtraderAccountButton({
  onConnected,
  label = 'Add a new account',
  primary = false,
}: {
  onConnected: (id: string) => void;
  label?: string;
  primary?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectToken, setSelectToken] = useState('');
  const [choices, setChoices] = useState<PendingAcct[]>([]);

  const start = async () => {
    setError(''); setBusy(true);
    try {
      const r = await connectCtraderPopup();
      if (r.status === 'connected') {
        onConnected(r.accountId);
      } else {
        const res = await apiRequest('GET', `/api/broker/ctrader/pending-accounts?token=${r.accountId}`);
        const data = await res.json();
        setSelectToken(r.accountId);
        setChoices(data.accounts || []);
      }
    } catch (e: any) {
      setError(e?.message || 'Connection failed.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (ctid: string) => {
    setError(''); setBusy(true);
    try {
      await apiRequest('POST', '/api/broker/ctrader/select-account', { token: selectToken, ctidTraderAccountId: ctid });
      const id = selectToken;
      setSelectToken(''); setChoices([]);
      onConnected(id);
    } catch (e: any) {
      setError(e?.message || 'Could not select that account.');
    } finally {
      setBusy(false);
    }
  };

  if (selectToken && choices.length) {
    return (
      <div className="space-y-2 rounded-lg p-3" style={{ border: '1px solid var(--b2)', background: 'var(--s2)' }}>
        <p className="uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>Choose which cTrader account</p>
        {choices.map(c => (
          <button
            key={c.ctidTraderAccountId}
            type="button"
            disabled={busy}
            onClick={() => pick(c.ctidTraderAccountId)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors disabled:opacity-50"
            style={{ border: '1px solid var(--b2)', background: 'var(--s3)' }}
          >
            <span className="truncate" style={{ fontSize: 14, color: 'var(--t1)' }}>
              #{c.traderLogin}{c.brokerName ? <span style={{ color: 'var(--t3)' }}> · {c.brokerName}</span> : null}
            </span>
            <span className="uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ fontSize: 8, fontWeight: 700, color: c.isLive ? 'var(--bad)' : 'var(--ok)', background: c.isLive ? 'var(--bad-s)' : 'var(--ok-s)' }}>
              {c.isLive ? 'Live' : 'Demo'}
            </span>
          </button>
        ))}
        {error && <p className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--bad)' }}><AlertCircle size={12} /> {error}</p>}
      </div>
    );
  }

  const iconSize = primary ? 13 : 12;
  const btnStyle = primary
    ? { height: 38, padding: '0 16px', background: 'var(--acc)', color: '#fff', borderRadius: 8, border: '1px solid transparent' }
    : { color: 'var(--t2)' };

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={start} disabled={busy}
        className={`${primary ? 'inline-flex items-center gap-2 uppercase tracking-widest' : 'inline-flex items-center gap-1.5'} transition-colors disabled:opacity-60`}
        style={{ ...btnStyle, fontSize: 11, fontWeight: primary ? 700 : 400 }}>
        {busy ? <Loader2 size={iconSize} className="animate-spin" /> : <Plus size={iconSize} />}
        {busy ? 'Connecting…' : label}
      </button>
      {error && <p className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--bad)' }}><AlertCircle size={12} /> {error}</p>}
    </div>
  );
}
