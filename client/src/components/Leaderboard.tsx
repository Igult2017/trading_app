import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, TrendingUp, Percent, Loader2, Users } from 'lucide-react';

interface Trader {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  country?: string;
  pnl: number;
  winRate: number;
  trades: number;
  profitFactor: number;
  growth: number[];
}

const flagEmoji = (code?: string) => {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1A5 + c.charCodeAt(0)));
};

const truncateName = (name: string, maxWords = 2) => {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
};

interface Summary {
  totalPnl: number;
  avgWinRate: number;
  totalTrades: number;
  activeTraders: number;
}

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  if (!data || data.length < 2) {
    return <svg width="100%" height={30} viewBox="0 0 100 30"><line x1="0" y1="15" x2="100" y2="15" stroke={color} strokeWidth="1.5" strokeOpacity="0.3" /></svg>;
  }
  // Build cumulative PnL for the sparkline
  const cumulative: number[] = [];
  let running = 0;
  for (const v of data) { running += v; cumulative.push(running); }

  const max = Math.max(...cumulative);
  const min = Math.min(...cumulative);
  const range = Math.max(max - min, 1);
  const W = 100, H = 30;
  const points = cumulative.map((d, i) => {
    const x = (i / (cumulative.length - 1)) * W;
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
  const [activePeriod, setActivePeriod]     = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const [traders, setTraders]               = useState<Trader[]>([]);
  const [summary, setSummary]               = useState<Summary | null>(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/leaderboard?period=${activePeriod}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setTraders(data.leaderboard || []);
        setSummary(data.summary || null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [activePeriod]);

  const categories = [
    { id: 'pnl'          as const, label: 'By PnL',         icon: <TrendingUp size={14} />, color: '#34d399' },
    { id: 'winRate'      as const, label: 'By Win Rate',     icon: <Percent size={14} />,    color: '#60a5fa' },
    { id: 'profitFactor' as const, label: 'By Profit Factor',icon: <Trophy size={14} />,     color: '#a78bfa' },
  ];

  const sortedTraders = useMemo(() => {
    return [...traders].sort((a, b) => b[activeCategory] - a[activeCategory]).map((t, i) => ({ ...t, rank: i + 1 }));
  }, [traders, activeCategory]);

  const podiumTraders = useMemo(() => {
    const top3 = sortedTraders.slice(0, 3);
    if (top3.length < 3) return top3;
    return [top3[1], top3[0], top3[2]];
  }, [sortedTraders]);

  const accentFor = (id: string) =>
    id === 'pnl' ? '#34d399' : id === 'winRate' ? '#60a5fa' : '#a78bfa';

  const fmtPnl = (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '+';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}k`;
    return `${sign}$${abs.toFixed(2)}`;
  };

  const btnBase: React.CSSProperties = {
    padding: '7px 16px', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.08em', border: '1px solid #1e293b',
    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
  };
  const btnActive: React.CSSProperties  = { ...btnBase, background: '#2563eb', color: '#fff', borderColor: '#2563eb' };
  const btnIdle: React.CSSProperties    = { ...btnBase, background: '#0f172a', color: '#64748b' };

  return (
    <div style={{ background: '#020617', color: '#f1f5f9', padding: '20px 0 40px', fontFamily: "'Montserrat', 'Inter', sans-serif" }}>

      {/* Disclaimer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(30,41,59,0.4)', border: '1px solid #1e293b', padding: '12px 16px', marginBottom: 16, fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
        <svg style={{ flexShrink: 0, marginTop: 1 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Performance data reflects live journal activity from connected user accounts. Rankings exist solely for community engagement — they do not constitute financial advice and should not be taken as a representation of returns any individual can expect to replicate.</span>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {categories.map(c => (
          <button key={c.id} onClick={() => setActiveCategory(c.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', border: `1px solid ${activeCategory === c.id ? c.color + '60' : '#1e293b'}`, background: activeCategory === c.id ? c.color + '18' : '#0f172a', color: activeCategory === c.id ? c.color : '#64748b', transition: 'all 0.15s', fontFamily: 'inherit' }}>
            {c.icon}{c.label}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: '#1e293b', margin: '0 4px' }} />
        <div style={{ display: 'flex', border: '1px solid #1e293b' }}>
          {(['all', 'daily', 'weekly', 'monthly'] as const).map(p => (
            <button key={p} onClick={() => setActivePeriod(p)} style={activePeriod === p ? btnActive : btnIdle}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '80px 0', color: '#475569' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Loading leaderboard…</span>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', padding: '16px 20px', color: '#f87171', fontSize: 13, marginBottom: 16 }}>
          Failed to load leaderboard: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sortedTraders.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 14, color: '#475569' }}>
          <Users size={40} strokeWidth={1.2} />
          <p style={{ fontSize: 14, fontWeight: 700, color: '#64748b', margin: 0 }}>No traders ranked yet</p>
          <p style={{ fontSize: 12, color: '#334155', margin: 0, textAlign: 'center', maxWidth: 300 }}>Start logging trades in your journal to appear on the leaderboard.</p>
        </div>
      )}

      {/* Podium */}
      {!loading && !error && sortedTraders.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            {podiumTraders.map(trader => {
              const rank = trader.rank;
              const isFirst = rank === 1;
              const podiumColor = isFirst ? '#eab308' : rank === 2 ? '#94a3b8' : '#f97316';
              return (
                <div key={trader.userId} style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                  <div style={{ background: '#0f172a', border: `1px solid ${isFirst ? 'rgba(234,179,8,0.4)' : '#1e293b'}`, padding: '16px 16px 14px', position: 'relative', overflow: 'hidden', minHeight: isFirst ? 260 : 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: isFirst ? '0 0 32px rgba(234,179,8,0.08)' : 'none', marginBottom: isFirst ? 14 : 0 }}>
                    {/* Top-left rank diamond */}
                    <div style={{ position: 'absolute', top: 12, left: 12, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ position: 'absolute', width: 22, height: 22, border: `1px solid ${podiumColor}`, background: isFirst ? 'rgba(234,179,8,0.12)' : 'rgba(30,41,59,0.6)', transform: 'rotate(45deg)' }} />
                      <span style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 800, color: podiumColor }}>{rank}</span>
                    </div>
                    {/* Top-right country flag */}
                    {trader.country && (
                      <div title={trader.country.toUpperCase()} style={{ position: 'absolute', top: 10, right: 12, fontSize: 22, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}>
                        {flagEmoji(trader.country)}
                      </div>
                    )}
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
                      <h3 style={{ fontSize: isFirst ? 14 : 12, fontWeight: 800, margin: 0, color: isFirst ? '#fff' : '#cbd5e1', lineHeight: 1.3 }}>{truncateName(trader.name)}</h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                      <div>
                        <p style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 2px' }}>Profit</p>
                        <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: trader.pnl >= 0 ? '#34d399' : '#f87171' }}>{fmtPnl(trader.pnl)}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 2px' }}>
                          {activeCategory === 'winRate' ? 'Win Rate' : activeCategory === 'profitFactor' ? 'P. Factor' : 'Win Rate'}
                        </p>
                        <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: accentFor(activeCategory) }}>
                          {activeCategory === 'profitFactor' ? trader.profitFactor.toFixed(2) : `${trader.winRate}%`}
                        </p>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                      <Sparkline data={trader.growth} color={isFirst ? '#eab308' : '#334155'} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table */}
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
                    { label: 'Growth',        align: 'right' as const, key: null },
                  ].map(col => (
                    <th key={col.label} style={{ padding: '12px 20px', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.16em', color: col.key === activeCategory ? accentFor(activeCategory) : '#475569', textAlign: col.align }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTraders.map((trader, index) => (
                  <tr key={trader.userId} style={{ borderTop: '1px solid #1e293b', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,41,59,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'absolute', width: 24, height: 24, border: `1px solid ${index < 3 ? '#eab308' : '#334155'}`, background: index < 3 ? 'rgba(234,179,8,0.08)' : 'rgba(30,41,59,0.4)', transform: 'rotate(45deg)' }} />
                        <span style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 700, color: index < 3 ? '#eab308' : '#64748b' }}>{trader.rank}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#94a3b8', flexShrink: 0 }}>
                          {trader.avatar}
                        </div>
                        {trader.country && (
                          <span title={trader.country.toUpperCase()} style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                            {flagEmoji(trader.country)}
                          </span>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: '#e2e8f0' }}>{truncateName(trader.name)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: activeCategory === 'pnl' ? (trader.pnl >= 0 ? '#34d399' : '#f87171') : (trader.pnl >= 0 ? '#34d399' : '#f87171') }}>
                      {fmtPnl(trader.pnl)}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: activeCategory === 'winRate' ? '#60a5fa' : '#64748b' }}>
                      {trader.winRate}%
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: activeCategory === 'profitFactor' ? '#a78bfa' : '#64748b' }}>
                      {trader.profitFactor > 0 ? trader.profitFactor.toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569' }}>
                      {trader.trades}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', width: 80 }}>
                      <Sparkline data={trader.growth} color={trader.pnl >= 0 ? '#34d399' : '#f87171'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Total PnL',      value: fmtPnl(summary.totalPnl) },
                { label: 'Avg Win Rate',   value: `${summary.avgWinRate}%` },
                { label: 'Total Trades',   value: summary.totalTrades.toLocaleString() },
                { label: 'Active Traders', value: summary.activeTraders.toString() },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid #1e293b', padding: '16px 18px', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#334155')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e293b')}>
                  <p style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.14em', margin: '0 0 6px' }}>{label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
