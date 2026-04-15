import { useState } from 'react';
import {
  Shield, Settings2, Link2, Globe, User, ChevronRight, CheckCircle2,
  Bell, ArrowRight, Radio, Users, GitFork, Scale, Anchor, TrendingUp,
  Rocket, Info, AlertTriangle, Filter, Hash, Send, Zap,
  MessageSquare, GitMerge, Menu, X,
} from 'lucide-react';

// ─── Fonts ────────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap');`;

// ─── Step Definitions ─────────────────────────────────────────────────────────
const STEPS_FOLLOWER = [
  { id: 'role',    label: 'Identity', icon: User },
  { id: 'connect', label: 'Broker',   icon: Globe },
  { id: 'link',    label: 'Provider', icon: Link2 },
  { id: 'filters', label: 'Filters',  icon: Filter },
  { id: 'copy',    label: 'Engine',   icon: Settings2 },
  { id: 'protect', label: 'Shield',   icon: Shield },
  { id: 'risk',    label: 'Risk',     icon: AlertTriangle },
  { id: 'go-live', label: 'Live',     icon: Rocket },
];
const STEPS_PROVIDER = [
  { id: 'role',     label: 'Identity',   icon: User },
  { id: 'connect',  label: 'Broker',     icon: Globe },
  { id: 'strategy', label: 'Strategy',   icon: TrendingUp },
  { id: 'limits',   label: 'Limits',     icon: Shield },
  { id: 'notif',    label: 'Notify',     icon: Bell },
  { id: 'risk',     label: 'Disclosure', icon: AlertTriangle },
  { id: 'go-live',  label: 'Live',       icon: Rocket },
];
const STEPS_SELF = [
  { id: 'role',     label: 'Identity', icon: User },
  { id: 'connect',  label: 'Source',   icon: Globe },
  { id: 'connect2', label: 'Target',   icon: Globe },
  { id: 'mapping',  label: 'Mapping',  icon: GitMerge },
  { id: 'copy',     label: 'Engine',   icon: Settings2 },
  { id: 'protect',  label: 'Shield',   icon: Shield },
  { id: 'go-live',  label: 'Live',     icon: Rocket },
];
const STEPS_TELEGRAM = [
  { id: 'role',       label: 'Identity', icon: User },
  { id: 'connect',    label: 'Broker',   icon: Globe },
  { id: 'tg-auth',    label: 'Telegram', icon: MessageSquare },
  { id: 'tg-channel', label: 'Channel',  icon: Hash },
  { id: 'tg-parser',  label: 'Parser',   icon: Zap },
  { id: 'tg-test',    label: 'Test',     icon: Send },
  { id: 'filters',    label: 'Filters',  icon: Filter },
  { id: 'protect',    label: 'Shield',   icon: Shield },
  { id: 'risk',       label: 'Risk',     icon: AlertTriangle },
  { id: 'go-live',    label: 'Live',     icon: Rocket },
];

// ─── Shared UI ────────────────────────────────────────────────────────────────
const GlowButton = ({ children, onClick, active, small }: any) => (
  <button onClick={onClick}
    className={`relative font-bold uppercase tracking-[0.2em] transition-all duration-500 border flex items-center gap-2
      ${small ? 'px-4 py-2 text-[9px]' : 'px-5 py-3 text-[10px]'}
      ${active
        ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
        : 'bg-transparent border-white/10 text-slate-400 hover:border-white/30 hover:text-white'}`}>
    {children}
  </button>
);

const TInput = ({ label, hint, ...props }: any) => (
  <div className="group space-y-1.5">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-focus-within:text-blue-500 transition-colors">{label}</label>
    {hint && <p className="text-[11px] text-slate-600 leading-relaxed">{hint}</p>}
    <input {...props} className="w-full bg-white/[0.01] border-b border-white/10 py-3 text-sm font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-all font-mono" />
  </div>
);

const TTextarea = ({ label, hint, ...props }: any) => (
  <div className="group space-y-1.5">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-focus-within:text-blue-500 transition-colors">{label}</label>
    {hint && <p className="text-[11px] text-slate-600 leading-relaxed">{hint}</p>}
    <textarea {...props} className="w-full bg-white/[0.03] border border-white/10 p-3 text-sm font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-all font-mono resize-none rounded-sm" />
  </div>
);

const TSelect = ({ label, hint, options, value, onChange }: any) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
    {hint && <p className="text-[11px] text-slate-600 leading-relaxed">{hint}</p>}
    <select value={value} onChange={(e: any) => onChange(e.target.value)}
      className="w-full bg-[#0a0a0f] border-b border-white/10 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all font-mono">
      {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, sub, on, onChange }: any) => (
  <div className="flex items-center justify-between p-3 md:p-4 border border-white/5 bg-white/[0.01] mb-3">
    <div className="pr-4">
      <div className="text-xs font-bold text-slate-300 tracking-tight">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 font-light mt-0.5">{sub}</div>}
    </div>
    <button onClick={() => onChange(!on)}
      className={`relative w-10 h-5 flex-shrink-0 rounded-full transition-colors duration-300 ${on ? 'bg-blue-600' : 'bg-slate-800'}`}>
      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${on ? 'left-6' : 'left-1'}`} />
    </button>
  </div>
);

const InfoBox = ({ children, color = 'blue' }: any) => {
  const styles: any = {
    blue:  'border-blue-500/20 bg-blue-500/5 text-blue-300',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    red:   'border-red-500/20 bg-red-500/5 text-red-300',
    green: 'border-green-500/20 bg-green-500/5 text-green-300',
  };
  return (
    <div className={`flex items-start gap-3 p-3 md:p-4 border rounded-sm ${styles[color]}`}>
      <Info size={14} className="mt-0.5 flex-shrink-0" />
      <p className="text-[11px] leading-relaxed">{children}</p>
    </div>
  );
};

const SectionTitle = ({ step, id, title }: any) => (
  <div className="mb-8 md:mb-16">
    <span className="text-blue-500 font-mono text-xs mb-2 block tracking-widest">0{step + 1} // {id.toUpperCase()}</span>
    <h1 className="text-3xl md:text-5xl font-extralight tracking-tighter mb-4">{title}</h1>
    <div className="w-24 h-[1px] bg-blue-500/50" />
  </div>
);

const FeatureCard = ({ title, sub, icon: Icon, active, onClick, accent }: any) => (
  <div onClick={onClick}
    className={`relative p-5 md:p-8 border cursor-pointer transition-all duration-700 group
      ${active ? 'bg-blue-600/5 border-blue-500/50' : 'bg-transparent border-white/5 hover:border-white/20'}`}>
    <div className={`mb-4 md:mb-6 transition-transform duration-500 ${active ? 'scale-110' : 'group-hover:scale-105'}`}>
      <Icon size={22} className={active ? (accent || 'text-blue-400') : 'text-slate-600'} strokeWidth={1.5} />
    </div>
    <h3 className={`text-base md:text-lg font-light tracking-tight mb-2 ${active ? 'text-white' : 'text-slate-400'}`}>{title}</h3>
    <p className="text-xs text-slate-500 leading-relaxed font-light">{sub}</p>
    {active && <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 w-full shadow-[0_0_15px_rgba(37,99,235,1)]" />}
  </div>
);

// ─── Provider Data ────────────────────────────────────────────────────────────
const PROVIDERS = [
  { id:'qc', name:'Quantum Core (Live-01)', initials:'QC', avatarBg:'rgba(37,99,235,0.12)', avatarBorder:'rgba(37,99,235,0.25)', avatarColor:'#60a5fa', since:'Jan 2022', followers:1204, winRate:73.4, totalTrades:3812, avgMonthly:8.2, maxDrawdown:12.1, style:'swing' },
  { id:'ts', name:'Titanium Scalp v4',      initials:'TS', avatarBg:'rgba(20,184,166,0.1)',  avatarBorder:'rgba(20,184,166,0.2)',  avatarColor:'#2dd4bf', since:'Mar 2023', followers:587,  winRate:61.0, totalTrades:9450, avgMonthly:5.7, maxDrawdown:7.4,  style:'scalp' },
  { id:'be', name:'Black Edge HFT',         initials:'BE', avatarBg:'rgba(245,158,11,0.1)',  avatarBorder:'rgba(245,158,11,0.2)', avatarColor:'#fbbf24', since:'Aug 2021', followers:2031, winRate:81.9, totalTrades:21340, avgMonthly:14.3, maxDrawdown:19.8, style:'hft' },
];

const ProviderCard = ({ provider, selected, onSelect }: any) => {
  const winColor = provider.winRate >= 70 ? '#4ade80' : provider.winRate >= 55 ? '#fbbf24' : '#f87171';
  const ddColor  = provider.maxDrawdown <= 10 ? '#4ade80' : provider.maxDrawdown <= 18 ? '#fb923c' : '#f87171';
  const mono = "'JetBrains Mono', monospace";
  return (
    <div onClick={() => onSelect(provider.id)}
      className={`relative p-5 md:p-8 border cursor-pointer transition-all duration-700 group flex flex-col
        ${selected ? 'bg-blue-600/5 border-blue-500/50' : 'bg-transparent border-white/5 hover:border-white/20'}`}>
      <div className={`mb-4 md:mb-6 transition-transform duration-500 ${selected ? 'scale-110' : 'group-hover:scale-105'}`}>
        <div style={{ width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, fontFamily:mono, background:provider.avatarBg, border:`1px solid ${provider.avatarBorder}`, color:provider.avatarColor }}>
          {provider.initials}
        </div>
      </div>
      <h3 className={`text-base md:text-lg font-light tracking-tight mb-1 ${selected ? 'text-white' : 'text-slate-400'}`}>{provider.name}</h3>
      <p className="text-xs text-slate-500 leading-relaxed font-light mb-4 md:mb-6">{provider.style} · {provider.followers.toLocaleString()} followers · since {provider.since}</p>
      <div className="grid grid-cols-2 gap-px bg-white/5 border border-white/5 mb-4">
        {[
          { label:'Win rate',     value:`${provider.winRate}%`,                color:winColor  },
          { label:'Avg / month',  value:`+${provider.avgMonthly}%`,            color:'#4ade80' },
          { label:'Total trades', value:provider.totalTrades.toLocaleString(), color:'#f8fafc' },
          { label:'Max drawdown', value:`−${provider.maxDrawdown}%`,           color:ddColor   },
        ].map(s => (
          <div key={s.label} className="bg-[#020203] p-2 md:p-3">
            <div style={{ fontSize:'9px', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#1e293b', marginBottom:'4px', fontFamily:mono }}>{s.label}</div>
            <div style={{ fontSize:'14px', fontWeight:700, letterSpacing:'-0.03em', fontFamily:mono, lineHeight:1, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <button onClick={(e: any) => { e.stopPropagation(); onSelect(provider.id); }}
        className={`w-full py-2 text-[9px] font-bold uppercase tracking-[0.15em] border transition-all duration-300
          ${selected ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-white/5 text-slate-700 hover:border-white/15 hover:text-slate-500'}`}
        style={{ fontFamily:mono }}>
        {selected ? '● copying this provider' : 'select provider'}
      </button>
      {selected && <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 w-full shadow-[0_0_15px_rgba(37,99,235,1)]" />}
    </div>
  );
};

const StatusDot = ({ status }: any) => {
  const s: any = { ready:{color:'#22c55e',shadow:'0 0 6px rgba(34,197,94,0.5)',label:'Ready'}, pending:{color:'#f59e0b',shadow:'none',label:'Pending'}, inactive:{color:'#1e293b',shadow:'none',label:'Not verified'} }[status] || {color:'#1e293b',shadow:'none',label:'—'};
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:s.color, boxShadow:s.shadow, display:'inline-block', flexShrink:0 }} />
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'11px', color:s.color }}>{s.label}</span>
    </span>
  );
};

