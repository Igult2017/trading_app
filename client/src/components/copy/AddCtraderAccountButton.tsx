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
      <div className="space-y-2 border border-white/10 rounded-md p-3 bg-white/[0.02]">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Choose which cTrader account</p>
        {choices.map(c => (
          <button
            key={c.ctidTraderAccountId}
            type="button"
            disabled={busy}
            onClick={() => pick(c.ctidTraderAccountId)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 border border-white/10 rounded-md text-left hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors disabled:opacity-50"
          >
            <span className="text-sm text-white truncate">
              #{c.traderLogin}{c.brokerName ? <span className="text-slate-500"> · {c.brokerName}</span> : null}
            </span>
            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${c.isLive ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
              {c.isLive ? 'Live' : 'Demo'}
            </span>
          </button>
        ))}
        {error && <p className="text-[11px] text-rose-400 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
      </div>
    );
  }

  const btnClass = primary
    ? 'inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-bold uppercase tracking-widest rounded-md transition-colors disabled:opacity-60'
    : 'inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-blue-300 transition-colors disabled:opacity-60';
  const iconSize = primary ? 13 : 12;

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={start} disabled={busy} className={btnClass}>
        {busy ? <Loader2 size={iconSize} className="animate-spin" /> : <Plus size={iconSize} />}
        {busy ? 'Connecting…' : label}
      </button>
      {error && <p className="text-[11px] text-rose-400 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
    </div>
  );
}
