import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCw, ShieldCheck, Check } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { connectCtraderPopup } from './connectCtraderPopup';
import { CT_PANEL_CSS } from './ctConnectStyles';

interface BrokerAccount { id: string; name: string; loginId: string; platform: string; accountType?: string | null; balance?: string | null; currency?: string | null; }
interface PendingAcct { ctidTraderAccountId: string; traderLogin: string; brokerName?: string; isLive?: boolean; }

const STEPS = [
  { t: 'Select the mirror account', d: 'Choose which connected account this terminal copies into.' },
  { t: 'Trades copy in real time', d: 'Orders mirror over the cTrader Open API the moment they fire.' },
  { t: 'Risk checks run first', d: 'Your size, symbol and risk filters apply before every order.' },
];

const fmtBal = (b?: string | null, c?: string | null) => {
  if (b == null) return null;
  const n = Number(b); if (Number.isNaN(n)) return null;
  return { v: n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), c: c ?? '' };
};

function CTraderMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <path d="M200 80C133.824 80 80 133.824 80 200C80 266.176 133.824 320 200 320C266.176 320 320 266.176 320 200C320 133.824 266.176 80 200 80ZM200 99.2882C253.771 99.2882 297.835 141.641 300.571 194.741C300.659 196.488 300.712 198.235 300.712 200C300.712 251.547 261.006 270.641 239.741 273.376C206.106 277.7 177.782 259.541 177.782 224C177.782 190.312 215.035 161.141 262.224 175.506L268.329 148.029C251.229 139.718 232.841 135.941 214.876 135.941C145.806 135.941 102.606 187.312 106.594 233.953C106.224 234.147 105.712 234.429 105.2 234.712C102.041 224.282 100.347 212.688 100.347 200C100.347 144.465 144.465 99.2882 200 99.2882Z" fill="#FF2A38" />
    </svg>
  );
}

/** Step-02 cTrader connect — pick which connected account this terminal mirrors into. Real OAuth accounts. */
export default function CTraderConnectPanel({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const { data, isLoading, refetch, isFetching } = useQuery<BrokerAccount[]>({ queryKey: ['/api/broker-accounts'], refetchOnWindowFocus: true });
  // Hide incomplete OAuth placeholders (loginId 'pending_…') — they're orphaned attempts, not real accounts.
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

  return (
    <div className="ct-root">
      <style>{CT_PANEL_CSS}</style>
      <div className="ct-shell">
        <div className="ct-grid">
          <section className="ct-col">
            <header className="ct-head">
              <div className="ct-brand">
                <span className="ct-logo"><CTraderMark size={20} /></span>
                <div className="ct-brand-text"><span className="ct-title">Trading account</span><span className="ct-sub">cTrader · Open API</span></div>
              </div>
              <span className="ct-conn"><span className="ct-dot" />Connected</span>
            </header>

            {choices.length > 0 ? (
              <div className="ct-list" role="radiogroup" aria-label="Choose which cTrader account">
                {choices.map(c => (
                  <button key={c.ctidTraderAccountId} type="button" className="ct-card" disabled={busy} onClick={() => pick(c.ctidTraderAccountId)}>
                    <span className="ct-mark"><CTraderMark size={18} /></span>
                    <span className="ct-card-body"><span className="ct-card-top"><span className="ct-name">cTrader</span><span className="ct-pill">{c.isLive ? 'Live' : 'Demo'}</span></span><span className="ct-num">#{c.traderLogin}{c.brokerName ? ` · ${c.brokerName}` : ''}</span></span>
                  </button>
                ))}
              </div>
            ) : isLoading ? (
              <div className="ct-list">{[0, 1].map(i => <div key={i} className="ct-card" style={{ opacity: .4 }}><span className="ct-mark" /><span className="ct-card-body"><span className="ct-num">loading…</span></span></div>)}</div>
            ) : accounts.length === 0 ? (
              <div className="ct-empty">No cTrader account connected yet.<br />Add one below — it connects securely over OAuth, no password stored.</div>
            ) : (
              <div className="ct-list" role="radiogroup" aria-label="Choose mirror account">
                {accounts.map(a => {
                  const sel = value === a.id; const live = (a.accountType || '').toLowerCase() === 'live'; const bal = fmtBal(a.balance, a.currency);
                  return (
                    <button key={a.id} type="button" role="radio" aria-checked={sel} className={'ct-card' + (sel ? ' is-sel' : '')} onClick={() => onChange(a.id)}>
                      <span className="ct-mark"><CTraderMark size={18} /></span>
                      <span className="ct-card-body"><span className="ct-card-top"><span className="ct-name">{a.name || 'cTrader'}</span><span className="ct-pill">{live ? 'Live' : 'Demo'}</span></span><span className="ct-num">#{a.loginId}</span></span>
                      <span className="ct-card-right">{bal ? <span className="ct-bal"><b>{bal.v}</b><i>{bal.c}</i></span> : <span className="ct-bal ct-bal-muted">—</span>}<span className="ct-radio">{sel && <Check size={12} strokeWidth={3.2} />}</span></span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ct-actions">
              <button type="button" className="ct-act ct-act-primary" onClick={add} disabled={busy}><Plus size={15} strokeWidth={2.4} /> {busy ? 'Connecting…' : 'Add account'}</button>
              <button type="button" className={'ct-act' + (isFetching ? ' is-spinning' : '')} onClick={() => refetch()}><RotateCw size={14} strokeWidth={2.4} />{isFetching ? 'Refreshing' : 'Refresh'}</button>
            </div>
            {err && <div className="ct-msg">{err}</div>}
          </section>

          <aside className="ct-col ct-right">
            <div className="ct-oauth">
              <span className="ct-oauth-chip"><ShieldCheck size={14} strokeWidth={2.2} />OAuth secured</span>
              <p className="ct-oauth-body">You sign in on cTrader's own page through Spotware's official OAuth. The terminal holds a <strong>revocable access token</strong> — never your password — so control always stays with you.</p>
            </div>
            <div className="ct-flowcard">
              <span className="ct-flow-label">How copying works</span>
              <ol className="ct-steps">
                {STEPS.map((s, i) => (<li className="ct-step" key={i}><span className="ct-node">{i + 1}</span><span className="ct-step-text"><b>{s.t}</b><span>{s.d}</span></span></li>))}
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
