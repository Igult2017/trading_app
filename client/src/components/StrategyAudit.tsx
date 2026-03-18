import { useState } from 'react';
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
  BarChart3,
  ScanSearch,
  Clock,
  Cpu,
  Stethoscope,
  GitFork,
  Bot,
  PlusCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';

// ── Types matching StrategyAuditResult from strategyAuditCalculator.ts ────────

interface EdgeSummary {
  overallWinRate: number;
  profitFactor: number;
  expectancy: number;
  sampleSize: number;
  edgeVerdict: 'Confirmed' | 'Marginal' | 'Unconfirmed';
  note?: string;
}

interface EdgeDriver {
  factor: string;
  winRateWithFactor: number;
  winRateWithout: number;
  lift: number;
}

interface Weakness {
  factor: string;
  winRateWithFactor: number;
  impact: number;
}

interface Level1 {
  edgeSummary: EdgeSummary;
  edgeDrivers: EdgeDriver[];
  monitorItems: string[];
  weaknesses: Weakness[];
  winFactorCorrelation: Record<string, number[]>;
  lossFactorCorrelation: Record<string, number[]>;
  psychologyScore: number;
  disciplineScore: number;
  probabilisticEdge: number;
}

interface Level2 {
  variance: {
    winRate: number;
    stdDev: number;
    skewness: number;
    kurtosis: number;
    sampleSize: number;
    winLossRatio: number;
    positiveSkew: boolean;
  };
  drawdown: {
    maxDrawdown: number;
    avgDrawdown: number;
    recoveryFactor: number;
    calmarRatio: number;
    ulcerIndex: number;
  };
  equityVariance: {
    bestMonth: number;
    worstMonth: number;
    monthlyStdDev: number;
    consistencyScore: number;
  };
  tradeQuality: {
    avgConfluenceScore: number;
    avgEntryQuality: number;
    avgPlanningVsExecution: number;
    highQualityWinRate: number | null;
    lowQualityWinRate: number | null;
  };
  conditionalEdge: {
    bySetupTag: Record<string, { trades: number; winRate: number; avgRR: number | null }>;
    bySession: Record<string, { trades: number; winRate: number; profitFactor: number }>;
  };
  heatmapProfiles: Array<{ instrument: string; strategy: string; winRate: number; trades: number }>;
}

interface Level3 {
  lossCluster: {
    clusterDates: string[];
    avgClusterSize: number;
    clusterFrequency: number;
  };
  executionAsymmetry: {
    avgWinRR: number;
    avgLossRR: number;
    asymmetryScore: number;
    plannedVsActualEntry: number;
    earlyExitRate: number;
    lateEntryRate: number;
  };
  regimeTransition: {
    trendingWinRate: number;
    rangingWinRate: number;
    breakoutWinRate: number;
    regimeDetectionAccuracy: number;
  };
  capitalHeat: {
    avgRiskPerTrade: number;
    maxRiskPerTrade: number;
    riskConsistencyScore: number;
    correlatedExposure: string[];
  };
  automationRisk: {
    score: number;
    issues: string[];
  };
}

interface PolicySuggestion {
  rule: string;
  rationale: string;
  expectedImpact: string;
}

interface Guardrail {
  condition: string;
  action: string;
}

interface Level4 {
  aiPolicySuggestions: PolicySuggestion[];
  guardrails: Guardrail[];
  edgeDecay: {
    detected: boolean;
    decayStartDate: string | null;
    decayMagnitude: number;
    recommendation: string;
  };
  finalVerdict: {
    overallGrade: string;
    summary: string;
    topStrengths: string[];
    topWeaknesses: string[];
    nextActions: string[];
  };
}

