import { useQuery } from '@tanstack/react-query';
import { Check, ServerCrash, RefreshCw } from 'lucide-react';
import AddCtraderAccountButton from './AddCtraderAccountButton';

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
 * The accounts already exist — selection is instant and in-place; no re-auth, no navigation.
 * `excludeId` hides an account already chosen elsewhere (e.g. the self-copy source) so the
 * list is "everything apart from the one you're copying". Adding a brand-NEW account is the
 * only thing that needs the Accounts page — it opens in a separate tab so the wizard is never
 * lost, and the list auto-refreshes on return.
 */
export default function CTraderAccountPicker({
  value,
  onChange,
  label = 'cTrader Account',
  excludeId,
}: {
  value?: string;
  onChange: (id: string) => void;
  label?: string;
  excludeId?: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery<BrokerAccount[]>({
    queryKey: ['/api/broker-accounts'],
    refetchOnWindowFocus: true,
  });
  const ctrader  = (data ?? []).filter(a => (a.platform || '').toLowerCase() === 'ctrader');
  const accounts = ctrader.filter(a => a.id !== excludeId);
  const onConnected = (id: string) => { onChange(id); refetch(); };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CTraderMark size={15} />
        <label className="uppercase tracking-[0.18em]" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>{label}</label>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map(i => <div key={i} className="h-[60px] rounded-lg animate-pulse" style={{ border: '1px solid var(--b1)', background: 'var(--s2)' }} />)}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 py-4 px-4 rounded-lg" style={{ fontSize: 12, color: 'var(--bad)', border: '1px solid rgba(240,85,107,.4)', background: 'var(--bad-s)' }}>
          <ServerCrash size={14} /> Couldn't load your accounts —
          <button type="button" onClick={() => refetch()} className="underline">retry</button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg p-6 text-center space-y-3" style={{ border: '1px dashed var(--b2)' }}>
          <div className="mx-auto w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'var(--s2)' }}><CTraderMark size={24} /></div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
            {ctrader.length > 0 ? 'No other cTrader account' : 'No cTrader account connected'}
          </p>
          <p className="leading-relaxed max-w-xs mx-auto" style={{ fontSize: 11.5, color: 'var(--t3)' }}>
            {ctrader.length > 0
              ? 'Self-copy needs two different accounts. Add a second cTrader account to copy onto.'
              : 'cTrader connects securely via OAuth on the Accounts page — no password is ever stored here.'}
          </p>
          <div className="flex flex-col items-center gap-2">
            <AddCtraderAccountButton onConnected={onConnected} primary label={ctrader.length > 0 ? 'Add another account' : 'Connect cTrader'} />
          </div>
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
                className="group w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200"
                style={{
                  border: `1px solid ${sel ? 'var(--acc-bd)' : 'var(--b2)'}`,
                  background: sel ? 'var(--acc-soft)' : 'var(--s2)',
                }}
              >
                <CTraderMark size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{a.name}</span>
                    <span
                      className="uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ fontSize: 8, fontWeight: 700, color: live ? 'var(--bad)' : 'var(--ok)', background: live ? 'var(--bad-s)' : 'var(--ok-s)' }}
                    >
                      {live ? 'Live' : 'Demo'}
                    </span>
                  </div>
                  <div className="mono truncate mt-0.5" style={{ fontSize: 11, color: 'var(--t3)' }}>
                    #{a.loginId}
                    {bal ? <span style={{ color: 'var(--t2)' }}> · {bal}</span> : null}
                  </div>
                </div>
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ border: `1px solid ${sel ? 'var(--acc)' : 'var(--b2)'}`, background: sel ? 'var(--acc)' : 'transparent' }}
                >
                  {sel && <Check size={12} className="text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          <div className="flex items-center gap-4 pt-1">
            <AddCtraderAccountButton onConnected={onConnected} />
            <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-1.5 transition-colors" style={{ fontSize: 11, color: 'var(--t3)' }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
