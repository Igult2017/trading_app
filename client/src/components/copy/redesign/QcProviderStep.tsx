import { Search, Check } from 'lucide-react';

export interface QcProvider {
  id: string;
  name: string;
  platform?: string;
  accountType?: string;
  initials?: string;
  color?: string;
  winRate?: number;
  trades?: number;
  avgRR?: number;
  netPnl?: string;
  instruments?: string[];
}

interface Props {
  providers: QcProvider[];
  value?: string;
  onChange: (id: string) => void;
}

const STAT = { display: 'flex', flexDirection: 'column' as const };
const K = { fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase' as const, letterSpacing: '.05em' };
const VV = { fontSize: 15, fontWeight: 600, marginTop: 3 };

/** Step — follower's provider directory. Pick a verified provider to mirror. */
export default function QcProviderStep({ providers, value, onChange }: Props) {
  return (
    <>
      <div className="qc-eyebrow">Step 03 · Provider</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>Choose a provider to follow</h1>
      <div className="qc-sub">Verified providers, ranked by track record. Your account mirrors whoever you pick.</div>

      <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: 8, padding: '0 12px', color: 'var(--t3)', fontSize: 14, marginTop: 22 }}>
        <Search size={15} /> Search providers…
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
        {providers.map(p => {
          const sel = value === p.id;
          const initials = p.initials ?? p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          return (
            <div
              key={p.id}
              onClick={() => onChange(p.id)}
              style={{
                background: sel ? 'var(--acc-soft)' : 'var(--s1)',
                border: `1px solid ${sel ? 'var(--acc-bd)' : 'var(--b1)'}`,
                borderRadius: 12, padding: 18, cursor: 'pointer', transition: 'all .2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff', flexShrink: 0, background: p.color ?? 'linear-gradient(135deg,#5B6CFF,#8B5CF6)' }}>{initials}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</h3>
                  <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{[p.platform, p.accountType].filter(Boolean).join(' · ')}</div>
                </div>
                <div className={`qc-chk${sel ? ' on' : ''}`}>{sel && <Check size={12} strokeWidth={3} />}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '16px 0 14px' }}>
                <div style={STAT}><div style={K}>Win</div><div className="mono" style={VV}>{p.winRate != null ? `${p.winRate}%` : '—'}</div></div>
                <div style={STAT}><div style={K}>Trades</div><div className="mono" style={VV}>{p.trades != null ? p.trades.toLocaleString() : '—'}</div></div>
                <div style={STAT}><div style={K}>Avg RR</div><div className="mono" style={VV}>{p.avgRR != null ? p.avgRR : '—'}</div></div>
                <div style={STAT}><div style={K}>Net P&amp;L</div><div className="mono qc-up" style={VV}>{p.netPnl ?? '—'}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(p.instruments ?? []).map(t => (
                  <span key={t} style={{ fontSize: 10, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--b1)', padding: '3px 8px', borderRadius: 6 }}>{t}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