// ─── STEPS ────────────────────────────────────────────────────────────────────
const StepRole = ({ data, setData, resetStep }: any) => (
  <div className="border border-white/5">
    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5 border-b border-white/5">
      <FeatureCard icon={Radio}         title="Signal Provider"  active={data.role==='provider'} onClick={() => { setData({...data,role:'provider'}); resetStep(); }} sub="Master account. Broadcast your trades to followers in real-time." />
      <FeatureCard icon={Users}         title="Copy Follower"    active={data.role==='follower'} onClick={() => { setData({...data,role:'follower'}); resetStep(); }} sub="Follow a verified provider. Trades mirror automatically." />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
      <FeatureCard icon={GitFork}       title="Self-Copy"         active={data.role==='self'}     onClick={() => { setData({...data,role:'self'}); resetStep(); }}     sub="Duplicate trades between your own accounts on any broker." />
      <FeatureCard icon={MessageSquare} title="Telegram Signals"  active={data.role==='telegram'} onClick={() => { setData({...data,role:'telegram'}); resetStep(); }} sub="Parse and auto-execute signals from a Telegram channel." accent="text-sky-400" />
    </div>
  </div>
);

const StepConnect = ({ data, setData, label = "Trading Account" }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Platform Type</label>
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          {["MT4","MT5","cTrader","Proprietary"].map(p => (
            <button key={p} onClick={() => setData({...data,platform:p})}
              className={`px-3 md:px-4 py-3 border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between
                ${data.platform===p ? 'bg-white text-black border-white' : 'border-white/10 text-slate-500 hover:border-white/30'}`}>
              {p}{data.platform===p && <CheckCircle2 size={12} />}
            </button>
          ))}
        </div>
      </div>
      {data.platform==='Proprietary' ? (
        <div className="space-y-6 md:space-y-8">
          <TInput label="Broker Platform Name" placeholder="e.g. ThinkTrader, Oanda Desktop" />
          <TInput label="API Endpoint (Optional)" placeholder="https://api.broker.com/v1" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
            <TInput label="API Key" type="password" placeholder="pk_live_..." />
            <TInput label="Secret"  type="password" placeholder="••••••••" />
          </div>
        </div>
      ) : (
        <div className="space-y-6 md:space-y-8">
          <TInput label={`${label} Nickname`} placeholder="e.g. IC Markets Live" value={data.nickname??''} onChange={(e:any)=>setData({...data,nickname:e.target.value})} />
          <TInput label="Broker Server" placeholder="IC-Markets-Live-02" value={data.brokerServer??''} onChange={(e:any)=>setData({...data,brokerServer:e.target.value})} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
            <TInput label="Login ID"          placeholder="1029384" value={data.loginId??''} onChange={(e:any)=>setData({...data,loginId:e.target.value})} />
            <TInput label="Investor Password" type="password" placeholder="••••••••" value={data.password??''} onChange={(e:any)=>setData({...data,password:e.target.value})} />
          </div>
        </div>
      )}
    </div>
    <div className="p-5 md:p-8 flex flex-col gap-4 md:gap-6">
      <div className="p-4 md:p-5 border border-white/5 bg-white/[0.01]">
        <div className="flex items-center gap-3 mb-3 md:mb-4 text-blue-400">
          <Shield size={16} strokeWidth={1.5} />
          <span className="text-[10px] font-bold uppercase tracking-widest font-mono">Security Protocol</span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed italic">TradeSync uses isolated bridge technology to monitor your margin and mirror executions. No withdrawal or sensitive personal data permissions are ever required.</p>
      </div>
      <div className="p-4 md:p-5 border border-white/5 bg-white/[0.01]">
        <span className="text-[9px] font-mono font-bold text-slate-700 uppercase tracking-widest block mb-3 md:mb-4">// connection_status</span>
        <div className="divide-y divide-white/[0.04]">
          {[{label:'Bridge',status:'ready'},{label:'Broker server',status:'pending'},{label:'Login ID',status:'inactive'}].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2.5">
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'11px', color:'#334155' }}>{row.label}</span>
              <StatusDot status={row.status} />
            </div>
          ))}
          <div className="flex items-center justify-between py-2.5">
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'11px', color:'#334155' }}>Latency</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'11px', color:'#1e293b' }}>— ms</span>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-3 p-3 md:p-4 border border-blue-500/20 bg-blue-500/5 rounded-sm">
        <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-blue-300 leading-relaxed">Use your <span className="text-blue-200 font-semibold">investor (read-only) password</span> — never your master password.</p>
      </div>
    </div>
  </div>
);

const StepLink = ({ data, setData }: any) => (
  <div className="w-full space-y-6 md:space-y-10">
    <TInput label="Master Search ID" placeholder="Enter Provider UUID or Account ID..." />
    <div className="space-y-4">
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'10px', fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'#1e293b' }}>// verified_providers</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
        {PROVIDERS.map(p => <ProviderCard key={p.id} provider={p} selected={data.selectedProvider===p.id} onSelect={(id: string) => setData({...data,selectedProvider:id})} />)}
      </div>
    </div>
  </div>
);

const StepFilters = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// symbol_filters</span>
      <InfoBox>Leave blank to copy everything from the provider. Filters only restrict — they never add symbols.</InfoBox>
      <TInput label="Symbol Whitelist" hint="Only copy trades on these symbols. Comma-separated." placeholder="EURUSD, XAUUSD, BTCUSD" value={data.whitelist??''} onChange={(e:any)=>setData({...data,whitelist:e.target.value})} />
      <TInput label="Symbol Blacklist" hint="Never copy trades on these symbols even if the provider opens them." placeholder="GBPJPY, USDZAR" value={data.blacklist??''} onChange={(e:any)=>setData({...data,blacklist:e.target.value})} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
        <TInput label="Max Open Trades"  hint="Cap on simultaneous copied positions." placeholder="10" type="number" value={data.maxOpenTrades??''} onChange={(e:any)=>setData({...data,maxOpenTrades:e.target.value})} />
        <TInput label="Trade Delay (sec)" hint="Buffer before a copied trade executes." placeholder="0" type="number" value={data.tradeDelay??''} onChange={(e:any)=>setData({...data,tradeDelay:e.target.value})} />
      </div>
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// auto_pause_conditions</span>
      <Toggle label="Pause if provider hasn't traded in 7 days" sub="Prevents copying stale or abandoned signals" on={data.pauseInactive??true} onChange={(v: any) => setData({...data,pauseInactive:v})} />
      <Toggle label="Pause if my drawdown exceeds threshold"    sub="Set your drawdown limit in the Shield step"  on={data.pauseDD??true}       onChange={(v: any) => setData({...data,pauseDD:v})} />
      <Toggle label="Only copy during market sessions"          sub="Restrict copying to selected trading hours"  on={data.sessionFilter??false} onChange={(v: any) => setData({...data,sessionFilter:v})} />
      {data.sessionFilter && (
        <div className="space-y-3 pl-4 border-l border-blue-500/30">
          {['London (08:00–17:00 GMT)','New York (13:00–22:00 GMT)','Asia (00:00–09:00 GMT)'].map(s => (
            <Toggle key={s} label={s} on={data[`session_${s}`]??false} onChange={(v: any) => setData({...data,[`session_${s}`]:v})} />
          ))}
        </div>
      )}
    </div>
  </div>
);

const StepCopy = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="divide-y divide-white/5">
      <FeatureCard icon={Scale}      title="Balance Multiplier" active={data.lotMode==='mult'}  onClick={() => setData({...data,lotMode:'mult'})}  sub="Scale lot relative to account size. Recommended for most users." />
      <FeatureCard icon={Anchor}     title="Fixed Lot Size"     active={data.lotMode==='fixed'} onClick={() => setData({...data,lotMode:'fixed'})} sub="Always open a fixed lot regardless of the provider's size." />
      <FeatureCard icon={TrendingUp} title="Equity Risk %"      active={data.lotMode==='risk'}  onClick={() => setData({...data,lotMode:'risk'})}  sub="Dynamic sizing based on free margin and stop-loss distance." />
    </div>
    <div className="p-5 md:p-8 flex flex-col justify-center space-y-6 md:space-y-8">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">
        // {data.lotMode==='mult'?'balance_multiplier':data.lotMode==='fixed'?'fixed_lot':'equity_risk'}_config
      </span>
      {data.lotMode==='mult'  && <TInput label="Multiplier" hint="1.0 mirrors exactly. 0.5 = half the provider's lot. 2.0 = double." placeholder="1.0" type="number" value={data.lotMultiplier??''} onChange={(e:any)=>setData({...data,lotMultiplier:e.target.value})} />}
      {data.lotMode==='fixed' && <TInput label="Fixed Lot Size" hint="This exact lot value will be used for every copied trade." placeholder="0.01" type="number" value={data.fixedLot??''} onChange={(e:any)=>setData({...data,fixedLot:e.target.value})} />}
      {data.lotMode==='risk'  && <TInput label="Risk Per Trade (%)" hint="Engine auto-calculates lot size from your free margin and the stop-loss distance." placeholder="1.0" type="number" value={data.riskAmount} onChange={(e: any) => setData({...data,riskAmount:e.target.value})} />}
      <TSelect label="Direction Mode" hint="How trades are copied relative to the provider's direction."
        options={[{value:'same',label:'Same direction (standard copy)'},{value:'reverse',label:'Reverse direction (counter-trade)'},{value:'hedge',label:'Hedge mode (open opposite simultaneously)'}]}
        value={data.direction??'same'} onChange={(v: any) => setData({...data,direction:v})} />
      <div className="p-3 md:p-4 border border-white/5 bg-white/[0.01]">
        <p className="text-[11px] text-slate-600 leading-relaxed">
          {data.lotMode==='mult'  && 'Best for accounts with a similar balance to the provider. The engine scales proportionally so risk stays consistent.'}
          {data.lotMode==='fixed' && 'Best for micro/cent accounts or when you want full manual control over position sizing.'}
          {data.lotMode==='risk'  && 'Best for accounts of any size. Lot is recalculated on every trade based on current equity and the stop-loss distance.'}
        </p>
      </div>
    </div>
  </div>
);