interface AuditData {
  success: boolean;
  level1?: Level1;
  level2?: Level2;
  level3?: Level3;
  level4?: Level4;
  error?: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface StrategyAuditProps {
  sessionId?: string;
  userId?: string;
}

// ── Main Component ────────────────────────────────────────────────────────────

const StrategyAudit = ({ sessionId, userId }: StrategyAuditProps) => {
  const [activeLevel, setActiveLevel] = useState(1);

  // Build query params
  const params = new URLSearchParams();
  if (sessionId) params.set('sessionId', sessionId);
  if (userId) params.set('userId', userId);

  const { data, isLoading, isError, error, refetch } = useQuery<AuditData>({
    queryKey: ['strategy-audit', sessionId, userId],
    queryFn: async () => {
      const res = await fetch(`/api/strategy-audit/compute?${params.toString()}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const levels = [
    { id: 1, label: 'STRATEGY AUDIT',   icon: <ScanSearch className="w-3.5 h-3.5" /> },
    { id: 2, label: 'EVIDENCE & PROOF', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 3, label: 'DIAGNOSTICS',      icon: <Stethoscope className="w-3.5 h-3.5" /> },
    { id: 4, label: 'ACTION & ITERATION', icon: <GitFork className="w-3.5 h-3.5" /> },
  ];

  const l1 = data?.level1;
  const l2 = data?.level2;
  const l3 = data?.level3;
  const l4 = data?.level4;

  return (
    <div className="strategy-audit-root min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <nav className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 shrink-0">
              <div className="absolute inset-0 bg-blue-600 rounded-lg rotate-3 opacity-60"></div>
              <div className="relative w-full h-full bg-blue-600 rounded-lg flex items-center justify-center border border-blue-400/30">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] text-slate-500 uppercase tracking-[0.25em] font-semibold hidden sm:block">Powered by AI</span>
              <span className="font-bold text-xs sm:text-sm uppercase text-white whitespace-nowrap" style={{ letterSpacing: '0.12em' }}>
                Strategy <span className="text-blue-400">Auditor</span>
              </span>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Refresh button */}
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-all"
              title="Refresh audit"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-700/60 gap-0.5 overflow-x-auto max-w-[calc(100vw-200px)] sm:max-w-none">
              {levels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setActiveLevel(level.id)}
                  className={`relative px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeLevel === level.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}
                >
                  <span className={activeLevel === level.id ? 'text-blue-200' : 'text-slate-500'}>{level.icon}</span>
                  <span className="hidden lg:inline">{level.label}</span>
                  <span className="hidden sm:inline lg:hidden">L{level.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3 pb-8">

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-widest">Computing audit...</p>
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <p className="text-red-400 text-sm font-semibold">Failed to load audit data</p>
            <p className="text-slate-500 text-xs">{String(error)}</p>
            <button onClick={() => refetch()} className="mt-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-all">
              Retry
            </button>
          </div>
        )}

        {/* API returned success: false */}
        {data && !data.success && !isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <AlertTriangle className="w-8 h-8 text-orange-400" />
            <p className="text-orange-400 text-sm font-semibold">Audit engine error</p>
            <p className="text-slate-500 text-xs">{data.error || 'Unknown error from audit engine'}</p>
          </div>
        )}

        {/* No session selected */}
        {!isLoading && !isError && !sessionId && !userId && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <ScanSearch className="w-8 h-8 text-slate-600" />
            <p className="text-slate-500 text-sm font-semibold">Select a session to run the audit</p>
          </div>
        )}

        {/* Main content - only render when data is ready */}
        {data?.success && l1 && l2 && l3 && l4 && (
          <>
            {/* Top stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-3 sm:mb-4">
              <StatCard
                label="Win Rate"
                value={`${l1.edgeSummary.overallWinRate.toFixed(1)}%`}
                trend={l1.edgeSummary.edgeVerdict}
                color={l1.edgeSummary.overallWinRate >= 55 ? 'text-emerald-400' : 'text-orange-400'}
              />
              <StatCard
                label="Profit Factor"
                value={l1.edgeSummary.profitFactor >= 999 ? '∞' : l1.edgeSummary.profitFactor.toFixed(2)}
                trend={`${l1.edgeSummary.sampleSize} trades`}
                color={l1.edgeSummary.profitFactor >= 1.5 ? 'text-blue-400' : 'text-orange-400'}
              />
              <StatCard
                label="Max Drawdown"
                value={l2.drawdown?.maxDrawdown != null ? `${Math.abs(l2.drawdown.maxDrawdown).toFixed(1)}%` : 'N/A'}
                trend={l2.drawdown?.calmarRatio != null ? `Calmar ${l2.drawdown.calmarRatio.toFixed(1)}` : 'Calmar N/A'}
                color={l2.drawdown?.maxDrawdown != null && Math.abs(l2.drawdown.maxDrawdown) <= 5 ? 'text-emerald-400' : 'text-red-400'}
              />
              <StatCard
                label="Overall Grade"
                value={l4.finalVerdict.overallGrade}
                trend={`Kelly ${l1.probabilisticEdge.toFixed(1)}%`}
                color={
                  l4.finalVerdict.overallGrade === 'A' ? 'text-emerald-400' :
                  l4.finalVerdict.overallGrade === 'B' ? 'text-blue-400' :
                  l4.finalVerdict.overallGrade === 'C' ? 'text-yellow-400' :
                  'text-red-400'
                }
              />
            </div>

            {/* ── LEVEL 1 ── */}
            {activeLevel === 1 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h2 className="text-xs sm:text-sm font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                    <ScanSearch className="text-blue-500 shrink-0 w-4 h-4 sm:w-5 sm:h-5" /> LEVEL 1 — STRATEGY AUDIT
                  </h2>
                  <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700 w-fit" style={{ letterSpacing: '0.1em' }}>
                    {l1.edgeSummary.sampleSize} trades analysed
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  <div className="lg:col-span-2 space-y-6">
                    <Section title="Edge Summary" icon={<Zap className="w-4 h-4 text-yellow-400" />}>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                          <div className={`text-xl font-bold ${l1.edgeSummary.overallWinRate >= 55 ? 'text-emerald-400' : 'text-orange-400'}`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                            {l1.edgeSummary.overallWinRate.toFixed(1)}%
                          </div>
                          <div className="text-[10px] uppercase text-slate-500 mt-1 font-bold" style={{ letterSpacing: '0.15em' }}>Win Rate</div>
                        </div>
                        <div className="text-center p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                          <div className="text-xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                            {l1.edgeSummary.profitFactor >= 999 ? '∞' : l1.edgeSummary.profitFactor.toFixed(2)}
                          </div>
                          <div className="text-[10px] uppercase text-slate-500 mt-1 font-bold" style={{ letterSpacing: '0.15em' }}>Profit Factor</div>
                        </div>
                        <div className="text-center p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                          <div className={`text-xl font-bold ${l1.edgeSummary.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                            {l1.edgeSummary.expectancy >= 0 ? '+' : ''}{l1.edgeSummary.expectancy.toFixed(2)}
                          </div>
                          <div className="text-[10px] uppercase text-slate-500 mt-1 font-bold" style={{ letterSpacing: '0.15em' }}>Expectancy</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`text-lg font-bold ${
                          l1.edgeSummary.edgeVerdict === 'Confirmed' ? 'text-emerald-400' :
                          l1.edgeSummary.edgeVerdict === 'Marginal' ? 'text-yellow-400' : 'text-red-400'
                        }`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                          {l1.edgeSummary.edgeVerdict.toUpperCase()}
                        </div>
                        <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-700 ${
                            l1.edgeSummary.edgeVerdict === 'Confirmed' ? 'bg-emerald-500' :
                            l1.edgeSummary.edgeVerdict === 'Marginal' ? 'bg-yellow-500' : 'bg-red-500'
                          }`} style={{ width: `${Math.min(100, l1.edgeSummary.profitFactor / 3 * 100)}%` }}></div>
                        </div>
                      </div>
                    </Section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Section title="Edge Drivers" icon={<TrendingUp className="w-4 h-4 text-blue-400" />}>
                        {l1.edgeDrivers.length === 0 ? (
                          <p className="text-sm text-slate-500 italic">No significant edge drivers detected yet.</p>
                        ) : (
                          <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                            {l1.edgeDrivers.map((d, i) => (
                              <div key={i} className="text-sm">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-slate-300 font-semibold text-xs">{d.factor}</span>
                                  <span className="text-emerald-400 font-bold text-xs">+{d.lift.toFixed(1)}pp</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${d.winRateWithFactor}%` }}></div>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                                  <span>With: {d.winRateWithFactor.toFixed(0)}%</span>
                                  <span>Without: {d.winRateWithout.toFixed(0)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Section>

                      <Section title="Weaknesses" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
                        {l1.weaknesses.length === 0 ? (
                          <p className="text-sm text-slate-500 italic">No significant weaknesses detected.</p>
                        ) : (
                          <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                            {l1.weaknesses.map((w, i) => (
                              <div key={i} className="p-3 bg-red-950/10 border border-red-900/30 rounded-lg">
                                <div className="text-xs font-bold text-red-300">{w.factor}</div>
                                <div className="text-xs text-slate-500 mt-1">
                                  Win rate: {w.winRateWithFactor.toFixed(0)}% (−{w.impact.toFixed(0)}pp impact)
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Section>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <Section title="What to Monitor" icon={<Activity className="w-4 h-4 text-orange-400" />}>
                      {l1.monitorItems.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No conditions flagged for monitoring.</p>
                      ) : (
                        <div className="space-y-2">
                          {l1.monitorItems.map((item, i) => (
                            <div key={i} className="p-3 border-l-4 border-orange-500/50 rounded-r-lg bg-slate-800/20">
                              <span className="text-xs text-slate-300">{item}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section title="Psychology & Discipline" icon={<Brain className="w-4 h-4 text-pink-400" />}>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">Psychology</span>
                            <span className="text-pink-400 font-bold">{l1.psychologyScore > 0 ? `${l1.psychologyScore.toFixed(0)}/100` : 'N/A'}</span>
                          </div>
                          {l1.psychologyScore > 0 && (
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-pink-500" style={{ width: `${l1.psychologyScore}%` }}></div>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">Discipline</span>
                            <span className="text-blue-400 font-bold">{l1.disciplineScore > 0 ? `${l1.disciplineScore.toFixed(0)}/100` : 'N/A'}</span>
                          </div>
                          {l1.disciplineScore > 0 && (
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${l1.disciplineScore}%` }}></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Section>
                  </div>
                </div>

                {/* Probabilistic Edge */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Section title="Probabilistic Edge (Kelly)" icon={<Target className="w-4 h-4 text-blue-400" />}>
                    <div className="flex items-center gap-6">
                      <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="64" cy="64" r="56" fill="none" stroke="#1e293b" strokeWidth="10" />
                          <circle cx="64" cy="64" r="56" fill="none" stroke={l1.probabilisticEdge > 0 ? '#3b82f6' : '#ef4444'} strokeWidth="10"
                            strokeDasharray={`${2 * Math.PI * 56 * (Math.max(0, l1.probabilisticEdge) / 100)} ${2 * Math.PI * 56}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className={`text-xl font-bold ${l1.probabilisticEdge > 0 ? 'text-blue-400' : 'text-red-400'}`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                            {l1.probabilisticEdge.toFixed(1)}%
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.15em' }}>Kelly</div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Win Rate</span>
                          <span className="font-bold text-emerald-400">{l1.edgeSummary.overallWinRate.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Profit Factor</span>
                          <span className="font-bold text-blue-400">{l1.edgeSummary.profitFactor >= 999 ? '∞' : l1.edgeSummary.profitFactor.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Expectancy/trade</span>
                          <span className={`font-bold ${l1.edgeSummary.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {l1.edgeSummary.expectancy >= 0 ? '+' : ''}{l1.edgeSummary.expectancy.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Section>

                  {/* Win/Loss Factor Correlation */}
                  <Section title="Win Factor Correlation by Instrument" icon={<BarChart3 className="w-4 h-4 text-purple-400" />}>
                    {Object.keys(l1.winFactorCorrelation).length === 0 ? (
                      <p className="text-sm text-slate-500 italic">Not enough data per instrument yet.</p>
                    ) : (
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="text-xs w-full">
                          <tbody>
                            {Object.entries(l1.winFactorCorrelation).map(([instr, scores]) => (
                              <tr key={instr} className="border-b border-slate-800/40">
                                <td className="py-2 pr-3 text-slate-400 font-bold whitespace-nowrap">{instr}</td>
                                {scores.map((s, i) => (
                                  <td key={i} className="py-2 px-1">
                                    <div className="w-10 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white"
                                      style={{ backgroundColor: `rgba(16,185,129,${s / 100})` }}>
                                      {s.toFixed(0)}
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Section>
                </div>
              </div>
            )}

            {/* ── LEVEL 2 ── */}
            {activeLevel === 2 && (
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-sm sm:text-lg font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                  <Database className="text-emerald-500 shrink-0 w-4 h-4 sm:w-5 sm:h-5" /> LEVEL 2 — EVIDENCE & PROOF
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Section title="Variance & Distribution" icon={<TrendingUp className="w-4 h-4 text-blue-400" />}>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-slate-400">Win Rate</span>
                        <span className="text-xl font-bold text-emerald-400">{l2.variance.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-slate-400">Sample Size</span>
                        <span className="text-lg font-bold text-blue-400">{l2.variance.sampleSize}</span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-slate-400">Win/Loss Ratio</span>
                        <span className="text-lg font-bold text-purple-400">{l2.variance.winLossRatio.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-slate-400">Skewness</span>
                        <span className={`text-base font-bold ${l2.variance.skewness > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {l2.variance.skewness.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-slate-400">Kurtosis</span>
                        <span className="text-base font-bold text-slate-300">{l2.variance.kurtosis.toFixed(3)}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between">
                        <span className="text-xs text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.12em' }}>Positive Skew</span>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${l2.variance.positiveSkew ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                          <span className={`text-xs font-bold uppercase ${l2.variance.positiveSkew ? 'text-emerald-400' : 'text-red-400'}`} style={{ letterSpacing: '0.1em' }}>
                            {l2.variance.positiveSkew ? 'Verified' : 'Negative'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section title="Drawdown Metrics" icon={<Activity className="w-4 h-4 text-orange-400" />}>
                    <div className="flex flex-col items-center justify-center py-2">
                      <div className="relative w-32 h-32 mb-4">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="64" cy="64" r="56" fill="none" stroke="#1e293b" strokeWidth="10" />
                          <circle cx="64" cy="64" r="56" fill="none" stroke="#f97316" strokeWidth="10"
                            strokeDasharray={`${2 * Math.PI * 56 * (Math.min(Math.abs(l2.drawdown.maxDrawdown), 100) / 100)} ${2 * Math.PI * 56}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="text-xl font-bold text-orange-400">{Math.abs(l2.drawdown.maxDrawdown).toFixed(1)}%</div>
                          <div className="text-[8px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.12em' }}>Max DD</div>
                        </div>
                      </div>
                      <div className="w-full grid grid-cols-2 gap-4 text-center">
                        <div>
                          <div className="text-sm text-slate-500">Recovery Factor</div>
                          <div className="text-base font-bold text-slate-300">{l2.drawdown.recoveryFactor.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-500">Ulcer Index</div>
                          <div className="text-base font-bold text-slate-300">{l2.drawdown.ulcerIndex.toFixed(3)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-500">Calmar Ratio</div>
                          <div className="text-base font-bold text-blue-400">{l2.drawdown.calmarRatio.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-slate-500">Avg Drawdown</div>
                          <div className="text-base font-bold text-slate-300">{Math.abs(l2.drawdown.avgDrawdown).toFixed(2)}%</div>
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section title="Equity Variance" icon={<Activity className="w-4 h-4 text-purple-400" />}>
                    <div className="space-y-4">
                      <div className="text-center py-2">
                        <div className="text-sm text-slate-500 uppercase font-bold mb-2" style={{ letterSpacing: '0.12em' }}>Consistency Score</div>
                        <div className="text-3xl font-bold text-purple-400">{l2.equityVariance.consistencyScore.toFixed(1)}%</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50">
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Best Month</div>
                          <div className="text-base font-bold text-emerald-400">+{l2.equityVariance.bestMonth.toFixed(0)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Worst Month</div>
                          <div className="text-base font-bold text-red-400">{l2.equityVariance.worstMonth.toFixed(0)}</div>
                        </div>
                        <div className="text-center col-span-2">
                          <div className="text-xs text-slate-500">Monthly Std Dev</div>
                          <div className="text-base font-bold text-slate-300">{l2.equityVariance.monthlyStdDev.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  </Section>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Section title="Trade Quality" icon={<Target className="w-4 h-4 text-emerald-400" />}>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Avg Confluence Score</span>
                        <span className="font-bold text-blue-400">{l2.tradeQuality.avgConfluenceScore.toFixed(1)}</span>
                      </div>
                      {l2.tradeQuality.highQualityWinRate !== null && (
                        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                          <div className="text-xs text-slate-500 mb-1">High Confluence Win Rate (≥70)</div>
                          <div className="text-lg font-bold text-emerald-400">{l2.tradeQuality.highQualityWinRate.toFixed(1)}%</div>
                        </div>
                      )}
                      {l2.tradeQuality.lowQualityWinRate !== null && (
                        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                          <div className="text-xs text-slate-500 mb-1">Low Confluence Win Rate (&lt;40)</div>
                          <div className="text-lg font-bold text-red-400">{l2.tradeQuality.lowQualityWinRate.toFixed(1)}%</div>
                        </div>
                      )}
                      {l2.tradeQuality.highQualityWinRate === null && l2.tradeQuality.lowQualityWinRate === null && (
                        <p className="text-sm text-slate-500 italic">Confluence scores not recorded — add them via manual fields.</p>
                      )}
                    </div>
                  </Section>

                  <Section title="Conditional Edge by Session" icon={<ShieldCheck className="w-4 h-4 text-blue-400" />}>
                    {Object.keys(l2.conditionalEdge.bySession).length === 0 ? (
                      <p className="text-sm text-slate-500 italic">No session data available.</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(l2.conditionalEdge.bySession)
                          .sort((a, b) => b[1].winRate - a[1].winRate)
                          .map(([session, data]) => (
                          <div key={session} className="p-3 bg-slate-800/20 rounded-xl border border-slate-700/30">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-slate-300">{session}</span>
                              <span className="text-xs text-slate-500">{data.trades} trades</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Win Rate</span>
                              <span className={`font-bold ${data.winRate >= 55 ? 'text-emerald-400' : 'text-orange-400'}`}>{data.winRate.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between text-xs mt-1">
                              <span className="text-slate-500">Profit Factor</span>
                              <span className="font-bold text-blue-400">{data.profitFactor.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </div>

                {/* Heatmap Profiles */}
                {l2.heatmapProfiles.length > 0 && (
                  <Section title="Instrument × Strategy Win Rate Profiles">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-xs min-w-[400px]">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="text-left py-2 text-slate-500 font-bold">Instrument</th>
                            <th className="text-left py-2 text-slate-500 font-bold">Strategy</th>
                            <th className="text-right py-2 text-slate-500 font-bold">Win Rate</th>
                            <th className="text-right py-2 text-slate-500 font-bold">Trades</th>
                          </tr>
                        </thead>
                        <tbody>
                          {l2.heatmapProfiles.map((p, i) => (
                            <tr key={i} className="border-b border-slate-800/40">
                              <td className="py-2 font-bold text-slate-300">{p.instrument}</td>
                              <td className="py-2 text-slate-400">{p.strategy}</td>
                              <td className="py-2 text-right">
                                <span className={`font-bold ${p.winRate >= 55 ? 'text-emerald-400' : 'text-orange-400'}`}>{p.winRate.toFixed(1)}%</span>
                              </td>
                              <td className="py-2 text-right text-slate-400">{p.trades}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                )}
              </div>
            )}

            {/* ── LEVEL 3 ── */}
            {activeLevel === 3 && (
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-sm sm:text-lg font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                  <Activity className="text-purple-500 shrink-0 w-4 h-4 sm:w-5 sm:h-5" /> LEVEL 3 — DIAGNOSTICS
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  <Section title="Loss Cluster Severity" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
                    <div className="space-y-4">
                      <div className="text-center p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                        <div className="text-sm text-slate-500 mb-2">Avg Cluster Size</div>
                        <div className="text-xl font-bold text-red-400">{l3.lossCluster.avgClusterSize.toFixed(1)}</div>
                      </div>
                      <div className="text-center p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                        <div className="text-sm text-slate-500 mb-2">Frequency per 100</div>
                        <div className="text-xl font-bold text-orange-400">{l3.lossCluster.clusterFrequency.toFixed(1)}</div>
                      </div>
                      {l3.lossCluster.clusterDates.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Cluster periods</div>
                          {l3.lossCluster.clusterDates.map((d, i) => (
                            <div key={i} className="text-xs text-slate-400 bg-slate-800/30 px-2 py-1 rounded">{d}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Section>

                  <Section title="Execution Asymmetry" icon={<Activity className="w-4 h-4 text-blue-400" />}>
                    <div className="space-y-3">
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                        <div className="text-xs text-slate-500">Avg Win R:R</div>
                        <div className="text-base font-bold text-emerald-400">{l3.executionAsymmetry.avgWinRR?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                      <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                        <div className="text-xs text-slate-500">Avg Loss R:R</div>
                        <div className="text-base font-bold text-red-400">{l3.executionAsymmetry.avgLossRR?.toFixed(2) ?? 'N/A'}</div>
                      </div>
                      <div className="p-3 bg-slate-800/20 border border-slate-700/30 rounded-xl">
                        <div className="text-xs text-slate-500">Early Exit Rate</div>
                        <div className="text-base font-bold text-orange-400">{l3.executionAsymmetry.earlyExitRate?.toFixed(1) ?? 0}%</div>
                      </div>
                      <div className="p-3 bg-slate-800/20 border border-slate-700/30 rounded-xl">
                        <div className="text-xs text-slate-500">Asymmetry Score</div>
                        <div className={`text-base font-bold ${(l3.executionAsymmetry.asymmetryScore ?? 0) >= 1.5 ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {l3.executionAsymmetry.asymmetryScore?.toFixed(3) ?? 'N/A'}
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section title="Regime Transitions" icon={<TrendingUp className="w-4 h-4 text-orange-400" />}>
                    <div className="space-y-3">
                      {[
                        { label: 'Trending', value: l3.regimeTransition.trendingWinRate, color: 'text-blue-400' },
                        { label: 'Ranging', value: l3.regimeTransition.rangingWinRate, color: 'text-purple-400' },
                        { label: 'Breakout', value: l3.regimeTransition.breakoutWinRate, color: 'text-orange-400' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="p-3 bg-slate-800/20 border border-slate-700/30 rounded-xl">
                          <div className="text-xs text-slate-500">{label} Win Rate</div>
                          <div className={`text-base font-bold ${value > 0 ? color : 'text-slate-600'}`}>
                            {value > 0 ? `${value.toFixed(1)}%` : 'No data'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Section title="Capital Heat / Exposure" icon={<AlertTriangle className="w-4 h-4 text-purple-400" />}>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-3 border-b border-slate-800/50">
                        <span className="text-sm text-slate-400">Avg Risk Per Trade</span>
                        <span className={`text-lg font-bold ${l3.capitalHeat.avgRiskPerTrade <= 1.5 ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {l3.capitalHeat.avgRiskPerTrade.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-slate-800/50">
                        <span className="text-sm text-slate-400">Max Risk Per Trade</span>
                        <span className={`text-lg font-bold ${l3.capitalHeat.maxRiskPerTrade <= 2 ? 'text-slate-300' : 'text-red-400'}`}>
                          {l3.capitalHeat.maxRiskPerTrade.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-slate-800/50">
                        <span className="text-sm text-slate-400">Risk Consistency</span>
                        <span className={`text-lg font-bold ${l3.capitalHeat.riskConsistencyScore >= 70 ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {l3.capitalHeat.riskConsistencyScore.toFixed(0)}/100
                        </span>
                      </div>
                      {l3.capitalHeat.correlatedExposure.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500 uppercase font-bold mb-2">Correlated Pairs</div>
                          {l3.capitalHeat.correlatedExposure.map((p, i) => (
                            <div key={i} className="text-xs text-orange-400 bg-orange-500/5 px-2 py-1 rounded mb-1">{p}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Section>

                  <Section title="Automation Risk" icon={<Cpu className="w-4 h-4 text-yellow-400" />}>
                    <div className="flex flex-col items-center justify-center py-6">
                      <div className={`text-4xl font-bold ${
                        l3.automationRisk.score < 30 ? 'text-emerald-400' :
                        l3.automationRisk.score < 60 ? 'text-yellow-400' : 'text-red-400'
                      }`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                        {l3.automationRisk.score.toFixed(0)}
                      </div>
                      <div className="text-sm text-slate-500 mt-2 uppercase" style={{ letterSpacing: '0.15em' }}>/ 100</div>
                      <div className={`mt-4 px-4 py-2 rounded-lg border text-xs font-bold uppercase ${
                        l3.automationRisk.score < 30 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        l3.automationRisk.score < 60 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                        'bg-red-500/10 border-red-500/20 text-red-400'
                      }`} style={{ letterSpacing: '0.1em' }}>
                        {l3.automationRisk.score < 30 ? 'LOW RISK' : l3.automationRisk.score < 60 ? 'MODERATE' : 'HIGH RISK'}
                      </div>
                      {l3.automationRisk.issues.length > 0 && (
                        <div className="mt-4 w-full space-y-2">
                          {l3.automationRisk.issues.map((issue, i) => (
                            <div key={i} className="text-xs text-orange-300 bg-orange-500/5 border border-orange-500/20 px-3 py-2 rounded-lg">{issue}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Section>
                </div>
              </div>
            )}

            {/* ── LEVEL 4 ── */}
            {activeLevel === 4 && (
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-sm sm:text-lg font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                  <PlusCircle className="text-blue-500 shrink-0 w-4 h-4 sm:w-5 sm:h-5" /> LEVEL 4 — ACTION & ITERATION
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Section title="AI Policy Suggestions" icon={<Zap className="w-4 h-4 text-yellow-500" />}>
                    {l4.aiPolicySuggestions.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">No policy suggestions generated yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {l4.aiPolicySuggestions.map((s, i) => (
                          <div key={i} className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                            <div className="text-blue-400 font-bold mb-1 text-sm">{s.rule}</div>
                            <p className="text-xs text-slate-400 mb-2">{s.rationale}</p>
                            <div className="text-[10px] text-emerald-400 font-bold uppercase" style={{ letterSpacing: '0.1em' }}>
                              {s.expectedImpact}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <Section title="Audit-Enforced Guardrails" icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}>
                    <div className="space-y-3">
                      {l4.guardrails.map((g, i) => (
                        <div key={i} className="p-3 bg-slate-800/20 rounded-xl border border-slate-700/30">
                          <div className="text-xs font-bold text-orange-400 mb-1">IF: {g.condition}</div>
                          <div className="text-xs text-slate-300">→ {g.action}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>

                <Section title="Edge Decay Detection" icon={<TrendingUp className="w-4 h-4 text-blue-400" />}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`p-4 rounded-xl border text-center ${l4.edgeDecay.detected ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                      <div className="text-xs text-slate-500 uppercase font-bold mb-2" style={{ letterSpacing: '0.15em' }}>Status</div>
                      <div className={`text-lg font-bold ${l4.edgeDecay.detected ? 'text-red-400' : 'text-emerald-400'}`}>
                        {l4.edgeDecay.detected ? 'DECAY DETECTED' : 'STABLE'}
                      </div>
                    </div>
                    {l4.edgeDecay.detected && (
                      <>
                        <div className="p-4 bg-slate-800/20 rounded-xl border border-slate-700/30 text-center">
                          <div className="text-xs text-slate-500 uppercase font-bold mb-2">Decay Since</div>
                          <div className="text-lg font-bold text-orange-400">{l4.edgeDecay.decayStartDate ?? '—'}</div>
                        </div>
                        <div className="p-4 bg-slate-800/20 rounded-xl border border-slate-700/30 text-center">
                          <div className="text-xs text-slate-500 uppercase font-bold mb-2">Magnitude</div>
                          <div className="text-lg font-bold text-red-400">−{l4.edgeDecay.decayMagnitude.toFixed(1)}pp</div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-4 p-3 bg-slate-800/20 rounded-lg border border-slate-700/30">
                    <p className="text-sm text-slate-400">{l4.edgeDecay.recommendation}</p>
                  </div>
                </Section>

                {/* Final Verdict */}
                <div className={`p-4 sm:p-6 border-2 rounded-2xl ${
                  l4.finalVerdict.overallGrade === 'A' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  l4.finalVerdict.overallGrade === 'B' ? 'bg-blue-500/10 border-blue-500/30' :
                  l4.finalVerdict.overallGrade === 'C' ? 'bg-yellow-500/10 border-yellow-500/30' :
                  'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                      <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0 border-2 ${
                        l4.finalVerdict.overallGrade === 'A' ? 'bg-emerald-500/20 border-emerald-500/40' :
                        l4.finalVerdict.overallGrade === 'B' ? 'bg-blue-500/20 border-blue-500/40' :
                        l4.finalVerdict.overallGrade === 'C' ? 'bg-yellow-500/20 border-yellow-500/40' :
                        'bg-red-500/20 border-red-500/40'
                      }`}>
                        <span className={`text-2xl font-bold ${
                          l4.finalVerdict.overallGrade === 'A' ? 'text-emerald-400' :
                          l4.finalVerdict.overallGrade === 'B' ? 'text-blue-400' :
                          l4.finalVerdict.overallGrade === 'C' ? 'text-yellow-400' : 'text-red-400'
                        }`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                          {l4.finalVerdict.overallGrade}
                        </span>
                      </div>
                      <div>
                        <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold mb-1" style={{ letterSpacing: '0.2em' }}>Final Audit Verdict</div>
                        <p className="text-sm text-slate-300 leading-relaxed max-w-xl">{l4.finalVerdict.summary}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-700/40">
                    <div>
                      <div className="text-xs text-emerald-400 uppercase font-bold mb-2" style={{ letterSpacing: '0.1em' }}>Strengths</div>
                      <ul className="space-y-1">
                        {l4.finalVerdict.topStrengths.map((s, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-2">
                            <span className="text-emerald-500 shrink-0">+</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs text-red-400 uppercase font-bold mb-2" style={{ letterSpacing: '0.1em' }}>Weaknesses</div>
                      <ul className="space-y-1">
                        {l4.finalVerdict.topWeaknesses.length === 0
                          ? <li className="text-xs text-slate-500 italic">None identified</li>
                          : l4.finalVerdict.topWeaknesses.map((w, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-2">
                            <span className="text-red-500 shrink-0">−</span>{w}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs text-blue-400 uppercase font-bold mb-2" style={{ letterSpacing: '0.1em' }}>Next Actions</div>
                      <ol className="space-y-1">
                        {l4.finalVerdict.nextActions.map((a, i) => (
                          <li key={i} className="text-xs text-slate-300 flex gap-2">
                            <span className="text-blue-500 shrink-0 font-bold">{i + 1}.</span>{a}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        .strategy-audit-root, .strategy-audit-root * { font-family: 'Rajdhani', sans-serif; }
        .custom-scrollbar { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #475569 #1e293b; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; border: 1px solid #334155; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Section = ({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) => (
  <section className="bg-slate-900/40 border border-slate-800/60 rounded-xl sm:rounded-2xl p-3 sm:p-5 md:p-6 hover:border-slate-700/80 transition-all duration-300">
    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-5">
      {icon && <div className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-lg">{icon}</div>}
      <h3 className="text-sm font-bold uppercase text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.15em' }}>{title}</h3>
    </div>
    {children}
  </section>
);

const StatCard = ({ label, value, trend, color }: { label: string; value: string; trend: string; color: string }) => (
  <div className="bg-slate-900/60 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col gap-1 hover:bg-slate-900/80 transition-all">
    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.2em' }}>{label}</span>
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-base sm:text-lg font-bold ${color}`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{value}</span>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
        {trend}
      </span>
    </div>
  </div>
);

export default StrategyAudit;
