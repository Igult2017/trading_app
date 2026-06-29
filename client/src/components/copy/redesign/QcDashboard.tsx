import { useMemo } from 'react';
import { Plus, Settings, TrendingUp } from 'lucide-react';
import { QC_CSS } from '../qcTheme';

export interface Kpi { label: string; value: string; delta?: string; deltaUp?: boolean; }
export interface CopiedTrade { symbol: string; volume: string; side: 'long' | 'short'; provider: string; pnl: string; up: boolean; }
export interface Allocation { name: string; pct: number; color: string; }

interface Props {
  kpis: Kpi[];
  trades: CopiedTrade[];
  allocation: Allocation[];
}

const DASH_CSS = `
.qc-root .qc-dash{max-width:1180px;margin:0 auto;padding:28px 32px 60px;}
.qc-root .qc-dhead{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:22px;}
.qc-root .qc-dh1{font-size:24px;font-weight:700;letter-spacing:-.015em;}
.qc-root .qc-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px;}
.qc-root .qc-kpi{background:var(--s1);border:1px solid var(--b1);border-radius:10px;padding:18px;}
.qc-root .qc-kpi .v{font-size:26px;font-weight:600;letter-spacing:-.01em;margin-top:8px;}
.qc-root .qc-kpi .d{font-size:12.5px;margin-top:6px;display:flex;align-items:center;gap:5px;}
.qc-root .qc-split{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;}
.qc-root .qc-panel{background:var(--s1);border:1px solid var(--b1);border-radius:12px;overflow:hidden;}
.qc-root .qc-panel .ph{padding:14px 18px;border-bottom:1px solid var(--b1);font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center;}
.qc-root .qc-th,.qc-root .qc-tr{display:grid;align-items:center;padding:0 16px;grid-template-columns:1.2fr 1fr .8fr .9fr 1fr;}
.qc-root .qc-th{height:40px;background:var(--s2);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--t3);}
.qc-root .qc-tr{height:48px;border-top:1px solid var(--b1);font-size:14px;}
.qc-root .qc-tr:hover{background:var(--s2);}
.qc-root .num{text-align:right;}
.qc-root .qc-don{display:flex;align-items:center;gap:18px;padding:18px;}
.qc-root .qc-leg{font-size:12px;color:var(--t2);display:flex;flex-direction:column;gap:8px;}
.qc-root .qc-leg .li{display:flex;align-items:center;gap:8px;}
.qc-root .qc-leg .sw2{width:10px;height:10px;border-radius:3px;}
@media (max-width:880px){.qc-root .qc-kpis{grid-template-columns:1fr 1fr;}.qc-root .qc-split{grid-template-columns:1fr;}}
`;

/** Full copy-trading dashboard page (own top bar + container). */
export default function QcDashboard({ kpis, trades, allocation }: Props) {
  const donut = useMemo(() => {
    const C = 100; // circumference of r=15.9 ≈ 100; pct maps 1:1 onto the dash length
    let acc = 0; // running total of segment lengths already laid down
    return allocation.map(a => {
      const len = (a.pct / 100) * C;
      // offset 25 puts the first segment's start at 12 o'clock; each later
      // segment is pushed back by the total length already drawn.
      const offset = 25 - acc;
      acc += len;
      return { ...a, dash: `${len} ${C - len}`, offset };
    });
  }, [allocation]);

  return (
    <div className="qc-root">
      <style>{QC_CSS}</style>
      <style>{DASH_CSS}</style>

      <div className="qc-top">
        <div className="qc-brand">Trade<b>Sync</b></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="qc-toplink"><Plus size={14} /> New copier</button>
          <button className="qc-toplink"><Settings size={14} /></button>
        </div>
      </div>

      <div className="qc-dash">
        <div className="qc-dhead">
          <div>
            <div className="qc-eyebrow">Copy Trading</div>
            <div className="qc-dh1" style={{ marginTop: 6 }}>Overview</div>
          </div>
        </div>

        <div className="qc-kpis">
          {kpis.map(k => (
            <div className="qc-kpi" key={k.label}>
              <div className="qc-eyebrow">{k.label}</div>
              <div className={`v mono${k.deltaUp === true ? ' qc-up' : ''}`}>{k.value}</div>
              {k.delta && (
                <div className={`d ${k.deltaUp ? 'qc-up' : 'qc-muted'}`}>
                  {k.deltaUp && <TrendingUp size={13} />}{k.delta}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="qc-split">
          <div className="qc-panel">
            <div className="ph"><span>Copied trades</span><span className="qc-muted" style={{ fontSize: 12, fontWeight: 400 }}>Last 24h</span></div>
            <div className="qc-th">
              <div>Symbol</div><div className="num">Volume</div><div>Side</div><div>Provider</div><div className="num">P&amp;L</div>
            </div>
            {trades.map((t, i) => (
              <div className="qc-tr" key={`${t.symbol}-${i}`}>
                <div><span className="qc-badge qc-b-live">{t.symbol}</span></div>
                <div className="num mono">{t.volume}</div>
                <div className={t.side === 'long' ? 'qc-up' : 'qc-down'}>{t.side === 'long' ? '▲ Long' : '▼ Short'}</div>
                <div className="qc-muted" style={{ fontSize: 12 }}>{t.provider}</div>
                <div className={`num mono ${t.up ? 'qc-up' : 'qc-down'}`}>{t.pnl}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="qc-panel">
              <div className="ph">Cumulative P&amp;L</div>
              <div style={{ padding: 18 }}>
                <svg width="100%" height="120" viewBox="0 0 320 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="qcg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#2FCB7E" stopOpacity=".25" />
                      <stop offset="1" stopColor="#2FCB7E" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,100 L40,92 L80,96 L120,74 L160,80 L200,52 L240,58 L280,30 L320,16 L320,120 L0,120 Z" fill="url(#qcg)" />
                  <polyline fill="none" stroke="#2FCB7E" strokeWidth="2" points="0,100 40,92 80,96 120,74 160,80 200,52 240,58 280,30 320,16" />
                </svg>
              </div>
            </div>

            <div className="qc-panel">
              <div className="ph">Allocation by provider</div>
              <div className="qc-don">
                <svg width="92" height="92" viewBox="0 0 42 42">
                  <circle cx="21" cy="21" r="15.9" fill="none" stroke="#1A1C21" strokeWidth="6" />
                  {donut.map(d => (
                    <circle key={d.name} cx="21" cy="21" r="15.9" fill="none" stroke={d.color} strokeWidth="6" strokeDasharray={d.dash} strokeDashoffset={d.offset} />
                  ))}
                </svg>
                <div className="qc-leg">
                  {allocation.map(a => (
                    <div className="li" key={a.name}><span className="sw2" style={{ background: a.color }} /> {a.name} · {a.pct}%</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
