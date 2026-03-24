import React, { useState, useMemo } from 'react';
import { Trophy, TrendingUp, Search, Medal, Zap, Percent } from 'lucide-react';

const mockTraders = [
  { id: 1, name: "Sarah 'Scalper' Jenkins", avatar: "SJ", pnl: 45230.50, winRate: 68, trades: 142, profitFactor: 2.1, growth: [10, 15, 12, 18, 25, 30, 45] },
  { id: 2, name: "Marcus Volatility",        avatar: "MV", pnl: 38100.20, winRate: 54, trades: 89,  profitFactor: 1.8, growth: [5, 8, 15, 14, 22, 35, 38] },
  { id: 3, name: "Elena Quantum",            avatar: "EQ", pnl: 31450.00, winRate: 72, trades: 56,  profitFactor: 3.4, growth: [20, 22, 21, 25, 28, 30, 31] },
  { id: 4, name: "David Daytrader",          avatar: "DD", pnl: 28900.75, winRate: 61, trades: 210, profitFactor: 1.5, growth: [2, 10, 8, 15, 18, 24, 28] },
  { id: 5, name: "Crypto King",              avatar: "CK", pnl: 22100.00, winRate: 45, trades: 312, profitFactor: 1.4, growth: [40, 35, 30, 25, 20, 18, 22] },
  { id: 6, name: "Alex Hedge",               avatar: "AH", pnl: 19500.30, winRate: 59, trades: 94,  profitFactor: 1.9, growth: [5, 7, 9, 12, 15, 18, 19] },
  { id: 7, name: "Option Queen",             avatar: "OQ", pnl: 15200.00, winRate: 65, trades: 45,  profitFactor: 2.8, growth: [10, 12, 11, 13, 14, 15, 15] },
  { id: 8, name: "Bullish Ben",              avatar: "BB", pnl: 12400.15, winRate: 52, trades: 128, profitFactor: 1.3, growth: [2, 4, 6, 8, 10, 11, 12] },
];

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(max - min, 1);
  const W = 100, H = 30;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((d - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export default function Leaderboard() {
  const [activeCategory, setActiveCategory] = useState<'pnl' | 'winRate' | 'profitFactor'>('pnl');
  const [searchTerm, setSearchTerm]         = useState('');
  const [activePeriod, setActivePeriod]     = useState('Weekly');
  const [activeMetric, setActiveMetric]     = useState('Percentage');
  const [activeMode, setActiveMode]         = useState('Demo');

  const categories = [
    { id: 'pnl' as const,          label: 'By PnL',         icon: <TrendingUp size={14} />, color: '#34d399' },
    { id: 'winRate' as const,      label: 'By Win Rate',    icon: <Percent size={14} />,    color: '#60a5fa' },
    { id: 'profitFactor' as const, label: 'By RR / Factor', icon: <Zap size={14} />,        color: '#a78bfa' },
  ];

  const sortedTraders = useMemo(() => {
    let items = [...mockTraders];
    if (searchTerm) items = items.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
    items.sort((a, b) => b[activeCategory] - a[activeCategory]);
    return items;
  }, [searchTerm, activeCategory]);

  const podiumTraders = useMemo(() => {
    const top3 = sortedTraders.slice(0, 3);
    if (top3.length < 3) return top3;
    return [top3[1], top3[0], top3[2]];
  }, [sortedTraders]);

  const accentFor = (id: typeof activeCategory) =>
    id === 'pnl' ? '#34d399' : id === 'winRate' ? '#60a5fa' : '#a78bfa';

  const btnBase: React.CSSProperties = {
    padding: '7px 16px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    border: '1px solid #1e293b',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  };
  const btnActive: React.CSSProperties  = { ...btnBase, background: '#2563eb', color: '#fff', borderColor: '#2563eb' };
  const btnIdle: React.CSSProperties   = { ...btnBase, background: '#0f172a', color: '#64748b' };

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#f1f5f9', padding: '20px 24px 40px', fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');`}</style>

      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
            <Trophy size={24} color="#eab308" />
            Leaderboard
          </h1>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 500 }}>Tracking the most elite performers in the journal.</p>
        </div>

        {/* ── Category pills ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', border: `1px solid ${activeCategory === c.id ? c.color + '60' : '#1e293b'}`, background: activeCategory === c.id ? c.color + '18' : '#0f172a', color: activeCategory === c.id ? c.color : '#64748b', transition: 'all 0.15s' }}>
              {c.icon}{c.label}
            </button>
          ))}
        </div>

        {/* ── Controls row ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', border: '1px solid #1e293b' }}>
              {['Daily', 'Weekly', 'Monthly'].map(p => (
                <button key={p} onClick={() => setActivePeriod(p)} style={activePeriod === p ? btnActive : btnIdle}>{p}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', padding: '7px 12px', gap: 10 }}>
              <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>‹</button>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                {activePeriod === 'Daily' ? 'Today' : activePeriod === 'Weekly' ? 'This Week' : 'This Month'}
              </span>
              <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>›</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search trader…"
                style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#cbd5e1', fontSize: 11, padding: '7px 10px 7px 28px', outline: 'none', width: 160, fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', border: '1px solid #1e293b' }}>
              {['Percentage', 'Currency'].map(o => (
                <button key={o} onClick={() => setActiveMetric(o)} style={activeMetric === o ? btnActive : btnIdle}>{o}</button>
              ))}
            </div>
            <div style={{ display: 'flex', border: '1px solid #1e293b' }}>
              {['Demo', 'Real'].map(m => (
                <button key={m} onClick={() => setActiveMode(m)} style={activeMode === m ? btnActive : btnIdle}>{m}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Podium ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {podiumTraders.map(trader => {
            const rank = sortedTraders.findIndex(t => t.id === trader.id) + 1;
            const isFirst = rank === 1;
            const podiumColor = isFirst ? '#eab308' : rank === 2 ? '#94a3b8' : '#f97316';
            return (
              <div key={trader.id} style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                <div style={{ background: '#0f172a', border: `1px solid ${isFirst ? 'rgba(234,179,8,0.4)' : '#1e293b'}`, padding: '16px 16px 14px', position: 'relative', overflow: 'hidden', minHeight: isFirst ? 260 : 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: isFirst ? '0 0 32px rgba(234,179,8,0.08)' : 'none', marginBottom: isFirst ? 14 : 0 }}>
                  {/* rank badge */}
                  <div style={{ position: 'absolute', top: 0, right: 0, padding: '4px 12px', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', background: podiumColor, color: isFirst ? '#000' : '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isFirst && <Medal size={10} />} Rank #{rank}
                  </div>
                  {/* avatar + name */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 10 }}>
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <div style={{ width: isFirst ? 60 : 50, height: isFirst ? 60 : 50, borderRadius: '50%', background: isFirst ? '#eab308' : '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isFirst ? 18 : 14, fontWeight: 800, color: isFirst ? '#000' : '#94a3b8' }}>
                        {trader.avatar}
                      </div>
                      {isFirst && (
                        <div style={{ position: 'absolute', bottom: -4, right: -4, background: '#020617', padding: 3, borderRadius: '50%', border: '2px solid #eab308' }}>
                          <Trophy size={10} color="#eab308" />
                        </div>
                      )}
                    </div>
                    <h3 style={{ fontSize: isFirst ? 14 : 12, fontWeight: 800, margin: 0, color: isFirst ? '#fff' : '#cbd5e1', lineHeight: 1.3 }}>{trader.name}</h3>
                  </div>
                  {/* stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                    <div>
                      <p style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 2px' }}>Profit</p>
                      <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: activeCategory === 'pnl' ? '#34d399' : '#cbd5e1' }}>${Math.floor(trader.pnl / 1000)}k</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 2px' }}>{activeCategory === 'winRate' ? 'Win Rate' : 'Factor'}</p>
                      <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: accentFor(activeCategory) }}>
                        {activeCategory === 'winRate' ? `${trader.winRate}%` : trader.profitFactor.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {/* sparkline */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                    <Sparkline data={trader.growth} color={isFirst ? '#eab308' : '#334155'} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Table ── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', overflowX: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.4)', marginBottom: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(30,41,59,0.5)' }}>
                {[
                  { label: '#',             align: 'left'  as const, key: null },
                  { label: 'Trader',        align: 'left'  as const, key: null },
                  { label: 'PnL',           align: 'right' as const, key: 'pnl' },
                  { label: 'Win Rate',      align: 'right' as const, key: 'winRate' },
                  { label: 'Profit Factor', align: 'right' as const, key: 'profitFactor' },
                  { label: 'Trades',        align: 'right' as const, key: null },
                ].map(col => (
                  <th key={col.label} style={{ padding: '12px 20px', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.16em', color: col.key === activeCategory ? accentFor(activeCategory as any) : '#475569', textAlign: col.align }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTraders.map((trader, index) => (
                <tr key={trader.id} style={{ borderTop: '1px solid #1e293b', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,41,59,0.3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 20px' }}>
                    <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ position: 'absolute', width: 24, height: 24, border: `1px solid ${index < 3 ? '#eab308' : '#334155'}`, background: index < 3 ? 'rgba(234,179,8,0.08)' : 'rgba(30,41,59,0.4)', transform: 'rotate(45deg)' }} />
                      <span style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 700, color: index < 3 ? '#eab308' : '#64748b' }}>{index + 1}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#94a3b8', flexShrink: 0 }}>
                        {trader.avatar}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: '#e2e8f0' }}>{trader.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: activeCategory === 'pnl' ? '#34d399' : '#64748b' }}>
                    ${trader.pnl.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: activeCategory === 'winRate' ? '#60a5fa' : '#64748b' }}>
                    {trader.winRate}%
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: activeCategory === 'profitFactor' ? '#a78bfa' : '#64748b' }}>
                    {trader.profitFactor.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569' }}>
                    {trader.trades}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Global Summary ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Total PnL',      value: '$245.2k' },
            { label: 'Avg Win Rate',   value: '58.4%'   },
            { label: 'Total Volume',   value: '1.2M'    },
            { label: 'Active Traders', value: '42'      },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid #1e293b', padding: '16px 18px', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#334155')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e293b')}>
              <p style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.14em', margin: '0 0 6px' }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
