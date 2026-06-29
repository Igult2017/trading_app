import { Check, ArrowRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export type GoLiveState = 'review' | 'deploying' | 'success' | 'error';

export interface SummaryItem {
  label: string;
  value: string;
  badge?: 'live';
}

interface Props {
  state: GoLiveState;
  summary: SummaryItem[];
  onDeploy?: () => void;
  onDashboard?: () => void;
  onReset?: () => void;
  error?: string;
}

function Summary({ items }: { items: SummaryItem[] }) {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 12, width: '100%', maxWidth: 440, marginTop: 26, textAlign: 'left', overflow: 'hidden' }}>
      {items.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--b1)', fontSize: 14 }}>
          <span style={{ color: 'var(--t3)' }}>{s.label}</span>
          {s.badge === 'live'
            ? <span className="qc-badge qc-b-conn">Live</span>
            : <span className={/^[+\-#\d.,$kKxX% ]+$/.test(s.value) ? 'mono' : ''}>{s.value}</span>}
        </div>
      ))}
    </div>
  );
}

const wrap = { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const, paddingTop: 14 };

/** Final step — review / deploying / success / error. Renders its own actions. */
export default function QcGoLive({ state, summary, onDeploy, onDashboard, onReset, error }: Props) {
  if (state === 'deploying') {
    return (
      <div style={wrap}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--acc-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--acc)', marginBottom: 20 }}>
          <Loader2 size={30} className="qc-spin" />
        </div>
        <div className="qc-eyebrow" style={{ color: 'var(--acc)' }}>Deploying</div>
        <h1 className="qc-h1" style={{ marginTop: 8 }}>Spinning up your copier…</h1>
        <div className="qc-sub">Connecting to cTrader and registering the copy link. This takes a few seconds.</div>
        <style>{`@keyframes qc-spin{to{transform:rotate(360deg)}}.qc-spin{animation:qc-spin 1s linear infinite}`}</style>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={wrap}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bad-s)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bad)', marginBottom: 20 }}>
          <AlertCircle size={30} />
        </div>
        <div className="qc-eyebrow" style={{ color: 'var(--bad)' }}>Failed</div>
        <h1 className="qc-h1" style={{ marginTop: 8 }}>Couldn't deploy your copier</h1>
        <div className="qc-sub">{error ?? 'Something went wrong while connecting. Please try again.'}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
          <button className="qc-btn qc-btn-pri" onClick={onDeploy}><RefreshCw size={16} /> Retry</button>
          {onReset && <button className="qc-btn qc-btn-sec" onClick={onReset}>Start over</button>}
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div style={wrap}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ok-s)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ok)', marginBottom: 20, boxShadow: '0 0 0 8px rgba(47,203,126,.05)' }}>
          <Check size={30} strokeWidth={2.5} />
        </div>
        <div className="qc-eyebrow" style={{ color: 'var(--ok)' }}>Deployed</div>
        <h1 className="qc-h1" style={{ marginTop: 8 }}>Your copier is live</h1>
        <div className="qc-sub">New trades on the provider will mirror to your account instantly.</div>
        <Summary items={summary} />
        <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
          <button className="qc-btn qc-btn-pri" onClick={onDashboard}>Go to dashboard <ArrowRight size={16} /></button>
          {onReset && <button className="qc-btn qc-btn-sec" onClick={onReset}>Set up another</button>}
        </div>
      </div>
    );
  }

  // review
  return (
    <div style={wrap}>
      <div className="qc-eyebrow">Final step · Review</div>
      <h1 className="qc-h1" style={{ marginTop: 8 }}>Ready to go live</h1>
      <div className="qc-sub">Confirm the setup below — you can change anything later.</div>
      <Summary items={summary} />
      <div style={{ marginTop: 26 }}>
        <button className="qc-btn qc-btn-pri" style={{ height: 46, padding: '0 26px', fontSize: 15 }} onClick={onDeploy}>
          Deploy copier <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
