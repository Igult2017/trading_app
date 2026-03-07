import { useState, useMemo } from 'react';
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
  Search,
  PlusCircle,
  Clock,
  Settings,
  Cpu
} from 'lucide-react';

const StrategyAudit = () => {
  const [activeLevel, setActiveLevel] = useState(1);

  const tradeData = useMemo(() => ({
    instruments: ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD'],
    winFactors: ['ATR 1.2-1.8', 'LDN Open', 'RSI 40-60', 'Vol >2.0x', 'H1 Flip'],
    lossFactors: ['ATR <0.5', 'Spread >2.5', 'News <15m', 'Consolidation', 'Low Liq'],
    winCorrelations: {
      'EURUSD': [85, 72, 91, 68, 78],
      'GBPUSD': [62, 88, 54, 75, 81],
      'XAUUSD': [93, 45, 67, 89, 71],
      'USDJPY': [71, 69, 82, 61, 66],
      'AUDUSD': [58, 81, 73, 70, 59],
      'NZDUSD': [64, 76, 68, 64, 72],
      'USDCAD': [77, 58, 79, 82, 68]
    },
    lossCorrelations: {
      'EURUSD': [72, 89, 48, 81, 65],
      'GBPUSD': [68, 92, 52, 76, 71],
      'XAUUSD': [45, 67, 38, 88, 79],
      'USDJPY': [81, 78, 61, 72, 58],
      'AUDUSD': [76, 85, 55, 69, 82],
      'NZDUSD': [69, 81, 49, 74, 77],
      'USDCAD': [73, 74, 44, 79, 68]
    },
    variance: {
      winRate: 62.4,
      sampleSize: 458,
      winLossRatio: 1.92,
      positiveSkew: true
    },
    drawdown: {
      maxPeakToValley: 8.4,
      recovery: 12,
      stagnation: 31
    },
    equityVariance: {
      simulationConfidence: 89.2,
      varianceSkew: 1.4,
      maxCluster: 6
    },
    coreRobustness: {
      ruleStability: 94,
      executionAdherence: 98.5,
      monteCarloStability: 89.2
    },
    probabilisticEdge: {
      baseRate: 62.4,
      avgWin: 1.82,
      avgLoss: 0.95
    },
    tradeQuality: {
      aTrades: { count: 28, profit: 70 },
      bTrades: { count: 46, profit: 24 },
      cTrades: { count: 26, profit: 6 }
    },
    conditionalEdge: {
      liquidityGap: { rMultiple: 1.05, samples: 120 },
      nonQualified: { rMultiple: 0.5, samples: 338 }
    },
    lossCluster: {
      avgLength: 2.4,
      worstDD: 4.5
    },
    executionAsymmetry: {
      slippageWins: 0.3,
      slippageLosses: 0.6
    },
    regimeTransition: {
      avgTransitionDD: 3.2,
      recoveryTrades: 8
    },
    capitalHeat: {
      peakEquityAtRisk: 37,
      timeAtPeak: 22
    },
    automationRisk: 1.8,
    edgeTransferability: 92,
    riskMetrics: {
      maxLossStreak: 6,
      fiveLossProbability: 14,
      timeInDrawdown: 31
    },
    edgeComponents: {
      winRateContribution: 48,
      riskRewardContribution: 38
    },
    edgeDecay: {
      last50: 0.42,
      last200: 0.48
    },
    logicalVerification: {
      regime: 'High-Volatility Trending (Expansion Phases)',
      entryLogic: 'AI-detected liquidity gaps + Order Flow Imbalance',
      exitLogic: 'Dynamic volatility-adjusted trailing stops',
      scalingProperties: 'Deep liquidity depth; scalable to institutional tiers',
      sessionDependency: 'Dominant in New York & London overlaps',
      behavioralFit: 'Fully autonomous; no discretionary input',
      forwardConfirmation: '6-month live walk-forward verified'
    }
  }), []);

  const levels = [
    { id: 1, label: 'STRATEGY AUDIT', icon: <Search className="w-4 h-4" /> },
    { id: 2, label: 'EVIDENCE & PROOF', icon: <Database className="w-4 h-4" /> },
    { id: 3, label: 'DIAGNOSTICS', icon: <Activity className="w-4 h-4" /> },
    { id: 4, label: 'ACTION & ITERATION', icon: <PlusCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="strategy-audit-root min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-12 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink">
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 rounded flex items-center justify-center shrink-0">
              <Cpu className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-[11px] sm:text-lg uppercase text-slate-100 whitespace-nowrap" style={{ letterSpacing: '0.15em' }}>
                <span className="hidden sm:inline">AI Strategy</span>
                <span className="sm:hidden">AI</span>
                <span className="text-blue-500">
                  <span className="hidden sm:inline"> Auditor</span>
                  <span className="sm:hidden"> Audit</span>
                </span>
              </span>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <div className="flex bg-slate-800/50 p-0.5 sm:p-1 rounded-lg border border-slate-700 overflow-x-auto max-w-[calc(100vw-160px)] sm:max-w-none">
              {levels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setActiveLevel(level.id)}
                  data-testid={`button-level-${level.id}`}
                  className={`px-2 sm:px-4 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all duration-200 flex items-center gap-1 sm:gap-2 whitespace-nowrap shrink-0 ${
                    activeLevel === level.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                    : 'text-slate-400 hover:text-slate-100'
                  }`}
                  style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.08em' }}
                >
                  {level.icon}
                  <span className="hidden lg:inline">{level.label}</span>
                  <span className="hidden sm:inline lg:hidden">L{level.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Audit Win Rate" value="64.2%" trend="+2.1%" color="text-emerald-400" />
          <StatCard label="Edge Persistence" value="2.14" trend="+0.12" color="text-blue-400" />
          <StatCard label="Risk Entropy" value="Low" trend="-0.2" color="text-slate-400" />
          <StatCard label="AI Confidence" value="High" trend="92/100" color="text-purple-400" />
        </div>

        {activeLevel === 1 && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-base sm:text-2xl font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                <Search className="text-blue-500 shrink-0 w-4 h-4 sm:w-6 sm:h-6" /> LEVEL 1 — STRATEGY AUDIT
              </h2>
              <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700 w-fit" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.1em' }}>
                Audit Cycle: Q4 2023 - PRESENT
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                <Section title="Executive Summary" icon={<Zap className="w-4 h-4 text-yellow-400" />}>
                  <div className="max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                    <p className="text-slate-300 leading-relaxed text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>
                      The AI Auditor has identified a robust statistical edge during high-volatility London/NY overlap sessions. 
                      Recent performance indicates a tightening of the equity curve with a specific reduction in "fat tail" risk events.
                      System suggests shifting sizing from linear to volatility-weighted based on VIX thresholds above 18.
                    </p>
                  </div>
                </Section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Section title="Is There an Edge?" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="text-3xl font-bold text-emerald-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>YES</div>
                      <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '88%' }}></div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.05em' }}>
                      Confidence: 95% (+/- 2.1%) | 482 samples
                    </p>
                  </Section>

                  <Section title="Edge Drivers" icon={<TrendingUp className="w-4 h-4 text-blue-400" />}>
                    <div className="max-h-[80px] overflow-y-auto pr-2 custom-scrollbar">
                      <ul className="text-sm space-y-2">
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Mean Reversion during Asian session lulls</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Momentum continuation at H1 supply/demand flips</span>
                        </li>
                      </ul>
                    </div>
                  </Section>
                </div>
              </div>

              <div className="space-y-6">
                <Section title="What to Monitor Next" icon={<Activity className="w-4 h-4 text-orange-400" />}>
                  <div className="max-h-[120px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    <MonitorItem label="Correlated USD Strength" status="High Priority" color="border-orange-500/50" />
                    <MonitorItem label="H4 Liquidity Gaps" status="Monitoring" color="border-slate-700" />
                    <MonitorItem label="Volatility Contraction" status="New" color="border-blue-500/50" />
                  </div>
                </Section>

                <Section title="Audit-Driven Changes" icon={<Clock className="w-4 h-4 text-purple-400" />}>
                  <div className="max-h-[120px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    <div className="text-xs border-l-2 border-purple-500 pl-3 py-1 bg-purple-500/5">
                      <div className="font-semibold text-slate-200" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.05em' }}>Trailing Stop Adjustment</div>
                      <div className="text-slate-500 italic" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 400 }}>Implemented 14 days ago. ROI improved 0.4%.</div>
                    </div>
                    <div className="text-xs border-l-2 border-slate-600 pl-3 py-1 bg-slate-800/20">
                      <div className="font-semibold text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.05em' }}>Previous: Fixed TP Ratio</div>
                      <div className="text-slate-600 italic" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 400 }}>Deprecated Q3.</div>
                    </div>
                  </div>
                </Section>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Section title="Weaknesses & Failure Conditions" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
                <div className="bg-red-950/10 border border-red-900/30 p-4 rounded-lg">
                  <p className="text-sm text-red-200 mb-2 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>Low Liquidity Environments</p>
                  <p className="text-xs text-red-300/80 leading-relaxed" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Strategy fails during bank holidays and pre-FOMC consolidation. AI recommends disabling auto-execution 4 hours prior to red-folder news events.</p>
                </div>
              </Section>

              <Section title="Psychology Impact" icon={<Brain className="w-4 h-4 text-pink-400" />}>
                <div className="flex gap-4 h-full items-center">
                  <div className="flex-1 text-center p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div className="text-2xl font-bold text-pink-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>7.8</div>
                    <div className="text-[10px] uppercase text-slate-500 mt-1 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em' }}>Stress Score</div>
                  </div>
                  <div className="flex-1 text-center p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div className="text-2xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>92%</div>
                    <div className="text-[10px] uppercase text-slate-500 mt-1 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em' }}>Rule Adherence</div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Section title="Probabilistic Edge" icon={<Target className="w-4 h-4 text-blue-400" />}>
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="relative w-40 h-40 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="80" cy="80" r="70" fill="none" stroke="#1e293b" strokeWidth="12" />
                      <circle 
                        cx="80" cy="80" r="70" fill="none" stroke="url(#blueGradient)" strokeWidth="12"
                        strokeDasharray={`${2 * Math.PI * 70 * (tradeData.probabilisticEdge.baseRate / 100)} ${2 * Math.PI * 70}`}
                        strokeLinecap="round"
                      />
                      <defs>
                        <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-4xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.probabilisticEdge.baseRate}%</div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.15em' }}>Base Rate</div>
                    </div>
                  </div>
                  <div className="mt-6 w-full space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Avg Win</span>
                      <span className="font-bold text-emerald-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.probabilisticEdge.avgWin}R</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Avg Loss</span>
                      <span className="font-bold text-red-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.probabilisticEdge.avgLoss}R</span>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Risk & Failure" icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Max Loss Streak</span>
                    <span className="text-2xl font-bold text-red-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.riskMetrics.maxLossStreak}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>5-Loss Probability</span>
                    <span className="text-xl font-bold text-orange-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.riskMetrics.fiveLossProbability}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Time in Drawdown</span>
                    <span className="text-xl font-bold text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.riskMetrics.timeInDrawdown}%</span>
                  </div>
                </div>
              </Section>

              <Section title="Edge Component Breakdown" icon={<BarChart3 className="w-4 h-4 text-purple-400" />}>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-400 uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>Win Rate</span>
                      <span className="text-blue-400 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.edgeComponents.winRateContribution}%</span>
                    </div>
                    <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-1000" style={{ width: `${tradeData.edgeComponents.winRateContribution}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-400 uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>Risk-Reward</span>
                      <span className="text-purple-400 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.edgeComponents.riskRewardContribution}%</span>
                    </div>
                    <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-1000" style={{ width: `${tradeData.edgeComponents.riskRewardContribution}%` }}></div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            <Section title="Logical Verification Elements" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <VerificationItem label="Regime" value={tradeData.logicalVerification.regime} />
                <VerificationItem label="Entry Logic" value={tradeData.logicalVerification.entryLogic} />
                <VerificationItem label="Exit Logic" value={tradeData.logicalVerification.exitLogic} />
                <VerificationItem label="Scaling Properties" value={tradeData.logicalVerification.scalingProperties} />
                <VerificationItem label="Session Dependency" value={tradeData.logicalVerification.sessionDependency} />
                <VerificationItem label="Behavioral Fit" value={tradeData.logicalVerification.behavioralFit} />
                <VerificationItem label="Forward Confirmation" value={tradeData.logicalVerification.forwardConfirmation} />
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800/50 flex items-center justify-end gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-400 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.15em' }}>System Certified</span>
                </div>
              </div>
            </Section>
          </div>
        )}

        {activeLevel === 2 && (
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-base sm:text-2xl font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
              <Database className="text-emerald-500 shrink-0 w-4 h-4 sm:w-6 sm:h-6" /> LEVEL 2 — EVIDENCE & PROOF
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Section title="Variance & Distribution" icon={<TrendingUp className="w-4 h-4 text-blue-400" />}>
                <div className="space-y-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Win Rate</span>
                    <span className="text-3xl font-bold text-emerald-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.variance.winRate}%</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Sample Size</span>
                    <span className="text-2xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.variance.sampleSize}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Win/Loss Ratio</span>
                    <span className="text-2xl font-bold text-purple-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.variance.winLossRatio}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between">
                    <span className="text-xs text-slate-500 uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em' }}>Positive Skew</span>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-xs font-bold text-emerald-400 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>Verified</span>
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
                        strokeDasharray={`${2 * Math.PI * 56 * (tradeData.drawdown.maxPeakToValley / 100)} ${2 * Math.PI * 56}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-3xl font-bold text-orange-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.drawdown.maxPeakToValley}%</div>
                      <div className="text-[8px] text-slate-500 uppercase font-bold" style={{ letterSpacing: '0.12em' }}>Max DD</div>
                    </div>
                  </div>
                  <div className="w-full grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-sm text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Recovery</div>
                      <div className="text-xl font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.drawdown.recovery} days</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Stagnation</div>
                      <div className="text-xl font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.drawdown.stagnation}%</div>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Equity Variance" icon={<Activity className="w-4 h-4 text-purple-400" />}>
                <div className="space-y-4">
                  <div className="text-center py-2">
                    <div className="text-sm text-slate-500 uppercase font-bold mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.12em' }}>Simulation (N=10K)</div>
                    <div className="text-3xl sm:text-5xl font-bold text-purple-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.equityVariance.simulationConfidence}%</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50">
                    <div className="text-center">
                      <div className="text-xs text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Variance Skew</div>
                      <div className="text-xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.equityVariance.varianceSkew}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Max Cluster</div>
                      <div className="text-xl font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.equityVariance.maxCluster}</div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Audit Scope & Confidence">
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Dataset (Total Audited)</span>
                    <span className="font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>1,248 Trades</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Statistical Significance</span>
                    <span className="text-emerald-400 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>98.2%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full w-[98%]"></div>
                  </div>
                </div>
              </Section>

              <Section title="Edge Evidence (Monte Carlo)">
                <div className="flex items-end gap-1 h-24 overflow-hidden">
                  {[40, 70, 45, 90, 65, 80, 50, 95, 100, 75, 85, 60, 40, 55, 70, 30].map((h, i) => (
                    <div key={i} className="flex-1 bg-blue-500/20 hover:bg-blue-500/50 transition-all rounded-t-sm" style={{ height: `${h}%` }}></div>
                  ))}
                </div>
                <div className="mt-4 text-xs text-slate-500 text-center uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.2em' }}>N=10,000 Simulations</div>
              </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Trade Quality Stratification" icon={<Target className="w-4 h-4 text-emerald-400" />}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <div>
                      <div className="text-xs text-slate-500 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>A-Trades <span className="text-slate-600">({tradeData.tradeQuality.aTrades.count})</span></div>
                      <div className="text-2xl font-bold text-emerald-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.tradeQuality.aTrades.profit}% Profit</div>
                    </div>
                    <div className="text-4xl font-bold text-emerald-500/20" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>A</div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-xl">
                    <div>
                      <div className="text-xs text-slate-500 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>B-Trades <span className="text-slate-600">({tradeData.tradeQuality.bTrades.count})</span></div>
                      <div className="text-2xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.tradeQuality.bTrades.profit}% Profit</div>
                    </div>
                    <div className="text-4xl font-bold text-blue-500/20" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>B</div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-500/10 to-slate-500/5 border border-slate-500/20 rounded-xl">
                    <div>
                      <div className="text-xs text-slate-500 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>C-Trades <span className="text-slate-600">({tradeData.tradeQuality.cTrades.count})</span></div>
                      <div className="text-2xl font-bold text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.tradeQuality.cTrades.profit}% Profit</div>
                    </div>
                    <div className="text-4xl font-bold text-slate-500/20" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>C</div>
                  </div>
                </div>
              </Section>

              <Section title="Conditional Edge Validation" icon={<ShieldCheck className="w-4 h-4 text-blue-400" />}>
                <div className="space-y-6">
                  <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                    <div className="text-xs text-blue-400 uppercase font-bold mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>Liquidity-Gap: {tradeData.conditionalEdge.liquidityGap.rMultiple}R</div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Samples</span>
                      <span className="text-xl font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.conditionalEdge.liquidityGap.samples}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-800/20 border border-slate-700/30 rounded-xl">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>Non-Qualified: {tradeData.conditionalEdge.nonQualified.rMultiple}R</div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Samples</span>
                      <span className="text-xl font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.conditionalEdge.nonQualified.samples}</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800/50">
                    <div className="text-[10px] text-slate-600 italic text-center" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Market retention: {tradeData.edgeTransferability}%</div>
                  </div>
                </div>
              </Section>
            </div>

            <Section title="Winning vs Losing Profiles (AI Classification)">
              <div className="heatmap-outer">
                <div className="flex flex-col lg:flex-row gap-6" style={{ minWidth: 'max-content' }}>

                  <div className="min-w-[320px] lg:w-[480px]" style={{ flexShrink: 0 }}>
                    <div className="text-xs font-bold text-emerald-400 uppercase bg-emerald-400/5 px-3 py-2 rounded-lg border border-emerald-500/10 mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.12em' }}>
                      Alpha Profile (Success Factors)
                    </div>
                    <div className="heatmap-inner">
                      <HeatmapGrid instruments={tradeData.instruments} factors={tradeData.winFactors} correlations={tradeData.winCorrelations} type="win" />
                    </div>
                  </div>

                  <div className="min-w-[320px] lg:w-[480px]" style={{ flexShrink: 0 }}>
                    <div className="text-xs font-bold text-red-400 uppercase bg-red-400/5 px-3 py-2 rounded-lg border border-red-500/10 mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.12em' }}>
                      Failure Profile (Decay Factors)
                    </div>
                    <div className="heatmap-inner" style={{ scrollbarColor: '#ef4444 #1e293b' }}>
                      <HeatmapGrid instruments={tradeData.instruments} factors={tradeData.lossFactors} correlations={tradeData.lossCorrelations} type="loss" />
                    </div>
                  </div>

                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-800/50">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-500 uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em' }}>Correlation Intensity</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Low</span>
                    <div className="flex gap-1">
                      {[20, 40, 60, 80, 100].map((intensity) => (
                        <div key={intensity} className="w-8 h-4 rounded" style={{ background: `rgba(16, 185, 129, ${intensity / 100})` }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif" }}>High</span>
                  </div>
                  <div className="text-[9px] text-slate-600 italic" style={{ fontFamily: "'Rajdhani', sans-serif" }}>← Scroll horizontally →</div>
                </div>
              </div>
            </Section>
          </div>
        )}

        {activeLevel === 3 && (
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-base sm:text-2xl font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
              <Activity className="text-purple-500 shrink-0 w-4 h-4 sm:w-6 sm:h-6" /> LEVEL 3 — DIAGNOSTICS
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <Section title="Component Breakdown">
                  <div className="overflow-x-auto custom-scrollbar">
                    <div className="min-w-[500px]">
                      <div className="text-xs text-slate-400 mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Sub-strategy performance analysis</div>
                    </div>
                  </div>
                </Section>
              </div>
              <Section title="Failure Mode Analysis">
                <div className="space-y-3">
                  <div className="text-xs text-red-400 mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>Critical risk factors</div>
                </div>
              </Section>
            </div>

            <Section title="Core Robustness" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-400 uppercase font-bold flex items-center gap-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                      <Target className="w-3 h-3" /> Rule Stability
                    </span>
                    <span className="text-blue-400 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.coreRobustness.ruleStability}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${tradeData.coreRobustness.ruleStability}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-400 uppercase font-bold flex items-center gap-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                      <Zap className="w-3 h-3" /> Execution Adherence
                    </span>
                    <span className="text-emerald-400 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.coreRobustness.executionAdherence}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${tradeData.coreRobustness.executionAdherence}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-400 uppercase font-bold flex items-center gap-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
                      <Activity className="w-3 h-3" /> Monte Carlo Stability
                    </span>
                    <span className="text-purple-400 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.coreRobustness.monteCarloStability}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500" style={{ width: `${tradeData.coreRobustness.monteCarloStability}%` }}></div>
                  </div>
                </div>
              </div>
            </Section>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <Section title="Loss Cluster Severity" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                    <div className="text-sm text-slate-500 mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Avg Cluster Length</div>
                    <div className="text-3xl font-bold text-red-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.lossCluster.avgLength}</div>
                  </div>
                  <div className="text-center p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                    <div className="text-sm text-slate-500 mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Worst DD Cluster</div>
                    <div className="text-3xl font-bold text-orange-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.lossCluster.worstDD}%</div>
                  </div>
                </div>
              </Section>

              <Section title="Execution Asymmetry" icon={<Activity className="w-4 h-4 text-blue-400" />}>
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <div className="text-xs text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Slippage (Wins)</div>
                    <div className="text-xl font-bold text-emerald-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.executionAsymmetry.slippageWins} ticks</div>
                  </div>
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                    <div className="text-xs text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Slippage (Losses)</div>
                    <div className="text-xl font-bold text-red-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.executionAsymmetry.slippageLosses} ticks</div>
                  </div>
                </div>
              </Section>

              <Section title="Regime Transition" icon={<TrendingUp className="w-4 h-4 text-orange-400" />}>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                    <div className="text-sm text-slate-500 mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Avg Transition DD</div>
                    <div className="text-3xl font-bold text-orange-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.regimeTransition.avgTransitionDD}%</div>
                  </div>
                  <div className="text-center p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                    <div className="text-sm text-slate-500 mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Recovery Trades</div>
                    <div className="text-3xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.regimeTransition.recoveryTrades}</div>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Section title="Capital Heat / Exposure" icon={<AlertTriangle className="w-4 h-4 text-purple-400" />}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-slate-800/50">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Peak Equity at Risk</span>
                    <span className="text-2xl font-bold text-purple-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.capitalHeat.peakEquityAtRisk}%</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm text-slate-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Time at Peak</span>
                    <span className="text-2xl font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.capitalHeat.timeAtPeak}%</span>
                  </div>
                </div>
              </Section>

              <Section title="Automation Risk" icon={<Cpu className="w-4 h-4 text-yellow-400" />}>
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="text-4xl sm:text-6xl font-bold text-yellow-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.automationRisk}%</div>
                  <div className="text-sm text-slate-500 mt-3 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.15em' }}>Execution Failure</div>
                  <div className="mt-6 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <span className="text-xs text-yellow-400 font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>LOW RISK</span>
                  </div>
                </div>
              </Section>
            </div>
          </div>
        )}

        {activeLevel === 4 && (
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-base sm:text-2xl font-bold flex items-center gap-2 sm:gap-3" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>
              <PlusCircle className="text-blue-500 shrink-0 w-4 h-4 sm:w-6 sm:h-6" /> LEVEL 4 — ACTION & ITERATION
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="AI Policy Suggestions" icon={<Zap className="w-4 h-4 text-yellow-500" />}>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                    <div className="text-blue-400 font-bold mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>Scale-In Protocol 2.0</div>
                    <p className="text-sm text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Add 50% size after 1:1 RR. Projected +14.2% profit.</p>
                  </div>
                  <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                    <div className="text-blue-400 font-bold mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>Volatility Ceiling Mod</div>
                    <p className="text-sm text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Reduce sizing 30% when VIX &gt; 35 for 3h.</p>
                  </div>
                </div>
              </Section>

              <Section title="Audit-Enforced Guardrails" icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}>
                <div className="space-y-3">
                  <GuardrailItem label="Max Daily Loss" value="2.0%" status="Active" />
                  <GuardrailItem label="Correlation Limit" value="0.75" status="Active" />
                  <GuardrailItem label="Volatility Ceiling" value="VIX 35" status="Review" color="text-yellow-400" />
                  <GuardrailItem label="Max Open Pairs" value="4" status="Active" />
                </div>
              </Section>
            </div>

            <Section title="Edge Decay / Rolling Trend" icon={<TrendingUp className="w-4 h-4 text-blue-400" />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-xl text-center">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.15em' }}>Last 50 Trades</div>
                  <div className="text-3xl sm:text-5xl font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.edgeDecay.last50}R</div>
                </div>
                <div className="p-4 sm:p-6 bg-purple-500/5 border border-purple-500/20 rounded-xl text-center">
                  <div className="text-xs text-slate-500 uppercase font-bold mb-2" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.15em' }}>Last 200 Trades</div>
                  <div className="text-3xl sm:text-5xl font-bold text-purple-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{tradeData.edgeDecay.last200}R</div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Edge Stability Trend</span>
                  <span className="text-xs font-bold text-emerald-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.1em' }}>↗ IMPROVING</span>
                </div>
              </div>
            </Section>

            <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-2 border-emerald-500/30 rounded-2xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] sm:text-xs text-emerald-500 uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.2em' }}>Final Audit Verdict</span>
                    </div>
                    <div className="text-xl sm:text-3xl font-bold text-emerald-400 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.08em' }}>System Authorized</div>
                    <div className="text-xs sm:text-sm text-slate-400 mt-1" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>Structural check passed. Max DD 8.4% within tolerance.</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
                    <div className="text-[10px] text-slate-500 uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.15em' }}>Next Phase</div>
                    <div className="text-lg font-bold text-blue-400" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>Walk-Forward 30D</div>
                  </div>
                  <div className="text-[9px] text-slate-600 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.2em' }}>Audit: Alpha-4.6</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&display=swap');

        .strategy-audit-root, .strategy-audit-root * {
          font-family: 'Rajdhani', sans-serif;
        }

        .custom-scrollbar {
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: #475569 #1e293b;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 4px;
          border: 1px solid #334155;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .custom-scrollbar::-webkit-scrollbar-corner {
          background: #1e293b;
        }

        .heatmap-outer {
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: #475569 #1e293b;
          padding-bottom: 12px;
        }
        .heatmap-outer::-webkit-scrollbar {
          height: 8px;
        }
        .heatmap-outer::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 4px;
          margin: 0 4px;
        }
        .heatmap-outer::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 4px;
          border: 1px solid #334155;
        }
        .heatmap-outer::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .heatmap-inner {
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: #22c55e #1e293b;
          padding-bottom: 10px;
        }
        .heatmap-inner::-webkit-scrollbar {
          height: 6px;
        }
        .heatmap-inner::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 4px;
        }
        .heatmap-inner::-webkit-scrollbar-thumb {
          background: #22c55e;
          border-radius: 4px;
        }
        .heatmap-inner::-webkit-scrollbar-thumb:hover {
          background: #4ade80;
        }
      `}} />
    </div>
  );
};

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
  <div className="bg-slate-900/60 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col gap-1 hover:bg-slate-900/80 transition-all" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.2em' }}>{label}</span>
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-xl sm:text-2xl font-bold ${color}`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{value}</span>
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800/50 ${trend.startsWith('+') ? 'text-emerald-400' : 'text-slate-400'}`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
        {trend}
      </span>
    </div>
  </div>
);

