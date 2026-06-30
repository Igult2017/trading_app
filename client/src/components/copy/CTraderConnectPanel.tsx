import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCw, ShieldCheck, Check } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { connectCtraderPopup } from './connectCtraderPopup';

interface BrokerAccount { id: string; name: string; loginId: string; platform: string; accountType?: string | null; balance?: string | null; currency?: string | null; }
interface PendingAcct { ctidTraderAccountId: string; traderLogin: string; brokerName?: string; isLive?: boolean; }

const HOW = [
  { t: 'Select the mirror account', d: 'Choose which connected account this terminal copies into.' },
  { t: 'Trades copy in real time', d: 'Orders mirror over the cTrader Open API the moment they fire.' },
  { t: 'Risk checks run first', d: 'Your size, symbol and risk filters apply before every order.' },
];

const fmtBal = (b?: string | null, c?: string | null) => {
  if (b == null) return null;
  const n = Number(b); if (Number.isNaN(n)) return null;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c ?? ''}`.trim();
};

/** Red cTrader mark. */
function CTMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M200 80C133.824 80 80 133.824 80 200C80 266.176 133.824 320 200 320C266.176 320 320 266.176 320 200C320 133.824 266.176 80 200 80ZM200 99.2882C253.771 99.2882 297.835 141.641 300.571 194.741C300.659 196.488 300.712 198.235 300.712 200C300.712 251.547 261.006 270.641 239.741 273.376C206.106 277.7 177.782 259.541 177.782 224C177.782 190.312 215.035 161.141 262.224 175.506L268.329 148.029C251.229 139.718 232.841 135.941 214.876 135.941C145.806 135.941 102.606 187.312 106.594 233.953C106.224 234.147 105.712 234.429 105.2 234.712C102.041 224.282 100.347 212.688 100.347 200C100.347 144.465 144.465 99.2882 200 99.2882Z" fill="#E5342A" />
    </svg>
  );
}

/** Step-02 cTrader connect — same terminal theme as every other wizard step (divider grid, blue accent,
 *  // mono eyebrows, DM Mono inherited from .ts-wizard-root). Picks a real OAuth-connected account. */
export default function CTraderConnectPanel({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const { data, isLoading, refetch, isFetching } = useQuery<BrokerAccount[]>({ queryKey: ['/api/broker-accounts'], refetchOnWindowFocus: true });
  // Hide incomplete OAuth placeholders ('pending_…') — orphaned attempts, not real accounts.
  const accounts = (data ?? []).filter(a => (a.platform || '').toLowerCase() === 'ctrader' && !String(a.loginId || '').startsWith('pending_'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [choices, setChoices] = useState<PendingAcct[]>([]);
  const [token, setToken] = useState('');

  const add = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await connectCtraderPopup();
      if (r.status === 'connected') { onChange(r.accountId); refetch(); }
      else {
        const res = await apiRequest('GET', `/api/broker/ctrader/pending-accounts?token=${r.accountId}`);
        const d = await res.json(); setToken(r.accountId); setChoices(d.accounts || []);
      }
    } catch (e: any) { setErr(e?.message || 'Connection failed.'); }
    finally { setBusy(false); }
  };
  const pick = async (ctid: string) => {
    setErr(''); setBusy(true);
    try {
      await apiRequest('POST', '/api/broker/ctrader/select-account', { token, ctidTraderAccountId: ctid });
      setChoices([]); onChange(token); setToken(''); refetch();
    } catch (e: any) { setErr(e?.message || 'Could not select that account.'); }
    finally { setBusy(false); }
  };

  const cardBase = 'w-full flex items-center gap-3 px-4 py-3 border text-left transition-all duration-200';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
      {/* LEFT — account selector */}
      <div className="p-5 md:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// trading_account</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.7)' }} /> cTrader · Open&nbsp;API
          </span>
        </div>

        {choices.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">// choose_account</p>
            {choices.map(c => (
              <button key={c.ctidTraderAccountId} type="button" disabled={busy} onClick={() => pick(c.ctidTraderAccountId)}
                className={`${cardBase} border-white/10 bg-white/[0.01] hover:border-blue-500/50 hover:bg-blue-500/5 disabled:opacity-50`}>
                <CTMark size={24} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">cTrader</span>
                    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 ${c.isLive ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{c.isLive ? 'Live' : 'Demo'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">#{c.traderLogin}{c.brokerName ? ` · ${c.brokerName}` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        ) : isLoading ? (
          <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-[58px] border border-white/5 bg-white/[0.02] animate-pulse" />)}</div>
        ) : accounts.length === 0 ? (
          <div className="border border-dashed border-white/15 p-6 text-center space-y-2">
            <p className="text-sm text-slate-300 font-medium">No cTrader account connected</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">Add one below — it connects securely over OAuth, no password stored.</p>
          </div>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Mirror account">
            {accounts.map(a => {
              const sel = value === a.id; const live = (a.accountType || '').toLowerCase() === 'live'; const bal = fmtBal(a.balance, a.currency);
              return (
                <button key={a.id} type="button" role="radio" aria-checked={sel} onClick={() => onChange(a.id)}
                  className={`${cardBase} group ${sel ? 'border-blue-500 bg-blue-500/[0.08] shadow-[0_0_0_1px_rgba(59,130,246,0.4)]' : 'border-white/10 bg-white/[0.01] hover:border-white/25 hover:bg-white/[0.03]'}`}>
                  <CTMark size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium truncate">{a.name || 'cTrader'}</span>
                      <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 ${live ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{live ? 'Live' : 'Demo'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">#{a.loginId}{bal ? ` · ${bal}` : ''}</div>
                  </div>
                  <span className={`w-5 h-5 border flex items-center justify-center flex-shrink-0 transition-colors ${sel ? 'border-blue-500 bg-blue-500' : 'border-white/20 group-hover:border-white/40'}`}>
                    {sel && <Check size={12} className="text-white" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-5 pt-1">
          <button type="button" onClick={add} disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 border border-blue-500/30 bg-blue-500/5 text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/50 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50">
            <Plus size={13} strokeWidth={2.4} /> {busy ? 'Connecting…' : 'Add account'}
          </button>
          <button type="button" onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors">
            <RotateCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        {err && <p className="text-[11px] text-rose-400 leading-relaxed">{err}</p>}
      </div>

      {/* RIGHT — trust + flow */}
      <div className="p-5 md:p-8 flex flex-col gap-4 md:gap-6">
        <div className="p-4 md:p-5 border border-emerald-500/15 bg-emerald-500/[0.04]">
          <div className="flex items-center gap-3 mb-3 text-emerald-400">
            <ShieldCheck size={16} strokeWidth={1.5} />
            <span className="text-[10px] font-bold uppercase tracking-widest font-mono">OAuth Secured</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">You sign in on cTrader's own page through Spotware's official OAuth. The terminal holds a <span className="text-slate-200 font-semibold">revocable access token</span> — never your password — so control always stays with you.</p>
        </div>
        <div className="p-4 md:p-5 border border-white/5 bg-white/[0.01]">
          <span className="text-[9px] font-mono font-bold text-slate-600 uppercase tracking-widest block mb-4">// how_copying_works</span>
          <ol className="space-y-3.5">
            {HOW.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-500/15 text-blue-300 text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-300">{s.t}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
