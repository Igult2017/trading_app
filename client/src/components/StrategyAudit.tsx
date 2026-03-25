import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  AlertTriangle,
  Brain,
  Database,
  Activity,
  Target,
  ShieldCheck,
  Zap,
  PlusCircle,
  Clock,
  Settings,
  Cpu,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types  (matching output_shaper.py shape_output exactly)
// ─────────────────────────────────────────────────────────────────────────────

interface AuditData {
  success: boolean;
  error?: string;

  auditSummary: {
    winRate: number;
    edgePersistence: number;
    riskEntropy: string;
    aiConfidence: number;
    sampleSize: number;
    edgeVerdict: string;
    confidence: number;
    grade: string;
    gradeSummary: string;
  };

  executiveSummary: string;

  edgeVerdict: {
    verdict: string;
    confidence: number;
    sampleSize: number;
    profitFactor: number;
    expectancy: number;
  };

  edgeDrivers: Array<{ factor: string; winRateWithFactor: number; winRateWithout: number; lift: number }>;
  monitorItems: Array<{ label: string; status: string; priority: string }>;
  weaknesses: Array<{ factor: string; winRateWithFactor: number; impact: number }>;

  instruments: string[];
  winFactors: string[];
  lossFactors: string[];
  winCorrelations: Record<string, number[]>;
  lossCorrelations: Record<string, number[]>;

  variance: { winRate: number; sampleSize: number; winLossRatio: number; positiveSkew: boolean; stdDev: number; skewness: number };
  drawdown: { maxPeakToValley: number; recovery: number; stagnation: number; calmarRatio: number; ulcerIndex: number };
  equityVariance: { simulationConfidence: number; varianceSkew: number; maxCluster: number; bestMonth: number; worstMonth: number; mcBars: number[] };

  auditScope: { totalTrades: number; statisticalSignificance: number };

  tradeQuality: {
    aTrades: { count: number; profit: number };
    bTrades: { count: number; profit: number };
    cTrades: { count: number; profit: number };
  };

  conditionalEdge: {
    liquidityGap: { label: string; rMultiple: number; samples: number; winRate: number };
    nonQualified:  { label: string; rMultiple: number; samples: number; winRate: number };
  };
  edgeTransferability: number;

  coreRobustness: { ruleStability: number; executionAdherence: number; monteCarloStability: number };

  probabilisticEdge: { baseRate: number; kelly: number; avgWin: number; avgLoss: number };

  riskMetrics: { maxLossStreak: number; fiveLossProbability: number; timeInDrawdown: number };

  edgeComponents: { winRateContribution: number; riskRewardContribution: number };

  lossCluster: { avgLength: number; worstDD: number; clusterFrequency: number; clusterDates: string[] };

  executionAsymmetry: {
    avgWinRR: number; avgLossRR: number; asymmetryScore: number;
    slippageWins: number; slippageLosses: number; earlyExitRate: number; lateEntryRate: number;
  };

  regimeTransition: {
    trendingWinRate: number; rangingWinRate: number; breakoutWinRate: number;
    regimeDetectionAccuracy: number; avgTransitionDD: number; recoveryTrades: number;
  };

  capitalHeat: {
    avgRiskPerTrade: number; maxRiskPerTrade: number; riskConsistencyScore: number;
    correlatedExposure: string[]; peakEquityAtRisk: number; timeAtPeak: number;
  };

  automationRisk: { score: number; issues: string[]; label: string };

  psychologyScore: number;
  disciplineScore: number;

  edgeDecay: { last50: number; last200: number; detected: boolean; magnitude: number; recommendation: string; trend: string };

  aiPolicySuggestions: Array<{ rule: string; rationale: string; expectedImpact: string }>;
  guardrails: Array<{ label: string; value: string; action: string; status: string }>;

  finalVerdict: { grade: string; summary: string; strengths: string[]; weaknesses: string[]; nextActions: string[]; authorized: boolean };

  logicalVerification: {
    regime: string; entryLogic: string; exitLogic: string; scalingProperties: string;
    sessionDependency: string; behavioralFit: string; forwardConfirmation: string;
  };

