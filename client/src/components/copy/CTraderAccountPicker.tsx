import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Loader2, Plus, CheckCircle2, ServerCrash } from 'lucide-react';

interface BrokerAccount {
  id: string;
  name: string;
  loginId: string;
  platform: string;
  accountType?: string | null;
  balance?: string | null;
  currency?: string | null;
}

/**
 * Picks one of the user's OAuth-connected cTrader accounts (from the Accounts page).
 * cTrader has no login/investor-password — it connects via OAuth — so copy trading
 * reuses those already-connected accounts instead of asking for credentials again.
 */
export default function CTraderAccountPicker({
  value,
  onChange,
  label = 'cTrader Account',
}: {
  value?: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { data, isLoading, isError } = useQuery<BrokerAccount[]>({ queryKey: ['/api/broker-accounts'] });
  const accounts = (data ?? []).filter(a => (a.platform || '').toLowerCase() === 'ctrader');

  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 text-xs py-6">
          <Loader2 size={14} className="animate-spin" /> Loading your cTrader accounts…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-rose-400 text-xs py-6">
          <ServerCrash size={14} /> Couldn't load accounts — try again.
        </div>
      ) : accounts.length === 0 ? (
        <div className="border border-white/10 rounded-sm p-5 text-center space-y-3">
          <p className="text-xs text-slate-400">No cTrader account connected yet.</p>
          <p className="text-[11px] text-slate-600">cTrader connects securely via OAuth — no password needed.</p>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-blue-500/40 bg-blue-500/10 text-blue-300 text-[11px] font-bold uppercase tracking-widest rounded-sm hover:bg-blue-500/20 transition-colors"
          >
            <Plus size={13} /> Connect a cTrader account
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(a => {
            const sel = value === a.id;
            const live = (a.accountType || '').toLowerCase() === 'live';
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange(a.id)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 border rounded-sm text-left transition-all ${
                  sel ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">{a.name}</span>
                    <span
                      className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        live ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {live ? 'Live' : 'Demo'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    #{a.loginId}
                    {a.balance != null ? ` · ${a.balance} ${a.currency ?? ''}` : ''}
                  </div>
                </div>
                {sel && <CheckCircle2 size={16} className="text-blue-400 flex-shrink-0" />}
              </button>
            );
          })}
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors pt-1"
          >
            <Plus size={12} /> Connect another cTrader account
          </Link>
        </div>
      )}
    </div>
  );
}
