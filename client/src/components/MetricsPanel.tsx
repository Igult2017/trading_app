import { useState } from 'react';
import {
  TrendingUp, Zap, Sparkles, Brain, ChevronRight, BarChart3,
  Filter, Clock, Activity, Globe, ArrowUpRight, ChevronDown,
  Target, Shield, ShieldCheck, DoorOpen, Award, Layers,
  Compass, CheckCircle2, TrendingDown, BarChart2,
  Users, RefreshCcw, Calendar, Timer, Percent, ArrowUp,
  LineChart
} from 'lucide-react';

export default function MetricsPanel() {
  const [selectedStrategy, setSelectedStrategy] = useState('ALL STRATEGIES');
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [equityView, setEquityView] = useState('WEEKLY');

  const strategies = ['ALL STRATEGIES', 'SILVER BULLET', 'ICT BREAKER', 'LONDON OPEN'];

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

      <div className="max-w-[1600px] mx-auto space-y-8">

        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { id: 'net-profit',      label: 'Total P&L',       value: '$2,100', color: '#10b981', iconBg: 'rgba(16,185,129,0.12)',  iconPath: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
              { id: 'win-rate',        label: 'Win Rate',         value: '67%',    color: '#60a5fa', iconBg: 'rgba(96,165,250,0.12)',   iconPath: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3' },
              { id: 'expectancy',      label: 'R Expectancy',     value: '2.83R',  color: '#fbbf24', iconBg: 'rgba(251,191,36,0.12)',   iconPath: 'M22 7 13.5 15.5 8.5 10.5 2 17M22 7h-5M22 7v5' },
              { id: 'trade-count',     label: 'Trades',           value: '3',      color: '#e2e8f0', iconBg: 'rgba(148,163,184,0.10)', iconPath: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18' },
              { id: 'profit-factor',   label: 'Profit Factor',    value: '8.00',   color: '#c084fc', iconBg: 'rgba(192,132,252,0.12)', iconPath: 'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-8v4m0-8v.01' },
              { id: 'avg-rr',          label: 'Avg R:R',          value: '1:2.5',  color: '#34d399', iconBg: 'rgba(52,211,153,0.12)',  iconPath: 'M3 3v18h18M7 16l4-4 4 4 4-4' },
              { id: 'rules-adherence', label: 'Rules Adherence',  value: '94%',    color: '#f87171', iconBg: 'rgba(248,113,113,0.12)', iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
            ].map(k => (
              <div key={k.id} onClick={() => handleCardClick(k.id)}
                style={{ background: '#0f152d', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}
                className={`p-5 shadow-2xl cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 ${activeCard === k.id ? 'card-active' : ''}`}
                data-testid={`metric-kpi-${k.id}`}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                  <div style={{ background: k.iconBg, borderRadius: '12px', padding: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={k.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={k.iconPath} />
                    </svg>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: '#475569', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif' }}>{k.label}</span>
                  <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: '#475569', fontWeight: 700, fontFamily: 'Montserrat, sans-serif' }}> : </span>
                  <span style={{ fontSize: '9px', letterSpacing: '0.05em', fontWeight: 900, color: k.color, fontFamily: 'Montserrat, sans-serif' }}>{k.value}</span>
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
                <MultiImpact label="Trade Direction — Impact on Win" options={[{label:'Long',pct:64},{label:'Short',pct:57}]} />
                <ImpactStat label="Avg Win (Long)" value="$550" highlight="text-emerald-400" />
                <ImpactStat label="Avg Win (Short)" value="$480" highlight="text-emerald-400" />
                <ImpactStat label="Avg Loss (Long)" value="-$220" highlight="text-rose-400" />
                <ImpactStat label="Avg Loss (Short)" value="-$310" highlight="text-rose-400" />
                <MultiImpact label="Trade Size — Impact on Win" options={[{label:'Standard',pct:66},{label:'Half',pct:58},{label:'Oversize',pct:42}]} />
                <MultiImpact label="Position Sizing — Impact on Win" options={[{label:'Correct',pct:67},{label:'Under',pct:55},{label:'Over',pct:40}]} />
              </div>
            </div>

            <div onClick={() => handleCardClick('setup-tags')} className={cardBase('setup-tags', 'emerald')} data-testid="card-setup-tags">
              <CardHeader icon={Layers} title="Setup Tags — Impact on Win" color="emerald" />
              <div className="p-5 space-y-1 scroll-section">
                {[
                  { tag: 'SMC Breaker', pct: 74 },
                  { tag: 'Silver Bullet', pct: 67 },
                  { tag: 'FVG Fill', pct: 70 },
                  { tag: 'Liquidity Sweep', pct: 62 },
                  { tag: 'Order Block', pct: 65 },
                  { tag: 'BOS Retest', pct: 59 },
                  { tag: 'Pullback', pct: 63 },
                  { tag: 'Breakout', pct: 56 },
                ].map((s, i) => (
                  <div key={i} className="flex justify-between items-center py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{s.tag}</span>
                    <span className={`text-xs font-black ${s.pct >= 65 ? 'text-emerald-400' : s.pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div onClick={() => handleCardClick('grade')} className={cardBase('grade', 'amber')} data-testid="card-grade">
              <CardHeader icon={Award} title="Trade Grade — Impact on Win" color="amber" />
              <div className="p-5 space-y-1 scroll-section">
                {[
                  { grade: 'A+', pct: 82, color: 'emerald' },
                  { grade: 'A',  pct: 74, color: 'emerald' },
                  { grade: 'B+', pct: 65, color: 'emerald' },
                  { grade: 'B',  pct: 58, color: 'amber' },
                  { grade: 'C',  pct: 44, color: 'amber' },
                  { grade: 'D',  pct: 31, color: 'rose' },
                  { grade: 'F',  pct: 18, color: 'rose' },
                ].map((g, i) => (
                  <div key={i} className="py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-black text-${g.color}-400`}>{g.grade}</span>
                      <span className={`text-xs font-black text-${g.color}-400`}>{g.pct}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-px">
                      <div className={`h-full bg-${g.color}-500`} style={{ width: `${g.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div onClick={() => handleCardClick('exit')} className={cardBase('exit', 'violet')} data-testid="card-exit">
              <CardHeader icon={DoorOpen} title="Exit Analysis — Impact on Win" color="violet" />
              <div className="p-5 space-y-1 scroll-section">
                <MultiImpact label="Exit Type — Impact on Win" options={[{label:'TP Hit',pct:72},{label:'Manual',pct:54},{label:'SL Hit',pct:0}]} />
                <MultiImpact label="Partial TP — Impact on Avg Win $" options={[{label:'Yes',pct:62},{label:'No',pct:55}]} />
                <ImpactStat label="Avg MAE" value="-12.5 pips" highlight="text-rose-400" />
                <ImpactStat label="Avg MFE" value="+34.2 pips" highlight="text-emerald-400" />
                <ImpactStat label="Avg Duration" value="2h 14m" />
                <MultiImpact label="Hold Time — Impact on Win" options={[{label:'<1h',pct:52},{label:'1-4h',pct:67},{label:'>4h',pct:55}]} />
                <ImpactStat label="Avg R Captured" value="1.8R" highlight="text-emerald-400" />
                <ImpactStat label="Avg R Left on Table" value="0.7R" highlight="text-amber-400" />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div onClick={() => handleCardClick('session')} className={cardBase('session', 'blue')} data-testid="card-session">
              <CardHeader icon={Globe} title="Session — Impact on Win" />
              <div className="p-5 space-y-1 scroll-section">
                <MultiImpact label="Session — Impact on Win" options={[{label:'London',pct:71},{label:'NY',pct:63},{label:'Asia',pct:48},{label:'Sydney',pct:42}]} />
                <MultiImpact label="Overlap — Impact on Win" options={[{label:'London-NY',pct:74},{label:'Asia-London',pct:58},{label:'None',pct:49}]} />
                <ImpactStat label="Best Day" value="Tuesday" highlight="text-emerald-400" />
                <ImpactStat label="Worst Day" value="Friday" highlight="text-rose-400" />
                <MultiImpact label="Day of Week — Impact on Win" options={[{label:'Mon',pct:62},{label:'Tue',pct:71},{label:'Wed',pct:65},{label:'Thu',pct:58},{label:'Fri',pct:48}]} />
              </div>
            </div>

            <div onClick={() => handleCardClick('instrument')} className={cardBase('instrument', 'emerald')} data-testid="card-instrument">
              <CardHeader icon={BarChart2} title="Instrument — Impact on Win" color="emerald" />
              <div className="p-5 space-y-1 scroll-section">
                {[
                  { pair: 'EUR/USD', pct: 67, pl: '+$820' },
                  { pair: 'GBP/USD', pct: 63, pl: '+$540' },
                  { pair: 'XAU/USD', pct: 58, pl: '+$380' },
                  { pair: 'NAS100', pct: 71, pl: '+$960' },
                  { pair: 'US30', pct: 55, pl: '-$120' },
                ].map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{p.pair}</span>
                    <div className="flex gap-3 items-center">
                      <span className={`text-[11px] font-black ${p.pct >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{p.pct}%</span>
                      <span className={`text-[10px] font-bold ${p.pl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{p.pl}</span>
                    </div>
                  </div>
                ))}
                <MultiImpact label="Asset Class — Impact on Win" options={[{label:'Forex',pct:64},{label:'Indices',pct:68},{label:'Commodities',pct:58},{label:'Crypto',pct:52}]} />
              </div>
            </div>

            <div onClick={() => handleCardClick('risk')} className={cardBase('risk', 'amber')} data-testid="card-risk">
              <CardHeader icon={Shield} title="Risk — Impact on Win" color="amber" />
              <div className="p-5 space-y-1 scroll-section">
                <ImpactStat label="Avg Risk per Trade" value="1.2%" highlight="text-amber-400" />
                <ImpactStat label="Max Drawdown" value="-4.3%" highlight="text-rose-400" />
                <ImpactStat label="Current Drawdown" value="-1.1%" highlight="text-amber-400" />
                <MultiImpact label="Risk Level — Impact on Win" options={[{label:'Conservative',pct:68},{label:'Moderate',pct:61},{label:'Aggressive',pct:45}]} />
                <MultiImpact label="RR Ratio — Impact on Win" options={[{label:'1:1',pct:52},{label:'1:2',pct:64},{label:'1:3+',pct:71}]} />
                <ImpactStat label="Avg Planned RR" value="1:2.5" />
                <ImpactStat label="Avg Actual RR" value="1:1.8" highlight="text-amber-400" />
                <YesNoImpact label="SL Moved — Impact on Win" yes={38} no={65} />
                <YesNoImpact label="TP Adjusted — Impact on Win" yes={52} no={61} />
              </div>
            </div>

            <div onClick={() => handleCardClick('rules')} className={cardBase('rules', 'rose')} data-testid="card-rules">
              <CardHeader icon={ShieldCheck} title="Rules & Discipline — Impact on Win" color="rose" />
              <div className="p-5 space-y-1 scroll-section">
                <ImpactStat label="Overall Adherence" value="94%" highlight="text-emerald-400" />
                {[
                  { rule: 'Max Daily Loss', adherence: 98 },
                  { rule: 'Max Position Size', adherence: 95 },
                  { rule: 'Pre-Trade Checklist', adherence: 91 },
                  { rule: 'Wait for Confirmation', adherence: 88 },
                  { rule: 'No Revenge Trades', adherence: 96 },
                  { rule: 'Journal Every Trade', adherence: 100 },
                ].map((r, i) => (
                  <div key={i} className="py-2 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{r.rule}</span>
                      <span className={`text-xs font-black ${r.adherence >= 90 ? 'text-emerald-400' : r.adherence >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>{r.adherence}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-px">
                      <div className={`h-full ${r.adherence >= 90 ? 'bg-emerald-500' : r.adherence >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${r.adherence}%` }} />
                    </div>
                  </div>
                ))}
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
                <MultiImpact label="Entry TF — Impact on Win" options={[{label:'M1',pct:52},{label:'M5',pct:64},{label:'M15',pct:68},{label:'H1',pct:62}]} />
                <MultiImpact label="HTF Bias TF — Impact on Win" options={[{label:'H4',pct:66},{label:'D1',pct:71},{label:'W1',pct:58}]} />
                <ImpactStat label="Avg Holding TF" value="M15–H1" />
              </div>
            </div>

            <div onClick={() => handleCardClick('strategy')} className={cardBase('strategy', 'cyan')} data-testid="card-strategy">
              <CardHeader icon={Target} title="Strategy — Impact on Win" color="cyan" />
              <div className="p-5 space-y-1 scroll-section">
                {[
                  { name: 'Silver Bullet', wr: 67, trades: 12, pl: '+$1,200' },
                  { name: 'SMC Breaker', wr: 74, trades: 8, pl: '+$900' },
                  { name: 'London Open', wr: 61, trades: 15, pl: '+$640' },
                ].map((s, i) => (
                  <div key={i} className="py-3 px-3 bg-slate-950/40 border border-white/5 hover:bg-slate-900/60 transition-all mb-1">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{s.name}</span>
                      <span className={`text-xs font-black ${s.pl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{s.pl}</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-600 mb-0.5">Win Rate</div>
                        <div className={`text-[11px] font-black ${s.wr >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{s.wr}%</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-600 mb-0.5">Trades</div>
                        <div className="text-[11px] font-black text-slate-300">{s.trades}</div>
                      </div>
                    </div>
                  </div>
                ))}
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
                <ImpactStat label="Trades This Week" value="3" />
                <ImpactStat label="Trades This Month" value="12" />
                <ImpactStat label="Best Trade" value="+$1,200" highlight="text-emerald-400" />
                <ImpactStat label="Worst Trade" value="-$480" highlight="text-rose-400" />
                <ImpactStat label="Avg Trade Duration" value="2h 14m" />
                <ImpactStat label="Most Traded Pair" value="EUR/USD" highlight="text-blue-400" />
                <ImpactStat label="Most Profitable Pair" value="NAS100" highlight="text-emerald-400" />
                <ImpactStat label="Least Profitable Pair" value="US30" highlight="text-rose-400" />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div onClick={() => handleCardClick('winloss')} className={cardBase('winloss')}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-xl"><BarChart3 className="w-4 h-4 text-blue-400" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-400/80">Avg Win / Loss</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Avg Win</div>
                    <div className="text-lg font-semibold text-emerald-400">$1,050</div>
                  </div>
                  <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Avg Loss</div>
                    <div className="text-lg font-semibold text-rose-400">$300</div>
                  </div>
                </div>
                <div className="bg-slate-950/50 rounded-xl border border-white/5 p-4 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Win / Loss Ratio</span>
                    <span className="text-sm font-semibold text-blue-400">3.5</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Wins</div>
                    <div className="text-xl font-semibold text-emerald-400">2</div>
                  </div>
                  <div className="bg-rose-500/8 border border-rose-500/20 rounded-xl p-3 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Losses</div>
                    <div className="text-xl font-semibold text-rose-400">1</div>
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
                    <div className="text-2xl font-semibold text-emerald-400">2</div>
                  </div>
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex justify-between items-center">
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Longest Loss</div>
                      <div className="text-[10px] font-bold text-rose-400/70">Streak</div>
                    </div>
                    <div className="text-2xl font-semibold text-rose-400">1</div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950/50 p-4">
                  <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-3">Current Streak</div>
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-center">
                      <div className="text-[9px] text-slate-500 uppercase mb-1">Status</div>
                      <div className="text-sm font-black text-rose-400 italic">loss</div>
                    </div>
                    <div className="flex-1 rounded-lg bg-slate-800/40 border border-slate-700/30 p-3 text-center">
                      <div className="text-[9px] text-slate-500 uppercase mb-1">Count</div>
                      <div className="text-sm font-black text-white">1</div>
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
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Win Rate After Loss</div>
                  <div className="text-3xl font-semibold text-cyan-400 mb-1">0%</div>
                  <div className="text-[9px] text-slate-600">0 wins / 0 trades</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-950/50 border border-white/5 p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">After Loss</div>
                    <div className="text-xl font-semibold text-cyan-400">0</div>
                  </div>
                  <div className="rounded-xl bg-slate-950/50 border border-white/5 p-4 text-center">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Wins</div>
                    <div className="text-xl font-semibold text-emerald-400">0</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {(() => {
              const equityData: Record<string, { points: number[][]; labels: string[] }> = {
                DAILY:   { points: [[0,155],[75,140],[150,148],[225,120],[300,105],[375,95],[450,80],[525,55],[600,22]], labels: ['9AM','11AM','1PM','3PM','5PM','7PM','9PM','11PM'] },
                WEEKLY:  { points: [[0,160],[150,128],[300,108],[450,68],[600,20]], labels: ['Mon','Tue','Wed','Thu','Fri'] },
                MONTHLY: { points: [[0,168],[150,118],[300,138],[450,68],[600,20]], labels: ['Nov','Dec','Jan','Feb','Mar'] },
              };
              
              const d = equityData[equityView];
              const pts = d.points;
              const H = 180; const W = 600;
              const curvePath = pts.reduce((acc, [x, y], i) => {
                if (i === 0) return `M ${x} ${y}`;
                const [px, py] = pts[i - 1];
                const cx1 = px + (x - px) / 2; const cy1 = py;
                const cx2 = px + (x - px) / 2; const cy2 = y;
                return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x} ${y}`;
              }, '');
              const fillPath = `${curvePath} L ${pts[pts.length-1][0]} ${H} L ${pts[0][0]} ${H} Z`;
              const lastPt = pts[pts.length - 1];
              return (
                <div className="lg:col-span-2 bg-[#07091a] rounded-2xl border border-slate-800/60 shadow-2xl hover:border-violet-500/40 hover:shadow-[0_20px_60px_rgba(139,92,246,0.2)] transition-all duration-300">
                  <div className="flex items-center justify-between px-6 pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-violet-500/10">
                        <TrendingUp className="w-4 h-4 text-violet-400" />
                      </div>
                      <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-violet-400/90">Equity Curve</h2>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900/80 border border-white/5 p-1">
                      {['DAILY','WEEKLY','MONTHLY'].map(v => (
                        <button key={v} onClick={(e) => { e.stopPropagation(); setEquityView(v); }}
                          className={`px-3 py-1 text-[9px] font-black tracking-widest uppercase transition-all duration-200 ${equityView === v ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.6)]' : 'text-slate-500 hover:text-slate-300'}`}
                          data-testid={`button-equity-${v.toLowerCase()}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="px-6 pb-2">
                    <div className="relative" style={{ height: `${H + 36}px` }}>
                      <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between pr-3">
                        {['700','533','367','200'].map((l,i) => (
                          <span key={i} className="text-[10px] text-slate-600 font-mono">{l}</span>
                        ))}
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
                          {d.labels.map((l,i) => (
                            <span key={i} className="text-[10px] text-slate-500 font-mono">{l}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 mt-6 border-t border-slate-800/40">
                    {[{l:'Starting Balance',v:'$100,000',c:'text-slate-400'},{l:'Current Balance',v:'$102,100',c:'text-violet-400'},{l:'Total Return',v:'+2.1%',c:'text-violet-400'}].map((x,i)=>(
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
                      <circle cx="80" cy="80" r="70" fill="none" stroke="#10b981" strokeWidth="12" strokeDasharray="440" strokeDashoffset="436.48" className="drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-xl font-semibold text-emerald-400">0.8%</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider">Risk</div>
                    </div>
                  </div>
                </div>
                {[{l:'Win Rate',v:'67%'},{l:'Risk per Trade',v:'1.0%'},{l:'Profit Factor',v:'8.00'},{l:'Strategy Version',v:'v2.1'}].map((item,i)=>(
                  <div key={i} className="flex justify-between items-center p-3 bg-slate-800/20 border border-slate-800/40 hover:bg-slate-800/40 transition-all cursor-pointer">
                    <span className="text-xs font-semibold text-slate-400">{item.l}</span>
                    <span className="text-sm font-black text-white">{item.v}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-white/5 text-center p-3 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                  <div className="text-xs text-emerald-400 mb-1">Risk Status</div>
                  <div className="text-sm font-black text-blue-400 italic">excellent</div>
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
                <h2 className="text-sm font-black uppercase tracking-wide text-blue-400 font-montserrat">Strategy Performance — Impact on Win in Bullish, Bearish and Ranging Markets</h2>
              </div>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/40">
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-400">Strategy</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-blue-400">Bullish</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-blue-400">Bearish</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-blue-400">Ranging</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-amber-400">Liquidity</th>
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-amber-400">Trend Aligned</th>
                    <th className="text-right py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-400">Net P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'SMC Breaker',  bull: '74%', bear: '29%', range: '35%', liq: 'High', aligned: '74%', pl: '$900',   plC: 'text-emerald-400' },
                    { name: 'Silver Bullet',bull: '68%', bear: '33%', range: '41%', liq: 'High', aligned: '68%', pl: '$1,200', plC: 'text-emerald-400' },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/30 transition-colors cursor-pointer">
                      <td className="py-4 px-4 text-sm font-semibold text-white">{row.name}</td>
                      <td className="py-4 px-4 text-sm font-bold text-emerald-400">{row.bull}</td>
                      <td className="py-4 px-4 text-sm font-bold text-rose-400">{row.bear}</td>
                      <td className="py-4 px-4 text-sm font-bold text-amber-400">{row.range}</td>
                      <td className="py-4 px-4 text-sm font-bold text-amber-400">{row.liq}</td>
                      <td className="py-4 px-4 text-sm font-bold text-cyan-400">{row.aligned}</td>
                      <td className={`py-4 px-4 text-right text-lg font-black ${row.plC}`}>{row.pl}</td>
                    </tr>
                  ))}
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
                <h2 className="text-sm font-black uppercase tracking-wide text-cyan-400 font-montserrat">Setup Occurrence Frequency — Per Day / Week / Month / Year</h2>
              </div>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/40">
                    <th className="text-left py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-400">Setup</th>
                    <th className="text-center py-3 px-4 text-xs font-black uppercase tracking-wider text-cyan-400">Per Day</th>
                    <th className="text-center py-3 px-4 text-xs font-black uppercase tracking-wider text-blue-400">Per Week</th>
                    <th className="text-center py-3 px-4 text-xs font-black uppercase tracking-wider text-violet-400">Per Month</th>
                    <th className="text-center py-3 px-4 text-xs font-black uppercase tracking-wider text-emerald-400">Per Year</th>
                    <th className="text-center py-3 px-4 text-xs font-black uppercase tracking-wider text-amber-400">Win Rate</th>
                    <th className="text-right py-3 px-4 text-xs font-black uppercase tracking-wider text-slate-400">Best Period</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Silver Bullet', day: '1–2', week: '5–8',  month: '20–32', year: '240–384', wr: '67%', wrC: 'text-emerald-400', best: 'London Open', bestC: 'text-cyan-400' },
                    { name: 'SMC Breaker',   day: '0–1', week: '2–4',  month: '8–16',  year: '96–192',  wr: '74%', wrC: 'text-emerald-400', best: 'NY Session',  bestC: 'text-blue-400' },
                    { name: 'Breakout',      day: '0–1', week: '1–3',  month: '4–12',  year: '48–144',  wr: '74%', wrC: 'text-emerald-400', best: 'Tuesday',     bestC: 'text-amber-400' },
                    { name: 'Pullback',      day: '1–3', week: '5–10', month: '20–40', year: '240–480', wr: '63%', wrC: 'text-emerald-400', best: 'Monday',      bestC: 'text-amber-400' },
                    { name: 'FVG Fill',      day: '1–3', week: '5–12', month: '20–48', year: '240–576', wr: '70%', wrC: 'text-emerald-400', best: 'London',      bestC: 'text-cyan-400' },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/30 transition-colors cursor-pointer group">
                      <td className="py-4 px-4 text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">{row.name}</td>
                      <td className="py-4 px-4 text-center"><span className="text-sm font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">{row.day}</span></td>
                      <td className="py-4 px-4 text-center"><span className="text-sm font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{row.week}</span></td>
                      <td className="py-4 px-4 text-center"><span className="text-sm font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">{row.month}</span></td>
                      <td className="py-4 px-4 text-center"><span className="text-sm font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{row.year}</span></td>
                      <td className={`py-4 px-4 text-center text-sm font-black ${row.wrC}`}>{row.wr}</td>
                      <td className={`py-4 px-4 text-right text-sm font-bold ${row.bestC}`}>{row.best}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}