import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Plus, Check, ServerCrash } from 'lucide-react';

interface BrokerAccount {
  id: string;
  name: string;
  loginId: string;
  platform: string;
  accountType?: string | null;
  balance?: string | null;
  currency?: string | null;
}

/** cTrader brand mark (same artwork as the Accounts page, for visual consistency). */
const CTraderMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }} aria-label="cTrader">
    <circle cx="50" cy="50" r="50" fill="#E5342A" />
    <path d="M41 23 C30 39 27 57 33 76 C52 71 64 53 62 32 C55 28 48 25 41 23 Z" fill="#fff" />
    <circle cx="63.5" cy="64" r="9.5" fill="#fff" />
  </svg>
);

const fmtBalance = (b?: string | null, c?: string | null): string | null => {
  if (b == null) return null;
  const n = Number(b);
  if (Number.isNaN(n)) return null;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c ?? ''}`.trim();
};

/**
 * Picks one of the user's OAuth-connected cTrader accounts (from the Accounts page).
 * cTrader connects via OAuth — there is no login/investor-password — so copy trading
 * reuses an already-connected account instead of asking for credentials again.
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
      <div className="flex items-center gap-2">
        <CTraderMark size={15} />
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">{label}</label>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map(i => <div key={i} className="h-[60px] rounded-md border border-white/5 bg-white/[0.02] animate-pulse" />)}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-rose-400 text-xs py-4 px-4 border border-rose-500/20 bg-rose-500/5 rounded-md">
          <ServerCrash size={14} /> Couldn't load your accounts — please retry.
        </div>
      ) : accounts.length === 0 ? (
        <div className="border border-dashed border-white/15 rounded-md p-6 text-center space-y-3">
          <div className="mx-auto w-11 h-11 rounded-full bg-white/[0.03] flex items-center justify-center"><CTraderMark size={24} /></div>
          <p className="text-sm text-slate-200 font-medium">No cTrader account connected</p>
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs mx-auto">cTrader connects securely via OAuth on the Accounts page — no password is ever stored here.</p>
          <Link href="/accounts" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-bold uppercase tracking-widest rounded-md transition-colors">
            <Plus size={13} /> Connect cTrader
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(a => {
            const sel = value === a.id;
            const live = (a.accountType || '').toLowerCase() === 'live';
            const bal = fmtBalance(a.balance, a.currency);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange(a.id)}
                aria-pressed={sel}
                className={`group w-full flex items-center gap-3 px-4 py-3 border rounded-md text-left transition-all duration-200 ${
                  sel
                    ? 'border-blue-500 bg-blue-500/[0.08] shadow-[0_0_0_1px_rgba(59,130,246,0.45)]'
                    : 'border-white/10 bg-white/[0.01] hover:border-white/25 hover:bg-white/[0.03] hover:-translate-y-0.5'
                }`}
              >
                <CTraderMark size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium truncate">{a.name}</span>
                    <span
                      className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                        live ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {live ? 'Live' : 'Demo'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                    #{a.loginId}
                    {bal ? <span className="text-slate-400"> · {bal}</span> : null}
                  </div>
                </div>
                <span
                  className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                    sel ? 'border-blue-500 bg-blue-500' : 'border-white/20 group-hover:border-white/40'
                  }`}
                >
                  {sel && <Check size={12} className="text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          <Link href="/accounts" className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-300 transition-colors pt-1">
            <Plus size={12} /> Connect another account
          </Link>
        </div>
      )}
    </div>
  );
}
