import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, Zap, Sparkles, Brain, ChevronRight, BarChart3,
  Filter, Clock, Activity, Globe, ArrowUpRight, ChevronDown,
  Target, Shield, ShieldCheck, DoorOpen, Award, Layers,
  Compass, CheckCircle2, TrendingDown, BarChart2,
  Users, RefreshCcw, Calendar, Timer, Percent, ArrowUp,
  LineChart, Loader2
} from 'lucide-react';

function formatPL(v: number): string {
  return v >= 0 ? `+$${Math.abs(v).toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;
}

function formatPct(v: number): string {
  return `${Math.round(v)}%`;
}

export default function MetricsPanel({ sessionId }: { sessionId?: string | null }) {
  const [selectedStrategy, setSelectedStrategy] = useState('ALL STRATEGIES');
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [equityView, setEquityView] = useState('WEEKLY');

  const queryUrl = sessionId ? `/api/metrics/compute?sessionId=${sessionId}` : '/api/metrics/compute';
  const { data: metricsData, isLoading, isError } = useQuery<{ success: boolean; metrics: any }>({
    queryKey: ['/api/metrics/compute', sessionId],
    queryFn: () => fetch(queryUrl).then(r => r.json()),
    enabled: !!sessionId,
  });

  const m = metricsData?.metrics;
  const core = m?.core || {};
  const streaks = m?.streaks || {};
  const sessionBreakdown = m?.sessionBreakdown || {};
  const instrumentBreakdown = m?.instrumentBreakdown || {};
  const directionBias = m?.directionBias || {};
  const exitAnalysis = m?.exitAnalysis || {};
  const riskMetrics = m?.riskMetrics || {};
  const equityCurve: any[] = m?.equityCurve || [];
  const strategyPerformance = m?.strategyPerformance || {};
  const setupFrequency = m?.setupFrequency || {};
  const tradeGrades = m?.tradeGrades || {};
  const psychology = m?.psychology || {};
  const dayOfWeekBreakdown = m?.dayOfWeekBreakdown || {};
  const timeframeBreakdown = m?.timeframeBreakdown || {};

  const strategies = ['ALL STRATEGIES', ...Object.keys(strategyPerformance).filter(k => k !== 'Unclassified')];

  const handleCardClick = (id: string) => {
    setActiveCard(id);
    setTimeout(() => setActiveCard(null), 300);
  };

  const cardBase = (id: string, hoverColor = 'blue') =>
    `bg-[#0f152d] rounded-2xl border border-slate-800/60 shadow-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-${hoverColor}-400/50 hover:shadow-[0_20px_60px_rgba(59,130,246,0.25)] active:scale-[0.98] ${activeCard === id ? 'card-active scale-[0.98]' : ''}`;

  const CardHeader = ({ icon: Icon, title, desc, color = 'blue' }: { icon: any; title: string; desc?: string; color?: string }) => (
    <div className="p-5 border-b border-slate-800/40 bg-slate-900/20">
      <div className="flex items-center gap-3 mb-1">
        <div className={`p-2 bg-${color}-500/10`}>
          <Icon className={`w-5 h-5 text-${color}-400`} />
        </div>
        <h2 className={`text-[11px] font-black uppercase tracking-[0.15em] text-${color}-400/90 font-montserrat`}>{title}</h2>
      </div>
      {desc && <p className="text-slate-400 text-xs font-medium leading-relaxed">{desc}</p>}
    </div>
  );

  const StatBadge = ({ value, label, color = 'blue' }: { value: string; label: string; color?: string }) => (
    <div className={`bg-${color}-500/10 border border-${color}-500/20 p-3 text-center hover:bg-${color}-500/20 transition-colors`}>
      <div className={`text-sm font-medium text-${color}-400`}>{value}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );

  const ImpactScoreRow = ({ label, scores }: { label: string; scores: Array<{ score: string; pct: number }> }) => (
    <div className="py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">{label}</div>
      <div className="grid grid-cols-4 gap-1">
        {scores.map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-[9px] text-slate-600 mb-0.5">{s.score}</div>
            <div className={`text-[11px] font-black ${s.pct >= 65 ? 'text-emerald-400' : s.pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{s.pct}%</div>
            <div className="w-full bg-slate-800 h-px mt-1">
              <div className={`h-full ${s.pct >= 65 ? 'bg-emerald-500' : s.pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const YesNoImpact = ({ label, yes, no }: { label: string; yes: number; no: number }) => (
    <div className="py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">{label}</div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="flex justify-between mb-0.5">
            <span className="text-[9px] text-slate-500">Yes</span>
            <span className={`text-[11px] font-black ${yes >= 60 ? 'text-emerald-400' : 'text-rose-400'}`}>{yes}%</span>
          </div>
          <div className="w-full bg-slate-800 h-px">
            <div className={`h-full ${yes >= 60 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${yes}%` }} />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex justify-between mb-0.5">
            <span className="text-[9px] text-slate-500">No</span>
            <span className={`text-[11px] font-black ${no >= 60 ? 'text-emerald-400' : 'text-rose-400'}`}>{no}%</span>
          </div>
          <div className="w-full bg-slate-800 h-px">
            <div className={`h-full ${no >= 60 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${no}%` }} />
          </div>
        </div>
      </div>
    </div>
  );

  const MultiImpact = ({ label, options }: { label: string; options: Array<{ label: string; pct: number }> }) => (
    <div className="py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">{label}</div>
      <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((o, i) => (
          <div key={i} className="text-center">
            <div className="text-[9px] text-slate-600 mb-0.5 truncate">{o.label}</div>
            <div className={`text-[11px] font-black ${o.pct >= 65 ? 'text-emerald-400' : o.pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{o.pct}%</div>
            <div className="w-full bg-slate-800 h-px mt-1">
              <div className={`h-full ${o.pct >= 65 ? 'bg-emerald-500' : o.pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${o.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const ImpactStat = ({ label, value, highlight }: { label: string; value: string; highlight?: string }) => (
    <div className="flex justify-between items-center py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{label}</span>
      <span className={`text-xs font-black tracking-tighter ${highlight || 'text-white'}`}>{value}</span>
    </div>
  );

  if (!sessionId) {
    return (
      <div className="text-slate-200 flex items-center justify-center py-20" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <div className="text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
              <path d="M21 21H4.6c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C3 20.24 3 19.96 3 19.4V3" />
              <path d="M7 14l4-4 4 4 6-6" />
            </svg>
          </div>
          <p className="text-sm text-slate-400 font-medium mb-1" data-testid="text-metrics-no-session">No session selected</p>
          <p className="text-xs text-slate-600">Select or create a session to view metrics.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-slate-200 flex items-center justify-center py-20" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-400 font-medium" data-testid="text-metrics-loading">Computing metrics from your trades...</p>
        </div>
      </div>
    );
  }

  if (isError || (metricsData && !metricsData.success)) {
    return (
      <div className="text-slate-200 flex items-center justify-center py-20" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <div className="text-center">
          <p className="text-sm text-rose-400 font-medium" data-testid="text-metrics-error">Failed to compute metrics. Please try again.</p>
        </div>
      </div>
    );
  }

  const isEmpty = (core.totalTrades || 0) === 0;

  if (isEmpty) {
    return (
      <div className="text-slate-200 flex items-center justify-center py-20" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <div className="text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
              <path d="M21 21H4.6c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C3 20.24 3 19.96 3 19.4V3" />
              <path d="M7 14l4-4 4 4 6-6" />
            </svg>
          </div>
          <p className="text-sm text-slate-400 font-medium mb-1" data-testid="text-metrics-empty">No trades recorded yet</p>
          <p className="text-xs text-slate-600">Add journal entries to see your performance metrics.</p>
        </div>
      </div>
    );
  }

  const longData = directionBias.long || {};
  const shortData = directionBias.short || {};
  const longWR = longData.winRate || 0;
  const shortWR = shortData.winRate || 0;
  const longWins = longData.wins || 0;
  const shortWins = shortData.wins || 0;
  const longTrades = longData.trades || 0;
  const shortTrades = shortData.trades || 0;
  const avgWinLong = longWins > 0 && longData.pl > 0 ? Math.round(longData.pl / longWins) : 0;
  const avgWinShort = shortWins > 0 && shortData.pl > 0 ? Math.round(shortData.pl / shortWins) : 0;
  const longLosses = longTrades - longWins;
  const shortLosses = shortTrades - shortWins;
  const avgLossLong = longLosses > 0 && longData.pl < 0 ? Math.round(Math.abs(longData.pl) / longLosses) : 0;
  const avgLossShort = shortLosses > 0 && shortData.pl < 0 ? Math.round(Math.abs(shortData.pl) / shortLosses) : 0;

  const instrumentEntries = Object.entries(instrumentBreakdown).map(([pair, data]: [string, any]) => ({
    pair, pct: data.winRate || 0, pl: formatPL(data.pl || 0),
  }));

  const sessionEntries = Object.entries(sessionBreakdown).map(([name, data]: [string, any]) => ({
    label: name, pct: data.winRate || 0,
  }));

  const dayEntries = Object.entries(dayOfWeekBreakdown).map(([day, data]: [string, any]) => ({
    label: day.substring(0, 3), pct: data.winRate || 0,
  }));

  const bestDay = dayEntries.length > 0 ? dayEntries.reduce((a, b) => a.pct > b.pct ? a : b).label : '--';
  const worstDay = dayEntries.length > 0 ? dayEntries.reduce((a, b) => a.pct < b.pct ? a : b).label : '--';

  const exitEntries = Object.entries(exitAnalysis).map(([reason, data]: [string, any]) => ({
    label: reason, pct: data.winRate || 0,
  }));

  const strategyEntries = Object.entries(strategyPerformance).map(([name, data]: [string, any]) => ({
    name, wr: data.winRate || 0, trades: data.trades || 0, pl: formatPL(data.pl || 0), rawPL: data.pl || 0,
  }));

  const setupEntries = Object.entries(setupFrequency).map(([name, count]: [string, any]) => {
    const stratData = strategyPerformance[name] || {};
    return { name, count: count as number, wr: stratData.winRate || 0 };
  });

  const gradeEntries = [
    { grade: 'A', count: tradeGrades.A || 0, color: 'emerald' },
    { grade: 'B', count: tradeGrades.B || 0, color: 'emerald' },
    { grade: 'C', count: tradeGrades.C || 0, color: 'amber' },
    { grade: 'D', count: tradeGrades.D || 0, color: 'amber' },
    { grade: 'F', count: tradeGrades.F || 0, color: 'rose' },
  ];
  const totalGraded = gradeEntries.reduce((s, g) => s + g.count, 0);

  const tfEntries = Object.entries(timeframeBreakdown).map(([tf, data]: [string, any]) => ({
    label: tf, pct: data.winRate || 0,
  }));

  const totalPL = core.totalPL || 0;
  const winRate = core.winRate || 0;
  const expectancy = core.expectancy || 0;
  const totalTrades = core.totalTrades || 0;
  const profitFactor = core.profitFactor || 0;
  const avgRR = core.avgRR || 0;
  const rulesAdherence = riskMetrics.rulesAdherence || 0;
  const avgWin = core.avgWin || 0;
  const avgLoss = core.avgLoss || 0;
  const wins = core.wins || 0;
  const losses = core.losses || 0;
  const winLossRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(1) : '0';
  const maxDD = streaks.maxDrawdown || 0;

  const bestTradePL = equityCurve.length > 0 ? Math.max(...equityCurve.map((e: any) => {
    const prev = equityCurve[equityCurve.indexOf(e) - 1];
    return prev ? e.cumulativePL - prev.cumulativePL : e.cumulativePL;
  })) : 0;
  const worstTradePL = equityCurve.length > 0 ? Math.min(...equityCurve.map((e: any) => {
    const prev = equityCurve[equityCurve.indexOf(e) - 1];
    return prev ? e.cumulativePL - prev.cumulativePL : e.cumulativePL;
  })) : 0;

  const mostTradedPair = instrumentEntries.length > 0
    ? instrumentEntries.reduce((a, b) => a.pair > b.pair ? a : b) : null;
  const mostProfitablePair = instrumentEntries.length > 0
    ? instrumentEntries.reduce((a, b) => {
        const apl = (instrumentBreakdown[a.pair] as any)?.pl || 0;
        const bpl = (instrumentBreakdown[b.pair] as any)?.pl || 0;
        return apl > bpl ? a : b;
      }) : null;
  const leastProfitablePair = instrumentEntries.length > 0
    ? instrumentEntries.reduce((a, b) => {
        const apl = (instrumentBreakdown[a.pair] as any)?.pl || 0;
        const bpl = (instrumentBreakdown[b.pair] as any)?.pl || 0;
        return apl < bpl ? a : b;
      }) : null;

  const riskOfRuin = (() => {
    if (winRate <= 0 || profitFactor <= 0) return 100;
    const wr = winRate / 100;
    const lr = 1 - wr;
    if (lr === 0) return 0;
    const ratio = profitFactor > 0 ? (lr / wr) : 1;
    return Math.max(0, Math.min(100, Math.round(Math.pow(ratio, 10) * 100)));
  })();
  const rorStatus = riskOfRuin < 5 ? 'excellent' : riskOfRuin < 20 ? 'good' : riskOfRuin < 50 ? 'moderate' : 'high';

  const curvePoints = (() => {
    if (equityCurve.length === 0) return [];
    const maxPL = Math.max(...equityCurve.map((e: any) => Math.abs(e.cumulativePL)), 1);
    const W = 600; const H = 180;
    return equityCurve.map((e: any, i: number) => {
      const x = equityCurve.length > 1 ? (i / (equityCurve.length - 1)) * W : W / 2;
      const y = H - ((e.cumulativePL + maxPL) / (2 * maxPL)) * H;
      return [x, Math.max(0, Math.min(H, y))];
    });
  })();

  return (
    <div className="text-slate-200 selection:bg-blue-500/30" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        .font-poppins { font-family: 'Poppins', sans-serif; }
        .font-montserrat { font-family: 'Montserrat', sans-serif; }
        .font-outfit { font-family: 'Outfit', sans-serif; }
        @keyframes cardPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(0.98)} }
        .card-active { animation: cardPulse 0.3s ease-in-out; }
        .scroll-section { max-height: 420px; overflow-y: auto; }
        .scroll-section::-webkit-scrollbar { width: 3px; }
        .scroll-section::-webkit-scrollbar-track { background: transparent; }
        .scroll-section::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 4px; }
      `}</style>

      <div className="max-w-[1600px] mx-auto space-y-4">

        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { id: 'net-profit',      label: 'Total P&L',       value: formatPL(totalPL), color: totalPL >= 0 ? '#10b981' : '#f87171', iconBg: totalPL >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(248,113,113,0.12)',  iconPath: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
              { id: 'win-rate',        label: 'Win Rate',         value: `${Math.round(winRate)}%`,    color: '#60a5fa', iconBg: 'rgba(96,165,250,0.12)',   iconPath: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3' },
              { id: 'expectancy',      label: 'R Expectancy',     value: `${expectancy.toFixed(2)}R`,  color: '#fbbf24', iconBg: 'rgba(251,191,36,0.12)',   iconPath: 'M22 7 13.5 15.5 8.5 10.5 2 17M22 7h-5M22 7v5' },
              { id: 'trade-count',     label: 'Trades',           value: `${totalTrades}`,      color: '#e2e8f0', iconBg: 'rgba(148,163,184,0.10)', iconPath: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18' },
              { id: 'profit-factor',   label: 'Profit Factor',    value: profitFactor.toFixed(2),   color: '#c084fc', iconBg: 'rgba(192,132,252,0.12)', iconPath: 'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-8v4m0-8v.01' },
              { id: 'avg-rr',          label: 'Avg R:R',          value: `1:${avgRR.toFixed(1)}`,  color: '#34d399', iconBg: 'rgba(52,211,153,0.12)',  iconPath: 'M3 3v18h18M7 16l4-4 4 4 4-4' },
              { id: 'rules-adherence', label: 'Rules Adherence',  value: `${Math.round(rulesAdherence)}%`,    color: '#f87171', iconBg: 'rgba(248,113,113,0.12)', iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
            ].map(k => (
              <div key={k.id} onClick={() => handleCardClick(k.id)}
                style={{ background: '#0f152d', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}
                className={`p-2.5 shadow-lg cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 ${activeCard === k.id ? 'card-active' : ''}`}
                data-testid={`metric-kpi-${k.id}`}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
                  <div style={{ background: k.iconBg, borderRadius: '8px', padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={k.iconPath} />
                    </svg>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: '#475569', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif' }}>{k.label}</span>
                  <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: '#475569', fontWeight: 700, fontFamily: 'Montserrat, sans-serif' }}> : </span>
                  <span style={{ fontSize: '8px', letterSpacing: '0.05em', fontWeight: 900, color: k.color, fontFamily: 'Montserrat, sans-serif' }}>{k.value}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div onClick={() => handleCardClick('market-regime')} className={`group relative bg-slate-900/40 rounded-2xl p-6 border border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-blue-500/50 transition-all duration-500 overflow-hidden cursor-pointer hover:scale-[1.02] hover:shadow-[0_20px_60px_rgba(59,130,246,0.3)] active:scale-[0.98] ${activeCard === 'market-regime' ? 'card-active scale-[0.98]' : ''}`} data-testid="card-market-regime">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl -mr-10 -mt-10 group-hover:bg-blue-600/20 transition-colors duration-500" />
              <div className="flex items-center justify-between mb-6">
                <div className="p-2.5 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors duration-300">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-5 font-poppins group-hover:text-blue-400 transition-colors">Market Regime — Impact on Win</h2>
              <div className="space-y-3 font-montserrat">
                {[
                  { label: 'TRENDING', pct: 67, color: 'emerald' },
                  { label: 'RANGING',  pct: 38, color: 'rose' },
                  { label: 'VOLATILE', pct: 44, color: 'amber' },
                ].map((item, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{item.label}</span>
                      <span className={`text-xl font-black text-${item.color}-400`}>{item.pct}<span className="text-xs text-slate-500 ml-0.5">%</span></span>
                    </div>
                    <div className="w-full bg-slate-800 h-px border border-white/5">
                      <div className={`bg-${item.color}-500/80 h-full transition-all duration-500`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-white/5 space-y-1">
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mb-2">Volatility State — Impact on Win</p>
                  {[{ l: 'Low', v: 58 }, { l: 'Normal', v: 67 }, { l: 'High', v: 39 }].map((x, i) => (
                    <div key={i} className="flex justify-between items-center py-1.5 px-2 bg-slate-950/40 border border-white/5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{x.l}</span>
                      <span className={`text-xs font-black ${x.v >= 60 ? 'text-emerald-400' : x.v >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{x.v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div onClick={() => handleCardClick('execution')} className={`group relative bg-slate-900/40 rounded-2xl p-6 border border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-purple-500/50 transition-all duration-500 overflow-hidden cursor-pointer hover:scale-[1.02] hover:shadow-[0_20px_60px_rgba(168,85,247,0.3)] active:scale-[0.98] ${activeCard === 'execution' ? 'card-active scale-[0.98]' : ''}`} data-testid="card-execution">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-3xl -mr-10 -mt-10 group-hover:bg-purple-600/20 transition-colors duration-500" />
              <div className="flex items-center justify-between mb-6">
                <div className="p-2.5 bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors duration-300">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 font-poppins group-hover:text-purple-400 transition-colors">Execution Precision — Impact on Win</h2>
              <div className="space-y-1 font-montserrat scroll-section">
                <ImpactScoreRow label="Entry Precision" scores={[{score:'4.5',pct:70},{score:'4.0',pct:62},{score:'3.5',pct:51},{score:'3.0',pct:38}]} />
                <ImpactScoreRow label="Timing Quality" scores={[{score:'4.5',pct:72},{score:'4.0',pct:65},{score:'3.5',pct:54},{score:'3.0',pct:41}]} />
                <ImpactScoreRow label="Market Alignment" scores={[{score:'4.5',pct:75},{score:'4.0',pct:68},{score:'3.5',pct:57},{score:'3.0',pct:44}]} />
                <ImpactScoreRow label="Setup Clarity" scores={[{score:'4.5',pct:70},{score:'4.0',pct:63},{score:'3.5',pct:55},{score:'3.0',pct:43}]} />
                <ImpactScoreRow label="Confluence Score" scores={[{score:'4.5',pct:73},{score:'4.0',pct:66},{score:'3.5',pct:58},{score:'3.0',pct:45}]} />
                <ImpactScoreRow label="Signal Validation" scores={[{score:'4.5',pct:71},{score:'4.0',pct:64},{score:'3.5',pct:53},{score:'3.0',pct:42}]} />
                <div className="pt-2 border-t border-white/5 mt-2">
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mb-2">Planned vs Actual (Avg Pips)</p>
                  <ImpactStat label="Entry Deviation" value="+0.8 pips" highlight="text-emerald-400" />
                  <ImpactStat label="SL Deviation" value="-0.3 pips" highlight="text-amber-400" />
                  <ImpactStat label="TP Deviation" value="+1.2 pips" highlight="text-emerald-400" />
                </div>
                <div className="pt-2 border-t border-white/5 mt-2">
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mb-2">Breakeven Applied — Impact</p>
                  <div className="py-2 px-3 bg-slate-950/40 border border-white/5 mb-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Impact on Loss</div>
                    <div className="flex gap-2">
                      <div className="flex-1 text-center">
                        <div className="text-[9px] text-slate-600">Yes</div>
                        <div className="text-[11px] font-black text-emerald-400">39%</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-[9px] text-slate-600">No</div>
                        <div className="text-[11px] font-black text-rose-400">61%</div>
                      </div>
                    </div>
                  </div>
                  <div className="py-2 px-3 bg-slate-950/40 border border-white/5 mb-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Impact on Profit</div>
                    <div className="flex gap-2">
                      <div className="flex-1 text-center">
                        <div className="text-[9px] text-slate-600">Yes</div>
                        <div className="text-[11px] font-black text-emerald-400">56%</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-[9px] text-slate-600">No</div>
                        <div className="text-[11px] font-black text-amber-400">44%</div>
                      </div>
                    </div>
                  </div>
                  <MultiImpact label="Management Type — Impact on Win" options={[{label:'Rule-Based',pct:64},{label:'Discret.',pct:51},{label:'Hybrid',pct:58}]} />
                </div>
              </div>
            </div>

            <div onClick={() => handleCardClick('clarity')} className={`group relative bg-slate-900/40 rounded-2xl p-6 border border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-cyan-500/50 transition-all duration-500 overflow-hidden cursor-pointer hover:scale-[1.02] hover:shadow-[0_20px_60px_rgba(34,211,238,0.3)] active:scale-[0.98] ${activeCard === 'clarity' ? 'card-active scale-[0.98]' : ''}`} data-testid="card-clarity">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl -mr-10 -mt-10 group-hover:bg-cyan-600/20 transition-colors duration-500" />
              <div className="flex items-center justify-between mb-6">
                <div className="p-2.5 bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors duration-300">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 font-poppins group-hover:text-cyan-400 transition-colors">Clarity & Confluence — Impact on Win</h2>
              <div className="space-y-1 font-montserrat scroll-section">
                <MultiImpact label="Clarity Level — Impact on Win" options={[{label:'High',pct:69},{label:'Low',pct:46}]} />
                <ImpactStat label="Setup Clarity Avg — Impact on Win" value="68%" highlight="text-emerald-400" />
                <ImpactStat label="Confluence Avg — Impact on Win" value="66%" highlight="text-emerald-400" />
                <YesNoImpact label="MTF Alignment — Impact on Win" yes={70} no={43} />
                <YesNoImpact label="Trend Alignment — Impact on Win" yes={72} no={45} />
                <YesNoImpact label="HTF Key Level Present — Impact on Win" yes={74} no={48} />
                <YesNoImpact label="Key Level Respect — Impact on Win" yes={69} no={44} />
                <MultiImpact label="Key Level Type — Impact on Win" options={[{label:'Support',pct:63},{label:'Resist.',pct:60},{label:'Supply',pct:55},{label:'Demand',pct:67}]} />
                <YesNoImpact label="Momentum: Strong — Impact on Win" yes={71} no={46} />
                <ImpactScoreRow label="Momentum Score — Impact on Win" scores={[{score:'4.5',pct:73},{score:'4.0',pct:65},{score:'3.5',pct:56},{score:'3.0',pct:42}]} />
                <YesNoImpact label="Target Logic — Impact on Win" yes={68} no={47} />
                <MultiImpact label="Timing Context — Impact on Win" options={[{label:'Good',pct:66},{label:'Poor',pct:41}]} />
                <MultiImpact label="Order Type — Impact on Win" options={[{label:'Limit',pct:67},{label:'Market',pct:52},{label:'Stop',pct:49}]} />
              </div>
            </div>

            <div onClick={() => handleCardClick('psychology')} className={`group relative bg-slate-900/40 rounded-2xl p-6 border border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-rose-500/50 transition-all duration-500 overflow-hidden cursor-pointer hover:scale-[1.02] hover:shadow-[0_20px_60px_rgba(244,63,94,0.3)] active:scale-[0.98] ${activeCard === 'psychology' ? 'card-active scale-[0.98]' : ''}`} data-testid="card-psychology">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-600/5 blur-3xl -mr-10 -mt-10 group-hover:bg-rose-600/20 transition-colors duration-500" />
              <div className="flex items-center justify-between mb-6">
                <div className="p-2.5 bg-rose-500/10 group-hover:bg-rose-500/20 transition-colors duration-300">
                  <Brain className="w-5 h-5 text-rose-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-rose-400 group-hover:translate-x-1 transition-all" />
              </div>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 font-poppins group-hover:text-rose-400 transition-colors">Psychology & Discipline — Impact on Win</h2>
              <div className="space-y-1 font-montserrat scroll-section">
                <MultiImpact label="Discipline Score" options={[{label:'Score',pct:psychology.discipline || 0}]} />
                <MultiImpact label="Patience Score" options={[{label:'Score',pct:psychology.patience || 0}]} />
                <MultiImpact label="Consistency Score" options={[{label:'Score',pct:psychology.consistency || 0}]} />
                <MultiImpact label="Rules Followed — Impact on Win/Loss" options={[{label:'High',pct:71},{label:'Low',pct:38}]} />
                <MultiImpact label="Confidence — Impact on Win/Loss" options={[{label:'High',pct:69},{label:'Low',pct:42}]} />
                <MultiImpact label="Energy Level — Impact on Win/Loss" options={[{label:'High',pct:65},{label:'Low',pct:44}]} />
                <MultiImpact label="Focus Level — Impact on Win" options={[{label:'High',pct:70},{label:'Low',pct:43}]} />
                <MultiImpact label="Confidence at Entry — Impact on Win" options={[{label:'High',pct:68},{label:'Low',pct:46}]} />
                <MultiImpact label="Emotional State — Impact on Win" options={[{label:'Calm',pct:66},{label:'Emotional',pct:39}]} />
                <YesNoImpact label="External Distraction — Impact on Win" yes={41} no={64} />
                <YesNoImpact label="Setup Fully Valid — Impact on Win" yes={72} no={37} />
                <YesNoImpact label="Any Rule Broken — Impact on Win" yes={35} no={68} />
                <YesNoImpact label="FOMO Trades — Impact on Win" yes={28} no={66} />
                <YesNoImpact label="Revenge Trades — Impact on Win" yes={24} no={65} />
                <YesNoImpact label="Boredom Trades — Impact on Win" yes={33} no={64} />
                <YesNoImpact label="Emotional Trades — Impact on Win" yes={31} no={67} />
                <MultiImpact label="Emotional Edge — Impact on Win" options={[{label:'Stable',pct:69},{label:'Unstable',pct:36}]} />
                <MultiImpact label="Focus State — Impact on Win" options={[{label:'Focused',pct:71},{label:'Unfocused',pct:40}]} />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div onClick={() => handleCardClick('direction')} className={cardBase('direction')} data-testid="card-direction">
              <CardHeader icon={Compass} title="Direction Bias — Impact on Win" />
              <div className="p-5 space-y-1 scroll-section">
                <MultiImpact label="Trade Direction — Impact on Win" options={[{label:'Long',pct:longWR},{label:'Short',pct:shortWR}]} />
                <ImpactStat label="Avg Win (Long)" value={avgWinLong > 0 ? `$${avgWinLong}` : '--'} highlight="text-emerald-400" />
                <ImpactStat label="Avg Win (Short)" value={avgWinShort > 0 ? `$${avgWinShort}` : '--'} highlight="text-emerald-400" />
                <ImpactStat label="Avg Loss (Long)" value={avgLossLong > 0 ? `-$${avgLossLong}` : '--'} highlight="text-rose-400" />
                <ImpactStat label="Avg Loss (Short)" value={avgLossShort > 0 ? `-$${avgLossShort}` : '--'} highlight="text-rose-400" />
                <ImpactStat label="Long Trades" value={`${longTrades}`} />
                <ImpactStat label="Short Trades" value={`${shortTrades}`} />
              </div>
            </div>

            <div onClick={() => handleCardClick('setup-tags')} className={cardBase('setup-tags', 'emerald')} data-testid="card-setup-tags">
              <CardHeader icon={Layers} title="Setup Tags — Impact on Win" color="emerald" />
              <div className="p-5 space-y-1 scroll-section">
                {setupEntries.length > 0 ? setupEntries.map((s, i) => (
                  <div key={i} className="flex justify-between items-center py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{s.name}</span>
                    <div className="flex gap-2 items-center">
                      <span className={`text-xs font-black ${s.wr >= 65 ? 'text-emerald-400' : s.wr >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{Math.round(s.wr)}%</span>
                      <span className="text-[9px] text-slate-600">({s.count})</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-[10px] text-slate-600 text-center py-4">No setup data available</div>
                )}
              </div>
            </div>

            <div onClick={() => handleCardClick('grade')} className={cardBase('grade', 'amber')} data-testid="card-grade">
              <CardHeader icon={Award} title="Trade Grade — Distribution" color="amber" />
              <div className="p-5 space-y-1 scroll-section">
                {gradeEntries.map((g, i) => {
                  const pct = totalGraded > 0 ? Math.round((g.count / totalGraded) * 100) : 0;
                  return (
                    <div key={i} className="py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-sm font-black text-${g.color}-400`}>{g.grade}</span>
                        <div className="flex gap-2 items-center">
                          <span className={`text-xs font-black text-${g.color}-400`}>{pct}%</span>
                          <span className="text-[9px] text-slate-600">({g.count})</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 h-px">
                        <div className={`h-full bg-${g.color}-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div onClick={() => handleCardClick('exit')} className={cardBase('exit', 'violet')} data-testid="card-exit">
              <CardHeader icon={DoorOpen} title="Exit Analysis" color="violet" />
              <div className="p-5 space-y-1 scroll-section">
                {exitEntries.length > 0 ? (
                  <MultiImpact label="Exit Type — Win Rate" options={exitEntries.map(e => ({ label: e.label, pct: e.pct }))} />
                ) : (
                  <div className="text-[10px] text-slate-600 text-center py-4">No exit data available</div>
                )}
                <ImpactStat label="Avg MAE" value={riskMetrics.avgMAE ? `${riskMetrics.avgMAE}` : '--'} highlight="text-rose-400" />
                <ImpactStat label="Avg MFE" value={riskMetrics.avgMFE ? `${riskMetrics.avgMFE}` : '--'} highlight="text-emerald-400" />
                <ImpactStat label="Avg R:R" value={`1:${avgRR.toFixed(1)}`} highlight="text-emerald-400" />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div onClick={() => handleCardClick('session')} className={cardBase('session', 'blue')} data-testid="card-session">
              <CardHeader icon={Globe} title="Session — Impact on Win" />
              <div className="p-5 space-y-1 scroll-section">
                {sessionEntries.length > 0 ? (
                  <MultiImpact label="Session — Win Rate" options={sessionEntries} />
                ) : (
                  <div className="text-[10px] text-slate-600 text-center py-4">No session data available</div>
                )}
                <ImpactStat label="Best Day" value={bestDay} highlight="text-emerald-400" />
                <ImpactStat label="Worst Day" value={worstDay} highlight="text-rose-400" />
                {dayEntries.length > 0 && (
                  <MultiImpact label="Day of Week — Win Rate" options={dayEntries} />
                )}
              </div>
            </div>

            <div onClick={() => handleCardClick('instrument')} className={cardBase('instrument', 'emerald')} data-testid="card-instrument">
              <CardHeader icon={BarChart2} title="Instrument — Impact on Win" color="emerald" />
              <div className="p-5 space-y-1 scroll-section">
                {instrumentEntries.length > 0 ? instrumentEntries.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{p.pair}</span>
                    <div className="flex gap-3 items-center">
                      <span className={`text-[11px] font-black ${p.pct >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{Math.round(p.pct)}%</span>
                      <span className={`text-[10px] font-bold ${p.pl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{p.pl}</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-[10px] text-slate-600 text-center py-4">No instrument data available</div>
                )}
              </div>
            </div>

            <div onClick={() => handleCardClick('risk')} className={cardBase('risk', 'amber')} data-testid="card-risk">
              <CardHeader icon={Shield} title="Risk — Impact on Win" color="amber" />
              <div className="p-5 space-y-1 scroll-section">
                <ImpactStat label="Avg Risk per Trade" value={riskMetrics.avgRiskPercent ? `${riskMetrics.avgRiskPercent}%` : '--'} highlight="text-amber-400" />
                <ImpactStat label="Max Drawdown" value={maxDD !== 0 ? formatPL(maxDD) : '--'} highlight="text-rose-400" />
                <ImpactStat label="Max Risk" value={riskMetrics.maxRiskPercent ? `${riskMetrics.maxRiskPercent}%` : '--'} highlight="text-rose-400" />
                <ImpactStat label="Avg Planned RR" value={`1:${avgRR.toFixed(1)}`} />
                <ImpactStat label="Profit Factor" value={profitFactor.toFixed(2)} highlight="text-emerald-400" />
              </div>
            </div>

            <div onClick={() => handleCardClick('rules')} className={cardBase('rules', 'rose')} data-testid="card-rules">
              <CardHeader icon={ShieldCheck} title="Rules & Discipline" color="rose" />
              <div className="p-5 space-y-1 scroll-section">
                <ImpactStat label="Overall Adherence" value={`${Math.round(rulesAdherence)}%`} highlight={rulesAdherence >= 80 ? 'text-emerald-400' : rulesAdherence >= 50 ? 'text-amber-400' : 'text-rose-400'} />
                <ImpactStat label="Discipline" value={`${psychology.discipline || 0}%`} highlight={psychology.discipline >= 70 ? 'text-emerald-400' : 'text-amber-400'} />
                <ImpactStat label="Patience" value={`${psychology.patience || 0}%`} highlight={psychology.patience >= 70 ? 'text-emerald-400' : 'text-amber-400'} />
                <ImpactStat label="Consistency" value={`${psychology.consistency || 0}%`} highlight={psychology.consistency >= 70 ? 'text-emerald-400' : 'text-amber-400'} />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div onClick={() => handleCardClick('news')} className={cardBase('news')} data-testid="card-news">
              <CardHeader icon={Globe} title="News & Events — Impact on Win" />
              <div className="p-5 space-y-1 scroll-section">
                <YesNoImpact label="News Event Around Trade — Impact on Win" yes={48} no={66} />
                <MultiImpact label="News Impact — Impact on Win" options={[{label:'High',pct:42},{label:'Medium',pct:58},{label:'Low',pct:67}]} />
                <ImpactStat label="Avg Slippage (News)" value="2.3 pips" highlight="text-rose-400" />
                <ImpactStat label="Avg Slippage (No News)" value="0.4 pips" highlight="text-emerald-400" />
              </div>
            </div>

            <div onClick={() => handleCardClick('timeframe')} className={cardBase('timeframe', 'violet')} data-testid="card-timeframe">
              <CardHeader icon={Timer} title="Timeframe — Impact on Win" color="violet" />
              <div className="p-5 space-y-1 scroll-section">
                {tfEntries.length > 0 ? (
                  <MultiImpact label="Entry TF — Win Rate" options={tfEntries} />
                ) : (
                  <div className="text-[10px] text-slate-600 text-center py-4">No timeframe data available</div>
                )}
              </div>
            </div>

            <div onClick={() => handleCardClick('strategy')} className={cardBase('strategy', 'cyan')} data-testid="card-strategy">
              <CardHeader icon={Target} title="Strategy — Impact on Win" color="cyan" />
              <div className="p-5 space-y-1 scroll-section">
                {strategyEntries.length > 0 ? strategyEntries.map((s, i) => (
                  <div key={i} className="py-3 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{s.name}</span>
                      <span className={`text-xs font-black ${s.rawPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.pl}</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-600 mb-0.5">Win Rate</div>
                        <div className={`text-[11px] font-black ${s.wr >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{Math.round(s.wr)}%</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-600 mb-0.5">Trades</div>
                        <div className="text-[11px] font-black text-slate-300">{s.trades}</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-[10px] text-slate-600 text-center py-4">No strategy data available</div>
                )}
                <div className="pt-2 border-t border-white/5 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Filter className="w-3 h-3 text-cyan-400" />
                    <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Strategy Filter</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {strategies.map(s => (
                      <button key={s} onClick={(e) => { e.stopPropagation(); setSelectedStrategy(s); }}
                        className={`px-2 py-1 text-[8px] font-black uppercase tracking-wider transition-all ${selectedStrategy === s ? 'bg-cyan-600 text-white' : 'bg-slate-800/60 text-slate-500 hover:text-cyan-400'}`}
                        data-testid={`button-strategy-${s.toLowerCase().replace(/\s/g, '-')}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div onClick={() => handleCardClick('misc')} className={cardBase('misc', 'pink')} data-testid="card-misc">
              <CardHeader icon={Layers} title="Misc Insights" color="pink" />
              <div className="p-5 space-y-1 scroll-section">
                <ImpactStat label="Total Trades" value={`${totalTrades}`} />
                <ImpactStat label="Best Trade" value={bestTradePL > 0 ? formatPL(bestTradePL) : '--'} highlight="text-emerald-400" />
                <ImpactStat label="Worst Trade" value={worstTradePL < 0 ? formatPL(worstTradePL) : '--'} highlight="text-rose-400" />
                <ImpactStat label="Most Traded Pair" value={mostTradedPair?.pair || '--'} highlight="text-blue-400" />
                <ImpactStat label="Most Profitable" value={mostProfitablePair?.pair || '--'} highlight="text-emerald-400" />
                <ImpactStat label="Least Profitable" value={leastProfitablePair?.pair || '--'} highlight="text-rose-400" />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div onClick={() => handleCardClick('drawdown')} className={cardBase('drawdown', 'rose')} data-testid="card-drawdown">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-rose-500/10 rounded-xl"><TrendingDown className="w-4 h-4 text-rose-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-rose-400/80">Drawdown</span>
                </div>
                <div className="space-y-4">
                  {[
                    { label: 'Max DD', value: maxDD !== 0 ? formatPL(maxDD) : '$0', sub: '', color: 'text-rose-400' },
                    { label: 'Total P/L', value: formatPL(totalPL), sub: '', color: totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400' },
                    { label: 'Gross Profit', value: formatPL(core.grossProfit || 0), sub: '', color: 'text-emerald-400' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center py-3 px-4 bg-slate-950/50 rounded-xl border border-white/5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</span>
                      <div className="text-right">
                        <div className={`text-sm font-black ${item.color}`}>{item.value}</div>
                        {item.sub && <div className="text-[9px] text-slate-600 mt-0.5">{item.sub}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div onClick={() => handleCardClick('winloss')} className={cardBase('winloss')}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-xl"><BarChart3 className="w-4 h-4 text-blue-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-400/80">Avg Win / Loss</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Avg Win</div>
                    <div className="text-lg font-semibold text-emerald-400">${Math.round(avgWin).toLocaleString()}</div>
                  </div>
                  <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Avg Loss</div>
                    <div className="text-lg font-semibold text-rose-400">${Math.round(avgLoss).toLocaleString()}</div>
                  </div>
                </div>
                <div className="bg-slate-950/50 rounded-xl border border-white/5 p-4 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Win / Loss Ratio</span>
                    <span className="text-sm font-semibold text-blue-400">{winLossRatio}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Wins</div>
                    <div className="text-xl font-semibold text-emerald-400">{wins}</div>
                  </div>
                  <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl p-3 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Losses</div>
                    <div className="text-xl font-semibold text-rose-400">{losses}</div>
                  </div>
                </div>
              </div>
            </div>

            <div onClick={() => handleCardClick('streaks')} className={cardBase('streaks', 'purple')}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-500/10 rounded-xl"><Activity className="w-4 h-4 text-purple-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-purple-400/80">Streaks</span>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex justify-between items-center">
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Longest Win</div>
                      <div className="text-[10px] font-bold text-emerald-400/70">Streak</div>
                    </div>
                    <div className="text-2xl font-semibold text-emerald-400">{streaks.maxWinStreak || 0}</div>
                  </div>
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex justify-between items-center">
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Longest Loss</div>
                      <div className="text-[10px] font-bold text-rose-400/70">Streak</div>
                    </div>
                    <div className="text-2xl font-semibold text-rose-400">{streaks.maxLossStreak || 0}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950/50 p-4">
                  <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-3">Current Streak</div>
                  <div className="flex gap-3">
                    <div className={`flex-1 rounded-lg ${streaks.currentStreakType === 'win' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'} border p-3 text-center`}>
                      <div className="text-[9px] text-slate-500 uppercase mb-1">Status</div>
                      <div className={`text-sm font-black italic ${streaks.currentStreakType === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>{streaks.currentStreakType || '--'}</div>
                    </div>
                    <div className="flex-1 rounded-lg bg-slate-800/40 border border-slate-700/30 p-3 text-center">
                      <div className="text-[9px] text-slate-500 uppercase mb-1">Count</div>
                      <div className="text-sm font-black text-white">{streaks.currentStreakCount || 0}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div onClick={() => handleCardClick('recovery')} className={cardBase('recovery')}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-cyan-500/10 rounded-xl"><RefreshCcw className="w-4 h-4 text-cyan-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400/80">Recovery</span>
                </div>
                <div className="flex flex-col items-center justify-center mb-6">
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Recovery Sequences</div>
                  <div className="text-3xl font-semibold text-cyan-400 mb-1">{streaks.recoverySequences || 0}</div>
                  <div className="text-[9px] text-slate-600">loss sequences encountered</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-950/50 border border-white/5 p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Max DD</div>
                    <div className="text-xl font-semibold text-rose-400">{maxDD !== 0 ? formatPL(maxDD) : '$0'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-950/50 border border-white/5 p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Wins</div>
                    <div className="text-xl font-semibold text-emerald-400">{wins}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {(() => {
              const H = 180; const W = 600;
              const pts = curvePoints.length >= 2 ? curvePoints : [[0, H/2], [W, H/2]];
              const curvePath = pts.reduce((acc: string, [x, y]: number[], i: number) => {
                if (i === 0) return `M ${x} ${y}`;
                const [px, py] = pts[i - 1];
                const cx1 = px + (x - px) / 2; const cy1 = py;
                const cx2 = px + (x - px) / 2; const cy2 = y;
                return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x} ${y}`;
              }, '');
              const fillPath = `${curvePath} L ${pts[pts.length-1][0]} ${H} L ${pts[0][0]} ${H} Z`;
              const lastPt = pts[pts.length - 1];
              const curveLabels = equityCurve.length > 0
                ? equityCurve.filter((_: any, i: number) => {
                    const step = Math.max(1, Math.floor(equityCurve.length / 5));
                    return i % step === 0 || i === equityCurve.length - 1;
                  }).map((e: any) => `#${e.tradeNumber}`)
                : ['--'];
              return (
                <div className="lg:col-span-2 bg-[#07091a] rounded-2xl border border-slate-800/60 shadow-2xl hover:border-violet-500/40 hover:shadow-[0_20px_60px_rgba(139,92,246,0.2)] transition-all duration-300">
                  <div className="flex items-center justify-between px-6 pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-violet-500/10">
                        <TrendingUp className="w-4 h-4 text-violet-400" />
                      </div>
                      <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-violet-400/90">Equity Curve</h2>
                    </div>
                  </div>
                  <div className="px-6 pb-2">
                    <div className="relative" style={{ height: `${H + 36}px` }}>
                      <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between pr-3">
                        {(() => {
                          if (equityCurve.length === 0) return ['0','0','0','0'].map((l,i) => (
                            <span key={i} className="text-[10px] text-slate-600 font-mono">{l}</span>
                          ));
                          const maxPL = Math.max(...equityCurve.map((e: any) => e.cumulativePL));
                          const minPL = Math.min(...equityCurve.map((e: any) => e.cumulativePL));
                          const range = maxPL - minPL || 1;
                          return [maxPL, maxPL - range*0.33, maxPL - range*0.66, minPL].map((l,i) => (
                            <span key={i} className="text-[10px] text-slate-600 font-mono">{Math.round(l)}</span>
                          ));
                        })()}
                      </div>
                      <div className="absolute left-10 right-0 top-0 bottom-8">
                        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="metricsVioletGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.5" />
                              <stop offset="70%"  stopColor="#4c1d95" stopOpacity="0.1" />
                              <stop offset="100%" stopColor="#0f0a2a" stopOpacity="0.0" />
                            </linearGradient>
                            <filter id="metricsLineGlow">
                              <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                              <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                            <filter id="metricsDotGlow">
                              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                              <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                          </defs>
                          {[0, 0.33, 0.66, 1].map((p,i) => (
                            <line key={i} x1="0" y1={p*H} x2={W} y2={p*H} stroke="#1e293b" strokeWidth="1" strokeDasharray="5 5" />
                          ))}
                          <path d={fillPath} fill="url(#metricsVioletGrad)" />
                          <path d={curvePath} fill="none" stroke="#a78bfa" strokeWidth="2.5" filter="url(#metricsLineGlow)" />
                          <circle cx={lastPt[0]} cy={lastPt[1]} r="7" fill="#7c3aed" opacity="0.4" filter="url(#metricsDotGlow)" />
                          <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill="#a78bfa" filter="url(#metricsLineGlow)" />
                          <circle cx={lastPt[0]} cy={lastPt[1]} r="2" fill="white" />
                        </svg>
                        <div className="absolute -bottom-7 left-0 right-0 flex justify-between">
                          {curveLabels.map((l: string, i: number) => (
                            <span key={i} className="text-[10px] text-slate-500 font-mono">{l}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 mt-6 border-t border-slate-800/40">
                    {[
                      {l:'Total P/L',v:formatPL(totalPL),c:totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'},
                      {l:'Win Rate',v:`${Math.round(winRate)}%`,c:'text-violet-400'},
                      {l:'Profit Factor',v:profitFactor.toFixed(2),c:'text-violet-400'}
                    ].map((x,i)=>(
                      <div key={i} className={`text-center py-4 hover:bg-slate-800/20 transition-colors ${i < 2 ? 'border-r border-slate-800/40' : ''}`}>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{x.l}</div>
                        <div className={`text-base font-black ${x.c}`}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div onClick={() => handleCardClick('ror')} className={cardBase('ror', 'amber')}>
              <CardHeader icon={Brain} title="Risk of Ruin" desc="Probability of losing entire account based on current stats." color="amber" />
              <div className="p-6 space-y-6 scroll-section">
                <div className="flex justify-center">
                  <div className="relative w-40 h-40">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="80" cy="80" r="70" fill="none" stroke="#1e293b" strokeWidth="12" />
                      <circle cx="80" cy="80" r="70" fill="none" stroke={riskOfRuin < 20 ? '#10b981' : riskOfRuin < 50 ? '#fbbf24' : '#f87171'} strokeWidth="12" strokeDasharray="440" strokeDashoffset={440 - (riskOfRuin / 100) * 440} className="drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className={`text-xl font-semibold ${riskOfRuin < 20 ? 'text-emerald-400' : riskOfRuin < 50 ? 'text-amber-400' : 'text-rose-400'}`}>{riskOfRuin}%</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider">Risk</div>
                    </div>
                  </div>
                </div>
                {[
                  {l:'Win Rate',v:`${Math.round(winRate)}%`},
                  {l:'Risk per Trade',v:riskMetrics.avgRiskPercent ? `${riskMetrics.avgRiskPercent}%` : '1.0%'},
                  {l:'Profit Factor',v:profitFactor.toFixed(2)},
                ].map((item,i)=>(
                  <div key={i} className="flex justify-between items-center p-3 bg-slate-800/20 border border-slate-800/40 hover:bg-slate-800/40 transition-all cursor-pointer">
                    <span className="text-xs font-semibold text-slate-400">{item.l}</span>
                    <span className="text-sm font-black text-white">{item.v}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-white/5 text-center p-3 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                  <div className="text-xs text-emerald-400 mb-1">Risk Status</div>
                  <div className={`text-sm font-black italic ${rorStatus === 'excellent' ? 'text-blue-400' : rorStatus === 'good' ? 'text-emerald-400' : rorStatus === 'moderate' ? 'text-amber-400' : 'text-rose-400'}`}>{rorStatus}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div onClick={() => handleCardClick('strat-perf')} className={`bg-[#0f152d] rounded-2xl border border-slate-800/60 shadow-2xl cursor-pointer transition-all duration-300 hover:scale-[1.005] hover:border-blue-400/50 hover:shadow-[0_20px_60px_rgba(59,130,246,0.25)] active:scale-[0.995] ${activeCard === 'strat-perf' ? 'card-active' : ''}`} data-testid="card-strat-perf">
            <div className="p-5 border-b border-slate-800/40 bg-slate-900/20">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-black uppercase tracking-wide text-blue-400 font-montserrat">Strategy Performance</h2>
              </div>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/40">
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-400">Strategy</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-blue-400">Win Rate</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-blue-400">Trades</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-amber-400">Wins</th>
                    <th className="text-right py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-400">Net P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyEntries.length > 0 ? strategyEntries.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/30 transition-colors cursor-pointer">
                      <td className="py-4 px-4 text-sm font-semibold text-white">{row.name}</td>
                      <td className={`py-4 px-4 text-sm font-bold ${row.wr >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{Math.round(row.wr)}%</td>
                      <td className="py-4 px-4 text-sm font-bold text-slate-400">{row.trades}</td>
                      <td className="py-4 px-4 text-sm font-bold text-emerald-400">{(strategyPerformance[row.name] as any)?.wins || 0}</td>
                      <td className={`py-4 px-4 text-right text-lg font-black ${row.rawPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.pl}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-600 text-sm">No strategy data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section>
          <div onClick={() => handleCardClick('setup-freq')} className={`bg-[#0f152d] rounded-2xl border border-slate-800/60 shadow-2xl cursor-pointer transition-all duration-300 hover:scale-[1.005] hover:border-cyan-400/50 hover:shadow-[0_20px_60px_rgba(34,211,238,0.2)] active:scale-[0.995] ${activeCard === 'setup-freq' ? 'card-active' : ''}`} data-testid="card-setup-freq">
            <div className="p-5 border-b border-slate-800/40 bg-slate-900/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-wide text-cyan-400 font-montserrat">Setup Occurrence Frequency</h2>
              </div>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/40">
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-400">Setup</th>
                    <th className="text-center py-3 px-4 text-xs font-black uppercase tracking-wider text-cyan-400">Count</th>
                    <th className="text-center py-3 px-4 text-xs font-black uppercase tracking-wider text-amber-400">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {setupEntries.length > 0 ? setupEntries.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/30 transition-colors cursor-pointer group">
                      <td className="py-4 px-4 text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">{row.name}</td>
                      <td className="py-4 px-4 text-center"><span className="text-sm font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">{row.count}</span></td>
                      <td className={`py-4 px-4 text-center text-sm font-black ${row.wr >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{Math.round(row.wr)}%</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-600 text-sm">No setup data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
