import React, { useState, useMemo } from 'react';
import { Layout, Clock, Zap, Network, CalendarDays, ShieldCheck, TrendingDown, Activity } from 'lucide-react';

const L = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`text-[10px] uppercase tracking-widest text-slate-500 ${className}`} style={{ fontWeight: 500 }}>{children}</span>
);
const V = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`text-xs font-mono ${className}`} style={{ fontWeight: 700 }}>{children}</span>
);
const Sub = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`text-[9px] font-mono text-slate-600 ${className}`} style={{ fontWeight: 400 }}>{children}</span>
);
const SectionTitle = ({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <div className="w-px h-4 bg-slate-700"></div>
    {icon && <span className="text-slate-600">{icon}</span>}
    <span className="text-[10px] uppercase tracking-[0.2em] text-white" style={{ fontWeight: 700 }}>{children}</span>
  </div>
);
const Bar = ({ pct, color = 'bg-rose-500' }: { pct: string; color?: string }) => (
  <div className="w-full bg-white/5 h-px mt-3">
    <div className={`${color} h-full transition-all duration-700`} style={{ width: pct }}></div>
  </div>
);
const Toggle = ({ options, active, onChange }: { options: { value: string; label: string }[]; active: string; onChange: (v: string) => void }) => (
  <div className="flex bg-black/50 p-1 rounded-sm border border-white/5">
    {options.map(o => (
      <button key={o.value} onClick={() => onChange(o.value)}
        className={`px-5 py-2 text-[9px] uppercase tracking-widest rounded-sm transition-all ${active === o.value ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-400'}`}
        style={{ fontWeight: 600 }}>
        {o.label}
      </button>
    ))}
  </div>
);

const heatColor = (v: number) => `rgba(244,63,94,${Math.min(Math.abs(v) / 6, 0.85)})`;

export default function DrawdownPanel() {
  const [activeFreqView, setActiveFreqView] = useState('attr');
  const [activeStructView, setActiveStructView] = useState('context');

  const topStats = [
    { label: 'Max Drawdown',    value: '-8.42%', accent: '#f43f5e' },
    { label: 'Avg. Drawdown',   value: '-1.25%', accent: '#f59e0b' },
    { label: 'Recovery Factor', value: '3.8',    accent: '#10b981' },
    { label: 'Trend Alignment', value: '76%',    accent: '#6366f1' },
  ];

  const pairs      = ['EURUSD','GBPUSD','XAUUSD','BTCUSD','NAS100','USDJPY','AUDUSD','ETHUSD'];
  const strategies = ['Trend','Range','Break','Scalp','News'];

  const heatmap = useMemo(() =>
    pairs.map(pair => ({
      pair,
      cells: strategies.map(() => {
        const val = parseFloat((-(Math.random() * 4.5)).toFixed(1));
        const t   = Math.floor(Math.random() * 40) + 5;
        const l   = Math.floor(Math.random() * (t / 2)) + 2;
        return { val, t, l };
      }),
    })),
  []);

  const freqData: Record<string, { cat: string; name: string; total: number; losses: number }[]> = {
    attr: [
      { cat:'Strategy',   name:'S1: Trend Following', total:42, losses:12 },
      { cat:'Strategy',   name:'S3: Impulse Break',   total:38, losses:26 },
      { cat:'Session',    name:'London Open',          total:55, losses:18 },
      { cat:'Session',    name:'NY Session',           total:60, losses:42 },
      { cat:'Psychology', name:'FOMO Trigger',         total:24, losses:22 },
      { cat:'Psychology', name:'Calm Execution',       total:82, losses:14 },
      { cat:'Structure',  name:'HTF OB Failed',        total:19, losses:15 },
      { cat:'Structure',  name:'CHOCH ID',             total:31, losses:11 },
    ],
    instr: [
      { cat:'Instrument', name:'EURUSD', total:110, losses:35 },
      { cat:'Instrument', name:'GBPUSD', total:85,  losses:42 },
      { cat:'Instrument', name:'XAUUSD', total:140, losses:78 },
      { cat:'Instrument', name:'BTCUSD', total:45,  losses:31 },
      { cat:'Instrument', name:'NAS100', total:95,  losses:40 },
      { cat:'Instrument', name:'USDJPY', total:60,  losses:20 },
      { cat:'Instrument', name:'AUDUSD', total:40,  losses:18 },
      { cat:'Instrument', name:'ETHUSD', total:30,  losses:21 },
    ],
  };

  const structData: Record<string, { title: string; icon: React.ReactNode; items: { label: string; val: string; t: number; l: number; w: string; c: string }[] }[]> = {
    context: [
      { title:'CTF Validity', icon:<Zap className="w-3 h-3 text-indigo-500"/>, items:[
        { label:'HTF Orderblock Failed', val:'-3.2%', t:12, l:9,  w:'75%', c:'bg-rose-500'   },
        { label:'HTF Swing Alignment',   val:'-1.5%', t:20, l:8,  w:'40%', c:'bg-amber-500'  },
      ]},
      { title:'ATF Validity', icon:<Zap className="w-3 h-3 text-emerald-500"/>, items:[
        { label:'Fake-out CHOCH ID',    val:'-4.1%', t:10, l:9, w:'90%', c:'bg-rose-500'  },
        { label:'Unmitigated FVG Trap', val:'-0.8%', t:15, l:3, w:'20%', c:'bg-amber-500' },
      ]},
      { title:'HTF Bias', icon:<Zap className="w-3 h-3 text-indigo-500"/>, items:[
        { label:'Counter-Trend Entry', val:'-5.0%', t:8,  l:7, w:'88%', c:'bg-rose-500'  },
        { label:'With-Trend Entry',    val:'-0.6%', t:30, l:5, w:'17%', c:'bg-amber-500' },
      ]},
    ],
    entry: [
      { title:'ETF Execution', icon:<Zap className="w-3 h-3 text-rose-500"/>, items:[
        { label:'Premature BOS Execution', val:'-2.4%', t:18, l:11, w:'60%', c:'bg-rose-500' },
        { label:'Inducement Failure',      val:'-1.9%', t:14, l:7,  w:'50%', c:'bg-rose-500' },
      ]},
      { title:'Entry Timing', icon:<Zap className="w-3 h-3 text-amber-500"/>, items:[
        { label:'Early Entry (Pre-confirm)', val:'-3.7%', t:11, l:9,  w:'82%', c:'bg-rose-500'    },
        { label:'Confirmed Entry',           val:'-0.4%', t:40, l:6,  w:'15%', c:'bg-emerald-500' },
      ]},
      { title:'Risk Placement', icon:<Zap className="w-3 h-3 text-rose-500"/>, items:[
        { label:'SL Above/Below Wick', val:'-1.1%', t:22, l:8, w:'36%', c:'bg-amber-500' },
        { label:'SL Inside Structure', val:'-4.5%', t:9,  l:8, w:'89%', c:'bg-rose-500'  },
      ]},
    ],
  };

  const sessions = [
    { s:'London Open',      v:'-1.2%', t:45, l:15, vColor:'text-rose-500',    bar:'bg-rose-500',    w:'33%', worstPair:'XAUUSD', worstDD:'-3.8%' },
    { s:'London/NY Overlap',v:'-2.4%', t:32, l:18, vColor:'text-amber-500',   bar:'bg-amber-500',   w:'56%', worstPair:'GBPUSD', worstDD:'-4.2%' },
    { s:'NY Mid-Day',       v:'-0.5%', t:28, l:4,  vColor:'text-emerald-500', bar:'bg-emerald-500', w:'14%', worstPair:'NAS100', worstDD:'-1.1%' },
    { s:'Asian Close',      v:'-3.1%', t:12, l:10, vColor:'text-rose-500',    bar:'bg-rose-500',    w:'83%', worstPair:'BTCUSD', worstDD:'-5.2%' },
  ];

  const streaks = [
    { label:'Max Loss Streak',     value:'7',   sub:'Apr 12–18',           vColor:'text-rose-500'    },
    { label:'Avg Loss Streak',     value:'3.2', sub:'before recovery',     vColor:'text-amber-500'   },
    { label:'Post-Streak Revenge', value:'68%', sub:'of streaks triggered', vColor:'text-rose-400'   },
    { label:'Best Win Streak',     value:'11',  sub:'Mar 3–14',            vColor:'text-emerald-500' },
  ];

  const rrBuckets = [
    { label:'< 1:1',     count:48, pct:'26%', c:'bg-rose-500',    note:'Underperforming' },
    { label:'1:1 – 1:2', count:72, pct:'39%', c:'bg-amber-500',   note:'Break-even'      },
    { label:'1:2 – 1:3', count:44, pct:'24%', c:'bg-indigo-500',  note:'Target range'    },
    { label:'> 1:3',     count:20, pct:'11%', c:'bg-emerald-500', note:'Outlier winners' },
  ];

  const monthly = [
    { month:'Jan', dd:'-2.1%', t:142, l:42, rec:'90%',  cause:'HTF OB Failed',   causeC:'text-rose-400',    rr:'1:1.8', bigL:'-0.8%' },
    { month:'Feb', dd:'-4.8%', t:128, l:65, rec:'40%',  cause:'FOMO Trigger',    causeC:'text-rose-500',    rr:'1:0.9', bigL:'-2.1%' },
    { month:'Mar', dd:'-1.4%', t:156, l:38, rec:'100%', cause:'Calm Exec',       causeC:'text-emerald-400', rr:'1:2.4', bigL:'-0.4%' },
    { month:'Apr', dd:'-6.2%', t:110, l:72, rec:'15%',  cause:'Counter-Trend',   causeC:'text-rose-500',    rr:'1:0.6', bigL:'-3.1%' },
    { month:'May', dd:'-3.5%', t:134, l:51, rec:'65%',  cause:'Premature BOS',   causeC:'text-amber-400',   rr:'1:1.2', bigL:'-1.4%' },
    { month:'Jun', dd:'-0.9%', t:168, l:24, rec:'100%', cause:'Confirmed Entry', causeC:'text-emerald-400', rr:'1:2.8', bigL:'-0.3%' },
  ];

  const timeline = ['W','W','L','W','L','L','L','W','W','W','L','L','L','L','L','L','L','W','L','W','W','W','W','W','W','W','W','W','W','W','W','L','W'];

  return (
    <div className="min-h-full antialiased" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        .dd-card      { background:#0d1117; border:1px solid rgba(255,255,255,0.04); }
        .dd-card-dark { background:#080a0e; border:1px solid rgba(255,255,255,0.04); }
        .dd-divider   { border-color:rgba(255,255,255,0.04); }
        .jm, .jm *    { font-family:'JetBrains Mono',monospace !important; }
      `}</style>

      <div className="max-w-[1400px] mx-auto">

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="mb-8 pb-6 border-b dd-divider flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] text-slate-600 mb-2" style={{ fontWeight: 500 }}>Drawdown Intelligence</p>
            <h1 className="text-2xl text-white leading-none" style={{ fontWeight: 800 }}>Where Are You Losing?</h1>
          </div>
          <div className="flex flex-wrap gap-8">
            {topStats.map((s, i) => (
              <div key={i} className="flex flex-col gap-1">
                <L>{s.label}</L>
                <span className="text-sm jm" style={{ fontWeight: 700, color: s.accent }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── ROW 1: HEATMAP + FREQUENCY ─────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 mb-4">

          {/* Heatmap */}
          <div className="dd-card rounded p-6">
            <div className="flex items-center justify-between mb-6">
              <SectionTitle icon={<Layout className="w-3 h-3"/>}>Risk Heatmap · Pair vs Strategy</SectionTitle>
              <L>loss intensity by cell</L>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left pb-3 pr-4 w-24"><L>Pair</L></th>
                    {strategies.map(s => <th key={s} className="pb-3 text-center min-w-[110px]"><L>{s}</L></th>)}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map(({ pair, cells }) => (
                    <tr key={pair}>
                      <td className="py-1 pr-4">
                        <span className="text-[10px] text-slate-400 uppercase" style={{ fontWeight: 600 }}>{pair}</span>
                      </td>
                      {cells.map((cell, i) => (
                        <td key={i} className="py-1 px-1">
                          <div className="rounded-sm py-2.5 flex flex-col items-center cursor-crosshair hover:brightness-125 transition-all"
                            style={{ backgroundColor: heatColor(cell.val) }}>
                            <span className="text-[11px] text-white" style={{ fontWeight: 700 }}>{cell.val}%</span>
                            <span className="text-[8px] text-white/50 jm mt-0.5" style={{ fontWeight: 400 }}>({cell.t}T/{cell.l}L)</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Frequency */}
          <div className="dd-card rounded p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <SectionTitle>Frequency</SectionTitle>
              <Toggle
                options={[{ value:'attr', label:'Attr' },{ value:'instr', label:'Instr' }]}
                active={activeFreqView}
                onChange={setActiveFreqView}
              />
            </div>
            <div className="flex flex-col gap-3 flex-1">
              {freqData[activeFreqView].map((item, i) => {
                const rate = Math.round((item.losses / item.total) * 100);
                const high = rate > 55;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[10px] text-slate-300 truncate uppercase" style={{ fontWeight: 600 }}>{item.name}</span>
                        <span className={`text-[10px] jm ml-2 shrink-0 ${high ? 'text-rose-500' : 'text-emerald-500'}`} style={{ fontWeight: 700 }}>{rate}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/5 h-px">
                          <div className={`h-full ${high ? 'bg-rose-500' : 'bg-slate-600'} transition-all duration-700`} style={{ width: `${rate}%` }}></div>
                        </div>
                        <Sub>{item.total}T/{item.losses}L</Sub>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── ROW 2: STRUCTURAL DIAGNOSTICS ──────────────────────── */}
        <div className="dd-card-dark rounded p-6 mb-4 border-t border-indigo-500/10">
          <div className="flex items-center justify-between mb-7">
            <SectionTitle icon={<Network className="w-3 h-3"/>}>Structural Diagnostics</SectionTitle>
            <Toggle
              options={[{ value:'context', label:'Context' },{ value:'entry', label:'Entry' }]}
              active={activeStructView}
              onChange={setActiveStructView}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {structData[activeStructView].map((sec, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-4">
                  {sec.icon}
                  <L>{sec.title}</L>
                </div>
                <div className="space-y-4">
                  {sec.items.map((item, j) => (
                    <div key={j}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[10px] text-slate-400 uppercase" style={{ fontWeight: 600 }}>{item.label}</span>
                        <V className="text-rose-500 ml-2 shrink-0">{item.val}</V>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-white/5 h-px">
                          <div className={`${item.c} h-full transition-all duration-700`} style={{ width: item.w }}></div>
                        </div>
                        <Sub>{item.t}T/{item.l}L</Sub>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ROW 3: SESSION + STREAK + RR ───────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

          {/* Session */}
          <div className="dd-card rounded p-6">
            <div className="mb-5"><SectionTitle icon={<Clock className="w-3 h-3"/>}>Session</SectionTitle></div>
            <div className="space-y-4">
              {sessions.map((s, i) => (
                <div key={i} className="pb-4 border-b dd-divider last:border-0 last:pb-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-[10px] text-slate-300 uppercase" style={{ fontWeight: 600 }}>{s.s}</span>
                      <Sub className="block mt-0.5">N={s.t} · {s.l} losses</Sub>
                    </div>
                    <V className={s.vColor}>{s.v}</V>
                  </div>
                  <Bar pct={s.w} color={s.bar} />
                  <div className="flex justify-between mt-2">
                    <L>Worst pair</L>
                    <div className="flex gap-2">
                      <Sub className="text-slate-400">{s.worstPair}</Sub>
                      <Sub className="text-rose-500">{s.worstDD}</Sub>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Streak */}
          <div className="dd-card rounded p-6">
            <div className="mb-5"><SectionTitle icon={<TrendingDown className="w-3 h-3"/>}>Loss Streaks</SectionTitle></div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {streaks.map((s, i) => (
                <div key={i} className="dd-card-dark rounded p-3">
                  <L className="block mb-2">{s.label}</L>
                  <V className={s.vColor}>{s.value}</V>
                  <Sub className="block mt-1">{s.sub}</Sub>
                </div>
              ))}
            </div>
            <div>
              <L className="block mb-3">Trade Timeline</L>
              <div className="flex flex-wrap gap-1">
                {timeline.map((r, i) => (
                  <div key={i} className={`w-[18px] h-[18px] rounded-sm flex items-center justify-center text-[7px] ${r === 'W' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'}`} style={{ fontWeight: 700 }}>{r}</div>
                ))}
              </div>
            </div>
          </div>

          {/* RR Distribution */}
          <div className="dd-card rounded p-6">
            <div className="mb-5"><SectionTitle icon={<Activity className="w-3 h-3"/>}>RR Distribution</SectionTitle></div>
            <div className="space-y-5">
              {rrBuckets.map((b, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="flex items-baseline gap-3">
                      <V className="text-slate-200">{b.label}</V>
                      <L>{b.note}</L>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <Sub>{b.count}T</Sub>
                      <V className="text-slate-300">{b.pct}</V>
                    </div>
                  </div>
                  <Bar pct={b.pct} color={b.c} />
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t dd-divider">
              <p className="text-[10px] text-slate-500 leading-relaxed" style={{ fontWeight: 500 }}>
                65% of trades fall below target RR —{' '}
                <span className="text-rose-400" style={{ fontWeight: 700 }}>primary drawdown driver</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── ROW 4: MONTHLY TIMELINE ────────────────────────────── */}
        <div className="dd-card rounded p-6">
          <div className="flex items-center justify-between mb-7">
            <SectionTitle icon={<CalendarDays className="w-3 h-3"/>}>Monthly Drawdown · FY 2025</SectionTitle>
            <L>dominant cause per month</L>
          </div>
          <div className="relative">
            <div className="absolute top-[22px] left-0 right-0 h-px bg-white/5 z-0"></div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 relative z-10">
              {monthly.map((d, i) => {
                const heavy = parseFloat(d.dd) < -4;
                return (
                  <div key={i} className={`rounded p-4 border transition-all duration-300 hover:border-white/10 ${heavy ? 'bg-rose-500/5 border-rose-500/15' : 'dd-card-dark border-white/4'}`}>
                    <div className={`w-2 h-2 rounded-full mb-4 mx-auto ${heavy ? 'bg-rose-500' : 'bg-slate-700'}`}></div>
                    <L className="block text-center mb-2">{d.month}</L>
                    <V className={`block text-center mb-1 ${heavy ? 'text-rose-500' : 'text-white'}`}>{d.dd}</V>
                    <Sub className="block text-center mb-3">{d.rec} rec.</Sub>
                    <div className={`text-[8px] text-center px-1.5 py-0.5 rounded bg-white/5 border border-white/5 ${d.causeC} mb-3`} style={{ fontWeight: 600 }}>{d.cause}</div>
                    <div className="space-y-1.5 pt-2 border-t dd-divider">
                      <div className="flex justify-between"><L>RR</L><Sub className="text-slate-400">{d.rr}</Sub></div>
                      <div className="flex justify-between"><L>Big L</L><Sub className="text-rose-400">{d.bigL}</Sub></div>
                      <div className="flex justify-between"><L>Loss</L><Sub className="text-slate-400">{d.l}/{d.t}</Sub></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      <footer className="max-w-[1400px] mx-auto px-6 py-8 flex justify-center">
        <ShieldCheck className="w-3 h-3 text-slate-800" />
      </footer>
    </div>
  );
}
