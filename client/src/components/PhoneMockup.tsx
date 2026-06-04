import React from 'react';
import { TrendingUp, Signal, Wifi, Battery } from 'lucide-react';

const DM_MONO = { fontFamily: "'DM Mono', monospace" } as const;
const OSWALD  = { fontFamily: "'Oswald', sans-serif" } as const;

interface Props { darkMode: boolean }

export default function PhoneMockup({ darkMode }: Props) {
  const d = darkMode;
  const frame   = d ? 'linear-gradient(160deg,#1e293b,#0f172a)'  : 'linear-gradient(160deg,#e2e8f0,#f8fafc)';
  const screen  = d ? 'linear-gradient(180deg,#0f172a,#0c1322)'  : 'linear-gradient(180deg,#f0f6ff,#ffffff)';
  const card    = d ? 'rgba(30,58,95,0.5)'  : 'rgba(219,234,254,0.6)';
  const cardBdr = d ? 'rgba(59,130,246,0.2)' : 'rgba(147,197,253,0.5)';
  const val     = d ? '#60a5fa' : '#1d4ed8';
  const lbl     = d ? '#64748b' : '#94a3b8';
  const bar     = d ? '#1e293b' : '#dbeafe';
  const topTxt  = d ? '#94a3b8' : '#64748b';
  const homebar = d ? '#334155' : '#cbd5e1';
  const shadow  = d
    ? '0 0 0 1px #1e293b, 0 30px 80px rgba(0,0,0,0.8), 0 0 40px rgba(59,130,246,0.12)'
    : '0 0 0 1px #cbd5e1, 0 30px 80px rgba(0,0,0,0.15), 0 0 40px rgba(59,130,246,0.08)';

  const StatCard = ({ value, label, bar: barW }: { value: string; label: string; bar?: string }) => (
    <div style={{ background: card, borderRadius: 14, padding: '10px 11px', border: `1px solid ${cardBdr}` }}>
      <div style={{ ...DM_MONO, fontSize: 17, fontWeight: 500, color: val, letterSpacing: '-0.03em' }}>{value}</div>
      <div style={{ fontSize: 9, color: lbl, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {barW && (
        <div style={{ marginTop: 7, height: 2, background: bar, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: barW, height: '100%', background: 'linear-gradient(to right,#2563eb,#60a5fa)' }} />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ position: 'relative', width: 260 }}>
      {/* Side buttons */}
      <div style={{ position: 'absolute', left: -3, top: 72, width: 3, height: 28, background: d ? '#334155' : '#cbd5e1', borderRadius: '2px 0 0 2px' }} />
      <div style={{ position: 'absolute', left: -3, top: 108, width: 3, height: 44, background: d ? '#334155' : '#cbd5e1', borderRadius: '2px 0 0 2px' }} />
      <div style={{ position: 'absolute', left: -3, top: 160, width: 3, height: 44, background: d ? '#334155' : '#cbd5e1', borderRadius: '2px 0 0 2px' }} />
      <div style={{ position: 'absolute', right: -3, top: 100, width: 3, height: 60, background: d ? '#334155' : '#cbd5e1', borderRadius: '0 2px 2px 0' }} />

      {/* Phone frame */}
      <div style={{ background: frame, borderRadius: 44, padding: 6, boxShadow: shadow }}>
        {/* Screen */}
        <div style={{ background: screen, borderRadius: 38, overflow: 'hidden', position: 'relative' }}>

          {/* Status bar */}
          <div style={{ padding: '12px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...DM_MONO, fontSize: 10, fontWeight: 500, color: topTxt }}>9:41</span>
            {/* Dynamic island */}
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 10, width: 80, height: 22, background: '#000', borderRadius: 12 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: topTxt }}>
              <Signal size={10} /><Wifi size={10} /><Battery size={10} />
            </div>
          </div>

          {/* App header */}
          <div style={{ padding: '6px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...OSWALD, fontSize: 11, letterSpacing: '0.04em' }}>
              <span style={{ color: d ? '#fff' : '#0f172a' }}>Myfm</span>
              <span style={{ color: '#3b82f6' }}>Journal</span>
            </span>
            <div style={{ width: 26, height: 26, background: 'linear-gradient(135deg,#2563eb,#60a5fa)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(59,130,246,0.4)' }}>
              <TrendingUp size={12} color="white" />
            </div>
          </div>

          {/* Stats */}
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatCard value="67.92%" label="Winrate" bar="68%" />
              <StatCard value="97.46%" label="Daily Winrate" bar="97%" />
            </div>

            <div style={{ background: card, borderRadius: 14, padding: '10px 12px', border: `1px solid ${cardBdr}` }}>
              <div style={{ ...DM_MONO, fontSize: 20, fontWeight: 500, color: val, letterSpacing: '-0.04em' }}>€19,800.72</div>
              <div style={{ fontSize: 9, color: lbl, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Profit</div>
              <svg viewBox="0 0 220 28" style={{ width: '100%', height: 28, marginTop: 8 }}>
                <defs><linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#60a5fa" /></linearGradient></defs>
                <polyline points="0,24 25,20 50,21 75,15 100,16 125,11 150,9 175,12 200,8 220,5" fill="none" stroke="url(#lg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatCard value="1,131" label="Trades" />
              <StatCard value="0.89" label="Avg Win/Loss" />
            </div>
          </div>

          {/* Home indicator */}
          <div style={{ padding: '4px 0 10px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 4, background: homebar, borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