const MonitorItem = ({ label, status, color }: { label: string; status: string; color: string }) => (
  <div className={`p-3 border-l-4 rounded-r-lg bg-slate-800/20 flex items-center justify-between ${color}`}>
    <span className="text-sm font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>{label}</span>
    <span className="text-[9px] uppercase font-black text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.12em' }}>{status}</span>
  </div>
);

const HeatmapGrid = ({ instruments, factors, correlations, type }: { instruments: string[]; factors: string[]; correlations: Record<string, number[]>; type: string }) => {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number; value: number; instrument: string; factor: string } | null>(null);

  const getHeatColor = (value: number, type: string) => {
    const baseColor = type === 'win' ? '16, 185, 129' : '239, 68, 68';
    return `rgba(${baseColor}, ${value / 100})`;
  };

  const getIntensityLabel = (value: number) => {
    if (value >= 85) return 'Critical';
    if (value >= 70) return 'High';
    if (value >= 55) return 'Med';
    return 'Low';
  };

  return (
    <div className="min-w-max">
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `110px repeat(${factors.length}, 80px)` }}>
        <div></div>
        {factors.map((factor, idx) => (
          <div key={idx} className="text-[9px] font-bold text-slate-400 uppercase p-2 text-center bg-slate-800/20 rounded" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }} title={factor}>
            {factor}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {instruments.map((instrument, rowIdx) => (
          <div key={instrument} className="grid gap-1" style={{ gridTemplateColumns: `110px repeat(${factors.length}, 80px)` }}>
            <div className="text-xs font-bold text-slate-300 p-2 bg-slate-800/30 rounded" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{instrument}</div>
            {correlations[instrument].map((value, colIdx) => (
              <div
                key={colIdx}
                className="relative p-2 rounded cursor-pointer border border-slate-800/50 hover:border-slate-600"
                style={{ backgroundColor: getHeatColor(value, type) }}
                onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx, value, instrument, factor: factors[colIdx] })}
                onMouseLeave={() => setHoveredCell(null)}
              >
                <div className="text-[10px] font-bold text-white text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
                  {value}%
                </div>
                {hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx && (
                  <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl whitespace-nowrap">
                    <div className="text-[10px] font-bold text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{instrument}</div>
                    <div className="text-[9px] text-slate-500" style={{ fontFamily: "'Rajdhani', sans-serif" }}>{factors[colIdx]}</div>
                    <div className="text-xs font-bold text-white mt-1" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{value}% — {getIntensityLabel(value)}</div>
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

const GuardrailItem = ({ label, value, status, color = "text-emerald-400" }: { label: string; value: string; status: string; color?: string }) => (
  <div className="flex items-center justify-between p-3 bg-slate-800/20 rounded-xl border border-slate-700/30 gap-4">
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] font-bold text-slate-500 uppercase" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.2em' }}>{label}</span>
      <span className="text-sm font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{value}</span>
    </div>
    <span className={`text-[9px] font-black uppercase bg-slate-800/40 px-2 py-0.5 rounded ${color}`} style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.15em' }}>{status}</span>
  </div>
);

const VerificationItem = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <div className="text-xs text-slate-500 uppercase font-bold" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, letterSpacing: '0.15em' }}>{label}</div>
    <div className="text-sm text-slate-200 leading-relaxed" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>{value}</div>
  </div>
);

export default StrategyAudit;