  sessionEdge: Record<string, { trades: number; winRate: number; profitFactor: number }>;
  heatmapProfiles: Array<{ instrument: string; strategy: string; winRate: number; trades: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAudit(sessionId?: string, userId?: string): Promise<AuditData> {
  const p = new URLSearchParams();
  if (sessionId) p.set('sessionId', sessionId);
  if (userId)    p.set('userId', userId);
  const res = await fetch(`/api/strategy-audit/compute?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props { sessionId?: string; userId?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function StrategyAudit({ sessionId, userId }: Props) {
  const [activeLevel, setActiveLevel] = useState(1);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<AuditData>({
    queryKey: ['strategyAudit', sessionId, userId],
    queryFn:  () => fetchAudit(sessionId, userId),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  // ── Icons ────────────────────────────────────────────────────────────────

  const ChessGearIcon = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 18 L54 10 L58 10 L58 18 Q65 20 70 25 L78 22 L81 25 L76 32 Q80 38 80 45 L88 49 L88 53 L80 57 Q80 64 76 70 L81 77 L78 80 L70 77 Q65 82 58 84 L58 92 L54 92 L50 84 L46 92 L42 92 L42 84 Q35 82 30 77 L22 80 L19 77 L24 70 Q20 64 20 57 L12 53 L12 49 L20 45 Q20 38 24 32 L19 25 L22 22 L30 25 Q35 20 42 18 L42 10 L46 10 Z" fill="none"/>
      <circle cx="50" cy="51" r="18" fill="none"/>
      <rect x="36" y="72" width="28" height="5" rx="1"/><rect x="38" y="50" width="24" height="22" rx="1"/>
      <rect x="36" y="42" width="6" height="10" rx="1"/><rect x="47" y="42" width="6" height="10" rx="1"/>
      <rect x="58" y="42" width="6" height="10" rx="1"/><line x1="30" y1="77" x2="70" y2="77"/>
    </svg>
  );

  const TargetIcon = () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
    </svg>
  );

  const DiceIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="3"/>
      <circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
    </svg>
  );

  const LayersIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 22 8.5 12 15 2 8.5"/>
      <polyline points="2 15.5 12 22 22 15.5"/>
      <polyline points="2 12 12 18.5 22 12"/>
    </svg>
  );

  const levels = [
    { id: 1, label: 'STRATEGY AUDIT',   icon: <ChessGearIcon size={14} /> },
    { id: 2, label: 'EVIDENCE & PROOF', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 3, label: 'DIAGNOSTICS',      icon: <TargetIcon /> },
    { id: 4, label: 'ACTION & ITERATION', icon: <PlusCircle className="w-3.5 h-3.5" /> },
  ];

  const F = { fontFamily: "'Montserrat', sans-serif" };

  // ── Loading / Error states ──────────────────────────────────────────────

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-6" style={F}>
      <div className="relative">
        <div className="w-16 h-16 bg-blue-600 rounded-none flex items-center justify-center shadow-lg shadow-blue-900/40">
          <Cpu className="w-8 h-8 text-white"/>
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-none border-2 border-slate-950 animate-pulse"/>
      </div>
      <div className="text-center space-y-2">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin"/>
          <span className="text-sm font-black uppercase tracking-widest text-slate-300">Running Strategy Audit</span>
        </div>
        <p className="text-xs text-slate-500 font-medium">Python engine analysing trades…</p>
      </div>
    </div>
  );

  if (isError || (data && !data.success)) {
    const msg = (error as Error)?.message ?? data?.error ?? 'Unknown error';
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-6" style={F}>
        <WifiOff className="w-12 h-12 text-red-400"/>
        <div className="text-center space-y-2">
          <p className="text-sm font-black uppercase tracking-widest text-red-400">Audit Engine Error</p>
          <p className="text-xs text-slate-400 font-medium max-w-sm">{msg}</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-none hover:bg-blue-500 transition-all">
          <RefreshCw className="w-3.5 h-3.5"/> Retry
        </button>
      </div>
    );
  }

  // Shorthand refs — data is guaranteed non-null here
  const d = data!;
  const verdict        = d.edgeVerdict?.verdict ?? 'Unconfirmed';
  const verdictColor   = verdict === 'Confirmed' ? 'text-emerald-400' : verdict === 'Marginal' ? 'text-yellow-400' : 'text-red-400';
  const verdictBar     = verdict === 'Confirmed' ? 88 : verdict === 'Marginal' ? 55 : 22;
  const verdictLabel   = verdict === 'Confirmed' ? 'YES' : verdict === 'Marginal' ? 'MAYBE' : 'NO';
  const verdictBarClr  = verdict === 'Confirmed' ? 'bg-emerald-500' : verdict === 'Marginal' ? 'bg-yellow-500' : 'bg-red-500';
  const grade          = d.finalVerdict?.grade ?? 'N/A';
  const gradeColor     = ['A','B'].includes(grade) ? 'text-emerald-400' : grade === 'C' ? 'text-yellow-400' : 'text-red-400';
  const autoLabel      = d.automationRisk?.label ?? 'LOW RISK';
  const autoColor      = autoLabel === 'LOW RISK' ? 'text-yellow-400' : autoLabel === 'MEDIUM RISK' ? 'text-orange-400' : 'text-red-400';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30" style={F}>

      {/* ── HEADER (nav + KPI strip) ────────────────────────────────── */}
      <nav className="border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl"
        style={{ boxShadow: '0 1px 0 rgba(59,130,246,0.08), 0 4px 24px rgba(0,0,0,0.4)' }}>
        <div className="h-14 flex items-center justify-between gap-4">


          <div className="flex-1 hidden md:flex items-center justify-center">
            <div className="flex items-center bg-slate-900/60 border border-slate-800 rounded-none p-1 gap-0.5">
              {levels.map(lv => (
                <button key={lv.id} onClick={() => setActiveLevel(lv.id)}
                  className={`relative px-3 py-1.5 rounded-none text-[10px] font-black transition-all duration-200 flex items-center gap-1.5 tracking-widest ${
                    activeLevel === lv.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'}`}>
                  {activeLevel === lv.id && <span className="absolute inset-0 rounded-none bg-blue-500/20 blur-sm"/>}
                  <span className="relative flex items-center gap-1.5">{lv.icon}{lv.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="md:hidden flex bg-slate-900/60 border border-slate-800 rounded-none p-0.5 gap-0.5">
            {levels.map(lv => (
              <button key={lv.id} onClick={() => setActiveLevel(lv.id)}
                className={`px-2.5 py-1 rounded-none text-[10px] font-black transition-all ${activeLevel === lv.id ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>
                L{lv.id}
              </button>
            ))}
          </div>

        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"/>
      </nav>

      {/* KPI stat cards — part of sticky header */}
      <div className="bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/60"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
            <StatCard label="Audit Win Rate"   value={`${d.auditSummary.winRate.toFixed(1)}%`}         trend={`+${(d.auditSummary.winRate - 50).toFixed(1)}pp`} color="text-emerald-400"/>
            <StatCard label="Edge Persistence" value={d.auditSummary.edgePersistence.toFixed(2)}        trend={d.auditSummary.edgeVerdict}                        color="text-blue-400"/>
            <StatCard label="Risk Entropy"     value={d.auditSummary.riskEntropy}                       trend={`Auto: ${d.automationRisk.score.toFixed(0)}/100`}  color="text-slate-400"/>
            <StatCard label="AI Confidence"    value={`${d.auditSummary.aiConfidence.toFixed(0)}%`}     trend={`Grade ${d.auditSummary.grade}`}                   color="text-purple-400"/>
          </div>
        </div>
      </div>

      {/* ── MAIN ───────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto py-3 pb-3">

        {/* ════ LEVEL 1 ════════════════════════════════════════════════════ */}
        {activeLevel === 1 && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-stretch">
              <div className="lg:col-span-2 flex flex-col gap-2">
                <Section title="Executive Summary" icon={<Zap className="w-4 h-4 text-yellow-400"/>} className="flex-1">
                  <p className="text-slate-300 leading-relaxed text-sm font-medium">
                    {d.executiveSummary || 'No trades found — add trades to generate an audit.'}
                  </p>
                </Section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1">
                  <Section title="Is There an Edge?" icon={<ShieldCheck className="w-4 h-4 text-emerald-400"/>}>
                    <div className="flex items-center gap-4 mb-2">
                      <div className={`text-lg font-black italic ${verdictColor}`} style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '0.05em' }}>
                        {verdictLabel}
                      </div>
                      <div className="h-0.5 flex-1 bg-slate-800 rounded-none overflow-hidden">
                        <div className={`h-full ${verdictBarClr}`} style={{ width: `${verdictBar}%` }}/>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 font-semibold" style={{ letterSpacing: '0.05em' }}>
                      Confidence: {d.edgeVerdict.confidence.toFixed(1)}% | {d.edgeVerdict.sampleSize} samples
                    </p>
                  </Section>

                  <Section title="Edge Drivers" icon={<TrendingUp className="w-4 h-4 text-blue-400"/>}>
                    <div className="max-h-[80px] overflow-y-auto pr-2 custom-scrollbar">
                      {d.edgeDrivers.length ? (
                        <ul className="text-sm space-y-2">
                          {d.edgeDrivers.slice(0, 3).map((drv, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <div className="w-1.5 h-1.5 rounded-none bg-blue-500 mt-1.5 shrink-0"/>
                              <span className="font-medium">{drv.factor} <span className="text-emerald-400 font-black">+{drv.lift.toFixed(1)}pp</span></span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-500 font-medium italic">
                          Tag trades with HTF bias, confluence score, session to unlock edge drivers.
                        </p>
                      )}
                    </div>
                  </Section>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Section title="What to Monitor Next" icon={<Activity className="w-4 h-4 text-orange-400"/>}>
                  <div className="max-h-[120px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {d.monitorItems.length ? (
                      d.monitorItems.map((m, i) => (
                        <MonitorItem key={i} label={m.label} status={m.status}
                          color={m.priority === 'High' ? 'border-orange-500/50' : m.priority === 'New' ? 'border-blue-500/50' : 'border-slate-700'}/>
                      ))
                    ) : (
                      <MonitorItem label="Nothing flagged yet" status="OK" color="border-slate-700"/>
                    )}
                  </div>
                </Section>

                <Section title="Audit-Driven Changes" icon={<Clock className="w-4 h-4 text-purple-400"/>}>
                  <div className="max-h-[120px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {d.aiPolicySuggestions.slice(0, 2).map((s, i) => (
                      <div key={i} className="text-xs border-l-2 border-purple-500 pl-3 py-1 bg-purple-500/5">
                        <div className="font-bold text-slate-200" style={{ letterSpacing: '0.05em' }}>{s.rule}</div>
                        <div className="text-slate-500 italic font-medium">{s.expectedImpact}</div>
                      </div>
                    ))}
                    {!d.aiPolicySuggestions.length && (
                      <div className="text-xs border-l-2 border-slate-600 pl-3 py-1 bg-slate-800/20">
                        <div className="font-bold text-slate-400">No changes yet</div>
                        <div className="text-slate-600 italic font-medium">Add more trades to generate suggestions.</div>
                      </div>
                    )}
                  </div>
                </Section>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Section title="Weaknesses & Failure Conditions" icon={<AlertTriangle className="w-4 h-4 text-red-400"/>}>
                <div className="bg-red-950/10 border border-red-900/30 p-4 rounded-none">
                  {d.weaknesses.length ? d.weaknesses.slice(0, 2).map((w, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      <p className="text-sm text-red-200 mb-1 font-black" style={{ letterSpacing: '0.05em' }}>{w.factor}</p>
                      <p className="text-xs text-red-300/80 leading-relaxed font-medium">
                        Win rate drops to {w.winRateWithFactor.toFixed(0)}% when present — drag of {w.impact.toFixed(1)}pp.
                      </p>
                    </div>
                  )) : (
                    <p className="text-sm text-slate-400 font-medium">No critical failure conditions identified yet.</p>
                  )}
                </div>
              </Section>

              <Section title="Psychology Impact" icon={<Brain className="w-4 h-4 text-pink-400"/>}>
                <div className="flex gap-4 h-full items-center">
                  <div className="flex-1 text-center p-3 bg-slate-900/80 rounded-none border border-slate-800">
                    <div className="text-2xl font-black text-pink-400">
                      {d.psychologyScore > 0 ? d.psychologyScore.toFixed(1) : '—'}
                    </div>
                    <div className="text-[10px] uppercase text-slate-500 mt-1 font-bold" style={{ letterSpacing: '0.15em' }}>Stress Score</div>
                  </div>
                  <div className="flex-1 text-center p-3 bg-slate-900/80 rounded-none border border-slate-800">
                    <div className="text-2xl font-black text-blue-400">
                      {d.disciplineScore > 0 ? `${d.disciplineScore.toFixed(0)}%` : '—'}
                    </div>
                    <div className="text-[10px] uppercase text-slate-500 mt-1 font-bold" style={{ letterSpacing: '0.15em' }}>Rule Adherence</div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              {/* Probabilistic Edge donut */}
              <Section title="Probabilistic Edge" icon={<DiceIcon/>}>
                <div className="flex flex-col items-center justify-center py-2">
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="6"/>
                      <circle cx="40" cy="40" r="34" fill="none" stroke="url(#blueGradient)" strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 34 * (d.probabilisticEdge.baseRate / 100)} ${2 * Math.PI * 34}`}
                        strokeLinecap="round"/>
                      <defs>
                        <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#2563eb"/>
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-xs font-black text-blue-400">{d.probabilisticEdge.baseRate.toFixed(1)}%</div>
                      <div className="text-[7px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.1em' }}>Base Rate</div>
                    </div>
                  </div>
                  <div className="mt-3 w-full space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 font-medium">Avg Win</span>
                      <span className="font-black text-emerald-400">{d.probabilisticEdge.avgWin.toFixed(2)}R</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 font-medium">Avg Loss</span>
                      <span className="font-black text-red-400">{d.probabilisticEdge.avgLoss.toFixed(2)}R</span>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Risk & Failure */}
              <Section title="Risk & Failure" icon={<AlertTriangle className="w-4 h-4 text-orange-400"/>}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-sm text-slate-400 font-medium">Max Loss Streak</span>
                    <span className="text-2xl font-black text-red-400">{d.riskMetrics.maxLossStreak}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-sm text-slate-400 font-medium">5-Loss Probability</span>
                    <span className="text-xl font-black text-orange-400">{d.riskMetrics.fiveLossProbability.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-400 font-medium">Time in Drawdown</span>
                    <span className="text-xl font-black text-slate-400">{d.riskMetrics.timeInDrawdown.toFixed(1)}%</span>
                  </div>
                </div>
              </Section>

              {/* Edge Component Breakdown */}
              <Section title="Edge Component Breakdown" icon={<LayersIcon/>}>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-400 uppercase font-black" style={{ letterSpacing: '0.1em' }}>Win Rate</span>
                      <span className="text-blue-400 font-black">{d.edgeComponents.winRateContribution.toFixed(1)}%</span>
                    </div>
                    <div className="h-0.5 bg-slate-800 rounded-none overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-1000"
                        style={{ width: `${d.edgeComponents.winRateContribution}%` }}/>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-400 uppercase font-black" style={{ letterSpacing: '0.1em' }}>Risk-Reward</span>
                      <span className="text-purple-400 font-black">{d.edgeComponents.riskRewardContribution.toFixed(1)}%</span>
                    </div>
                    <div className="h-0.5 bg-slate-800 rounded-none overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-1000"
                        style={{ width: `${d.edgeComponents.riskRewardContribution}%` }}/>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            {/* Logical Verification */}
            <Section title="Logical Verification Elements" icon={<ShieldCheck className="w-4 h-4 text-emerald-400"/>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {Object.entries(d.logicalVerification ?? {}).map(([k, v]) => (
                  <VerificationItem key={k}
                    label={k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    value={v}/>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800/50 flex items-center justify-end gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500"/>
                  <span className="text-xs font-black italic text-emerald-400 uppercase" style={{ letterSpacing: '0.15em' }}>
                    {d.finalVerdict?.authorized ? 'System Certified' : 'Pending Certification'}
                  </span>
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* ════ LEVEL 2 ════════════════════════════════════════════════════ */}
        {activeLevel === 2 && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              {/* Variance */}
              <Section title="Variance & Distribution" icon={<TrendingUp className="w-4 h-4 text-blue-400"/>}>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400 font-medium">Win Rate</span>
                    <span className="text-xs font-black text-emerald-400">{d.variance.winRate.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400 font-medium">Sample Size</span>
                    <span className="text-xs font-black text-blue-400">{d.variance.sampleSize}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400 font-medium">Win/Loss Ratio</span>
                    <span className="text-xs font-black text-purple-400">{d.variance.winLossRatio.toFixed(3)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between">
                    <span className="text-[9px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.12em' }}>Positive Skew</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-none ${d.variance.positiveSkew ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}/>
                      <span className={`text-[9px] font-black uppercase ${d.variance.positiveSkew ? 'text-emerald-400' : 'text-red-400'}`} style={{ letterSpacing: '0.1em' }}>
                        {d.variance.positiveSkew ? 'Verified' : 'Negative'}
                      </span>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Drawdown donut */}
              <Section title="Drawdown Metrics" icon={<Activity className="w-4 h-4 text-orange-400"/>}>
                <div className="flex flex-col items-center justify-center py-1">
                  <div className="relative w-20 h-20 mb-3">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="6"/>
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#f97316" strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 34 * (Math.min(100, d.drawdown.maxPeakToValley) / 100)} ${2 * Math.PI * 34}`}
                        strokeLinecap="round"/>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-sm font-black text-orange-400">{d.drawdown.maxPeakToValley.toFixed(1)}%</div>
                      <div className="text-[7px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.1em' }}>Max DD</div>
                    </div>
                  </div>
                  <div className="w-full grid grid-cols-2 gap-3 text-center">
                    <div>
                      <div className="text-[9px] text-slate-500 font-medium">Recovery</div>
                      <div className="text-xs font-black text-slate-300">{d.drawdown.recovery.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 font-medium">Stagnation</div>
                      <div className="text-xs font-black text-slate-300">{d.drawdown.stagnation.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Equity Variance */}
              <Section title="Equity Variance" icon={<Activity className="w-4 h-4 text-purple-400"/>}>
                <div className="space-y-3">
                  <div className="text-center py-1">
                    <div className="text-[9px] text-slate-500 uppercase font-bold mb-1" style={{ letterSpacing: '0.12em' }}>Consistency Score</div>
                    <div className="text-xs font-black text-purple-400">{d.equityVariance.simulationConfidence.toFixed(1)}/100</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/50">
                    <div className="text-center">
                      <div className="text-[9px] text-slate-500 font-medium">Variance Skew</div>
                      <div className="text-xs font-black text-blue-400">{d.equityVariance.varianceSkew.toFixed(2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-slate-500 font-medium">Max Cluster</div>
                      <div className="text-xs font-black text-slate-300">{d.equityVariance.maxCluster}</div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {/* Audit Scope */}
              <Section title="Audit Scope & Confidence">
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium">Dataset (Total Audited)</span>
                    <span className="font-black">{d.auditScope.totalTrades.toLocaleString()} Trades</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium">Statistical Significance</span>
                    <span className="text-emerald-400 font-black">{d.auditScope.statisticalSignificance.toFixed(1)}%</span>
                  </div>
                  <div className="h-0.5 bg-slate-800 rounded-none">
                    <div className="h-full bg-emerald-500 rounded-none" style={{ width: `${d.auditScope.statisticalSignificance}%` }}/>
                  </div>
                </div>
              </Section>

              {/* Monte Carlo bars */}
              <Section title="Edge Evidence (Monte Carlo)">
                <div className="flex items-end gap-1 h-24 overflow-hidden">
                  {(d.equityVariance.mcBars ?? [40,70,45,90,65,80,50,95,100,75,85,60,40,55,70,30]).map((h, i) => (
                    <div key={i} className="flex-1 bg-blue-500/20 hover:bg-blue-500/50 transition-all rounded-none" style={{ height: `${h}%` }}/>
                  ))}
                </div>
                <div className="mt-4 text-xs text-slate-500 text-center uppercase font-bold" style={{ letterSpacing: '0.2em' }}>
                  N={d.auditScope.totalTrades.toLocaleString()} Trades Analysed
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {/* Trade Quality A/B/C */}
              <Section title="Trade Quality Stratification" icon={<LayersIcon/>}>
                <div className="space-y-2">
                  {(['aTrades','bTrades','cTrades'] as const).map((key, i) => {
                    const labels = ['A','B','C'];
                    const colors = [
                      { bg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-400', ghost: 'text-emerald-500/20' },
                      { bg: 'from-blue-500/10 to-blue-500/5',       border: 'border-blue-500/20',    text: 'text-blue-400',    ghost: 'text-blue-500/20' },
                      { bg: 'from-slate-500/10 to-slate-500/5',     border: 'border-slate-500/20',   text: 'text-slate-400',   ghost: 'text-slate-500/20' },
                    ][i];
                    const t = d.tradeQuality[key];
                    return (
                      <div key={key} className={`flex items-center justify-between p-3 bg-gradient-to-r ${colors.bg} border ${colors.border} rounded-none`}>
                        <div>
                          <div className="text-[9px] text-slate-500 font-bold" style={{ letterSpacing: '0.1em' }}>
                            {labels[i]}-Trades <span className="text-slate-600">({t.count})</span>
                          </div>
                          <div className={`text-xs font-black ${colors.text}`}>{t.profit.toFixed(1)}% Win Rate</div>
                        </div>
                        <div className={`text-lg font-black ${colors.ghost}`}>{labels[i]}</div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* Conditional Edge */}
              <Section title="Conditional Edge Validation" icon={<ShieldCheck className="w-4 h-4 text-blue-400"/>}>
                <div className="space-y-2">
                  <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-none">
                    <div className="text-xs text-blue-400 uppercase font-black mb-3" style={{ letterSpacing: '0.1em' }}>
                      {d.conditionalEdge.liquidityGap.label}: {d.conditionalEdge.liquidityGap.rMultiple.toFixed(2)}R
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400 font-medium">Samples</span>
                      <span className="text-xl font-black text-slate-300">{d.conditionalEdge.liquidityGap.samples}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-800/20 border border-slate-700/30 rounded-none">
                    <div className="text-xs text-slate-400 uppercase font-black mb-3" style={{ letterSpacing: '0.1em' }}>
                      {d.conditionalEdge.nonQualified.label}: {d.conditionalEdge.nonQualified.rMultiple.toFixed(2)}R
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400 font-medium">Samples</span>
                      <span className="text-xl font-black text-slate-300">{d.conditionalEdge.nonQualified.samples}</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800/50">
                    <div className="text-[10px] text-slate-600 italic text-center font-medium">
                      Edge transferability: {d.edgeTransferability.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            {/* Heatmap */}
            <Section title="Winning vs Losing Profiles (AI Classification)">
              {d.instruments.length > 0 ? (
                <>
                  <div className="heatmap-outer">
                    <div style={{ display: 'flex', gap: '2rem', minWidth: 'max-content' }}>
                      <div style={{ width: 480, flexShrink: 0 }}>
                        <div className="text-xs font-black text-emerald-400 uppercase bg-emerald-400/5 px-3 py-2 rounded-none border border-emerald-500/10 mb-3" style={{ letterSpacing: '0.12em' }}>
                          Alpha Profile (Success Factors)
                        </div>
                        <div className="heatmap-inner">
                          <HeatmapGrid instruments={d.instruments} factors={d.winFactors} correlations={d.winCorrelations} type="win"/>
                        </div>
                      </div>
                      <div style={{ width: 480, flexShrink: 0 }}>
                        <div className="text-xs font-black text-red-400 uppercase bg-red-400/5 px-3 py-2 rounded-none border border-red-500/10 mb-3" style={{ letterSpacing: '0.12em' }}>
                          Failure Profile (Decay Factors)
                        </div>
                        <div className="heatmap-inner" style={{ scrollbarColor: '#ef4444 #1e293b' }}>
                          <HeatmapGrid instruments={d.instruments} factors={d.lossFactors} correlations={d.lossCorrelations} type="loss"/>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-slate-800/50">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-xs text-slate-500 uppercase font-black" style={{ letterSpacing: '0.15em' }}>Correlation Intensity</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-medium">Low</span>
                        <div className="flex gap-1">
                          {[20,40,60,80,100].map(i => (
                            <div key={i} className="w-8 h-4 rounded" style={{ background: `rgba(16,185,129,${i/100})` }}/>
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium">High</span>
                      </div>
                      <div className="text-[9px] text-slate-600 italic font-medium">← Scroll horizontally →</div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 italic font-medium py-4 text-center">
                  Tag trades with instrument, confluence score, HTF bias, and session to unlock the AI classification heatmap.
                </p>
              )}
            </Section>
          </div>
        )}

        {/* ════ LEVEL 3 ════════════════════════════════════════════════════ */}
        {activeLevel === 3 && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-start">
              <div className="lg:col-span-2">
                <Section title="Component Breakdown">
                  <div className="overflow-x-auto custom-scrollbar">
                    <div className="min-w-[500px] space-y-2">
                      <div className="text-xs text-slate-400 mb-2 font-medium">Regime performance analysis</div>
                      {[
                        { label: 'Trending', value: d.regimeTransition.trendingWinRate, color: 'bg-blue-500' },
                        { label: 'Ranging',  value: d.regimeTransition.rangingWinRate,  color: 'bg-purple-500' },
                        { label: 'Breakout', value: d.regimeTransition.breakoutWinRate, color: 'bg-orange-500' },
                      ].map(r => (
                        <div key={r.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">{r.label} Regime</span>
                            <span className="font-black text-slate-300">{r.value > 0 ? `${r.value.toFixed(1)}%` : '—'}</span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-none overflow-hidden">
                            <div className={`h-full ${r.color}`} style={{ width: `${r.value}%` }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>
              </div>
              <Section title="Failure Mode Analysis">
                <div className="space-y-3">
                  <div className="text-xs text-red-400 mb-2 font-bold">Critical risk factors</div>
                  {d.automationRisk.issues.length ? d.automationRisk.issues.slice(0, 3).map((iss, i) => (
                    <div key={i} className="text-xs text-orange-300 font-medium bg-orange-500/5 border border-orange-500/20 rounded px-2 py-1">{iss}</div>
                  )) : (
                    <div className="text-xs text-slate-500 font-medium italic">No critical failure modes detected.</div>
                  )}
                </div>
              </Section>
            </div>

            <Section title="Core Robustness" icon={<ShieldCheck className="w-4 h-4 text-emerald-400"/>}>
              <div className="space-y-4">
                {[
                  { label: 'Rule Stability',        icon: <Target className="w-3 h-3"/>, value: d.coreRobustness.ruleStability,       color: 'bg-blue-500',   textColor: 'text-blue-400' },
                  { label: 'Execution Adherence',   icon: <Zap className="w-3 h-3"/>,    value: d.coreRobustness.executionAdherence,   color: 'bg-emerald-500',textColor: 'text-emerald-400' },
                  { label: 'Monte Carlo Stability', icon: <Activity className="w-3 h-3"/>,value: d.coreRobustness.monteCarloStability, color: 'bg-purple-500', textColor: 'text-purple-400' },
                ].map(row => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-400 uppercase font-black flex items-center gap-2" style={{ letterSpacing: '0.1em' }}>
                        {row.icon} {row.label}
                      </span>
                      <span className={`font-black ${row.textColor}`}>{row.value.toFixed(1)}%</span>
                    </div>
                    <div className="h-0.5 bg-slate-800 rounded-none overflow-hidden">
                      <div className={`h-full ${row.color}`} style={{ width: `${Math.min(100, row.value)}%` }}/>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              <Section title="Loss Cluster Severity" icon={<AlertTriangle className="w-4 h-4 text-red-400"/>}>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-red-500/5 border border-red-500/20 rounded-none">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Avg Cluster Length</div>
                    <div className="text-lg font-black text-red-400">{d.lossCluster.avgLength.toFixed(1)}</div>
                  </div>
                  <div className="text-center p-4 bg-orange-500/5 border border-orange-500/20 rounded-none">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Worst DD Cluster</div>
                    <div className="text-lg font-black text-orange-400">{d.lossCluster.worstDD.toFixed(1)}%</div>
                  </div>
                </div>
              </Section>

              <Section title="Execution Asymmetry" icon={<Activity className="w-4 h-4 text-blue-400"/>}>
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-none">
                    <div className="text-xs text-slate-500 font-medium">Slippage (Wins)</div>
                    <div className="text-sm font-black text-emerald-400">{d.executionAsymmetry.slippageWins.toFixed(2)} ticks</div>
                  </div>
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-none">
                    <div className="text-xs text-slate-500 font-medium">Slippage (Losses)</div>
                    <div className="text-sm font-black text-red-400">{d.executionAsymmetry.slippageLosses.toFixed(2)} ticks</div>
                  </div>
                </div>
              </Section>

              <Section title="Regime Transition" icon={<TrendingUp className="w-4 h-4 text-orange-400"/>}>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-orange-500/5 border border-orange-500/20 rounded-none">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Avg Transition DD</div>
                    <div className="text-lg font-black text-orange-400">{d.regimeTransition.avgTransitionDD.toFixed(1)}%</div>
                  </div>
                  <div className="text-center p-4 bg-blue-500/5 border border-blue-500/20 rounded-none">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Recovery Trades</div>
                    <div className="text-lg font-black text-blue-400">{d.regimeTransition.recoveryTrades}</div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Section title="Capital Heat / Exposure" icon={<AlertTriangle className="w-4 h-4 text-purple-400"/>}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-slate-800/50">
                    <span className="text-sm text-slate-400 font-medium">Peak Equity at Risk</span>
                    <span className="text-sm font-black text-purple-400">{d.capitalHeat.peakEquityAtRisk.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm text-slate-400 font-medium">Time at Peak</span>
                    <span className="text-sm font-black text-slate-300">{d.capitalHeat.timeAtPeak.toFixed(1)}%</span>
                  </div>
                </div>
              </Section>

              <Section title="Automation Risk" icon={<Cpu className="w-4 h-4 text-yellow-400"/>}>
                <div className="flex flex-col items-center justify-center py-4 gap-3">
                  <div className="text-2xl font-black text-yellow-400">{d.automationRisk.score.toFixed(1)}%</div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.15em' }}>Execution Failure Risk</div>
                  <div className="px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-none">
                    <span className={`text-xs italic font-black ${autoColor}`} style={{ letterSpacing: '0.1em' }}>{autoLabel}</span>
                  </div>
                </div>
              </Section>
            </div>
          </div>
        )}

        {/* ════ LEVEL 4 ════════════════════════════════════════════════════ */}
        {activeLevel === 4 && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <Section title="AI Policy Suggestions" icon={<Zap className="w-4 h-4 text-yellow-500"/>}>
                <div className="space-y-4">
                  {d.aiPolicySuggestions.length ? d.aiPolicySuggestions.slice(0, 3).map((s, i) => (
                    <div key={i} className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-none">
                      <div className="text-blue-400 font-black mb-2" style={{ letterSpacing: '0.05em' }}>{s.rule}</div>
                      <p className="text-sm text-slate-300 font-medium">{s.rationale}</p>
                      {s.expectedImpact && (
                        <p className="text-xs text-emerald-400 font-black mt-2">{s.expectedImpact}</p>
                      )}
                    </div>
                  )) : (
                    <p className="text-xs text-slate-500 italic font-medium">
                      No policy suggestions yet. Add more tagged trades to generate data-driven rules.
                    </p>
                  )}
                </div>
              </Section>

              <Section title="Audit-Enforced Guardrails" icon={<ShieldCheck className="w-4 h-4 text-emerald-500"/>}>
                <div className="space-y-3">
                  {d.guardrails.slice(0, 5).map((g, i) => (
                    <GuardrailItem key={i} label={g.label} value={g.action} status={g.status}
                      color={g.status === 'Active' ? 'text-emerald-400' : 'text-yellow-400'}/>
                  ))}
                </div>
              </Section>
            </div>

            <Section title="Edge Decay / Rolling Trend" icon={<TrendingUp className="w-4 h-4 text-blue-400"/>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-none text-center">
                  <div className="text-[9px] text-slate-500 uppercase font-black mb-1" style={{ letterSpacing: '0.15em' }}>Last 50 Trades</div>
                  <div className="text-xs font-black text-blue-400">{d.edgeDecay.last50.toFixed(2)}R</div>
                </div>
                <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-none text-center">
                  <div className="text-[9px] text-slate-500 uppercase font-black mb-1" style={{ letterSpacing: '0.15em' }}>Last 200 Trades</div>
                  <div className="text-xs font-black text-purple-400">{d.edgeDecay.last200.toFixed(2)}R</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-500 font-medium">Edge Stability Trend</span>
                  <span className={`text-[9px] font-black ${d.edgeDecay.detected ? 'text-red-400' : 'text-emerald-400'}`}
                    style={{ letterSpacing: '0.1em' }}>
                    {d.edgeDecay.trend}
                  </span>
                </div>
                {d.edgeDecay.detected && (
                  <p className="text-xs text-red-300/80 font-medium mt-2">{d.edgeDecay.recommendation}</p>
                )}
              </div>
            </Section>

            {/* Final verdict banner */}
            <div className="mt-2 p-3 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-none">
              <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-none bg-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400"/>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] text-emerald-500 uppercase font-black" style={{ letterSpacing: '0.2em' }}>Final Audit Verdict</span>
                    </div>
                    <div className={`text-xs font-black italic uppercase ${gradeColor}`} style={{ letterSpacing: '0.08em' }}>
                      {d.finalVerdict.authorized ? 'System Authorized' : 'Pending Certification'}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5 font-medium">
                      {d.finalVerdict.summary.slice(0, 120)}{d.finalVerdict.summary.length > 120 ? '…' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-none">
                    <div className="text-[9px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.15em' }}>Overall Grade</div>
                    <div className={`text-lg font-black italic text-center ${gradeColor}`} style={{ fontFamily: "'Inter', sans-serif" }}>{grade}</div>
                  </div>
                  {d.finalVerdict.nextActions[0] && (
                    <div className="text-[9px] text-slate-500 uppercase font-bold text-right max-w-[180px]" style={{ letterSpacing: '0.15em' }}>
                      Next: {d.finalVerdict.nextActions[0].slice(0, 40)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { font-family: 'Montserrat', sans-serif; }
        .custom-scrollbar { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #475569 #1e293b; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; border: 1px solid #334155; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .custom-scrollbar::-webkit-scrollbar-corner { background: #1e293b; }
        .heatmap-outer { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #475569 #1e293b; padding-bottom: 12px; }
        .heatmap-outer::-webkit-scrollbar { height: 8px; }
        .heatmap-outer::-webkit-scrollbar-track { background: #1e293b; border-radius: 4px; margin: 0 4px; }
        .heatmap-outer::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; border: 1px solid #334155; }
        .heatmap-outer::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .heatmap-inner { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #22c55e #1e293b; padding-bottom: 10px; }
        .heatmap-inner::-webkit-scrollbar { height: 6px; }
        .heatmap-inner::-webkit-scrollbar-track { background: #1e293b; border-radius: 4px; }
        .heatmap-inner::-webkit-scrollbar-thumb { background: #22c55e; border-radius: 4px; }
        .heatmap-inner::-webkit-scrollbar-thumb:hover { background: #4ade80; }
      `}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (identical API to original mock component)
// ─────────────────────────────────────────────────────────────────────────────

const Section = ({ title, children, icon = null, className = '' }: {
  title: string; children: React.ReactNode; icon?: React.ReactNode; className?: string;
}) => (
  <section className={`bg-slate-900/40 border border-slate-800/60 rounded-none p-3 md:p-4 hover:border-slate-700/80 transition-all duration-300 ${className}`}>
    <div className="flex items-center gap-2 mb-3">
      {icon && <div className="p-1.5 bg-slate-800/50 border border-slate-700/50 rounded-none">{icon}</div>}
      <h3 className="text-xs font-black uppercase text-slate-400" style={{ letterSpacing: '0.15em' }}>{title}</h3>
    </div>
    {children}
  </section>
);

const StatCard = ({ label, value, trend, color }: { label: string; value: string; trend: string; color: string }) => (
  <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-none flex flex-col gap-0.5 hover:bg-slate-900/80 transition-all">
    <span className="text-[8px] font-black text-slate-500 uppercase" style={{ letterSpacing: '0.2em' }}>{label}</span>
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-sm font-black italic ${color}`}>{value}</span>
      <span className={`text-[8px] font-bold px-1 py-0.5 rounded bg-slate-800/50 ${trend.startsWith('+') ? 'text-emerald-400' : 'text-slate-400'}`}>
        {trend}
      </span>
    </div>
  </div>
);

const MonitorItem = ({ label, status, color }: { label: string; status: string; color: string }) => (
  <div className={`p-3 border-l-4 rounded-none bg-slate-800/20 flex items-center justify-between ${color}`}>
    <span className="text-sm font-bold text-slate-300 flex-1 leading-snug">{label}</span>
    <span className="text-[9px] uppercase font-black text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded ml-2 shrink-0" style={{ letterSpacing: '0.12em' }}>{status}</span>
  </div>
);

const HeatmapGrid = ({ instruments, factors, correlations, type }: {
  instruments: string[]; factors: string[]; correlations: Record<string, number[]>; type: string;
}) => {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number; value: number; instrument: string; factor: string } | null>(null);
  const getHeatColor = (v: number, t: string) => `rgba(${t === 'win' ? '16,185,129' : '239,68,68'},${v / 100})`;
  const getLabel = (v: number) => v >= 85 ? 'Critical' : v >= 70 ? 'High' : v >= 55 ? 'Med' : 'Low';
  return (
    <div className="min-w-max">
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `110px repeat(${factors.length}, 80px)` }}>
        <div/>
        {factors.map((f, i) => (
          <div key={i} className="text-[9px] font-black text-slate-400 uppercase p-2 text-center bg-slate-800/20 rounded" style={{ letterSpacing: '0.05em' }} title={f}>{f}</div>
        ))}
      </div>
      <div className="space-y-1">
        {instruments.map((instr, rowIdx) => (
          <div key={instr} className="grid gap-1" style={{ gridTemplateColumns: `110px repeat(${factors.length}, 80px)` }}>
            <div className="text-xs font-black text-slate-300 p-2 bg-slate-800/30 rounded">{instr}</div>
            {(correlations[instr] ?? []).map((val, colIdx) => (
              <div key={colIdx}
                className="relative p-2 rounded cursor-pointer border border-slate-800/50 hover:border-slate-600"
                style={{ backgroundColor: getHeatColor(val, type) }}
                onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx, value: val, instrument: instr, factor: factors[colIdx] })}
                onMouseLeave={() => setHoveredCell(null)}>
                <div className="text-[10px] font-black text-white text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{val}%</div>
                {hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx && (
                  <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-none shadow-xl whitespace-nowrap">
                    <div className="text-[10px] font-black text-slate-300">{instr}</div>
                    <div className="text-[9px] text-slate-500 font-medium">{factors[colIdx]}</div>
                    <div className="text-xs font-black text-white mt-1">{val}% — {getLabel(val)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const GuardrailItem = ({ label, value, status, color = 'text-emerald-400' }: { label: string; value: string; status: string; color?: string }) => (
  <div className="flex items-center justify-between p-3 bg-slate-800/20 rounded-none border border-slate-700/30 gap-4">
    <div className="flex flex-col min-w-0 flex-1">
      <span className="text-[9px] font-black text-slate-500 uppercase" style={{ letterSpacing: '0.2em' }}>{label}</span>
      <span className="text-xs font-bold text-slate-300 leading-snug mt-0.5">{value}</span>
    </div>
    <span className={`text-[9px] font-black uppercase bg-slate-800/40 px-2 py-0.5 rounded shrink-0 ${color}`} style={{ letterSpacing: '0.15em' }}>{status}</span>
  </div>
);

const VerificationItem = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <div className="text-[9px] text-blue-400 uppercase font-black" style={{ letterSpacing: '0.15em' }}>{label}</div>
    <div className="flex items-start gap-1.5">
      <svg className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="2,6 5,9 10,3"/>
      </svg>
      <div className="text-xs italic text-slate-200 leading-relaxed font-medium">{value}</div>
    </div>
  </div>
);
