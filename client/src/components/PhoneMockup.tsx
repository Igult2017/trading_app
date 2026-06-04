import React from 'react';
import { TrendingUp, Signal, Wifi, Battery } from 'lucide-react';

const DM_MONO = { fontFamily: "'DM Mono', monospace" } as const;
const OSWALD  = { fontFamily: "'Oswald', sans-serif", fontWeight: 700 } as const;

interface Props { darkMode: boolean }

export default function PhoneMockup({ darkMode: d }: Props) {
  const screen  = d ? 'linear-gradient(180deg,#0a0f1e 0%,#0c1322 100%)' : 'linear-gradient(180deg,#eef4ff 0%,#f8fbff 100%)';
  const card    = d ? 'rgba(30,58,95,0.55)'  : 'rgba(219,234,254,0.7)';
  const cardBdr = d ? 'rgba(59,130,246,0.2)' : 'rgba(147,197,253,0.6)';
  const val     = d ? '#60a5fa' : '#1d4ed8';
  const lbl     = d ? '#64748b' : '#94a3b8';
  const bar     = d ? '#1e293b' : '#dbeafe';
  const topTxt  = d ? '#64748b' : '#94a3b8';
  const homebar = d ? '#1e293b' : '#cbd5e1';
  const btnClr  = d ? '#1e293b' : '#d1d5db';

  // Outer frame gradient — space grey feel
  const frame = d
    ? 'linear-gradient(160deg,#2d3748 0%,#1a202c 40%,#2d3748 100%)'
    : 'linear-gradient(160deg,#e8ecf0 0%,#d1d5db 40%,#e8ecf0 100%)';

  const shadow = d
    ? '0 0 0 0.5px #374151, 0 40px 100px rgba(0,0,0,0.9), 0 0 60px rgba(59,130,246,0.08)'
    : '0 0 0 0.5px #d1d5db, 0 40px 100px rgba(0,0,0,0.22), 0 10px 40px rgba(0,0,0,0.10)';

  const StatCard = ({ value, label, barW }: { value: string; label: string; barW?: string }) => (
    <div style={{ background: card, borderRadius: 16, padding: '11px 13px', border: `1px solid ${cardBdr}` }}>
      <div style={{ ...DM_MONO, fontSize: 18, fontWeight: 500, color: val, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: lbl, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {barW && (
        <div style={{ marginTop: 8, height: 2, background: bar, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: barW, height: '100%', background: 'linear-gradient(to right,#2563eb,#60a5fa)', borderRadius: 2 }} />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ position: 'relative', width: 248, userSelect: 'none' }}>

      {/* Side buttons */}
      {[72, 110, 152].map((top, i) => (
        <div key={i} style={{ position: 'absolute', left: -2, top, width: 2.5, height: i === 0 ? 30 : 46, background: btnClr, borderRadius: '2px 0 0 2px' }} />
      ))}
      <div style={{ position: 'absolute', right: -2, top: 104, width: 2.5, height: 64, background: btnClr, borderRadius: '0 2px 2px 0' }} />

      {/* Outer frame */}
      <div style={{ background: frame, borderRadius: 50, padding: '3px', boxShadow: shadow }}>

        {/* Inner bezel ring */}
        <div style={{ background: d ? '#111827' : '#f3f4f6', borderRadius: 47, padding: '2px' }}>

          {/* Screen */}
          <div style={{ background: screen, borderRadius: 45, overflow: 'hidden', position: 'relative' }}>

            {/* Status bar */}
            <div style={{ padding: '14px 20px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <span style={{ ...DM_MONO, fontSize: 10, fontWeight: 500, color: topTxt }}>9:41</span>
              {/* Notch */}
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 100, height: 26, background: '#000', borderRadius: '0 0 18px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1a1a1a', border: '1.5px solid #2a2a2a' }} />
                <div style={{ width: 36, height: 6, borderRadius: 3, background: '#1a1a1a' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: topTxt }}>
                <Signal size={9} /><Wifi size={9} /><Battery size={9} />
              </div>
            </div>

            {/* App header */}
            <div style={{ padding: '8px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...OSWALD, fontSize: 12, letterSpacing: '0.04em' }}>
                <span style={{ color: d ? '#f1f5f9' : '#0f172a' }}>Myfm</span>
                <span style={{ color: '#3b82f6' }}>Journal</span>
              </span>
              <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#2563eb,#60a5fa)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(59,130,246,0.5)' }}>
                <TrendingUp size={13} color="white" />
              </div>
            </div>

            {/* Stats content */}
            <div style={{ padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatCard value="67.92%" label="Winrate" barW="68%" />
                <StatCard value="97.46%" label="Daily WR" barW="97%" />
              </div>

              <div style={{ background: card, borderRadius: 16, padding: '12px 14px', border: `1px solid ${cardBdr}` }}>
                <div style={{ ...DM_MONO, fontSize: 22, fontWeight: 500, color: val, letterSpacing: '-0.04em', lineHeight: 1 }}>€19,800.72</div>
                <div style={{ fontSize: 9, color: lbl, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Profit</div>
                <svg viewBox="0 0 210 28" style={{ width: '100%', height: 28, marginTop: 10 }}>
                  <defs>
                    <linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                    <linearGradient id="fill2" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,24 L25,20 L50,21 L75,15 L100,16 L125,11 L150,9 L175,12 L200,7 L210,5 L210,28 L0,28 Z" fill="url(#fill2)" />
                  <polyline points="0,24 25,20 50,21 75,15 100,16 125,11 150,9 175,12 200,7 210,5" fill="none" stroke="url(#lg2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatCard value="1,131" label="Trades" />
                <StatCard value="0.89" label="Avg W/L" />
              </div>
            </div>

            {/* Home indicator */}
            <div style={{ padding: '2px 0 12px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, background: homebar, borderRadius: 2, opacity: 0.6 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