const StepProtect = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <TInput label="Global Drawdown (%)" hint="Stop all copying if total account drawdown exceeds this." placeholder="5.0" type="number" value={data.maxDdPercent??''} onChange={(e:any)=>setData({...data,maxDdPercent:e.target.value})} />
      <TInput label="Max Daily Loss ($)"  hint="Halt copying for the rest of the day if this dollar loss is hit." placeholder="1000" type="number" value={data.maxDailyLoss??''} onChange={(e:any)=>setData({...data,maxDailyLoss:e.target.value})} />
      <div className="border-t border-white/5 pt-6 space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol Prefix</label>
          <p className="text-[11px] text-slate-600 leading-relaxed">Characters your broker adds <span className="text-slate-300">before</span> the symbol name.</p>
          <input type="text" placeholder="e.g. .m" value={data.symbolPrefix??''} onChange={(e:any)=>setData({...data,symbolPrefix:e.target.value})} className="w-full bg-white/[0.01] border-b border-white/10 py-3 text-sm font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-all font-mono" />
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] font-mono text-slate-600 bg-white/5 border border-white/5 px-2 py-1">EURUSD</span>
            <span className="text-[10px] text-slate-600">→</span>
            <span className="text-[10px] font-mono text-blue-400 bg-blue-500/5 border border-blue-500/10 px-2 py-1">.mEURUSD</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol Suffix</label>
          <p className="text-[11px] text-slate-600 leading-relaxed">Characters your broker adds <span className="text-slate-300">after</span> the symbol name.</p>
          <input type="text" placeholder="e.g. +f" value={data.symbolSuffix??''} onChange={(e:any)=>setData({...data,symbolSuffix:e.target.value})} className="w-full bg-white/[0.01] border-b border-white/10 py-3 text-sm font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-all font-mono" />
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] font-mono text-slate-600 bg-white/5 border border-white/5 px-2 py-1">EURUSD</span>
            <span className="text-[10px] text-slate-600">→</span>
            <span className="text-[10px] font-mono text-blue-400 bg-blue-500/5 border border-blue-500/10 px-2 py-1">EURUSD+f</span>
          </div>
        </div>
        <InfoBox>Leave prefix/suffix blank if unsure — most brokers don't need them.</InfoBox>
      </div>
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// safety_notifications</span>
      <Toggle label="Disconnection Alert" sub="Alert if bridge loses server connection"   on={data.notif1??true} onChange={(v: any) => setData({...data,notif1:v})} />
      <Toggle label="Execution Fail"      sub="Alert when an order is rejected by broker" on={data.notif2??true} onChange={(v: any) => setData({...data,notif2:v})} />
      <Toggle label="Drawdown Warning"    sub="Alert at 80% of your drawdown threshold"   on={data.notif3??true} onChange={(v: any) => setData({...data,notif3:v})} />
      <Toggle label="Daily Loss Warning"  sub="Alert at 80% of your daily loss limit"      on={data.notif4??true} onChange={(v: any) => setData({...data,notif4:v})} />
    </div>
  </div>
);

