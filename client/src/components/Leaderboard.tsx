import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, TrendingUp, Percent, Loader2, Users, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';

interface Trader {
  rank: number;
  userId: string;
  sessionId?: string;
  sessionName?: string;
  name: string;
  avatar: string;
  country?: string;
  pnl: number;
  winRate: number;
  trades: number;
  profitFactor: number;
  growth: number[];
}

const FlagCdn = ({ code, size = 28 }: { code?: string; size?: number }) => {
  if (!code || code.length !== 2) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      width={size}
      height={Math.round(size * 0.67)}
      style={{ objectFit: 'cover', borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)', display: 'block', flexShrink: 0 }}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
};

const truncateName = (name: string, maxWords = 2) => {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
};

interface Summary {
  totalPnl: number;
  avgWinRate?: number;
  totalTrades: number;
  activeTraders: number;
}

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  if (!data || data.length < 2) {
    return <svg width="100%" height={30} viewBox="0 0 100 30"><line x1="0" y1="15" x2="100" y2="15" stroke={color} strokeWidth="1.5" strokeOpacity="0.3" /></svg>;
  }
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
  const [viewMode, setViewMode]             = useState<'overall' | 'session'>('overall');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [isMobile, setIsMobile]             = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const { data: lbData, isLoading: loadingOverall, error: overallError } = useQuery<{ leaderboard: Trader[]; summary: Summary | null }>({
    queryKey: ['/api/leaderboard/by-session', activePeriod, '__overall__'],
    queryFn: async () => {
      const r = await authFetch(`/api/leaderboard/by-session?period=${activePeriod}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      return { leaderboard: d.leaderboard || [], summary: d.summary || null };
    },
    staleTime: 2 * 60 * 1000,
    enabled: viewMode === 'overall',
  });

  const sessionParam = selectedSession ? `&session_name=${encodeURIComponent(selectedSession)}` : '';
  const { data: sessionData, isLoading: loadingSession, error: sessionError } = useQuery<{ leaderboard: Trader[]; summary: Summary | null }>({
    queryKey: ['/api/leaderboard/by-session', activePeriod, selectedSession],
    queryFn: async () => {
      const r = await authFetch(`/api/leaderboard/by-session?period=${activePeriod}${sessionParam}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      return { leaderboard: d.leaderboard || [], summary: d.summary || null };
    },
    staleTime: 2 * 60 * 1000,
    enabled: viewMode === 'session',
  });

  const { data: sessionNamesData } = useQuery<{ sessionNames: string[] }>({
    queryKey: ['/api/leaderboard/session-names'],
    queryFn: async () => {
      const r = await authFetch('/api/leaderboard/session-names');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: viewMode === 'session',
  });
  const sessionNames = sessionNamesData?.sessionNames ?? [];

  const traders = viewMode === 'session' ? (sessionData?.leaderboard ?? []) : (lbData?.leaderboard ?? []);
  const summary = viewMode === 'session' ? (sessionData?.summary ?? null) : (lbData?.summary ?? null);
  const loading = viewMode === 'session' ? loadingSession : loadingOverall;
  const queryError = viewMode === 'session' ? sessionError : overallError;
  const error = queryError ? (queryError as Error).message : null;

  const categories = [
    { id: 'pnl'          as const, label: 'By PnL',          icon: <TrendingUp size={14} />, color: '#34d399' },
    { id: 'winRate'      as const, label: 'By Win Rate',      icon: <Percent size={14} />,    color: '#60a5fa' },
    { id: 'profitFactor' as const, label: 'By Profit Factor', icon: <Trophy size={14} />,     color: '#a78bfa' },
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
    letterSpacing: '0.08em', border: '1px solid var(--jr-border)',
    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
  };
  const btnActive: React.CSSProperties  = { ...btnBase, background: '#2563eb', color: '#fff', borderColor: '#2563eb' };
  const btnIdle: React.CSSProperties    = { ...btnBase, background: 'var(--jr-panel)', color: 'var(--jr-muted)' };

  return (
    <div style={{ background: 'var(--jr-panel)', color: 'var(--jr-text)', padding: isMobile ? '14px 0 28px' : '20px 0 40px', fontFamily: "'Montserrat', 'Inter', sans-serif" }}>

      {/* Disclaimer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? 8 : 10, background: 'rgba(0,0,0,0.03)', border: '1px solid var(--jr-border)', padding: isMobile ? '10px 12px' : '12px 16px', marginBottom: isMobile ? 12 : 16, fontSize: isMobile ? 10 : 11, color: 'var(--jr-muted)', lineHeight: 1.55 }}>
        <svg style={{ flexShrink: 0, marginTop: 1 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Performance data reflects live journal activity from connected user accounts. Rankings exist solely for community engagement — they do not constitute financial advice and should not be taken as a representation of returns any individual can expect to replicate.</span>
      </div>

      {/* View Mode Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isMobile ? 10 : 14 }}>
        {([
          { id: 'overall' as const, label: 'Overall', icon: <Users size={13} /> },
          { id: 'session' as const, label: 'By Session', icon: <Layers size={13} /> },
        ]).map(m => (
          <button key={m.id} onClick={() => setViewMode(m.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '6px 12px' : '7px 16px', borderRadius: 4, fontSize: isMobile ? 10 : 11, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', border: `1px solid ${viewMode === m.id ? '#2563eb' : 'var(--jr-border)'}`, background: viewMode === m.id ? 'rgba(37,99,235,0.15)' : 'var(--jr-panel)', color: viewMode === m.id ? '#60a5fa' : 'var(--jr-muted)', transition: 'all 0.15s', fontFamily: 'inherit' }}>
            {m.icon}{m.label}
          </button>
        ))}

        {viewMode === 'session' && sessionNames.length > 0 && (
          <select
            value={selectedSession}
            onChange={e => setSelectedSession(e.target.value)}
            style={{ marginLeft: 6, padding: isMobile ? '6px 10px' : '7px 14px', fontSize: isMobile ? 10 : 11, fontWeight: 700, background: 'var(--jr-panel)', color: selectedSession ? '#60a5fa' : 'var(--jr-muted)', border: `1px solid ${selectedSession ? '#2563eb60' : 'var(--jr-border)'}`, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
            <option value="">All Sessions</option>
            {sessionNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isMobile ? 6 : 8, marginBottom: isMobile ? 14 : 20 }}>
        {categories.map(c => (
          <button key={c.id} onClick={() => setActiveCategory(c.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '6px 10px' : '7px 14px', borderRadius: 4, fontSize: isMobile ? 10 : 11, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', border: `1px solid ${activeCategory === c.id ? c.color + '60' : 'var(--jr-border)'}`, background: activeCategory === c.id ? c.color + '18' : 'var(--jr-panel)', color: activeCategory === c.id ? c.color : 'var(--jr-muted)', transition: 'all 0.15s', fontFamily: 'inherit' }}>
            {c.icon}{isMobile ? c.label.replace('By ', '') : c.label}
          </button>
        ))}
        {!isMobile && <div style={{ width: 1, height: 22, background: 'var(--jr-border)', margin: '0 4px' }} />}
        <div style={{ display: 'flex', border: '1px solid var(--jr-border)', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {(['all', 'daily', 'weekly', 'monthly'] as const).map(p => (
            <button key={p} onClick={() => setActivePeriod(p)} style={activePeriod === p
              ? { ...btnActive, padding: isMobile ? '6px 10px' : '7px 16px', fontSize: isMobile ? 10 : 11 }
              : { ...btnIdle,   padding: isMobile ? '6px 10px' : '7px 16px', fontSize: isMobile ? 10 : 11 }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '80px 0', color: 'var(--jr-muted)' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 14, color: 'var(--jr-muted)' }}>
          <Users size={40} strokeWidth={1.2} />
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--jr-muted)', margin: 0 }}>No traders ranked yet</p>
          <p style={{ fontSize: 12, color: 'var(--jr-muted)', margin: 0, textAlign: 'center', maxWidth: 300 }}>
            {viewMode === 'session'
              ? 'No session data found. Trades must be linked to a session to appear here.'
              : 'Start logging trades in your journal to appear on the leaderboard.'}
          </p>
        </div>
      )}

      {/* Podium */}
      {!loading && !error && sortedTraders.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 8 : 10, marginBottom: 10, flexWrap: 'wrap' }}>
            {podiumTraders.map(trader => {
              const rank = trader.rank;
              const isFirst = rank === 1;
              const podiumColor = isFirst ? '#eab308' : rank === 2 ? '#94a3b8' : '#f97316';
              return (
                <div key={trader.sessionId ?? trader.userId} style={{ flex: 1, minWidth: isMobile ? 140 : 180, position: 'relative' }}>
                  <div style={{ background: 'var(--jr-panel)', border: `1px solid ${isFirst ? 'rgba(234,179,8,0.4)' : 'var(--jr-border)'}`, padding: isMobile ? '14px 12px 12px' : '16px 16px 14px', position: 'relative', overflow: 'hidden', minHeight: isFirst ? (isMobile ? 220 : 260) : (isMobile ? 180 : 200), display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: isFirst ? '0 0 32px rgba(234,179,8,0.08)' : 'none', marginBottom: isFirst && !isMobile ? 14 : 0 }}>
                    {/* Top-left rank diamond */}
                    <div style={{ position: 'absolute', top: 12, left: 12, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ position: 'absolute', width: 22, height: 22, border: `1px solid ${podiumColor}`, background: isFirst ? 'rgba(234,179,8,0.12)' : 'rgba(0,0,0,0.06)', transform: 'rotate(45deg)' }} />
                      <span style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 800, color: podiumColor }}>{rank}</span>
                    </div>
                    {/* Top-right country flag */}
                    {trader.country && (
                      <div style={{ position: 'absolute', top: 10, right: 12 }}>
                        <FlagCdn code={trader.country} size={30} />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 10 }}>
                      <div style={{ position: 'relative', marginBottom: 8 }}>
                        <div style={{ width: isFirst ? 60 : 50, height: isFirst ? 60 : 50, borderRadius: '50%', background: isFirst ? '#eab308' : 'var(--jr-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isFirst ? 18 : 14, fontWeight: 800, color: isFirst ? '#000' : '#94a3b8' }}>
                          {trader.avatar}
                        </div>
                        {isFirst && (
                          <div style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--jr-panel)', padding: 3, borderRadius: '50%', border: '2px solid #eab308' }}>
                            <Trophy size={10} color="#eab308" />
                          </div>
                        )}
                      </div>
                      <h3 style={{ fontSize: isFirst ? 14 : 12, fontWeight: 800, margin: 0, color: 'var(--jr-text)', lineHeight: 1.3 }}>{truncateName(trader.name)}</h3>
                      {viewMode === 'session' && trader.sessionName && (
                        <span style={{ marginTop: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--jr-muted)', background: 'var(--jr-panel)', border: '1px solid var(--jr-border)', padding: '2px 7px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {trader.sessionName}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                      <div>
                        <p style={{ fontSize: 9, color: 'var(--jr-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 2px' }}>Profit</p>
                        <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: trader.pnl >= 0 ? '#34d399' : '#f87171' }}>{fmtPnl(trader.pnl)}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 9, color: 'var(--jr-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 2px' }}>
                          {activeCategory === 'profitFactor' ? 'P. Factor' : 'Win Rate'}
                        </p>
                        <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: accentFor(activeCategory) }}>
                          {activeCategory === 'profitFactor' ? trader.profitFactor.toFixed(2) : `${trader.winRate}%`}
                        </p>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--jr-border)' }}>
                      <Sparkline data={trader.growth} color={isFirst ? '#eab308' : '#94a3b8'} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table */}
          <div style={{ background: 'var(--jr-panel)', border: '1px solid var(--jr-border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: isMobile ? 560 : undefined }}>
              <thead>
                <tr style={{ background: 'var(--jr-divider,rgba(0,0,0,0.04))' }}>
                  {[
                    { label: '#',             align: 'left'  as const, key: null,            hideOnMobile: false },
                    { label: 'Trader',        align: 'left'  as const, key: null,            hideOnMobile: false },
                    ...(viewMode === 'session' ? [{ label: 'Session', align: 'left' as const, key: null, hideOnMobile: true }] : []),
                    { label: 'PnL',           align: 'right' as const, key: 'pnl',           hideOnMobile: false },
                    { label: 'Win Rate',      align: 'right' as const, key: 'winRate',       hideOnMobile: false },
                    { label: 'Profit Factor', align: 'right' as const, key: 'profitFactor',  hideOnMobile: true  },
                    { label: 'Trades',        align: 'right' as const, key: null,            hideOnMobile: true  },
                    { label: 'Growth',        align: 'right' as const, key: null,            hideOnMobile: false },
                  ].filter(col => !(isMobile && col.hideOnMobile)).map(col => (
                    <th key={col.label} style={{ padding: isMobile ? '10px 10px' : '12px 20px', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.16em', color: col.key === activeCategory ? accentFor(activeCategory) : 'var(--jr-muted)', textAlign: col.align, whiteSpace: 'nowrap' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTraders.map((trader, index) => (
                  <tr key={trader.sessionId ?? trader.userId} style={{ borderTop: '1px solid var(--jr-border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: isMobile ? '10px 10px' : '12px 20px' }}>
                      <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'absolute', width: 24, height: 24, border: `1px solid ${index < 3 ? '#eab308' : 'var(--jr-border)'}`, background: index < 3 ? 'rgba(234,179,8,0.08)' : 'rgba(0,0,0,0.04)', transform: 'rotate(45deg)' }} />
                        <span style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 700, color: index < 3 ? '#eab308' : 'var(--jr-muted)' }}>{trader.rank}</span>
                      </div>
                    </td>
                    <td style={{ padding: isMobile ? '10px 10px' : '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10 }}>
                        <div style={{ width: isMobile ? 26 : 30, height: isMobile ? 26 : 30, borderRadius: '50%', background: 'var(--jr-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#94a3b8', flexShrink: 0 }}>
                          {trader.avatar}
                        </div>
                        {trader.country && (
                          <FlagCdn code={trader.country} size={isMobile ? 20 : 24} />
                        )}
                        <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--jr-text)' }}>{truncateName(trader.name)}</span>
                      </div>
                    </td>
                    {viewMode === 'session' && !isMobile && (
                      <td style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--jr-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trader.sessionName || '—'}
                      </td>
                    )}
                    <td style={{ padding: isMobile ? '10px 10px' : '12px 20px', textAlign: 'right', fontSize: isMobile ? 11 : 12, fontWeight: 700, whiteSpace: 'nowrap', color: trader.pnl >= 0 ? '#34d399' : '#f87171' }}>
                      {fmtPnl(trader.pnl)}
                    </td>
                    <td style={{ padding: isMobile ? '10px 10px' : '12px 20px', textAlign: 'right', fontSize: isMobile ? 11 : 12, fontWeight: 700, whiteSpace: 'nowrap', color: activeCategory === 'winRate' ? '#60a5fa' : 'var(--jr-muted)' }}>
                      {trader.winRate}%
                    </td>
                    {!isMobile && (
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: activeCategory === 'profitFactor' ? '#a78bfa' : 'var(--jr-muted)' }}>
                        {trader.profitFactor > 0 ? trader.profitFactor.toFixed(2) : '—'}
                      </td>
                    )}
                    {!isMobile && (
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--jr-muted)' }}>
                        {trader.trades}
                      </td>
                    )}
                    <td style={{ padding: isMobile ? '10px 10px' : '12px 20px', textAlign: 'right', width: isMobile ? 64 : 80 }}>
                      <Sparkline data={trader.growth} color={trader.pnl >= 0 ? '#34d399' : '#f87171'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 8 : 10 }}>
              {[
                { label: 'Total PnL',                                               value: fmtPnl(summary.totalPnl) },
                { label: 'Total Trades',                                            value: summary.totalTrades.toLocaleString() },
                { label: viewMode === 'session' ? 'Sessions Ranked' : 'Active Traders', value: summary.activeTraders.toString() },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--jr-panel)', border: '1px solid var(--jr-border)', padding: isMobile ? '12px 14px' : '16px 18px', transition: 'border-color 0.15s', minWidth: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--jr-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--jr-border)')}>
                  <p style={{ fontSize: 9, color: 'var(--jr-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.14em', margin: '0 0 6px' }}>{label}</p>
                  <p style={{ fontSize: isMobile ? 17 : 22, fontWeight: 800, color: 'var(--jr-text)', margin: 0, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