const StepRisk = ({ data, setData, isProvider }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <div className="p-4 border border-red-500/20 bg-red-500/5 space-y-3">
        <div className="flex items-center gap-3 text-red-400">
          <AlertTriangle size={16} />
          <span className="text-[10px] font-bold uppercase tracking-widest">{isProvider?'Provider Liability Disclosure':'Risk Warning'}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {isProvider ? "As a signal provider, you acknowledge that followers will execute real-money trades based on your signals. TradeSync does not verify your trading strategy or guarantee follower profitability."
                      : "Copy trading involves significant risk and may not be suitable for all investors. Past performance does not guarantee future results. You may lose some or all of your invested capital."}
        </p>
      </div>
      <div className="space-y-3 pt-2">
        <Toggle label="I have read and understand the risk warning" on={data.riskAccepted??false} onChange={(v: any) => setData({...data,riskAccepted:v})} />
        {isProvider && <Toggle label="I confirm I am a genuine signal provider" on={data.providerConfirmed??false} onChange={(v: any) => setData({...data,providerConfirmed:v})} />}
        <Toggle label={`I confirm I am ${isProvider?'broadcasting':'trading'} with funds I can afford to lose`} on={data.affordConfirmed??false} onChange={(v: any) => setData({...data,affordConfirmed:v})} />
      </div>
      {!(data.riskAccepted && data.affordConfirmed) && <InfoBox color="amber">You must accept all disclosures before deploying.</InfoBox>}
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// what_this_means</span>
      {[
        { icon:Shield,        title:'Your account is your responsibility', body:'TradeSync executes trades on your behalf but you remain the account holder. Always monitor open positions.' },
        { icon:AlertTriangle, title:'Past results are not a guarantee',    body:"A provider's historical win rate does not predict future performance. Markets change." },
        { icon:TrendingUp,    title:'Only risk what you can afford',        body:'Never fund a copy trading account with money needed for living expenses or other obligations.' },
      ].map(({ icon:Icon, title, body }) => (
        <div key={title} className="flex items-start gap-3 p-3 md:p-4 border border-white/5 bg-white/[0.01]">
          <Icon size={14} className="text-slate-600 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">{title}</p>
            <p className="text-[11px] text-slate-600 leading-relaxed">{body}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StepStrategy = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <TInput label="Strategy Name / Nickname" hint="Public-facing name followers will see on your profile." placeholder="e.g. Quantum Swing EA v3" value={data.strategyName??''} onChange={(e:any)=>setData({...data,strategyName:e.target.value})} />
      <TTextarea label="Strategy Description" hint="Describe your trading approach so followers know what to expect." placeholder="Describe your edge, timeframes, risk management approach..." rows={4} value={data.strategyDescription??''} onChange={(e:any)=>setData({...data,strategyDescription:e.target.value})} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
        <TSelect label="Trading Style" hint="Primary style that best describes your approach."
          options={[{value:'scalp',label:'Scalping (< 1 hour)'},{value:'intraday',label:'Intraday (same-day)'},{value:'swing',label:'Swing (multi-day)'},{value:'position',label:'Position (weeks/months)'},{value:'hft',label:'High-Frequency (HFT)'}]}
          value={data.tradingStyle??'swing'} onChange={(v: any) => setData({...data,tradingStyle:v})} />
        <TSelect label="Primary Markets" hint="Markets you primarily trade."
          options={[{value:'fx',label:'Forex (FX)'},{value:'crypto',label:'Cryptocurrency'},{value:'stocks',label:'Stocks / Indices'},{value:'commodities',label:'Commodities'},{value:'mixed',label:'Mixed / All markets'}]}
          value={data.primaryMarket??'fx'} onChange={(v: any) => setData({...data,primaryMarket:v})} />
      </div>
      <TInput label="Typical Symbols Traded" hint="Comma-separated list of instruments your strategy focuses on." placeholder="EURUSD, XAUUSD, GBPUSD" value={data.typicalSymbols??''} onChange={(e:any)=>setData({...data,typicalSymbols:e.target.value})} />
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// active_trading_sessions</span>
      <p className="text-[11px] text-slate-600 leading-relaxed">Let followers know which market sessions you actively trade.</p>
      {['London (08:00–17:00 GMT)','New York (13:00–22:00 GMT)','Asia (00:00–09:00 GMT)'].map(s => (
        <Toggle key={s} label={s} on={data[`prov_session_${s}`]??false} onChange={(v: any) => setData({...data,[`prov_session_${s}`]:v})} />
      ))}
    </div>
  </div>
);

const StepLimits = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// trade_limits</span>
      <InfoBox>These limits protect your followers from overexposure and help them size positions correctly.</InfoBox>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
        <TInput label="Max Lot Size Per Signal"    hint="Highest lot you will ever broadcast."              placeholder="1.00" type="number" />
        <TInput label="Max Open Trades at Once"    hint="Maximum simultaneous positions you'll carry."      placeholder="5"    type="number" />
        <TInput label="Typical Stop-Loss (pips)"   hint="Average SL distance per trade."                   placeholder="30"   type="number" />
        <TInput label="Typical Take-Profit (pips)" hint="Average TP distance."                             placeholder="60"   type="number" />
      </div>
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// signal_visibility</span>
      <Toggle label="Make profile publicly discoverable"         sub="Appear in the verified providers list for all users" on={data.isPublic??true}         onChange={(v: any) => setData({...data,isPublic:v})} />
      <Toggle label="Require approval before followers can copy" sub="You manually approve each follower request"          on={data.requireApproval??false} onChange={(v: any) => setData({...data,requireApproval:v})} />
      <Toggle label="Show live open trades to followers"         sub="Followers can see your current open positions"       on={data.showOpenTrades??true}   onChange={(v: any) => setData({...data,showOpenTrades:v})} />
    </div>
  </div>
);

const StepProviderNotif = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <TInput label="Notification Email" hint="Where to receive follower and performance alerts." placeholder="you@example.com" type="email" />
      <div className="border-t border-white/5 pt-4 space-y-3">
        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// alert_events</span>
        <Toggle label="New follower joined"           sub="Alert when someone starts copying you"           on={data.nNewFollower??true} onChange={(v: any) => setData({...data,nNewFollower:v})} />
        <Toggle label="Follower stopped copying"      sub="Alert when someone disconnects from your signal" on={data.nDropped??true}     onChange={(v: any) => setData({...data,nDropped:v})} />
        <Toggle label="Execution failure on follower" sub="Alert if a follower's copy trade was rejected"   on={data.nExecFail??true}    onChange={(v: any) => setData({...data,nExecFail:v})} />
        <Toggle label="Bridge disconnection"          sub="Alert if your bridge loses server connection"    on={data.nDisconnect??true}  onChange={(v: any) => setData({...data,nDisconnect:v})} />
        <Toggle label="Weekly performance digest"     sub="A weekly summary of your follower performance"   on={data.nWeekly??false}     onChange={(v: any) => setData({...data,nWeekly:v})} />
      </div>
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// delivery_info</span>
      <p className="text-[11px] text-slate-600 leading-relaxed">All alerts are delivered to your notification email. You can update this at any time from your provider dashboard.</p>
      <InfoBox color="blue">Keep alerts on while you are live. Disconnection and execution failure alerts are especially critical during active trading sessions.</InfoBox>
    </div>
  </div>
);

const StepConnect2 = ({ data, setData }: any) => (
  <StepConnect data={{...data,platform:data.platform2??'MT5'}} setData={(d: any) => setData({...data,platform2:d.platform})} label="Target Account" />
);

const StepMapping = ({ data, setData }: any) => {
  const copyAll = data.copyAllSymbols ?? true;
  return (
    <div className="space-y-6 md:space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
        <div onClick={() => setData({...data,copyAllSymbols:true})}
          className={`relative p-5 cursor-pointer transition-all duration-300 ${copyAll?'bg-blue-600/5 border-blue-500/50 border':'border border-transparent hover:border-white/10'}`}>
          <div className="flex items-start gap-4">
            <div className={`mt-1 w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${copyAll?'border-blue-500':'border-slate-600'}`}>
              {copyAll && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
            <div>
              <p className={`text-sm font-semibold mb-1 transition-colors ${copyAll?'text-white':'text-slate-400'}`}>Copy everything</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">Mirror all symbols traded on the source account automatically.</p>
            </div>
          </div>
          {copyAll && <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 w-full" />}
        </div>
        <div onClick={() => setData({...data,copyAllSymbols:false})}
          className={`relative p-5 cursor-pointer transition-all duration-300 ${!copyAll?'bg-blue-600/5 border-blue-500/50 border':'border border-transparent hover:border-white/10'}`}>
          <div className="flex items-start gap-4">
            <div className={`mt-1 w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${!copyAll?'border-blue-500':'border-slate-600'}`}>
              {!copyAll && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
            <div>
              <p className={`text-sm font-semibold mb-1 transition-colors ${!copyAll?'text-white':'text-slate-400'}`}>Custom symbol mapping</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">Specify exactly which symbols to copy and rename them if needed.</p>
            </div>
          </div>
          {!copyAll && <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 w-full" />}
        </div>
      </div>
      {copyAll && (
        <InfoBox color="green">
          All instruments on the source account will mirror to the target automatically. If brokers use different symbol names (e.g. <span className="font-mono">XAUUSD</span> vs <span className="font-mono">GOLD</span>), switch to Custom Mapping.
        </InfoBox>
      )}
      {!copyAll && (
        <div className="space-y-5">
          <InfoBox>Only symbols listed here will be copied — all others will be ignored.</InfoBox>
          <div className="grid grid-cols-2 gap-4 md:gap-8 px-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Source Symbol</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Symbol</span>
          </div>
          {(data.symbolMaps??[{from:'',to:''},{from:'',to:''}]).map((m: any,i: number) => (
            <div key={i} className="grid grid-cols-2 gap-4 md:gap-8 items-center">
              <input placeholder="e.g. XAUUSD" value={m.from}
                onChange={(e: any) => { const maps=[...(data.symbolMaps??[])]; maps[i]={...maps[i],from:e.target.value}; setData({...data,symbolMaps:maps}); }}
                className="w-full bg-white/[0.01] border-b border-white/10 py-3 text-sm font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-all font-mono" />
              <div className="flex items-center gap-2">
                <span className="text-slate-700 text-xs flex-shrink-0">→</span>
                <input placeholder="e.g. GOLD" value={m.to}
                  onChange={(e: any) => { const maps=[...(data.symbolMaps??[])]; maps[i]={...maps[i],to:e.target.value}; setData({...data,symbolMaps:maps}); }}
                  className="w-full bg-white/[0.01] border-b border-white/10 py-3 text-sm font-medium text-white placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-all font-mono" />
                {(data.symbolMaps??[]).length > 1 && (
                  <button onClick={() => setData({...data,symbolMaps:(data.symbolMaps??[]).filter((_: any,idx: number)=>idx!==i)})}
                    className="text-slate-700 hover:text-red-400 transition-colors text-xs flex-shrink-0 font-mono">✕</button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => setData({...data,symbolMaps:[...(data.symbolMaps??[]),{from:'',to:''}]})}
            className="text-[10px] uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/20 px-4 py-2">
            + Add Symbol
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 border-t border-white/5">
        <div className="space-y-6 pt-6 md:pt-8 md:pr-8">
          <TSelect label="Direction Mode" hint="How to copy relative to source direction."
            options={[{value:'same',label:'Same direction (mirror)'},{value:'reverse',label:'Reverse direction (counter)'},{value:'hedge',label:'Hedge (open both directions)'}]}
            value={data.selfDirection??'same'} onChange={(v: any) => setData({...data,selfDirection:v})} />
          <Toggle label="Replay missed trades on reconnect" sub="If the bridge was offline, catch up on trades that were missed" on={data.replayMissed??false} onChange={(v: any) => setData({...data,replayMissed:v})} />
        </div>
      </div>
    </div>
  );
};

const StepTgAuth = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// credentials</span>
      <TInput label="Bot API Token" hint="Create a bot via @BotFather on Telegram and paste the token here." placeholder="1234567890:AAF..." value={data.tgBotToken??''} onChange={(e:any)=>setData({...data,tgBotToken:e.target.value})} />
      <TInput label="Telegram Phone Number" hint="Your personal Telegram number linked to the account with channel access." placeholder="+254 7XX XXX XXX" type="tel" value={data.tgPhone??''} onChange={(e:any)=>setData({...data,tgPhone:e.target.value})} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
        <TInput label="API ID"   hint="Get from my.telegram.org → API development tools." placeholder="12345678" value={data.tgApiId??''} onChange={(e:any)=>setData({...data,tgApiId:e.target.value})} />
        <TInput label="API Hash" hint="Generated alongside your API ID." placeholder="abc123def456..." value={data.tgApiHash??''} onChange={(e:any)=>setData({...data,tgApiHash:e.target.value})} />
      </div>
      <InfoBox color="blue">A verification code will be sent to your Telegram app after submitting.</InfoBox>
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// security_protocol</span>
      <p className="text-[11px] text-slate-600 leading-relaxed">TradeSync uses a read-only Telegram bot to monitor signal channels. Your credentials are never stored — only a revocable session token is used.</p>
      {[
        { title:'Read-only access',      body:'The bot can only read messages in channels it has been added to. It cannot send messages or access your contacts.' },
        { title:'Revocable at any time', body:'You can revoke access from Telegram Settings → Privacy → Active Sessions at any time.' },
        { title:'No password required',  body:"We use Telegram's official MTProto API. Your account password is never requested or stored." },
      ].map(({ title, body }) => (
        <div key={title} className="flex items-start gap-3 p-3 md:p-4 border border-white/5 bg-white/[0.01]">
          <Shield size={13} className="text-slate-600 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">{title}</p>
            <p className="text-[11px] text-slate-600 leading-relaxed">{body}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StepTgChannel = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <TInput label="Verification Code" hint="Enter the code sent to your Telegram app to confirm account access." placeholder="12345" value={data.tgVerifyCode??''} onChange={(e:any)=>setData({...data,tgVerifyCode:e.target.value})} />
      <div className="border-t border-white/5 pt-6 space-y-6">
        <TInput label="Channel / Group Name or Link" hint="The exact username or invite link of the signal channel." placeholder="@forex_signals_channel or https://t.me/..." value={data.tgChannelName??''} onChange={(e:any)=>setData({...data,tgChannelName:e.target.value})} />
        <TSelect label="Channel Type" hint="Select the type of Telegram source you're connecting to."
          options={[{value:'public_channel',label:'Public channel (@username)'},{value:'private_channel',label:'Private channel (invite link)'},{value:'group',label:'Group or supergroup'},{value:'bot',label:'Direct bot signals'}]}
          value={data.tgChannelType??'public_channel'} onChange={(v: any) => setData({...data,tgChannelType:v})} />
      </div>
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// source_options</span>
      <Toggle label="Monitor multiple channels"              sub="Connect up to 5 channels and merge their signals"         on={data.tgMultiChannel??false} onChange={(v: any) => setData({...data,tgMultiChannel:v})} />
      <Toggle label="Only copy signals from specific sender" sub="Filter by a specific admin or bot username in the channel" on={data.tgFilterSender??false} onChange={(v: any) => setData({...data,tgFilterSender:v})} />
      {data.tgFilterSender && (
        <div className="pl-4 border-l border-blue-500/30 pt-2">
          <TInput label="Sender Username" placeholder="@signal_admin" value={data.tgSenderUsername??''} onChange={(e:any)=>setData({...data,tgSenderUsername:e.target.value})} />
        </div>
      )}
    </div>
  </div>
);

const StepTgParser = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6 md:space-y-8">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// signal_keywords</span>
      <InfoBox>Tell the parser what keywords your channel uses so it can extract entry, SL and TP correctly.</InfoBox>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
        <TInput label="Entry Keyword"       hint="Word that precedes the entry price."       placeholder="e.g. Entry, Buy at" value={data.tgEntryKw??''} onChange={(e:any)=>setData({...data,tgEntryKw:e.target.value})} />
        <TInput label="Stop-Loss Keyword"   hint="Word that precedes the stop-loss value."    placeholder="e.g. SL, Stop" value={data.tgSlKw??''} onChange={(e:any)=>setData({...data,tgSlKw:e.target.value})} />
        <TInput label="Take-Profit Keyword" hint="Word preceding the take-profit value."      placeholder="e.g. TP, Target" value={data.tgTpKw??''} onChange={(e:any)=>setData({...data,tgTpKw:e.target.value})} />
        <TInput label="Symbol Keyword"      hint="How the symbol is labelled in the message." placeholder="e.g. Pair, Symbol" value={data.tgSymbolKw??''} onChange={(e:any)=>setData({...data,tgSymbolKw:e.target.value})} />
      </div>
    </div>
    <div className="p-5 md:p-8 space-y-4 md:space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// partial_signal_handling</span>
      <Toggle label="Execute if no Stop-Loss provided"        sub="Opens the trade without an SL — use with caution"   on={data.tgNoSL??false}      onChange={(v: any) => setData({...data,tgNoSL:v})} />
      <Toggle label="Execute if no Take-Profit provided"      sub="Leaves trade open until manually closed or SL hit"  on={data.tgNoTP??true}       onChange={(v: any) => setData({...data,tgNoTP:v})} />
      <Toggle label="Use first TP only (ignore multiple TPs)" sub="For multi-TP signals, only execute against TP1"     on={data.tgFirstTP??true}    onChange={(v: any) => setData({...data,tgFirstTP:v})} />
      <Toggle label="Auto-close on signal update"             sub="If the channel updates a signal, modify the trade"  on={data.tgAutoUpdate??false} onChange={(v: any) => setData({...data,tgAutoUpdate:v})} />
    </div>
  </div>
);

function clientSideParseSignal(text: string) {
  const up = text.toUpperCase();
  const KNOWN = [
    'EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD',
    'EURGBP','EURJPY','EURAUD','EURCAD','EURCHF','EURNZD',
    'GBPJPY','GBPAUD','GBPCAD','GBPCHF','GBPNZD',
    'XAUUSD','GOLD','XAGUSD','SILVER','USOIL','UKOIL','WTI',
    'US30','US100','US500','NAS100','SPX500','DJ30','UK100','GER40',
    'BTCUSD','ETHUSD','XRPUSD','BTCUSDT','ETHUSDT',
    'AUDJPY','AUDCAD','AUDCHF','AUDNZD','CADJPY','CADCHF','CHFJPY','NZDJPY',
  ];
  const BLOCKLIST = new Set(['BUY','SELL','LONG','SHORT','STOP','LIMIT','ENTRY',
    'TARGET','HIGH','LOW','CLOSE','OPEN','PRICE','LOSS','PROFIT','TAKE','TRADE',
    'SIGNAL','ALERT','NEWS','UPDATE','MARKET','ORDER','USD','EUR','GBP','JPY',
    'CHF','CAD','AUD','NZD','TP','SL','RR','PIP','LOT','PAIR']);

  let direction: string | null = null;
  if (/\b(buy\s+limit|buy\s+stop|buy|long)\b/i.test(text))  direction = 'BUY';
  else if (/\b(sell\s+limit|sell\s+stop|sell|short)\b/i.test(text)) direction = 'SELL';
  if (!direction) return null;

  let symbol: string | null = null;
  for (const s of [...KNOWN].sort((a,b) => b.length - a.length)) {
    if (new RegExp('(?<![A-Z])' + s + '(?![A-Z])').test(up)) { symbol = s; break; }
  }
  if (!symbol) {
    const m = text.match(/\b([A-Z]{3,6}(?:\/?[A-Z]{3,6})?)\b/);
    if (m) { const c = m[1].replace('/',''); if (!BLOCKLIST.has(c)) symbol = c; }
  }
  if (!symbol) return null;

  const priceRe = /(\d{2,6}(?:[.,]\d{1,5})?)/;
  const after = (kw: string) => {
    const m = text.match(new RegExp(kw + '[:\\s@]*' + priceRe.source, 'i'));
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  };
  const entry = after('entry') ?? after('price') ?? after('@');
  const sl    = after('sl') ?? after('stop');
  const tp    = after('tp1') ?? after('tp') ?? after('target') ?? after('take profit');
  const tp2   = (() => { const m = text.match(/tp\s*2[:\s]*([\d.,]+)/i); return m ? parseFloat(m[1].replace(',','.')) : null; })();

  const filled = [entry, sl, tp].filter(v => v !== null).length;
  const confidence = filled === 3 ? 'High' : filled === 2 ? 'Medium' : 'Low';

  return {
    symbol, direction,
    entry: entry ? String(entry) : '—',
    sl:    sl    ? String(sl)    : '—',
    tp1:   tp    ? String(tp)    : '—',
    tp2:   tp2   ? String(tp2)   : '—',
    confidence,
  };
}

const StepTgTest = ({ data, setData }: any) => {
  const [parsed, setParsed] = useState<any>(null);
  const [parseError, setParseError] = useState<string>('');
  const sampleMsg = data.testMessage ?? '';
  const runTest = () => {
    if (!sampleMsg.trim()) return;
    setParseError('');
    const result = clientSideParseSignal(sampleMsg);
    if (result) {
      setParsed(result);
    } else {
      setParsed(null);
      setParseError('Could not identify a valid trade signal. Check that the message contains a direction (BUY/SELL) and a symbol (e.g. EURUSD).');
    }
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
      <div className="p-5 md:p-8 space-y-6 md:space-y-8">
        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// sample_message</span>
        <InfoBox>Paste a real signal message from the channel to verify the parser before going live.</InfoBox>
        <TTextarea label="Signal Message" hint="Copy and paste an example message exactly as it appears in the channel."
          placeholder={`BUY EURUSD\nEntry: 1.08450\nSL: 1.08100\nTP1: 1.08800\nTP2: 1.09100`}
          rows={6} value={sampleMsg} onChange={(e: any) => setData({...data,testMessage:e.target.value})} />
        <GlowButton active={!!sampleMsg.trim()} onClick={runTest}>
          <Zap size={14} /> Run Parser Test
        </GlowButton>
      </div>
      <div className="p-5 md:p-8 space-y-4 md:space-y-6">
        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// parser_result</span>
        {!parsed && !parseError
          ? <p className="text-[11px] text-slate-700 leading-relaxed">Paste a signal message and run the test to see the extracted trade details here.</p>
          : parseError
          ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <span className="text-[10px] font-bold uppercase tracking-widest">No Signal Detected</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{parseError}</p>
            </div>
          )
          : parsed && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Confidence: {parsed.confidence}</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/5 border border-white/5">
                {[{label:'Symbol',value:parsed.symbol},{label:'Direction',value:parsed.direction},{label:'Entry',value:parsed.entry},{label:'Stop-Loss',value:parsed.sl},{label:'TP 1',value:parsed.tp1},{label:'TP 2',value:parsed.tp2}].map((f: any) => (
                  <div key={f.label} className="bg-[#020203] p-2 md:p-3">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1 font-mono">{f.label}</div>
                    <div className="text-sm font-bold font-mono text-white">{f.value ?? '—'}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-600">If any field looks incorrect, go back and adjust the parser keywords.</p>
            </div>
          )
        }
      </div>
    </div>
  );
};

function buildDeployPayload(data: any) {
  const toList = (csv: string) =>
    csv ? csv.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined;
  return {
    role: data.role,
    accountConfig: {
      nickname:     data.nickname || data.loginId || 'My Account',
      platform:     data.platform || 'MT5',
      brokerServer: data.brokerServer,
      loginId:      data.loginId,
      password:     data.password,
      symbolPrefix: data.symbolPrefix,
      symbolSuffix: data.symbolSuffix,
    },
    masterConfig: {
      strategyName:    data.strategyName,
      description:     data.strategyDescription,
      tradingStyle:    data.tradingStyle,
      primaryMarket:   data.primaryMarket,
      isPublic:        data.isPublic ?? true,
      requireApproval: data.requireApproval ?? false,
      showOpenTrades:  data.showOpenTrades ?? true,
    },
    followerConfig: {
      masterId:        data.selectedProvider,
      lotMode:         data.lotMode || 'mult',
      lotMultiplier:   data.lotMultiplier || '1.0',
      fixedLot:        data.fixedLot,
      riskPercent:     data.riskAmount || '1.0',
      direction:       data.direction || 'same',
      symbolWhitelist: toList(data.whitelist),
      symbolBlacklist: toList(data.blacklist),
      maxOpenTrades:   data.maxOpenTrades ? parseInt(data.maxOpenTrades) : 10,
      tradeDelaySec:   data.tradeDelay   ? parseInt(data.tradeDelay)    : 0,
      pauseInactive:   data.pauseInactive ?? true,
      pauseOnDD:       data.pauseDD ?? true,
      maxDdPercent:    data.maxDdPercent  || undefined,
      maxDailyLoss:    data.maxDailyLoss  || undefined,
      riskAccepted:    data.riskAccepted  ?? false,
    },
    telegramConfig: data.role === 'telegram' ? {
      botToken:      data.tgBotToken,
      phoneNumber:   data.tgPhone,
      apiId:         data.tgApiId,
      apiHash:       data.tgApiHash,
      channelName:   data.tgChannelName,
      channelType:   data.tgChannelType || 'public_channel',
      multiChannel:  data.tgMultiChannel ?? false,
      filterSender:  data.tgFilterSender ? data.tgSenderUsername : undefined,
      entryKeyword:  data.tgEntryKw,
      slKeyword:     data.tgSlKw,
      tpKeyword:     data.tgTpKw,
      symbolKeyword: data.tgSymbolKw,
      executeNoSL:   data.tgNoSL      ?? false,
      executeNoTP:   data.tgNoTP      ?? true,
      useFirstTpOnly: data.tgFirstTP  ?? true,
      autoUpdate:    data.tgAutoUpdate ?? false,
    } : undefined,
  };
}

const StepGoLive = ({ data, role, onReset }: any) => {
  const [status, setStatus] = useState<'ready'|'deploying'|'success'|'error'>('ready');
  const [deployResult, setDeployResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const provider  = PROVIDERS.find(p => p.id === data.selectedProvider);
  const allAccepted = data.riskAccepted && data.affordConfirmed;
  const canDeploy = role==='provider' ? (allAccepted && data.providerConfirmed) : allAccepted;
  const summaries: any = {
    follower: provider ? `Copying ${provider.name} · ${data.lotMode??'mult'} lot mode` : 'Configure provider in Bridge Linkage step',
    provider: `Broadcasting your strategy · ${data.isPublic?'Public':'Private'}`,
    self:     'Self-copy bridge between your two accounts',
    telegram: 'Telegram signal parser configured',
  };
  const successMsg: any = {
    follower: provider ? <>Copying <span className="text-blue-400 font-mono">{provider.name}</span> in real-time.</> : 'Bridge is live.',
    provider: 'Your signals are now broadcasting to followers.',
    self:     'Self-copy bridge is active between your accounts.',
    telegram: 'Telegram signal parser is live and monitoring the channel.',
  };

  const handleDeploy = async () => {
    if (!canDeploy) return;
    setStatus('deploying');
    setErrorMsg('');
    try {
      const res = await fetch('/api/copy/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDeployPayload(data)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `Server error ${res.status}` }));
        throw new Error(err.message || `Server error ${res.status}`);
      }
      const result = await res.json();
      setDeployResult(result);
      setStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Deployment failed');
      setStatus('error');
    }
  };

  if (status === 'deploying') return (
    <div className="border border-white/5 p-8 md:p-20 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto">
      <div className="w-24 h-24 rounded-full border border-blue-500/20 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-blue-500/10 blur-2xl animate-ping" />
        <Rocket size={40} className="text-blue-400 animate-pulse" strokeWidth={1.5} />
      </div>
      <h2 className="text-2xl md:text-3xl font-light">Deploying Terminal…</h2>
      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        {['Establishing bridge connection','Verifying account credentials','Activating copy engine'].map((msg, i) => (
          <div key={msg} className="flex items-center gap-3 w-full text-left">
            <div className="w-4 h-4 rounded-full border border-blue-500/40 bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay:`${i*0.3}s` }} />
            </div>
            <span className="text-[11px] font-mono text-slate-500">{msg}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (status === 'error') return (
    <div className="border border-white/5 p-8 md:p-20 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto">
      <div className="w-24 h-24 rounded-full border border-red-500/30 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-red-500/10 blur-2xl animate-pulse" />
        <AlertTriangle size={40} className="text-red-400 relative z-10" strokeWidth={1.5} />
      </div>
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-4 py-1.5 text-red-400 text-[10px] font-mono font-bold uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
          Deployment Failed
        </div>
        <h2 className="text-2xl md:text-3xl font-light">Terminal Error</h2>
        <p className="text-slate-500 text-sm max-w-md font-mono">{errorMsg}</p>
      </div>
      <GlowButton active onClick={() => setStatus('ready')}>
        Try Again <ArrowRight size={14} />
      </GlowButton>
    </div>
  );

  if (status === 'success') return (
    <div className="border border-white/5 p-8 md:p-20 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto">
      <div className="w-24 h-24 rounded-full border border-green-500/30 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-green-500/10 blur-2xl animate-pulse" />
        <CheckCircle2 size={40} className="text-green-400 relative z-10" strokeWidth={1.5} />
      </div>
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-4 py-1.5 text-green-400 text-[10px] font-mono font-bold uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
          Deployment Successful
        </div>
        <h2 className="text-2xl md:text-3xl font-light">Terminal Live</h2>
        <p className="text-slate-500 text-sm max-w-md">{successMsg[role]}</p>
      </div>
      <div className="grid grid-cols-3 gap-px bg-white/5 border border-white/5 w-full max-w-sm mt-2">
        {[
          { label:'Account', value: deployResult?.account?.id ? deployResult.account.id.slice(0,8)+'…' : '—', color:'#4ade80' },
          { label:'Bridge',  value: deployResult?.follower?.id || deployResult?.master?.id ? 'Linked' : 'Ready', color:'#f8fafc' },
          { label:'Status',  value:'Live', color:'#60a5fa' },
        ].map(s => (
          <div key={s.label} className="bg-[#020203] p-3 text-center">
            <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
            <div className="text-sm font-mono font-bold" style={{ color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-3 pt-2">
        <GlowButton active onClick={onReset}>
          Set Up Another Terminal <ArrowRight size={14} />
        </GlowButton>
        {deployResult?.follower?.id && (
          <a href={`/api/copy/logs/${deployResult.follower.id}`} target="_blank" rel="noreferrer"
            className="text-[10px] uppercase tracking-widest text-slate-700 hover:text-slate-400 transition-colors">
            View Bridge Logs
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="border border-white/5 p-8 md:p-20 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto">
      <div className="w-24 h-24 rounded-full border border-blue-500/20 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-blue-500/10 blur-2xl animate-pulse" />
        <Rocket size={40} className="text-blue-500" strokeWidth={1.5} />
      </div>
      <h2 className="text-2xl md:text-3xl font-light">System Ready</h2>
      <p className="text-slate-500 text-sm max-w-md">{summaries[role]}</p>
      {!canDeploy && (
        <div className="flex items-start gap-2 text-amber-400 text-xs border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>Please complete the Risk Disclosure step before deploying.</span>
        </div>
      )}
      <GlowButton active={canDeploy} onClick={handleDeploy}>
        DEPLOY TERMINAL <ArrowRight size={14} />
      </GlowButton>
    </div>
  );
};

// ─── Step Titles ──────────────────────────────────────────────────────────────
const STEP_TITLES: any = {
  role:'Define your role.', connect:'Terminal Access', connect2:'Target Account',
  link:'Bridge Linkage', filters:'Copy Filters', copy:'Lot Engine',
  protect:'Protection Shield', risk:'Risk Disclosure', strategy:'Your Strategy',
  limits:'Signal Limits', notif:'Notifications', mapping:'Symbol Mapping',
  'tg-auth':'Telegram Auth', 'tg-channel':'Channel Setup',
  'tg-parser':'Signal Parser', 'tg-test':'Parser Test', 'go-live':'Deployment Protocol',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COPIER WIZARD
// ═══════════════════════════════════════════════════════════════════════════════
function CopierWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep]               = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<any>({
    role:'follower', platform:'MT5', lotMode:'mult', riskAmount:'1',
    selectedProvider:null, symbolMaps:[{from:'',to:''},{from:'',to:''}],
  });

  const getSteps = () => {
    if (data.role==='provider') return STEPS_PROVIDER;
    if (data.role==='self')     return STEPS_SELF;
    if (data.role==='telegram') return STEPS_TELEGRAM;
    return STEPS_FOLLOWER;
  };

  const steps = getSteps();
  const cur   = steps[step] || steps[0];

  const handleNext = () => { if (step < steps.length-1) { setStep(s=>s+1); setSidebarOpen(false); } };
  const handlePrev = () => { if (step > 0) setStep(s=>s-1); };

  const handleReset = () => {
    setStep(0);
    setData({ role:'follower', platform:'MT5', lotMode:'mult', riskAmount:'1', selectedProvider:null, symbolMaps:[{from:'',to:''},{from:'',to:''}] });
  };

  const renderStep = () => {
    switch (cur.id) {
      case 'role':       return <StepRole          data={data} setData={setData} resetStep={() => setStep(0)} />;
      case 'connect':    return <StepConnect       data={data} setData={setData} label={data.role==='self'?'Source Account':'Trading Account'} />;
      case 'connect2':   return <StepConnect2      data={data} setData={setData} />;
      case 'link':       return <StepLink          data={data} setData={setData} />;
      case 'filters':    return <StepFilters       data={data} setData={setData} />;
      case 'copy':       return <StepCopy          data={data} setData={setData} />;
      case 'protect':    return <StepProtect       data={data} setData={setData} />;
      case 'risk':       return <StepRisk          data={data} setData={setData} isProvider={data.role==='provider'} />;
      case 'strategy':   return <StepStrategy      data={data} setData={setData} />;
      case 'limits':     return <StepLimits        data={data} setData={setData} />;
      case 'notif':      return <StepProviderNotif data={data} setData={setData} />;
      case 'mapping':    return <StepMapping       data={data} setData={setData} />;
      case 'tg-auth':    return <StepTgAuth        data={data} setData={setData} />;
      case 'tg-channel': return <StepTgChannel     data={data} setData={setData} />;
      case 'tg-parser':  return <StepTgParser      data={data} setData={setData} />;
      case 'tg-test':    return <StepTgTest        data={data} setData={setData} />;
      case 'go-live':    return <StepGoLive        data={data} role={data.role} onReset={handleReset} />;
      default:           return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#020203] text-white selection:bg-blue-500/40 font-light overflow-hidden">
      <style>{FONTS + `
        body{font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:-0.01em;}
        .mono{font-family:'JetBrains Mono',monospace;}
        .hide-scrollbar::-webkit-scrollbar{display:none;}
        .hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}
      `}</style>

      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-52 bg-[#0a0a0f] border-l border-white/10 flex flex-col py-6 px-4" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Navigation</span>
              <button onClick={() => setSidebarOpen(false)}><X size={16} className="text-slate-500" /></button>
            </div>
            <nav className="flex flex-col gap-0.5">
              {steps.map((s,i) => {
                const Icon = s.icon;
                const done   = i < step;
                const active = i === step;
                return (
                  <button key={s.id} onClick={() => { if(done||active){ setStep(i); setSidebarOpen(false); } }}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-all text-left rounded-sm
                      ${active?'text-blue-400 bg-blue-500/5':done?'text-slate-500 hover:text-slate-300 cursor-pointer':'text-slate-700 cursor-default'}`}>
                    <Icon size={14} strokeWidth={1.5} />
                    <span className="text-[11px] uppercase tracking-widest">{s.label}</span>
                    {active && <div className="ml-auto w-1 h-3 bg-blue-500 rounded-full" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <div className="flex h-screen flex-row-reverse">

        {/* SIDEBAR — desktop only */}
        <aside className="hidden md:flex w-24 border-l border-white/5 flex-col items-center py-8 bg-black/40 backdrop-blur-xl z-20 overflow-y-auto hide-scrollbar">
          <nav className="flex-1 flex flex-col gap-6 justify-center">
            {steps.map((s,i) => {
              const Icon = s.icon;
              const done   = i < step;
              const active = i === step;
              return (
                <div key={s.id} className="relative flex flex-col items-center gap-1">
                  <div className="relative flex items-center justify-center">
                    <Icon size={18} strokeWidth={1.5}
                      className={`transition-all duration-500 cursor-pointer
                        ${active?'text-blue-400':done?'text-blue-600':'text-slate-700 hover:text-slate-400'}`}
                      onClick={() => done && setStep(i)} />
                    {active && <div className="absolute -left-[13px] w-[2px] h-6 bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,1)]" />}
                  </div>
                  <span className={`text-[8px] uppercase tracking-widest transition-colors ${active?'text-blue-400':done?'text-slate-600':'text-slate-800'}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.03),transparent_40%)]">

          {/* HEADER */}
          <header className="h-14 md:h-20 border-b border-white/5 flex items-center px-4 md:px-12 justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest hidden sm:block">TradeSync Terminal</span>
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest sm:hidden">TradeSync</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Role tabs */}
              <div className="hidden sm:flex items-center gap-1.5">
                {['follower','provider','self','telegram'].map(r => (
                  <span key={r} className={`text-[9px] uppercase tracking-widest px-2 py-1 border transition-colors cursor-pointer
                    ${data.role===r?'border-blue-500/40 text-blue-400 bg-blue-500/5':'border-white/5 text-slate-700 hover:text-slate-500'}`}
                    onClick={() => { setData({...data,role:r}); setStep(0); }}>
                    {r}
                  </span>
                ))}
              </div>
              {/* Back button */}
              <button onClick={onBack}
                className="ml-3 text-[9px] uppercase tracking-widest px-3 py-1.5 border border-white/10 text-slate-600 hover:border-white/30 hover:text-slate-300 transition-colors">
                ← Back
              </button>
              {/* Hamburger — mobile */}
              <button className="md:hidden p-1.5 text-slate-500 hover:text-white transition-colors" onClick={() => setSidebarOpen(true)}>
                <Menu size={18} />
              </button>
            </div>
          </header>

          {/* Mobile role switcher */}
          <div className="flex sm:hidden items-center gap-1.5 px-4 py-2 border-b border-white/5 overflow-x-auto hide-scrollbar flex-shrink-0">
            {['follower','provider','self','telegram'].map(r => (
              <span key={r} className={`text-[9px] uppercase tracking-widest px-2 py-1.5 border transition-colors cursor-pointer flex-shrink-0
                ${data.role===r?'border-blue-500/40 text-blue-400 bg-blue-500/5':'border-white/5 text-slate-700'}`}
                onClick={() => { setData({...data,role:r}); setStep(0); }}>
                {r}
              </span>
            ))}
          </div>

          {/* CONTENT */}
          <section className="flex-1 overflow-y-auto p-5 md:p-12 lg:p-20 hide-scrollbar">
            <div className={cur.id==='link' ? 'w-full' : 'max-w-6xl'}>
              <SectionTitle step={step} id={cur.id} title={STEP_TITLES[cur.id]??cur.id} />
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {renderStep()}
              </div>
            </div>
          </section>

          {/* FOOTER */}
          <footer className="h-16 md:h-24 border-t border-white/5 bg-black/40 flex items-center justify-between px-4 md:px-12 flex-shrink-0">
            <button onClick={handlePrev}
              className={`text-[10px] font-bold uppercase tracking-[0.2em] md:tracking-[0.3em] text-slate-600 hover:text-white transition-colors ${step===0?'opacity-0 pointer-events-none':''}`}>
              [ Prev ]
            </button>
            <div className="flex items-center gap-3 md:gap-6">
              <span className="text-[10px] font-mono text-slate-700">{step+1} / {steps.length}</span>
              {step < steps.length-1 && (
                <GlowButton onClick={handleNext}>
                  Proceed <ChevronRight size={14} />
                </GlowButton>
              )}
            </div>
          </footer>

        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const landingStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ts-bg: #070b14; --ts-bg2: #0d1220; --ts-card: #111827; --ts-card2: #151e2e;
    --ts-border: #1e2d45; --ts-blue: #2d8cf0; --ts-blue-bright: #3d9fff;
    --ts-green: #00c896; --ts-gold: #f0a500; --ts-text: #e8edf5; --ts-muted: #8a99b3;
  }
  .ts-page { min-height:100vh; background:var(--ts-bg); overflow-x:hidden; color:var(--ts-text); font-family:'Poppins',sans-serif; }
  .ts-hero { display:grid; grid-template-columns:1fr 1fr; align-items:center; gap:48px; padding:64px 48px 56px; max-width:1200px; margin:0 auto; }
  .ts-hero-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(45,140,240,0.12); border:1px solid rgba(45,140,240,0.3); padding:5px 12px; font-size:0.75rem; color:var(--ts-blue); font-weight:600; margin-bottom:20px; }
  .ts-hero h1 { font-family:'Montserrat',sans-serif; font-size:3.5rem; font-weight:800; line-height:1.1; margin-bottom:20px; background:linear-gradient(135deg,#fff 40%,var(--ts-blue)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .ts-hero p { font-size:1.05rem; color:var(--ts-muted); line-height:1.7; max-width:440px; margin-bottom:32px; }
  .ts-hero-actions { display:flex; gap:14px; align-items:center; }
  .ts-btn-primary { background:var(--ts-blue); color:#fff; border:none; padding:13px 28px; font-size:1rem; font-weight:600; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; gap:8px; }
  .ts-btn-primary:hover { background:var(--ts-blue-bright); transform:translateY(-1px); }
  .ts-btn-ghost { background:transparent; color:var(--ts-muted); border:1px solid var(--ts-border); padding:13px 24px; font-size:1rem; font-weight:500; cursor:pointer; transition:all 0.2s; }
  .ts-btn-ghost:hover { border-color:var(--ts-blue); color:var(--ts-text); }
  .ts-hero-visual { background:var(--ts-bg2); border:1px solid var(--ts-border); padding:32px; position:relative; overflow:hidden; }
  .ts-hero-visual::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 70% 30%,rgba(45,140,240,0.07) 0%,transparent 70%); pointer-events:none; }
  .ts-diagram { display:flex; flex-direction:column; align-items:center; gap:0; }
  .ts-diagram-master { border:2px solid var(--ts-blue); padding:14px 20px; background:rgba(45,140,240,0.08); display:flex; align-items:center; gap:12px; min-width:220px; }
  .ts-diag-icon { width:38px; height:38px; background:rgba(45,140,240,0.2); display:flex; align-items:center; justify-content:center; font-size:1.1rem; }
  .ts-diag-label { font-family:'Montserrat',sans-serif; font-weight:600; font-size:0.9rem; }
  .ts-diag-id { font-size:0.75rem; color:var(--ts-muted); }
  .ts-badge-master { background:var(--ts-blue); color:#fff; padding:3px 10px; font-size:0.72rem; font-weight:700; margin-left:auto; }
  .ts-badge-slave  { background:var(--ts-green); color:#000; padding:3px 10px; font-size:0.72rem; font-weight:700; margin-left:auto; }
  .ts-connector { width:260px; height:70px; overflow:visible; }
  .ts-diagram-slaves { display:flex; gap:20px; }
  .ts-diagram-slave { border:2px solid var(--ts-green); padding:14px 18px; background:rgba(0,200,150,0.06); display:flex; align-items:center; gap:10px; min-width:180px; }
  .ts-section { padding:64px 48px; max-width:1200px; margin:0 auto; }
  .ts-section-header { text-align:center; margin-bottom:48px; }
  .ts-section-title { font-family:'Montserrat',sans-serif; font-size:1.8rem; font-weight:700; color:var(--ts-blue); margin-bottom:10px; }
  .ts-section-sub { color:var(--ts-muted); font-size:1rem; }
  .ts-steps { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
  .ts-step-card { background:var(--ts-card); border:1px solid var(--ts-border); padding:28px 22px; transition:border-color 0.2s,transform 0.2s; }
  .ts-step-card:hover { border-color:var(--ts-blue); transform:translateY(-3px); }
  .ts-step-num { width:42px; height:42px; background:var(--ts-blue); color:#fff; font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.1rem; display:flex; align-items:center; justify-content:center; margin-bottom:18px; }
  .ts-step-title { font-weight:600; font-size:0.95rem; margin-bottom:8px; }
  .ts-step-desc { color:var(--ts-muted); font-size:0.85rem; line-height:1.6; }
  .ts-platforms-section { padding:64px 48px; background:var(--ts-bg2); }
  .ts-platforms-inner { max-width:1200px; margin:0 auto; }
  .ts-platforms-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:16px; margin-bottom:16px; }
  .ts-platforms-grid-2 { display:grid; grid-template-columns:repeat(5,1fr); gap:16px; max-width:900px; margin:0 auto; }
  .ts-platform-card { background:var(--ts-card); border:1px solid var(--ts-border); padding:20px 14px; text-align:center; transition:border-color 0.2s; }
  .ts-platform-card:hover { border-color:var(--ts-blue); }
  .ts-status-badge { display:inline-block; padding:2px 8px; font-size:0.68rem; font-weight:700; margin-bottom:14px; }
  .ts-status-available { background:rgba(0,200,150,0.15); color:var(--ts-green); border:1px solid rgba(0,200,150,0.3); }
  .ts-status-soon { background:rgba(240,165,0,0.15); color:var(--ts-gold); border:1px solid rgba(240,165,0,0.3); }
  .ts-platform-logo { width:48px; height:48px; background:var(--ts-card2); display:flex; align-items:center; justify-content:center; font-size:1.4rem; margin:0 auto 10px; }
  .ts-platform-name { font-weight:600; font-size:0.85rem; margin-bottom:12px; }
  .ts-vote-row { display:flex; align-items:center; gap:8px; justify-content:center; }
  .ts-vote-btn { display:flex; align-items:center; gap:5px; background:var(--ts-blue); color:#fff; border:none; padding:5px 12px; font-size:0.75rem; font-weight:600; cursor:pointer; transition:background 0.2s; }
  .ts-vote-btn:hover { background:var(--ts-blue-bright); }
  .ts-vote-btn.unvote { background:rgba(45,140,240,0.2); color:var(--ts-blue); }
  .ts-vote-btn.unvote:hover { background:rgba(45,140,240,0.35); }
  .ts-vote-count { font-size:0.8rem; color:var(--ts-muted); font-weight:500; }
  .ts-fp-grid { display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:start; }
  .ts-features-title { font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.9rem; color:var(--ts-blue); display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .ts-features-sub { color:var(--ts-muted); font-size:0.85rem; margin-bottom:32px; }
  .ts-feature-item { display:flex; gap:16px; margin-bottom:24px; }
  .ts-feat-icon { width:44px; height:44px; background:var(--ts-card2); display:flex; align-items:center; justify-content:center; font-size:1.2rem; flex-shrink:0; border:1px solid var(--ts-border); }
  .ts-feat-title { font-weight:600; font-size:0.9rem; margin-bottom:4px; }
  .ts-feat-desc { color:var(--ts-muted); font-size:0.82rem; line-height:1.6; }
  .ts-pricing-card { background:var(--ts-card); border:2px solid var(--ts-blue); padding:28px; }
  .ts-price-toggle { display:flex; background:var(--ts-card2); padding:4px; margin-bottom:24px; }
  .ts-toggle-btn { flex:1; padding:8px; border:none; font-size:0.875rem; font-weight:600; cursor:pointer; transition:all 0.2s; background:transparent; color:var(--ts-muted); }
  .ts-toggle-btn.active { background:var(--ts-blue); color:#fff; }
  .ts-price-label { font-size:0.78rem; color:var(--ts-muted); margin-bottom:6px; }
  .ts-price-amount { font-family:'Montserrat',sans-serif; font-weight:800; font-size:2.4rem; color:var(--ts-text); margin-bottom:4px; }
  .ts-price-amount span { font-size:0.9rem; font-weight:400; color:var(--ts-muted); }
  .ts-price-original { font-size:0.85rem; color:var(--ts-muted); text-decoration:line-through; display:inline-block; margin-right:8px; }
  .ts-price-limited { color:var(--ts-blue); font-size:0.8rem; font-weight:600; }
  .ts-price-note { font-size:0.82rem; color:var(--ts-muted); margin-top:10px; margin-bottom:24px; }
  .ts-checkout-card { background:var(--ts-card2); padding:22px; margin-top:20px; }
  .ts-checkout-title { font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.9rem; display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .ts-checkout-sub { color:var(--ts-muted); font-size:0.82rem; margin-bottom:16px; }
  .ts-btn-start { width:100%; background:var(--ts-card); color:var(--ts-muted); border:1px solid var(--ts-border); padding:13px; font-size:0.95rem; font-weight:600; cursor:pointer; transition:all 0.2s; }
  .ts-btn-start:hover { background:var(--ts-blue); color:#fff; border-color:var(--ts-blue); }
  .ts-faq-section { padding:72px 48px; }
  .ts-faq-inner { max-width:760px; margin:0 auto; }
  .ts-faq-item { border:1px solid var(--ts-border); margin-bottom:10px; overflow:hidden; transition:border-color 0.2s; }
  .ts-faq-item.open { border-color:var(--ts-blue); }
  .ts-faq-q { width:100%; background:var(--ts-card); color:var(--ts-text); border:none; text-align:left; padding:18px 20px; font-size:0.9rem; font-weight:600; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-family:'Poppins',sans-serif; }
  .ts-faq-chevron { transition:transform 0.25s; font-size:0.8rem; color:var(--ts-muted); }
  .ts-faq-item.open .ts-faq-chevron { transform:rotate(180deg); }
  .ts-faq-a { background:var(--ts-card2); padding:0 20px; color:var(--ts-muted); font-size:0.875rem; line-height:1.7; max-height:0; overflow:hidden; transition:max-height 0.3s ease,padding 0.3s; }
  .ts-faq-item.open .ts-faq-a { max-height:200px; padding:14px 20px; }
  @media (max-width:900px) {
    .ts-hero { grid-template-columns:1fr; padding:40px 20px 36px; }
    .ts-steps { grid-template-columns:1fr 1fr; }
    .ts-platforms-grid { grid-template-columns:repeat(3,1fr); }
    .ts-fp-grid { grid-template-columns:1fr; }
    .ts-section { padding:48px 20px; }
    .ts-platforms-section { padding:48px 20px; }
    .ts-faq-section { padding:48px 20px; }
  }
`;

const platformsRow1 = [
  { name:"MT5",         icon:"5️⃣", status:"available", votes:2061, voted:true  },
  { name:"MT4",         icon:"4️⃣", status:"available", votes:419,  voted:true  },
  { name:"MatchTrader", icon:"🔗", status:"available", votes:182,  voted:false },
  { name:"Bitunix",     icon:"🟢", status:"soon",      votes:19,   voted:false },
  { name:"DXTrade",     icon:"DX", status:"soon",      votes:85,   voted:false },
  { name:"cTrader",     icon:"🔴", status:"soon",      votes:370,  voted:false },
];
const platformsRow2 = [
  { name:"TradeLocker", icon:"🔒", status:"soon", votes:289, voted:false },
  { name:"Binance",     icon:"🔶", status:"soon", votes:170, voted:false },
  { name:"Tradovate",   icon:"💎", status:"soon", votes:231, voted:false },
  { name:"NinjaTrader", icon:"🥷", status:"soon", votes:124, voted:false },
  { name:"ProjectX",    icon:"✖",  status:"soon", votes:88,  voted:false },
];
const features = [
  { icon:"⚡", title:"Instant Trade Mirroring",      desc:"Trades copied with extremely low latency. Never miss a market move." },
  { icon:"🔔", title:"Telegram Notifications",       desc:"Get notified via Telegram or email whenever a trading event occurs." },
  { icon:"☁️", title:"Cloud-Based Copying",          desc:"No need to install any software on your computer. All copying is done in the cloud." },
  { icon:"⚖️", title:"Flexible Risk Allocation",     desc:"Customize risk scaling per slave account, adjust on the fly." },
  { icon:"🎯", title:"Priority Support & Onboarding", desc:"Get one-on-one onboarding & dedicated troubleshooting." },
];
const faqs = [
  { q:"Does Sync Trade trade for me?",        a:"No. Sync Trade is a copy trading tool that mirrors your own trades from a master account to one or more slave accounts. You remain in full control of all trading decisions." },
  { q:"Is this for accounts I own?",          a:"Yes. Trade Sync is designed for traders who manage multiple accounts of their own. You must have authorized access to all accounts you connect to the platform." },
  { q:"Which platforms are supported?",       a:"Currently MT4 and MT5 are fully supported. MatchTrader is also available. More platforms including cTrader, Binance, TradeLocker, and others are coming soon — you can vote for your favorites." },
  { q:"Do you provide signals or advice?",    a:"No. Trade Sync does not provide trading signals, advice, or recommendations. It solely syncs trades between accounts you control." },
  { q:"How are my credentials handled?",      a:"Your account credentials are encrypted and stored securely. We use industry-standard encryption and never share your data with third parties." },
  { q:"Are alerts available?",               a:"Yes! You can receive real-time alerts via Telegram or email whenever a trade is copied, modified, or closed across your accounts." },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function TradeSyncPage() {
  const [showCopier, setShowCopier] = useState(false);
  const [billing, setBilling] = useState<"monthly"|"yearly">("monthly");
  const [openFaq, setOpenFaq] = useState<number|null>(null);
  const [votes, setVotes] = useState<Record<string,{count:number;voted:boolean}>>(() => {
    const v: Record<string,{count:number;voted:boolean}> = {};
    [...platformsRow1,...platformsRow2].forEach(p => { v[p.name]={count:p.votes,voted:p.voted}; });
    return v;
  });

  const toggleVote = (name: string) => {
    setVotes(prev => ({ ...prev, [name]:{ count:prev[name].voted?prev[name].count-1:prev[name].count+1, voted:!prev[name].voted } }));
  };

  if (showCopier) return <CopierWizard onBack={() => setShowCopier(false)} />;

  const PlatformCard = ({ p }: { p: typeof platformsRow1[0] }) => (
    <div className="ts-platform-card">
      <div className={`ts-status-badge ${p.status==="available"?"ts-status-available":"ts-status-soon"}`}>
        {p.status==="available"?"Available":"Coming Soon"}
      </div>
      <div className="ts-platform-logo">{p.icon}</div>
      <div className="ts-platform-name">{p.name}</div>
      <div className="ts-vote-row">
        <button className={`ts-vote-btn ${votes[p.name]?.voted?"unvote":""}`} onClick={() => toggleVote(p.name)}>
          ↑ {votes[p.name]?.voted?"Unvote":"Vote"}
        </button>
        <span className="ts-vote-count">{votes[p.name]?.count}</span>
      </div>
    </div>
  );

  return (
    <>
      <style>{landingStyles}</style>
      <div className="ts-page">

        {/* HERO */}
        <div className="ts-hero">
          <div>
            <div className="ts-hero-badge">⚡ Automated Trade Copying</div>
            <h1>Trade Sync</h1>
            <p>Control all your trading accounts from one place—automatically and in real time.</p>
            <div className="ts-hero-actions">
              <button className="ts-btn-primary" onClick={() => setShowCopier(true)}>Start Now →</button>
              <button className="ts-btn-ghost">Learn More</button>
            </div>
          </div>
          <div className="ts-hero-visual">
            <div className="ts-diagram">
              <div className="ts-diagram-master">
                <div className="ts-diag-icon">⚙️</div>
                <div>
                  <div className="ts-diag-label">Master Account 1</div>
                  <div className="ts-diag-id">1000001</div>
                </div>
                <span className="ts-badge-master">Master</span>
              </div>
              <svg className="ts-connector" viewBox="0 0 260 70">
                <defs><marker id="ts-dot" markerWidth="6" markerHeight="6" refX="3" refY="3"><circle cx="3" cy="3" r="2.5" fill="#2d8cf0"/></marker></defs>
                <line x1="130" y1="0"  x2="130" y2="20"  stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3"/>
                <line x1="130" y1="20" x2="50"  y2="20"  stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3"/>
                <line x1="130" y1="20" x2="210" y2="20"  stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3"/>
                <line x1="50"  y1="20" x2="50"  y2="62"  stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#ts-dot)"/>
                <line x1="210" y1="20" x2="210" y2="62"  stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#ts-dot)"/>
                <text x="78"  y="17" fill="#8a99b3" fontSize="10">1x</text>
                <text x="158" y="17" fill="#8a99b3" fontSize="10">1x</text>
              </svg>
              <div className="ts-diagram-slaves">
                <div className="ts-diagram-slave">
                  <div className="ts-diag-icon">👤</div>
                  <div><div className="ts-diag-label">Follower Account A</div><div className="ts-diag-id">1× lot</div></div>
                  <span className="ts-badge-slave">Follower</span>
                </div>
                <div className="ts-diagram-slave">
                  <div className="ts-diag-icon">👤</div>
                  <div><div className="ts-diag-label">Follower Account B</div><div className="ts-diag-id">1× lot</div></div>
                  <span className="ts-badge-slave">Follower</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div style={{ background:"var(--ts-bg2)", padding:"1px 0" }}>
          <div className="ts-section">
            <div className="ts-section-header">
              <div className="ts-section-title">How Trade Sync Works</div>
              <div className="ts-section-sub">Easily manage multiple accounts from one master—everything stays synced in real time:</div>
            </div>
            <div className="ts-steps">
              {[
                {n:1,t:"Connect Master Account",           d:"Link your source trading account"},
                {n:2,t:"Choose Slave Accounts & Allocation",d:"Select accounts to copy to and set risk ratios"},
                {n:3,t:"Start Copying—Automated & Real-Time",d:"Trades execute automatically across all accounts"},
                {n:4,t:"Monitor & Adjust as You Go",        d:"Track performance and modify settings anytime"},
              ].map(s => (
                <div key={s.n} className="ts-step-card">
                  <div className="ts-step-num">{s.n}</div>
                  <div className="ts-step-title">{s.t}</div>
                  <div className="ts-step-desc">{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PLATFORMS */}
        <div className="ts-platforms-section">
          <div className="ts-platforms-inner">
            <div className="ts-section-header">
              <div className="ts-section-title">Supported Trading Platforms</div>
              <div className="ts-section-sub">Launch with MT4 & MT5 support, with additional platforms coming soon. Vote for your favorite platforms below.</div>
            </div>
            <div className="ts-platforms-grid">{platformsRow1.map(p => <PlatformCard key={p.name} p={p} />)}</div>
            <div className="ts-platforms-grid-2">{platformsRow2.map(p => <PlatformCard key={p.name} p={p} />)}</div>
          </div>
        </div>

        {/* FEATURES + PRICING */}
        <div className="ts-section">
          <div className="ts-fp-grid">
            <div>
              <div className="ts-features-title">⚡ Key Features & Benefits</div>
              <div className="ts-features-sub">Everything you need for professional-grade trade copying</div>
              {features.map(f => (
                <div key={f.title} className="ts-feature-item">
                  <div className="ts-feat-icon">{f.icon}</div>
                  <div><div className="ts-feat-title">{f.title}</div><div className="ts-feat-desc">{f.desc}</div></div>
                </div>
              ))}
            </div>
            <div>
              <div className="ts-pricing-card">
                <div className="ts-price-toggle">
                  <button className={`ts-toggle-btn ${billing==="monthly"?"active":""}`} onClick={() => setBilling("monthly")}>Monthly</button>
                  <button className={`ts-toggle-btn ${billing==="yearly"?"active":""}`}  onClick={() => setBilling("yearly")}>Yearly</button>
                </div>
                <div className="ts-price-label">Early Bird Pricing</div>
                <div className="ts-price-amount">
                  {billing==="monthly"?"$7.50":"$64.99"} <span>per account/{billing==="monthly"?"month":"year"}</span>
                </div>
                <div style={{ marginTop:6 }}>
                  <span className="ts-price-original">{billing==="monthly"?"$10.00":"$90.00"}</span>
                  <span className="ts-price-limited">Limited-time pricing</span>
                </div>
                <div className="ts-price-note">Unlimited trade copying on supported platforms</div>
                <div className="ts-checkout-card">
                  <div className="ts-checkout-title">⚡ Start Trade Sync</div>
                  <div className="ts-checkout-sub">Choose your plan and number of accounts, then proceed to secure checkout.</div>
                  <button className="ts-btn-start" onClick={() => setShowCopier(true)}>Start Now</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="ts-faq-section">
          <div className="ts-faq-inner">
            <div className="ts-section-header">
              <div className="ts-section-title">Frequently Asked Questions</div>
              <div className="ts-section-sub">Everything you need to know about Sync Trade</div>
            </div>
            {faqs.map((f,i) => (
              <div key={i} className={`ts-faq-item ${openFaq===i?"open":""}`}>
                <button className="ts-faq-q" onClick={() => setOpenFaq(openFaq===i?null:i)}>
                  {f.q}<span className="ts-faq-chevron">▼</span>
                </button>
                <div className="ts-faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
