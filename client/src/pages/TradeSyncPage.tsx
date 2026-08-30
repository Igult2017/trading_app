import { useState, useEffect, useCallback } from 'react';
import { TradeSyncApp, useCtFonts } from '@/features/trade-sync';
import {
  Shield, ShieldCheck, Settings2, Link2, Globe, User, ChevronRight, CheckCircle2,
  Bell, ArrowRight, Radio, Users, GitFork, Scale, Anchor, TrendingUp,
  Rocket, AlertTriangle, Filter, Hash, Send, Zap,
  MessageSquare, Menu, X, Check,
  // Added for the FX Copier landing (2026-08-21)
  Cloud, SlidersHorizontal, Headphones, ChevronUp, ChevronDown, Repeat, Minus, Plus, Info,
} from 'lucide-react';
import { PiInfoFill } from 'react-icons/pi';
import CopyManagementDashboard from '@/components/CopyManagementDashboard';
import CTraderAccountPicker from '@/components/copy/CTraderAccountPicker';
import CTraderConnectPanel from '@/components/copy/CTraderConnectPanel';
import { usePersistedState } from '@/hooks/usePersistedState';
import TradeSyncNav from '@/components/copy/TradeSyncNav';
import { apiRequest, authFetch } from '@/lib/queryClient';

// ─── Fonts ────────────────────────────────────────────────────────────────────
// Nothing to import: DM Mono is self-hosted in client/src/index.css, alongside Playfair Display and
// Material Icons (both moved there when this page's text-flash was fixed). The last Google Fonts
// request on this page went 2026-08-22.

// ─── Step Definitions ─────────────────────────────────────────────────────────
const STEPS_FOLLOWER = [
  { id: 'role',    label: 'Identity', icon: User },
  { id: 'connect', label: 'Account',  icon: Globe },
  { id: 'link',    label: 'Provider', icon: Link2 },
  { id: 'copy',    label: 'Engine',   icon: Settings2 },
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
  { id: 'accounts', label: 'Accounts', icon: GitFork },
  { id: 'copy',     label: 'Engine',   icon: Settings2 },
  { id: 'go-live',  label: 'Live',     icon: Rocket },
];
const STEPS_TELEGRAM = [
  { id: 'role',       label: 'Identity', icon: User },
  { id: 'connect',    label: 'Account',  icon: Globe },
  { id: 'tg-channel', label: 'Channel',  icon: Hash },
  { id: 'tg-parser',  label: 'Parser',   icon: Zap },
  { id: 'copy',       label: 'Engine',   icon: Settings2 },
  { id: 'go-live',    label: 'Live',     icon: Rocket },
];
// Advanced: copy via the user's OWN Telegram account (channels the bot can't admin).
const STEPS_RELAY = [
  { id: 'role',             label: 'Identity',  icon: User },
  { id: 'connect',          label: 'Account',   icon: Globe },
  { id: 'tg-login',         label: 'Authorize', icon: Send },
  { id: 'tg-relay-channel', label: 'Channel',   icon: Hash },
  { id: 'copy',             label: 'Engine',    icon: Settings2 },
  { id: 'go-live',          label: 'Live',      icon: Rocket },
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
      <PiInfoFill size={15} className="mt-0.5 flex-shrink-0" />
      <p className="text-[11px] leading-relaxed">{children}</p>
    </div>
  );
};

const SectionTitle = ({ step, title }: any) => (
  <div className="mb-7 md:mb-10">
    <span className="text-blue-500 font-mono text-xs block tracking-widest">0{step + 1} // {String(title).replace(/\.$/, '').toUpperCase()}</span>
    <div className="w-24 h-[1px] bg-blue-500/50 mt-3" />
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

// ─── Provider helpers ─────────────────────────────────────────────────────────
const AVATAR_PALETTES = [
  { bg:'rgba(37,99,235,0.12)',  border:'rgba(37,99,235,0.25)', color:'#60a5fa' },
  { bg:'rgba(20,184,166,0.1)',  border:'rgba(20,184,166,0.2)', color:'#2dd4bf' },
  { bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.2)', color:'#fbbf24' },
  { bg:'rgba(139,92,246,0.1)', border:'rgba(139,92,246,0.2)', color:'#a78bfa' },
  { bg:'rgba(236,72,153,0.1)', border:'rgba(236,72,153,0.2)', color:'#f472b6' },
];

function providerAvatar(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function providerInitials(name: string) {
  return (name || '??')
    .split(/[\s_\-]+/)
    .slice(0, 2)
    .map((w: string) => w[0] ?? '')
    .join('')
    .toUpperCase() || '??';
}

const ProviderCard = ({ provider, selected, onSelect }: any) => {
  const mono = "'DM Mono', monospace";
  // The server decides this now and sends `isOwn`. It used to send every account's raw `ownerId`
  // for the browser to compare, on an endpoint that needed no login at all.
  const isOwn = !!provider.isOwn;
  const followable = !!provider.followingEnabled && !!provider.masterId;

  const name = provider.name || 'Unnamed Account';
  const avatar = providerAvatar(provider.brokerAccountId || name);
  const initials = providerInitials(name);
  const winRate = provider.winRate;
  const winColor = winRate == null ? '#475569' : winRate >= 60 ? '#4ade80' : winRate >= 45 ? '#fbbf24' : '#f87171';
  const trades = provider.trades ?? 0;
  const avgRR = provider.avgRR;
  const netPnl = provider.netPnl ?? 0;
  const pnlColor = netPnl > 0 ? '#4ade80' : netPnl < 0 ? '#f87171' : '#94a3b8';
  const instruments: string[] = provider.instruments || [];

  const stats = [
    { label: 'Win rate', value: winRate != null ? `${winRate}%` : '—', color: winColor },
    { label: 'Trades',   value: trades > 0 ? trades.toLocaleString() : '—', color: '#f8fafc' },
    { label: 'Avg RR',   value: avgRR != null ? avgRR.toFixed(2) : '—', color: '#f8fafc' },
    { label: 'Net P/L',  value: trades > 0 ? `${netPnl >= 0 ? '+' : ''}${netPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—', color: pnlColor },
  ];
  const badge = isOwn
    ? { t: 'Your account', c: 'bg-violet-500/15 text-violet-300' }
    : followable ? { t: 'Copyable', c: 'bg-emerald-500/15 text-emerald-300' }
                 : { t: 'Not enabled', c: 'bg-slate-500/15 text-slate-400' };

  const pick = () => { if (followable && !isOwn) onSelect(provider.masterId); };

  return (
    <div onClick={pick}
      className={`relative p-5 md:p-7 border transition-all duration-300 flex flex-col
        ${selected ? 'bg-blue-600/5 border-blue-500/50' : 'bg-transparent border-white/5'}
        ${followable && !isOwn ? 'cursor-pointer hover:border-white/20' : 'opacity-80'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, fontFamily: mono, background: avatar.bg, border: `1px solid ${avatar.border}`, color: avatar.color, flexShrink: 0 }}>{initials}</div>
          <div className="min-w-0">
            <h3 className={`text-sm md:text-base font-medium tracking-tight truncate ${selected ? 'text-white' : 'text-slate-300'}`}>{name}</h3>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{provider.platform} · {provider.accountType || 'demo'}</p>
            {(provider.tradingStyle || provider.maxLotSize != null || (provider.typicalSl && provider.typicalTp)) && (
              <p className="text-[10px] text-slate-600 font-mono truncate mt-0.5">
                {[provider.tradingStyle, provider.maxLotSize != null ? `≤${provider.maxLotSize} lot` : null, (provider.typicalSl && provider.typicalTp) ? `SL${provider.typicalSl}/TP${provider.typicalTp}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${badge.c}`}>{badge.t}</span>
      </div>

      <div className="grid grid-cols-4 gap-px bg-white/5 border border-white/5 mb-3">
        {stats.map(s => (
          <div key={s.label} className="bg-[#020203] p-2">
            <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569', marginBottom: '3px', fontFamily: mono }}>{s.label}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: mono, lineHeight: 1, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {instruments.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {instruments.slice(0, 6).map(sym => (
            <span key={sym} className="text-[9px] font-mono text-slate-400 bg-white/[0.04] border border-white/10 rounded px-1.5 py-0.5">{sym}</span>
          ))}
        </div>
      )}

      {isOwn ? (
        <div className="w-full py-2 text-center text-[9px] font-bold uppercase tracking-[0.15em] text-violet-300/70 border border-violet-500/20" style={{ fontFamily: mono }}>
          Your account — use Self-Copy
        </div>
      ) : followable ? (
        <button onClick={(e: any) => { e.stopPropagation(); onSelect(provider.masterId); }}
          className={`w-full py-2 text-[9px] font-bold uppercase tracking-[0.15em] border transition-all duration-300
            ${selected ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' : 'border-white/10 text-slate-400 hover:border-blue-500/40 hover:text-blue-300'}`}
          style={{ fontFamily: mono }}>
          {selected ? '● copying this account' : 'follow this account'}
        </button>
      ) : (
        <div className="w-full py-2 text-center text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 border border-white/5" style={{ fontFamily: mono }}>
          Following not enabled
        </div>
      )}
      {selected && <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 w-full shadow-[0_0_15px_rgba(37,99,235,1)]" />}
    </div>
  );
};

const StatusDot = ({ status }: any) => {
  const s = (({ ready:{color:'#22c55e',shadow:'0 0 6px rgba(34,197,94,0.5)',label:'Ready'}, pending:{color:'#f59e0b',shadow:'none',label:'Pending'}, inactive:{color:'#1e293b',shadow:'none',label:'Not verified'} } as Record<string,{color:string;shadow:string;label:string}>)[status as string]) || {color:'#1e293b',shadow:'none',label:'—'};
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:s.color, boxShadow:s.shadow, display:'inline-block', flexShrink:0 }} />
      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:s.color }}>{s.label}</span>
    </span>
  );
};

// ─── STEPS ────────────────────────────────────────────────────────────────────
const StepRole = ({ data, setData, onNext }: any) => {
  const isTg = data.role === 'telegram' || data.role === 'relay';
  const pickTg = (role: string) => setData({ ...data, role, platform: 'cTrader', lotMode: data.lotMode === 'risk' ? 'risk' : 'fixed' });
  return (
    <div className="space-y-5">
      <div className="border border-white/5">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5 border-b border-white/5">
          <FeatureCard icon={Radio} title="Signal Provider" active={data.role==='provider'} onClick={() => { setData({...data,role:'provider'}); onNext(); }} sub="Master account. Broadcast your trades to followers in real-time." />
          <FeatureCard icon={Users}  title="Copy Follower"   active={data.role==='follower'} onClick={() => { setData({...data,role:'follower'}); onNext(); }} sub="Follow a verified provider. Trades mirror automatically." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
          <FeatureCard icon={GitFork}       title="Self-Copy" active={data.role==='self'} onClick={() => { setData({...data,role:'self'}); onNext(); }} sub="Duplicate trades between your own accounts on any broker." />
          <FeatureCard icon={MessageSquare} title="Telegram"  active={isTg} onClick={() => { if (!isTg) pickTg('telegram'); }} sub="Auto-execute signals from a Telegram channel — pick the source below." accent="text-sky-400" />
        </div>
      </div>

      {isTg && (
        <div className="border border-white/5 p-5 md:p-6">
          <TSelect
            label="Telegram source"
            hint="Both modes execute onto your connected cTrader account — that's why the next step asks for it."
            options={[
              { value: 'telegram', label: 'Channel / bot signals — we monitor a public or bot channel' },
              { value: 'relay',    label: "My own Telegram account (advanced) — copy any channel you're in" },
            ]}
            value={data.role}
            onChange={(v: string) => pickTg(v)}
          />
        </div>
      )}
    </div>
  );
};

const StepConnect = ({ data, setData, label = "Trading Account" }: any) => {
  const isCtrader = data.platform==='cTrader' || data.role==='telegram' || data.role==='relay';
  const showSelector = data.role!=='telegram' && data.role!=='relay';
  return (
    <div className="space-y-6 md:space-y-8">
      {showSelector && (
        <div className="space-y-2.5 max-w-2xl">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Platform Type</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            {["MT4","MT5","cTrader","Proprietary"].map(p => (
              <button key={p} onClick={() => setData({...data,platform:p})}
                className={`px-3 md:px-4 py-3 border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between
                  ${data.platform===p ? 'bg-white text-black border-white' : 'border-white/10 text-slate-500 hover:border-white/30'}`}>
                {p}{data.platform===p && <CheckCircle2 size={12} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {isCtrader ? (
        <CTraderConnectPanel value={data.brokerAccountId} onChange={(id: string) => setData({ ...data, brokerAccountId: id })} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
          <div className="p-5 md:p-8 space-y-6 md:space-y-8">
            {data.platform==='Proprietary' ? (
              <div className="space-y-6 md:space-y-8">
                <TInput label="Broker Platform Name" placeholder="e.g. ThinkTrader, Oanda Desktop" value={data.propriBrokerName??''} onChange={(e:any)=>setData({...data,propriBrokerName:e.target.value})} />
                <TInput label="API Endpoint (Optional)" placeholder="https://api.broker.com/v1" value={data.propriApiEndpoint??''} onChange={(e:any)=>setData({...data,propriApiEndpoint:e.target.value})} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                  <TInput label="API Key" type="password" placeholder="pk_live_..." value={data.propriApiKey??''} onChange={(e:any)=>setData({...data,propriApiKey:e.target.value})} />
                  <TInput label="Secret"  type="password" placeholder="••••••••" value={data.propriSecret??''} onChange={(e:any)=>setData({...data,propriSecret:e.target.value})} />
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
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'#334155' }}>{row.label}</span>
                    <StatusDot status={row.status} />
                  </div>
                ))}
                <div className="flex items-center justify-between py-2.5">
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'#334155' }}>Latency</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'11px', color:'#1e293b' }}>— ms</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 md:p-4 border border-blue-500/20 bg-blue-500/5 rounded-sm">
              <PiInfoFill size={15} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-blue-300 leading-relaxed">Use your <span className="text-blue-200 font-semibold">investor (read-only) password</span> — never your master password.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StepLink = ({ data, setData, providers, providersLoading }: any) => {
  const mono = "'DM Mono', monospace";
  const [search, setSearch] = useState('');

  const filtered = (providers || []).filter((p: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.platform || '').toLowerCase().includes(q) ||
      (p.instruments || []).some((s: string) => s.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full space-y-6 md:space-y-10">
      <TInput
        label="Browse Accounts"
        placeholder="Filter by name, platform, or instrument…"
        value={search}
        onChange={(e: any) => setSearch(e.target.value)}
      />
      <div className="space-y-4">
        <div style={{ fontFamily: mono, fontSize:'10px', fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'#1e293b' }}>
          // verified_providers
        </div>

        {providersLoading ? (
          <div className="border border-white/5 p-10 flex items-center justify-center gap-3">
            <div className="w-4 h-4 border border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span style={{ fontFamily: mono, fontSize:'11px', color:'#334155' }}>loading providers…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-white/5 p-10 text-center space-y-3">
            <div style={{ fontFamily: mono, fontSize:'11px', color:'#1e293b' }}>
              {search.trim()
                ? `// no_providers_match "${search}"`
                : '// no_public_providers_registered'}
            </div>
            {!search.trim() && (
              <p className="text-xs text-slate-600 font-light">
                Be the first — register as a Signal Provider using the role selector above.
              </p>
            )}
          </div>
        ) : (
          <div className={`grid gap-0 border border-white/5 divide-y divide-white/5
            ${filtered.length === 1 ? 'grid-cols-1 md:grid-cols-1' : 'grid-cols-1 md:grid-cols-2 md:divide-y-0 md:divide-x'}`}>
            {filtered.map((p: any) => (
              <ProviderCard
                key={p.brokerAccountId}
                provider={p}
                selected={!!p.masterId && data.selectedProvider === p.masterId}
                onSelect={(id: string) => setData({ ...data, selectedProvider: id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

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
  <div className="space-y-5">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
      <div className="divide-y divide-white/5">
        {(data.role!=='telegram' && data.role!=='relay') && <FeatureCard icon={Scale} title="Balance Multiplier" active={data.lotMode==='mult'}  onClick={() => setData({...data,lotMode:'mult'})}  sub="Scale lot relative to account size. Recommended for most users." />}
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
        <TSelect label="Direction Mode" hint={(data.role==='telegram'||data.role==='relay') ? "How trades are placed relative to the signal's direction." : "How trades are copied relative to the provider's direction."}
          options={(data.role==='telegram'||data.role==='relay')
            ? [{value:'same',label:'Same direction (follow the signal)'},{value:'reverse',label:'Reverse direction (counter-trade)'}]
            : [{value:'same',label:'Same direction (standard copy)'},{value:'reverse',label:'Reverse direction (counter-trade)'},{value:'hedge',label:'Hedge mode (open opposite simultaneously)'}]}
          value={(data.role==='telegram'||data.role==='relay') && data.direction==='hedge' ? 'reverse' : (data.direction??'same')} onChange={(v: any) => setData({...data,direction:v})} />
        <div className="p-3 md:p-4 border border-white/5 bg-white/[0.01]">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {data.lotMode==='mult'  && 'Best for accounts with a similar balance to the provider. The engine scales proportionally so risk stays consistent.'}
            {data.lotMode==='fixed' && 'Best for micro/cent accounts or when you want full manual control over position sizing.'}
            {data.lotMode==='risk'  && 'Best for accounts of any size. Lot is recalculated on every trade based on current equity and the stop-loss distance.'}
          </p>
        </div>
      </div>
    </div>

    {/* Risk controls — read by the copy engine (drawdown / daily-loss guard, symbol filters, trade cap).
        Only follower + self carry these through (register-as-follower / self-copy payloads). */}
    {(data.role!=='telegram' && data.role!=='relay') && (
    <div className="border border-white/5 p-5 md:p-7 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// risk_controls</span>
        <span className="text-[10px] text-slate-600">optional · safe defaults apply if blank</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-7">
        <TInput label="Max Drawdown (%)"   hint="Auto-pause copying if account drawdown passes this. Blank = no cap." placeholder="10" type="number" value={data.maxDdPercent??''}  onChange={(e:any)=>setData({...data,maxDdPercent:e.target.value})} />
        <TInput label="Max Daily Loss (%)" hint="Halt for the day past this % of balance. Default 2%." placeholder="2" type="number" value={data.maxDailyLoss??''} onChange={(e:any)=>setData({...data,maxDailyLoss:e.target.value})} />
        <TInput label="Max Open Trades"    hint="Cap on simultaneous copied positions. Default 10." placeholder="10" type="number" value={data.maxOpenTrades??''} onChange={(e:any)=>setData({...data,maxOpenTrades:e.target.value})} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-7">
        <TInput label="Symbol Whitelist" hint="Only copy these (exact names, comma-separated). Blank = copy all." placeholder="EURUSD, XAUUSD" value={data.whitelist??''} onChange={(e:any)=>setData({...data,whitelist:e.target.value})} />
        <TInput label="Symbol Blacklist" hint="Never copy these symbols, even if the provider trades them." placeholder="GBPJPY" value={data.blacklist??''} onChange={(e:any)=>setData({...data,blacklist:e.target.value})} />
      </div>
    </div>
    )}
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
        <TInput label="Max Lot Size Per Signal"    hint="Highest lot you will ever broadcast."              placeholder="1.00" type="number" value={data.maxLotSize??''}          onChange={(e:any)=>setData({...data,maxLotSize:e.target.value})} />
        <TInput label="Max Open Trades at Once"    hint="Maximum simultaneous positions you'll carry."      placeholder="5"    type="number" value={data.provMaxOpenTrades??''}   onChange={(e:any)=>setData({...data,provMaxOpenTrades:e.target.value})} />
        <TInput label="Typical Stop-Loss (pips)"   hint="Average SL distance per trade."                   placeholder="30"   type="number" value={data.typicalSL??''}           onChange={(e:any)=>setData({...data,typicalSL:e.target.value})} />
        <TInput label="Typical Take-Profit (pips)" hint="Average TP distance."                             placeholder="60"   type="number" value={data.typicalTP??''}           onChange={(e:any)=>setData({...data,typicalTP:e.target.value})} />
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
      <TInput label="Notification Email" hint="Where to receive follower and performance alerts." placeholder="you@example.com" type="email" value={data.notifEmail??''} onChange={(e:any)=>setData({...data,notifEmail:e.target.value})} />
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

const StepConnect2 = ({ data, setData }: any) => {
  const inner = {
    ...data,
    platform:        data.platform2        ?? 'cTrader',
    nickname:        data.nickname2        ?? '',
    brokerServer:    data.brokerServer2    ?? '',
    loginId:         data.loginId2         ?? '',
    password:        data.password2        ?? '',
    symbolPrefix:    data.symbolPrefix2    ?? '',
    symbolSuffix:    data.symbolSuffix2    ?? '',
    brokerAccountId: data.brokerAccountId2 ?? '',
  };
  const setInner = (d: any) => setData({
    ...data,
    platform2:        d.platform,
    nickname2:        d.nickname,
    brokerServer2:    d.brokerServer,
    loginId2:         d.loginId,
    password2:        d.password,
    symbolPrefix2:    d.symbolPrefix,
    symbolSuffix2:    d.symbolSuffix,
    brokerAccountId2: d.brokerAccountId,
  });
  return <StepConnect data={inner} setData={setInner} label="Target Account" />;
};

// Self-copy: pick source + target connected cTrader accounts on one screen.
const StepSelfAccounts = ({ data, setData }: any) => (
  <div className="space-y-6 md:space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
      <div className="border border-white/5 bg-white/[0.01] p-5 md:p-6 rounded-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[9px] font-bold text-blue-300 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full">Source</span>
          <span className="text-[11px] text-slate-500">copy from</span>
        </div>
        <CTraderAccountPicker value={data.brokerAccountId} excludeId={data.brokerAccountId2} onChange={(id: string) => setData({ ...data, platform: 'cTrader', brokerAccountId: id })} label="Source cTrader account" />
      </div>
      <div className="border border-white/5 bg-white/[0.01] p-5 md:p-6 rounded-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full">Target</span>
          <span className="text-[11px] text-slate-500">copy to</span>
        </div>
        <CTraderAccountPicker value={data.brokerAccountId2} excludeId={data.brokerAccountId} onChange={(id: string) => setData({ ...data, platform2: 'cTrader', brokerAccountId2: id })} label="Target cTrader account" />
      </div>
    </div>
    <InfoBox color="blue">Every trade on the source mirrors to the target in real time. Pick two different cTrader accounts — both connected on the Accounts page.</InfoBox>
  </div>
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

const TG_COPY_BOT = '@tandjournal_copybot';   // the platform copy-bot (your configured TELEGRAM_COPY_BOT_TOKEN)

const StepTgChannel = ({ data, setData }: any) => {
  const isPrivate = data.tgChannelType === 'private_channel';
  return (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    {/* STEP 1 — add the bot (this is what grants access) */}
    <div className="p-5 md:p-8 space-y-5">
      <div className="flex items-center gap-3 text-blue-400">
        <Send size={16} strokeWidth={1.5} />
        <span className="text-[10px] font-bold uppercase tracking-widest font-mono">Step 1 · Add our bot</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">Adding the bot as a channel admin is what grants access — no phone number, API keys or OTP. It then reads new signals automatically and securely.</p>
      <div className="p-3 border border-white/10 bg-white/[0.02] rounded-md flex items-center justify-between gap-3">
        <span className="font-mono text-sm text-blue-300 select-all">{TG_COPY_BOT}</span>
        <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">copy bot</span>
      </div>
      <ol className="space-y-3">
        {[
          <>In Telegram, open your channel → <span className="text-slate-300">Manage → Administrators</span></>,
          <>Tap <span className="text-slate-300">Add Admin</span>, search <span className="font-mono text-blue-300">{TG_COPY_BOT}</span> and add it (read access is enough)</>,
        ].map((t, i) => (
          <li key={i} className="flex gap-3 text-[11px] text-slate-400 leading-relaxed">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-500/15 text-blue-300 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>{t}
          </li>
        ))}
      </ol>
    </div>
    {/* STEP 2 — identify the channel */}
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex items-center gap-3 text-blue-400">
        <Hash size={16} strokeWidth={1.5} />
        <span className="text-[10px] font-bold uppercase tracking-widest font-mono">Step 2 · Which channel?</span>
      </div>
      <TSelect label="Channel type"
        options={[{value:'public_channel',label:'Public (has an @username)'},{value:'private_channel',label:'Private (no @username)'},{value:'group',label:'Group / supergroup'}]}
        value={data.tgChannelType??'public_channel'} onChange={(v: any) => setData({...data,tgChannelType:v})} />
      <TInput
        label={isPrivate ? 'Channel ID' : 'Channel @username'}
        hint={isPrivate
          ? 'Private channels have no @username — paste the numeric ID (e.g. -1001234567890), not an invite link. Tip: forward any post to @getidsbot to reveal it.'
          : 'Its public @username, e.g. @forex_signals. A t.me/forex_signals link also works.'}
        placeholder={isPrivate ? '-1001234567890' : '@forex_signals'}
        value={data.tgChannelName??''} onChange={(e:any)=>setData({...data,tgChannelName:e.target.value})} />
      <InfoBox color="blue">{isPrivate
        ? 'Add the bot (Step 1) first — a private channel only works with its numeric ID.'
        : 'Add the bot (Step 1), then paste the @username here. That\'s it.'}</InfoBox>
    </div>
  </div>
  );
};

const StepTgParser = ({ data, setData }: any) => {
  const [sample, setSample] = useState<string>(data.testMessage ?? '');
  const parsed = sample.trim() ? clientSideParseSignal(sample) : null;
  const confColor = parsed ? (parsed.confidence === 'High' ? '#4ade80' : parsed.confidence === 'Medium' ? '#fbbf24' : '#f87171') : '#64748b';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
      <div className="p-5 md:p-8 space-y-6">
        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// parser_settings</span>
        <InfoBox color="green">The parser auto-detects symbol, side, entry, SL and TP for most channels. Only set keywords below if your channel uses an unusual format.</InfoBox>
        <div className="grid grid-cols-2 gap-4 md:gap-5">
          <TInput label="Entry keyword"  placeholder="auto" value={data.tgEntryKw??''}  onChange={(e:any)=>setData({...data,tgEntryKw:e.target.value})} />
          <TInput label="SL keyword"     placeholder="auto" value={data.tgSlKw??''}     onChange={(e:any)=>setData({...data,tgSlKw:e.target.value})} />
          <TInput label="TP keyword"     placeholder="auto" value={data.tgTpKw??''}     onChange={(e:any)=>setData({...data,tgTpKw:e.target.value})} />
          <TInput label="Symbol keyword" placeholder="auto" value={data.tgSymbolKw??''} onChange={(e:any)=>setData({...data,tgSymbolKw:e.target.value})} />
        </div>
        <div className="space-y-3 pt-2 border-t border-white/5">
          <Toggle label="Execute without a Stop-Loss" sub="Open even if the signal has no SL (riskier)" on={data.tgNoSL??false}   onChange={(v:any)=>setData({...data,tgNoSL:v})} />
          <Toggle label="Use first TP only"            sub="For multi-TP signals, target TP1"           on={data.tgFirstTP??true} onChange={(v:any)=>setData({...data,tgFirstTP:v})} />
        </div>
      </div>
      <div className="p-5 md:p-8 space-y-4">
        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// live_test</span>
        <p className="text-xs text-slate-500 leading-relaxed">Paste a real message from the channel to preview how it parses. <span className="text-slate-600">Final parsing runs server-side.</span></p>
        <textarea value={sample}
          onChange={(e) => { setSample(e.target.value); setData({ ...data, testMessage: e.target.value }); }}
          placeholder={"BUY EURUSD @ 1.0950\nSL 1.0900\nTP 1.1000"}
          className="w-full h-28 bg-white/[0.02] border border-white/10 rounded-md p-3 text-[13px] text-slate-200 font-mono placeholder:text-slate-600 focus:border-blue-500/50 outline-none resize-none" />
        {parsed ? (
          <div className="border border-white/10 rounded-md divide-y divide-white/5">
            {[['Symbol', parsed.symbol], ['Side', parsed.direction], ['Entry', parsed.entry], ['Stop-loss', parsed.sl], ['Take-profit', parsed.tp1], ['Confidence', parsed.confidence]].map(([k, v]) => (
              <div key={k as string} className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{k}</span>
                <span className="text-[12px] font-mono font-bold" style={{ color: k === 'Confidence' ? confColor : '#e2e8f0' }}>{v}</span>
              </div>
            ))}
          </div>
        ) : sample.trim() ? (
          <div className="border border-rose-500/20 bg-rose-500/5 rounded-md p-3 text-[11px] text-rose-300">No signal detected — check the message or set keywords on the left.</div>
        ) : null}
      </div>
    </div>
  );
};

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

// Advanced relay — authorize the user's own Telegram account (phone → code → 2FA).
const StepTgLogin = ({ data, setData }: any) => {
  const [phase, setPhase] = useState<'phone'|'code'|'password'|'done'>(data.relayAuthed ? 'done' : 'phone');
  const [phone, setPhone] = useState(data.relayPhone ?? '');
  const [code, setCode]   = useState('');
  const [pw, setPw]       = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');

  const call = async (url: string, body: any) => {
    setBusy(true); setErr('');
    try { const r = await apiRequest('POST', url, body); return await r.json(); }
    catch (e: any) { setErr(e?.message || 'Request failed'); return null; }
    finally { setBusy(false); }
  };
  const sendCode = async () => {
    if (!phone.trim()) { setErr('Enter your Telegram phone number'); return; }
    const r = await call('/api/copy/telegram-relay/start', { phone: phone.trim() });
    if (r?.sessionId) { setData({ ...data, relaySessionId: r.sessionId, relayPhone: phone.trim() }); setPhase('code'); }
    else if (r) setErr(r.error || 'Could not send code');
  };
  const verify = async () => {
    const r = await call('/api/copy/telegram-relay/verify', { sessionId: data.relaySessionId, code: code.trim() });
    if (r?.status === 'active') { setData({ ...data, relayAuthed: true }); setPhase('done'); }
    else if (r?.status === 'password_needed') setPhase('password');
    else if (r) setErr(r.error || 'Verification failed');
  };
  const submitPw = async () => {
    const r = await call('/api/copy/telegram-relay/password', { sessionId: data.relaySessionId, password: pw });
    if (r?.status === 'active') { setData({ ...data, relayAuthed: true }); setPhase('done'); }
    else if (r) setErr(r.error || '2FA failed');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
      <div className="p-5 md:p-8 space-y-6">
        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// authorize_telegram</span>
        {phase === 'phone' && (<>
          <TInput label="Telegram phone number" hint="The account subscribed to the channels you want to copy. A login code is sent to your Telegram app." placeholder="+254 7XX XXX XXX" type="tel" value={phone} onChange={(e:any)=>setPhone(e.target.value)} />
          <GlowButton active={!busy && !!phone.trim()} onClick={sendCode}>{busy ? 'Sending…' : 'Send login code'}</GlowButton>
        </>)}
        {phase === 'code' && (<>
          <TInput label="Login code" hint="Sent to your Telegram app (not SMS)." placeholder="12345" value={code} onChange={(e:any)=>setCode(e.target.value)} />
          <GlowButton active={!busy && !!code.trim()} onClick={verify}>{busy ? 'Verifying…' : 'Verify code'}</GlowButton>
        </>)}
        {phase === 'password' && (<>
          <TInput label="Two-step password" hint="Your account has 2FA enabled — enter your Telegram password." type="password" placeholder="••••••••" value={pw} onChange={(e:any)=>setPw(e.target.value)} />
          <GlowButton active={!busy && !!pw} onClick={submitPw}>{busy ? 'Checking…' : 'Confirm'}</GlowButton>
        </>)}
        {phase === 'done' && (
          <div className="flex items-center gap-3 p-4 border border-emerald-500/20 bg-emerald-500/[0.05] rounded-sm text-emerald-400">
            <CheckCircle2 size={16} /><span className="text-xs font-semibold">Telegram account authorized.</span>
          </div>
        )}
        {err && <InfoBox color="amber">{err}</InfoBox>}
      </div>
      <div className="p-5 md:p-8 space-y-4">
        <div className="flex items-center gap-3 text-amber-400"><Shield size={16} strokeWidth={1.5} /><span className="text-[10px] font-bold uppercase tracking-widest font-mono">Advanced · your session</span></div>
        <p className="text-xs text-slate-400 leading-relaxed">This authorizes <span className="text-slate-200">your own</span> Telegram account so the engine can read the channels you're subscribed to — including ones our bot can't join. No channel-owner involvement needed.</p>
        <ul className="space-y-2 text-[11px] text-slate-500 leading-relaxed list-disc pl-4">
          <li>Your session is encrypted and used only to read the channels you choose.</li>
          <li>Automated user sessions are a Telegram grey area — use an account you're comfortable with.</li>
          <li>Revoke any time from Telegram → Settings → Devices.</li>
        </ul>
      </div>
    </div>
  );
};

const StepRelayChannel = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-white/5 divide-y md:divide-y-0 md:divide-x divide-white/5">
    <div className="p-5 md:p-8 space-y-6">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// channel_to_copy</span>
      <TInput label="Channel @username or ID" hint="Any channel YOUR account is subscribed to. @username for public, numeric -100… id for private." placeholder="@forex_signals" value={data.relayChannel??''} onChange={(e:any)=>setData({...data,relayChannel:e.target.value})} />
      <div className="space-y-3 pt-2 border-t border-white/5">
        <Toggle label="Execute without a Stop-Loss" sub="Open even if the signal has no SL (riskier)" on={data.tgNoSL??false}   onChange={(v:any)=>setData({...data,tgNoSL:v})} />
        <Toggle label="Use first TP only"            sub="For multi-TP signals, target TP1"           on={data.tgFirstTP??true} onChange={(v:any)=>setData({...data,tgFirstTP:v})} />
      </div>
    </div>
    <div className="p-5 md:p-8 space-y-4">
      <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">// note</span>
      <p className="text-xs text-slate-400 leading-relaxed">You must already be subscribed to this channel on the Telegram account you authorized. The relay reads new posts as they arrive and mirrors valid signals to your cTrader account.</p>
      <InfoBox color="blue">One channel per setup — run the wizard again to relay another.</InfoBox>
    </div>
  </div>
);

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
    targetAccountConfig: data.role === 'self' ? {
      nickname:     data.nickname2 || data.loginId2 || 'Target Account',
      platform:     data.platform2 || 'MT5',
      brokerServer: data.brokerServer2,
      loginId:      data.loginId2,
      password:     data.password2,
      symbolPrefix: data.symbolPrefix2,
      symbolSuffix: data.symbolSuffix2,
    } : undefined,
    masterConfig: {
      strategyName:      data.strategyName,
      description:       data.strategyDescription,
      tradingStyle:      data.tradingStyle ?? 'swing',   // match the Strategy step's shown default
      primaryMarket:     data.primaryMarket ?? 'fx',      // (untouched select would else save as backend 'intraday')
      isPublic:          data.isPublic ?? true,
      requireApproval:   data.requireApproval ?? false,
      showOpenTrades:    data.showOpenTrades ?? true,
      maxLotSize:        data.maxLotSize        || undefined,
      provMaxOpenTrades: data.provMaxOpenTrades || undefined,
      typicalSl:         data.typicalSL         || undefined,
      typicalTp:         data.typicalTP         || undefined,
      typicalSymbols:    data.typicalSymbols    || undefined,
      allowedSessions:   ([['London (08:00–17:00 GMT)','London'],['New York (13:00–22:00 GMT)','New York'],['Asia (00:00–09:00 GMT)','Asia']] as [string,string][])
                           .filter(([k]) => data[`prov_session_${k}`]).map(([, s]) => s),
      notifEmail:        data.notifEmail        || undefined,
      notifPrefs: {
        newFollower: data.nNewFollower ?? true,
        dropped:     data.nDropped     ?? true,
        execFail:    data.nExecFail    ?? true,
        disconnect:  data.nDisconnect  ?? true,
        weekly:      data.nWeekly      ?? false,
      },
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

/**
 * Submit the copy configuration. cTrader (OAuth/API) accounts are connected on the
 * Accounts page and wired through the broker-account endpoints; MT5 / Telegram /
 * Proprietary keep the legacy deploy path. Every call goes through apiRequest so
 * the Supabase bearer token is attached (the old header-less fetch always 401'd).
 */
async function deployCopy(data: any): Promise<any> {
  // Telegram: copy a signal channel onto the user's connected account.
  if (data.role === 'telegram') {
    if (!data.brokerAccountId) throw new Error('Select the account to copy onto.');
    if (!data.tgChannelName) throw new Error('Enter the signal channel.');
    const res = await apiRequest('POST', '/api/copy/telegram-follow', {
      brokerAccountId: data.brokerAccountId,
      channel:         data.tgChannelName,
      channelType:     data.tgChannelType,
      entryKeyword:    data.tgEntryKw || undefined,
      slKeyword:       data.tgSlKw || undefined,
      tpKeyword:       data.tgTpKw || undefined,
      symbolKeyword:   data.tgSymbolKw || undefined,
      executeNoSl:     data.tgNoSL ?? false,
      useFirstTpOnly:  data.tgFirstTP ?? true,
      lotMode:         data.lotMode || 'fixed',
      fixedLot:        data.fixedLot,
      lotMultiplier:   data.lotMultiplier,
      riskPercent:     data.riskAmount,
      direction:       data.direction || 'same',
      riskAccepted:    data.riskAccepted ?? true,
    });
    return res.json();
  }

  // Relay: copy a channel via the user's OWN authorized Telegram account.
  if (data.role === 'relay') {
    if (!data.relayAuthed || !data.relaySessionId) throw new Error('Authorize your Telegram account first.');
    if (!data.brokerAccountId) throw new Error('Select the account to copy onto.');
    if (!data.relayChannel) throw new Error('Enter the channel to copy.');
    const res = await apiRequest('POST', '/api/copy/telegram-relay/follow', {
      sessionId:      data.relaySessionId,
      brokerAccountId: data.brokerAccountId,
      channel:        data.relayChannel,
      executeNoSl:    data.tgNoSL ?? false,
      useFirstTpOnly: data.tgFirstTP ?? true,
      lotMode:        data.lotMode || 'fixed',
      fixedLot:       data.fixedLot,
      riskPercent:    data.riskAmount,
      direction:      data.direction || 'same',
      riskAccepted:   data.riskAccepted ?? true,
    });
    return res.json();
  }

  const isApiPlatform = String(data.platform || '').toLowerCase() === 'ctrader';

  if (!isApiPlatform) {
    const res = await apiRequest('POST', '/api/copy/deploy', buildDeployPayload(data));
    return res.json();
  }

  if (!data.brokerAccountId) throw new Error('Select a connected cTrader account first.');
  const p = buildDeployPayload(data);

  if (data.role === 'provider') {
    const res = await apiRequest('POST', `/api/broker-accounts/${data.brokerAccountId}/register-as-provider`, p.masterConfig);
    return res.json();
  }

  if (data.role === 'self') {
    if (!data.brokerAccountId2) throw new Error('Select a target cTrader account.');
    const { masterId, ...followerCfg } = p.followerConfig;
    const res = await apiRequest('POST', '/api/copy/self-copy', {
      sourceBrokerAccountId: data.brokerAccountId,
      targetBrokerAccountId: data.brokerAccountId2,
      ...followerCfg,
    });
    return res.json();
  }

  // follower
  const res = await apiRequest('POST', `/api/broker-accounts/${data.brokerAccountId}/register-as-follower`, p.followerConfig);
  return res.json();
}

// ─── Copier Dashboard (shown after successful deployment) ─────────────────────
const ROLE_LABELS: Record<string,string> = {
  follower:'Follower', provider:'Provider / Master', self:'Self-Copy', telegram:'Telegram Signal', relay:'Telegram (My Account)',
};
const ROLE_COLORS: Record<string,string> = {
  follower:'#60a5fa', provider:'#a78bfa', self:'#34d399', telegram:'#fbbf24', relay:'#fbbf24',
};

function CopierDashboard({ deployResult, role, data, onSetupAnother, onHome }: any) {
  const [logs, setLogs]         = useState<any[]>([]);
  const [trades, setTrades]     = useState<any[]>([]);
  const [account, setAccount]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const followerId = deployResult?.follower?.id;
  const masterId   = deployResult?.master?.id;
  const accountId  = deployResult?.account?.id;

  const fetchData = useCallback(async () => {
    try {
      const reqs: Promise<any>[] = [];
      if (followerId) {
        reqs.push(
          authFetch(`/api/copy/logs/${followerId}`).then(r => r.ok ? r.json() : []),
          authFetch(`/api/copy/trades/follower/${followerId}?limit=10`).then(r => r.ok ? r.json() : []),
        );
      } else if (masterId) {
        reqs.push(
          Promise.resolve([]),
          authFetch(`/api/copy/trades/master/${masterId}?limit=10`).then(r => r.ok ? r.json() : []),
        );
      } else {
        reqs.push(Promise.resolve([]), Promise.resolve([]));
      }
      if (accountId) {
        reqs.push(authFetch(`/api/copy/accounts/${accountId}`).then(r => r.ok ? r.json() : null));
      }
      const [logsRes, tradesRes, acctRes] = await Promise.all(reqs);
      setLogs(Array.isArray(logsRes) ? logsRes.slice(0, 8) : []);
      setTrades(Array.isArray(tradesRes) ? tradesRes.slice(0, 8) : []);
      if (acctRes) setAccount(acctRes);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [followerId, masterId, accountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const roleColor = ROLE_COLORS[role] || '#60a5fa';
  const roleLabel = ROLE_LABELS[role] || role;
  const loginId   = data?.loginId || account?.loginId || '—';
  const broker    = data?.brokerServer || account?.brokerServer || '—';
  const platform  = data?.platform || account?.platform || 'MT5';

  return (
    <div className="ts-wizard-root w-full max-w-3xl mx-auto space-y-0">
      {/* ── Hero status bar ─────────────────────────────────────────────── */}
      <div className="border border-white/5 bg-[#05060a] p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6">
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 rounded-full border border-green-500/30 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-green-500/10 blur-xl animate-pulse" />
            <CheckCircle2 size={32} className="text-green-400 relative z-10" strokeWidth={1.5} />
          </div>
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-[#05060a] animate-pulse" />
        </div>
        <div className="flex-1 text-center md:text-left space-y-1">
          <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 border"
              style={{ color: roleColor, borderColor: roleColor + '40', background: roleColor + '10' }}>
              {roleLabel}
            </span>
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 border border-green-500/30 bg-green-500/10 text-green-400">
              ● Live
            </span>
          </div>
          <h2 className="text-base md:text-lg font-light tracking-tight">Copy Engine Active</h2>
          <p className="text-slate-500 text-xs font-mono">{data?.nickname || loginId} · {platform} · {broker}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={fetchData}
            className="text-[9px] font-mono uppercase tracking-widest text-slate-600 hover:text-slate-300 border border-white/5 hover:border-white/10 px-3 py-1.5 transition-all">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-px bg-white/5 border-x border-white/5">
        {[
          { label:'Account ID', value: accountId ? accountId.slice(0,8)+'…' : '—', color:'#f8fafc' },
          { label:'Role',       value: roleLabel,                                    color: roleColor },
          { label:'Bridge',     value: followerId || masterId ? 'Linked' : 'Ready',  color:'#4ade80' },
          { label:'Trades',     value: loading ? '…' : String(trades.length),        color:'#60a5fa' },
        ].map(s => (
          <div key={s.label} className="bg-[#020203] p-3 md:p-4 text-center">
            <div className="text-[8px] font-mono font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
            <div className="text-xs md:text-sm font-mono font-bold truncate" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Recent logs ─────────────────────────────────────────────────── */}
      <div className="border border-t-0 border-white/5 bg-[#020203]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600">// execution_log</span>
          {/* The "View all" link opened this endpoint raw in a new tab. That endpoint now needs a
              login, and a plain browser navigation cannot send a Bearer header — the link would
              only ever show {"error":"Unauthorized"}. The logs it pointed at are rendered directly
              below, so the link is removed rather than left broken. */}
        </div>
        {loading ? (
          <div className="px-5 py-8 flex items-center justify-center">
            <div className="text-[10px] font-mono text-slate-700 animate-pulse">Loading logs…</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center">
              <Radio size={14} className="text-slate-700" />
            </div>
            <p className="text-[11px] text-slate-700 font-mono">Listening for first trade signal…</p>
            <p className="text-[10px] text-slate-800">Logs appear here as trades execute</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map((log: any, i: number) => {
              const levelColor: Record<string,string> = { INFO:'#4ade80', WARN:'#fbbf24', ERROR:'#f87171', DEBUG:'#94a3b8' };
              const c = levelColor[log.level] || '#94a3b8';
              return (
                <div key={log.id || i} className="px-5 py-2.5 flex items-start gap-3 hover:bg-white/[0.01]">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-widest mt-0.5 flex-shrink-0"
                    style={{ color: c }}>{log.level}</span>
                  <span className="text-[10px] font-mono text-slate-400 flex-1 leading-relaxed">{log.message}</span>
                  <span className="text-[8px] font-mono text-slate-700 flex-shrink-0 mt-0.5">
                    {log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent trades ───────────────────────────────────────────────── */}
      <div className="border border-t-0 border-white/5 bg-[#020203]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600">// recent_trades</span>
        </div>
        {loading ? (
          <div className="px-5 py-6 flex items-center justify-center">
            <div className="text-[10px] font-mono text-slate-700 animate-pulse">Loading trades…</div>
          </div>
        ) : trades.length === 0 ? (
          <div className="px-5 py-6 flex flex-col items-center justify-center gap-2">
            <p className="text-[11px] text-slate-700 font-mono">No trades copied yet</p>
            <p className="text-[10px] text-slate-800">Trades will appear here once the engine processes a signal</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {trades.map((t: any, i: number) => (
              <div key={t.id || i} className="px-5 py-2.5 grid grid-cols-4 gap-2 items-center hover:bg-white/[0.01]">
                <span className="text-[10px] font-mono text-slate-300 truncate">{t.symbol || '—'}</span>
                <span className={`text-[9px] font-mono font-bold uppercase ${t.action==='BUY'?'text-green-400':'text-red-400'}`}>
                  {t.action || '—'}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{t.eventType || t.event_type || '—'}</span>
                <span className={`text-[9px] font-mono uppercase text-right
                  ${t.status==='executed'?'text-green-400':t.status==='failed'?'text-red-400':'text-slate-500'}`}>
                  {t.status || '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="border border-t-0 border-white/5 bg-[#020203] p-5 md:p-6 flex flex-col sm:flex-row items-center gap-3">
        <GlowButton active onClick={onSetupAnother}>
          Set Up Another Terminal <ArrowRight size={13} />
        </GlowButton>
        <button onClick={onHome}
          className="text-[10px] font-mono uppercase tracking-widest text-slate-600 hover:text-slate-300 transition-colors border border-white/5 hover:border-white/10 px-4 py-2">
          ← Back to FX Copier Home
        </button>
      </div>
    </div>
  );
}

const StepGoLive = ({ data, setData, role, onReset, onHome, providers }: any) => {
  const [status, setStatus] = useState<'ready'|'deploying'|'success'|'error'>('ready');
  const [deployResult, setDeployResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const provider = (providers || []).find((p: any) => p.id === data.selectedProvider);
  const allAccepted = data.riskAccepted && data.affordConfirmed;
  const isCT = String(data.platform || '').toLowerCase() === 'ctrader';
  const disclosuresAccepted = role==='provider' ? (allAccepted && data.providerConfirmed) : allAccepted;
  const accountsReady = !isCT ? true
    : role === 'self'     ? !!(data.brokerAccountId && data.brokerAccountId2 && data.brokerAccountId !== data.brokerAccountId2)
    : role === 'follower' ? !!(data.brokerAccountId && data.selectedProvider)
    : role === 'telegram' ? !!(data.brokerAccountId && data.tgChannelName)
    : role === 'relay'    ? !!(data.brokerAccountId && data.relayAuthed && data.relayChannel)
    : !!data.brokerAccountId;   // provider
  const canDeploy = disclosuresAccepted && accountsReady;
  const providerName = provider ? (provider.strategyName || provider.name || 'Provider') : null;
  const summaries: any = {
    follower: providerName ? `Copying ${providerName} · ${data.lotMode??'mult'} lot mode` : 'Configure provider in Bridge Linkage step',
    provider: `Broadcasting your strategy · ${data.isPublic?'Public':'Private'}`,
    self:     'Self-copy bridge between your two accounts',
    telegram: 'Telegram signal parser configured',
    relay:    'Relaying a channel via your own Telegram account',
  };
  const successMsg: any = {
    follower: providerName ? <>Copying <span className="text-blue-400 font-mono">{providerName}</span> in real-time.</> : 'Bridge is live.',
    provider: 'Your signals are now broadcasting to followers.',
    self:     'Self-copy bridge is active between your accounts.',
    telegram: 'Telegram signal parser is live and monitoring the channel.',
    relay:    'Relay is live — reading the channel from your Telegram account.',
  };

  const handleDeploy = async () => {
    if (!canDeploy) return;
    setStatus('deploying');
    setErrorMsg('');
    try {
      const result = await deployCopy(data);
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
      <h2 className="text-lg md:text-xl font-light">Deploying Terminal…</h2>
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
        <h2 className="text-lg md:text-xl font-light">Terminal Error</h2>
        <p className="text-slate-500 text-sm max-w-md font-mono">{errorMsg}</p>
      </div>
      <GlowButton active onClick={() => setStatus('ready')}>
        Try Again <ArrowRight size={14} />
      </GlowButton>
    </div>
  );

  if (status === 'success') return (
    <CopierDashboard
      deployResult={deployResult}
      role={role}
      data={data}
      onSetupAnother={onReset}
      onHome={onHome}
    />
  );

  return (
    <div className="border border-white/5 max-w-2xl mx-auto flex flex-col items-center">
      {/* ── Hero block ──────────────────────────────────────── */}
      <div className="w-full p-8 md:p-16 flex flex-col items-center text-center space-y-4 border-b border-white/5">
        <div className="w-24 h-24 rounded-full border border-blue-500/20 flex items-center justify-center relative">
          <div className="absolute inset-0 bg-blue-500/10 blur-2xl animate-pulse" />
          <Rocket size={40} className="text-blue-500 relative z-10" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg md:text-xl font-light">System Ready</h2>
        <p className="text-slate-500 text-sm max-w-md">{summaries[role]}</p>
      </div>

      {/* ── Risk disclosure (inline) ─────────────────────────── */}
      {!disclosuresAccepted && (
        <div className="w-full border-b border-white/5 p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Risk Disclosure Required</span>
          </div>

          <div className="p-4 border border-red-500/20 bg-red-500/5 space-y-2">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {role === 'provider'
                ? "As a signal provider, you acknowledge that followers will execute real-money trades based on your signals. TradeSync does not verify your trading strategy or guarantee follower profitability."
                : "Copy trading involves significant risk and may not be suitable for all investors. Past performance does not guarantee future results. You may lose some or all of your invested capital."}
            </p>
          </div>

          <div className="space-y-2">
            <Toggle
              label="I have read and understand the risk warning"
              on={data.riskAccepted ?? false}
              onChange={(v: boolean) => setData({ ...data, riskAccepted: v })}
            />
            {role === 'provider' && (
              <Toggle
                label="I confirm I am a genuine signal provider"
                on={data.providerConfirmed ?? false}
                onChange={(v: boolean) => setData({ ...data, providerConfirmed: v })}
              />
            )}
            <Toggle
              label={`I confirm I am ${role === 'provider' ? 'broadcasting' : 'trading'} with funds I can afford to lose`}
              on={data.affordConfirmed ?? false}
              onChange={(v: boolean) => setData({ ...data, affordConfirmed: v })}
            />
          </div>
        </div>
      )}

      {/* ── Deploy action ────────────────────────────────────── */}
      <div className="w-full p-6 md:p-8 flex flex-col items-center gap-3">
        {canDeploy && (
          <div className="flex items-center gap-2 text-green-400 text-[10px] font-mono uppercase tracking-widest mb-2">
            <CheckCircle2 size={13} />
            <span>All disclosures accepted — ready to deploy</span>
          </div>
        )}
        <GlowButton active={canDeploy} onClick={handleDeploy}>
          DEPLOY TERMINAL <ArrowRight size={14} />
        </GlowButton>
        {!canDeploy && (
          <p className="text-[10px] text-slate-700 font-mono mt-1">
            {!accountsReady
              ? (role === 'self' ? 'Select both source and target cTrader accounts.'
                 : role === 'follower' ? 'Select your account and a provider in the earlier steps.'
                 : role === 'telegram' ? 'Select your account and enter the signal channel.'
                 : 'Select your cTrader account in the earlier step.')
              : 'Accept all disclosures above to enable deployment.'}
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Step Titles ──────────────────────────────────────────────────────────────
const STEP_TITLES: any = {
  role:'Define your role.', connect:'Terminal Access', connect2:'Target Account', accounts:'Source & Target',
  link:'Bridge Linkage', filters:'Copy Filters', copy:'Lot Engine',
  protect:'Protection Shield', risk:'Risk Disclosure', strategy:'Your Strategy',
  limits:'Signal Limits', notif:'Notifications', mapping:'Symbol Mapping',
  'tg-channel':'Channel Setup', 'tg-login':'Authorize Telegram', 'tg-relay-channel':'Channel',
  'tg-parser':'Signal Parser', 'go-live':'Deployment Protocol',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COPIER WIZARD
// ═══════════════════════════════════════════════════════════════════════════════
export function CopierWizard({ onBack, onOpenDashboard }: { onBack: () => void; onOpenDashboard: (tab: 'provider' | 'follower') => void }) {
  const [step, setStep]               = usePersistedState('ts-step', 0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = usePersistedState<any>('ts-data', {
    role:'follower', platform:'cTrader', platform2:'cTrader', lotMode:'mult', riskAmount:'1',
    selectedProvider:null, symbolMaps:[{from:'',to:''},{from:'',to:''}],
  });
  const [providers, setProviders]             = useState<any[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  useEffect(() => {
    // apiRequest, NOT a bare fetch — the endpoint now requires a login, and a bare fetch sends no
    // credentials, which would leave the marketplace permanently empty.
    apiRequest('GET', '/api/copy/providers')
      .then(r => r.json())
      .then(d => { setProviders(Array.isArray(d) ? d : []); })
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoading(false));
  }, []);

  const getSteps = () => {
    if (data.role==='provider') return STEPS_PROVIDER;
    if (data.role==='self')     return STEPS_SELF;
    if (data.role==='telegram') return STEPS_TELEGRAM;
    if (data.role==='relay')    return STEPS_RELAY;
    return STEPS_FOLLOWER;
  };

  const steps = getSteps();
  const cur   = steps[step] || steps[0];

  const handleNext = () => { if (step < steps.length-1) { setStep(s=>s+1); setSidebarOpen(false); } };
  const handlePrev = () => { if (step > 0) setStep(s=>s-1); };

  const handleReset = () => {
    setStep(0);
    setData({ role:'follower', platform:'cTrader', platform2:'cTrader', lotMode:'mult', riskAmount:'1', selectedProvider:null, symbolMaps:[{from:'',to:''},{from:'',to:''}] });
  };

  const renderStep = () => {
    switch (cur.id) {
      case 'role':       return <StepRole          data={data} setData={setData} onNext={handleNext} />;
      case 'connect':    return <StepConnect       data={data} setData={setData} label={data.role==='self'?'Source Account':data.role==='telegram'?'Account to Copy Onto':'Trading Account'} />;
      case 'connect2':   return <StepConnect2      data={data} setData={setData} />;
      case 'accounts':   return <StepSelfAccounts  data={data} setData={setData} />;
      case 'link':       return <StepLink          data={data} setData={setData} providers={providers} providersLoading={providersLoading} />;
      case 'filters':    return <StepFilters       data={data} setData={setData} />;
      case 'copy':       return <StepCopy          data={data} setData={setData} />;
      case 'protect':    return <StepProtect       data={data} setData={setData} />;
      case 'risk':       return <StepRisk          data={data} setData={setData} isProvider={data.role==='provider'} />;
      case 'strategy':   return <StepStrategy      data={data} setData={setData} />;
      case 'limits':     return <StepLimits        data={data} setData={setData} />;
      case 'notif':      return <StepProviderNotif data={data} setData={setData} />;
      case 'mapping':    return <StepMapping       data={data} setData={setData} />;
      case 'tg-channel': return <StepTgChannel     data={data} setData={setData} />;
      case 'tg-parser':  return <StepTgParser      data={data} setData={setData} />;
      case 'tg-login':   return <StepTgLogin       data={data} setData={setData} />;
      case 'tg-relay-channel': return <StepRelayChannel data={data} setData={setData} />;
      case 'go-live':    return <StepGoLive        data={data} setData={setData} role={data.role} onReset={handleReset} onHome={onBack} providers={providers} />;
      default:           return null;
    }
  };

  return (
    <div className="ts-wizard-root min-h-screen bg-[#020203] text-white selection:bg-blue-500/40 font-light overflow-hidden">
      <style>{`
        .ts-wizard-root,.ts-wizard-root *{font-family:'DM Mono',ui-monospace,SFMono-Regular,monospace !important;}
        .ts-wizard-root{letter-spacing:-0.01em;}
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

      <div className="flex flex-col h-screen">

        {/* HEADER — full-width terminal nav */}
        <TradeSyncNav
          active={data.role}
          onSelect={(id) => { setData({ ...data, role: id }); setStep(0); }}
          onOpenDashboard={onOpenDashboard}
          onBack={onBack}
          onMenu={() => setSidebarOpen(true)}
        />

        <div className="flex flex-1 flex-row-reverse overflow-hidden">

        {/* SIDEBAR — desktop only */}
        <aside className="hidden md:flex w-24 border-l border-white/5 flex-col items-center py-8 bg-black/40 backdrop-blur-xl z-20 overflow-y-auto hide-scrollbar">
          <nav className="flex-1 flex flex-col justify-center">
            {steps.map((s,i) => {
              const Icon   = s.icon;
              const done   = i < step;
              const active = i === step;
              const last   = i === steps.length - 1;
              return (
                <div key={s.id} className="flex flex-col items-center">
                  <button
                    onClick={() => done && setStep(i)}
                    disabled={!done}
                    aria-current={active ? 'step' : undefined}
                    aria-label={s.label}
                    className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full border transition-all duration-300
                      ${active
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300 shadow-[0_0_18px_rgba(37,99,235,0.55)]'
                        : done
                          ? 'border-blue-600/70 bg-blue-600/15 text-blue-300 hover:border-blue-400 hover:bg-blue-600/25 cursor-pointer'
                          : 'border-white/10 bg-white/[0.02] text-slate-500 cursor-default'}`}>
                    {done ? <Check size={15} strokeWidth={2.5} /> : <Icon size={15} strokeWidth={1.5} />}
                    {active && <span className="absolute -inset-1 rounded-full border border-blue-500/30 animate-pulse" />}
                  </button>
                  <span className={`mt-1.5 text-[8px] uppercase tracking-widest transition-colors
                    ${active ? 'text-blue-300' : done ? 'text-slate-400' : 'text-slate-600'}`}>
                    {s.label}
                  </span>
                  {!last && (
                    <div className={`w-px h-7 my-1 rounded-full transition-colors duration-500
                      ${done ? 'bg-gradient-to-b from-blue-500/70 to-blue-600/40' : 'bg-white/10'}`} />
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.03),transparent_40%)]">

          {/* CONTENT */}
          <section className="flex-1 overflow-y-auto p-5 md:p-12 lg:p-20 hide-scrollbar">
            <div className={cur.id==='link' ? 'w-full' : 'max-w-6xl'}>
              <SectionTitle step={step} id={cur.id} title={STEP_TITLES[cur.id]??cur.id} />
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {renderStep()}
              </div>
            </div>
          </section>

        </main>
        </div>

        {/* FOOTER — full width */}
        <footer className="h-16 md:h-20 border-t border-white/[0.06] bg-[#020203]/85 backdrop-blur-sm flex items-center justify-between px-5 md:px-12 lg:px-20 flex-shrink-0">
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
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const landingStyles = `
/* ── FX COPIER LANDING ─────────────────────────────────────────────────────────
   His design, 2026-08-21, supplied as a component. Ink-navy terminal + editorial
   Playfair; two-tone signal system where blue = master and sky = follower.

   SCOPED UNDER .ts-page, NOT .fx, AND THAT IS LOAD-BEARING. Journal forces its own font with
   \`!important\` on every subtree except .dp, .ct-app and .ts-page (Journal.tsx). A .fx-only root
   would inherit that force and render the lucide icons as TEXT — which has happened here twice.
   The wrapper carries BOTH classes: .ts-page earns the exemption for itself and its descendants,
   .fx carries the styling below.

   NO GOOGLE FONTS IMPORT. The supplied code @imported Playfair + JetBrains Mono and also injected
   three <link> tags into document.head at mount. Both faces are already bundled
   (@fontsource-variable/playfair-display, @fontsource-variable/jetbrains-mono), so that would fetch
   over the network what is already in the bundle — the same needless round-trip as the 403 KB logo.

   DARK IN BOTH THEMES, his call (a1). The panel owns its typography and its palette, which is why it
   sits behind the font exemption in the first place. Journal's old light-mode patches targeted the
   previous markup (.ts-hero h1, .ts-step p, .ts-platform-meta) and are removed rather than left
   pointing at selectors that no longer exist.
──────────────────────────────────────────────────────────────────────────────── */
.ts-page{
  --ink:#090C15; --ink-2:#0C1120; --panel:#121826; --panel-2:#161E30;
  --line:#232C42; --line-soft:#1B2234;
  --text:#EEF0F7; --muted:#8B93AA; --muted-2:#5B647E; --faint:#616B85;
  --blue:#4C8DFF; --blue-soft:#9CBEFF; --blue-dim:rgba(76,141,255,.16);
  --sky:#54C6F2; --sky-soft:#AEE6FB; --sky-dim:rgba(84,198,242,.15);
  --up:#4ADE80; --down:#F0726F;
  --fd:'Playfair Display',Georgia,serif;
  --fb:'Playfair Display',Georgia,serif;
  --fm:'JetBrains Mono',ui-monospace,monospace;
}
.ts-page *,.ts-page *::before,.ts-page *::after{box-sizing:border-box;}
.ts-page.fx{background:var(--ink);color:var(--text);font-family:var(--fb);font-weight:500;
  -webkit-font-smoothing:antialiased;line-height:1.6;letter-spacing:.005em;position:relative;
  overflow-x:hidden;min-height:100%;}
/* The glow was position:fixed in the mock — a full-page assumption. Inside Journal's scrolling
   <main> that would pin to the viewport and slide over the rest of the app, so it is absolute. */
.ts-page.fx::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(60% 40% at 78% 0%, rgba(76,141,255,.06), transparent 70%),
    radial-gradient(50% 45% at 8% 12%, rgba(84,198,242,.05), transparent 70%);}
.ts-page .fx-wrap{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:0 28px;}

/* ---- type ---- */
.ts-page .eyebrow{font-family:var(--fm);font-size:11px;letter-spacing:.24em;text-transform:uppercase;
  color:var(--sky);font-weight:500;display:inline-flex;align-items:center;gap:9px;}
.ts-page .eyebrow .dot{width:5px;height:5px;border-radius:50%;background:var(--sky);
  box-shadow:0 0 0 4px var(--sky-dim);}
/* The hero's eyebrow is editorial rather than terminal — Playfair italic, sentence case. */
.ts-page .eyebrow.pf{font-family:var(--fd);text-transform:none;letter-spacing:.01em;
  font-size:16px;font-style:italic;font-weight:500;}
.ts-page h1,.ts-page h2,.ts-page h3{font-family:var(--fd);font-weight:700;margin:0;
  letter-spacing:-.01em;line-height:1.04;}
.ts-page .mono{font-family:var(--fm);}

/* ---- intro banner ----
   HIS REVISION: a quiet strip, not a feature card. It was a gradient panel with a blue→sky accent
   bar, a drop shadow and 19px text — which read as the loudest thing on the page and competed with
   the hero for the eye. Now it is a flat ink strip with small muted type: context you can read if
   you want it, sitting under the headline rather than in front of it. */
.ts-page .intro{padding:22px 0 6px;}
.ts-page .intro-card{display:flex;gap:12px;align-items:flex-start;
  background:var(--ink-2);border:1px solid var(--line-soft);border-radius:10px;padding:13px 18px;}
.ts-page .intro-ic{flex-shrink:0;width:22px;height:22px;border-radius:50%;display:grid;
  place-items:center;background:var(--blue);color:#FFFFFF;margin-top:1px;}
.ts-page .intro-text{margin:0;font-size:13.5px;line-height:1.6;color:var(--muted);font-weight:400;max-width:none;}
.ts-page .intro-text b{color:var(--text);font-weight:700;}
.ts-page .intro-text b.hl{color:var(--blue-soft);font-weight:700;}
.ts-page .intro-text .dash{color:var(--muted);}

/* ---- NAV REMOVED (his revision) ----
   The landing had its own brand bar with links and a "bridge synced" pill. It sits INSIDE Journal,
   under Journal's own header and beside Journal's own sidebar, so a second nav was a second set of
   navigation for a page that is one scroll long. Gone; the hero carries the calls to action. */

/* ---- hero ---- */
.ts-page .hero{padding:42px 0 92px;position:relative;}
.ts-page .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;}
/* THE HEADLINE, his revision: smaller, upright, and two-tone.
   It was clamp(52px,7.4vw,92px) with the second line in italic — at 1366px that resolved to 92px,
   which pushed "mirror every trade." onto two lines and made the block taller than the diagram
   beside it. Now it tops out at 56px and stays on two lines.

   NOT ITALIC. The distinction between the product name and the line about it is carried by COLOUR
   and WEIGHT instead: the name in near-white at 700, the promise in sky at 500. Two different hues
   rather than one hue plus a slant, which is what he asked for — and sky keeps the blue free for
   the buttons, where blue means "this is clickable". */
.ts-page .hero h1{font-size:clamp(34px,4.4vw,56px);line-height:1.06;margin:20px 0 0;}
.ts-page .hero h1 .l1{color:var(--text);font-weight:700;}
/* BOTH LINES AT 700, and that is the point of the weight.
   The tagline was 500 and he said it did not look like Playfair. He was reacting to something real:
   Playfair's character is its thick-thin stroke contrast, and at 500 upright that contrast flattens
   into a generic serif. (Measured at the time — the face WAS Playfair: "mirror every trade." came out
   486.14px against Playfair's 486.14 and Georgia's 469.03. The font was right; the weight hid it.)
   700 brings the contrast back, and it is also the one Playfair weight confirmed resolved on this
   page. COLOUR now does all the separating, which is what he asked for. */
.ts-page .hero h1 .l2{display:block;font-weight:700;color:var(--sky);letter-spacing:0;}
.ts-page .hero .lede{color:var(--muted);font-size:18px;max-width:440px;margin:22px 0 32px;line-height:1.6;}
.ts-page .hero .cta-row{display:flex;gap:14px;flex-wrap:wrap;}
.ts-page .trust{margin-top:30px;display:flex;align-items:center;gap:11px;color:var(--faint);
  font-size:13.5px;max-width:430px;line-height:1.5;}
.ts-page .trust svg{color:var(--sky);flex-shrink:0;margin-top:1px;}
.ts-page .trust b{color:var(--muted);font-weight:600;}

/* ---- the signature: live mirror diagram ----
   One master emitting to three followers, with pulses travelling the wires. Decorative, so the
   wrapper is aria-hidden — a screen reader gets the lede, not a description of dots moving. */
.ts-page .dg-outer{width:100%;height:470px;display:flex;justify-content:center;overflow:hidden;}
.ts-page .diagram{position:relative;height:470px;width:460px;flex:0 0 auto;transform-origin:top center;}
.ts-page .dg-scene{position:absolute;inset:0;}
.ts-page .node{position:absolute;border-radius:13px;background:var(--panel);border:1px solid var(--line);
  padding:13px 15px;width:190px;box-shadow:0 18px 44px rgba(0,0,0,.4);}
.ts-page .node .row{display:flex;align-items:center;gap:10px;}
.ts-page .node .ic{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;flex-shrink:0;}
.ts-page .node .lbl{font-family:var(--fd);font-weight:700;font-size:15px;line-height:1.1;}
.ts-page .node .id{font-family:var(--fm);font-size:10.5px;color:var(--muted);letter-spacing:.04em;margin-top:2px;}
.ts-page .tag{font-family:var(--fm);font-size:9.5px;font-weight:600;letter-spacing:.08em;
  text-transform:uppercase;padding:3px 8px;border-radius:6px;margin-left:auto;}
.ts-page .tag-m{background:var(--blue-dim);color:var(--blue-soft);border:1px solid rgba(76,141,255,.3);}
.ts-page .tag-f{background:var(--sky-dim);color:var(--sky-soft);border:1px solid rgba(84,198,242,.3);}
.ts-page .node-master{left:50%;top:8px;transform:translateX(-50%);width:210px;
  border-color:rgba(76,141,255,.34);background:linear-gradient(180deg,rgba(76,141,255,.07),var(--panel));}
.ts-page .node-master .ic{background:linear-gradient(150deg,var(--blue),#2E63DA);color:#ffffff;}
.ts-page .node-f{width:172px;}
.ts-page .node-f .ic{background:var(--sky-dim);color:var(--sky);border:1px solid rgba(84,198,242,.3);}
.ts-page .f-a{left:-6px;bottom:6px;}
.ts-page .f-b{left:50%;transform:translateX(-50%);bottom:-8px;}
.ts-page .f-c{right:-6px;bottom:6px;}
.ts-page .lot{font-family:var(--fm);font-size:10px;color:var(--muted);margin-top:9px;display:flex;
  justify-content:space-between;border-top:1px solid var(--line-soft);padding-top:8px;}
.ts-page .lot .ms{color:var(--sky);}
.ts-page .recv{animation:fxrecv 3s ease-in-out infinite;}
.ts-page .recv.d1{animation-delay:.28s} .ts-page .recv.d2{animation-delay:.42s} .ts-page .recv.d3{animation-delay:.56s}
@keyframes fxrecv{0%,18%,100%{border-color:var(--line)}22%,30%{border-color:rgba(84,198,242,.7);
  box-shadow:0 18px 44px rgba(0,0,0,.4),0 0 0 1px rgba(84,198,242,.4),0 0 26px rgba(84,198,242,.18)}}
.ts-page .wires{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
.ts-page .wire{fill:none;stroke:var(--line);stroke-width:1.5;stroke-dasharray:4 5;}
.ts-page .pulse{position:absolute;width:9px;height:9px;border-radius:50%;left:220px;top:96px;
  background:var(--blue-soft);box-shadow:0 0 12px 3px rgba(76,141,255,.6);
  animation:fxtravel 3s cubic-bezier(.4,0,.2,1) infinite;opacity:0;}
.ts-page .p1{--ex:-128px;--ey:250px;animation-delay:0s}
.ts-page .p2{--ex:0px;--ey:268px;animation-delay:.14s}
.ts-page .p3{--ex:128px;--ey:250px;animation-delay:.28s}
@keyframes fxtravel{0%{transform:translate(0,0) scale(.6);opacity:0}
  8%{opacity:1}70%{opacity:1}
  86%,100%{transform:translate(var(--ex),var(--ey)) scale(1);opacity:0}}
.ts-page .emit{position:absolute;left:220px;top:96px;width:14px;height:14px;border-radius:50%;
  transform:translate(-50%,-50%);background:var(--blue);animation:fxemit 3s ease-in-out infinite;}
@keyframes fxemit{0%,100%{box-shadow:0 0 0 0 rgba(76,141,255,.5)}
  10%{box-shadow:0 0 0 12px rgba(76,141,255,0)}}

/* ---- buttons ---- */
.ts-page .btn{font-family:var(--fb);font-weight:600;font-size:14.5px;border-radius:10px;cursor:pointer;
  display:inline-flex;align-items:center;gap:9px;
  transition:transform .16s,box-shadow .16s,background .16s,border-color .16s;
  border:1px solid transparent;text-decoration:none;}
.ts-page .btn-blue{background:linear-gradient(150deg,var(--blue),#2C5AD0);color:#ffffff;padding:12px 20px;
  box-shadow:0 6px 20px rgba(76,141,255,.24);}
.ts-page .btn-blue:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(76,141,255,.34);}
.ts-page .btn-ghost{background:transparent;color:var(--text);border-color:var(--line);padding:12px 20px;}
.ts-page .btn-ghost:hover{border-color:var(--muted);background:var(--panel);}

/* ---- sections ---- */
.ts-page .section{padding:104px 0;position:relative;}
.ts-page .sec-head{max-width:640px;margin:0 auto 58px;text-align:center;}
.ts-page .sec-head h2{font-size:clamp(30px,4vw,46px);margin:16px 0 14px;}
.ts-page .sec-head h2 em{font-style:italic;color:var(--blue-soft);}
.ts-page .sec-head p{color:var(--muted);font-size:16.5px;margin:0;}
.ts-page .reveal{opacity:0;transform:translateY(22px);
  transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1);}
.ts-page .reveal.in{opacity:1;transform:none;}

/* ---- modes ---- */
.ts-page .modes{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.ts-page .mode{background:var(--panel);border:1px solid var(--line-soft);border-radius:14px;
  padding:22px 20px;transition:transform .2s,border-color .2s;position:relative;overflow:hidden;
  text-align:left;font:inherit;color:inherit;cursor:pointer;}
.ts-page .mode:hover{transform:translateY(-4px);border-color:var(--line);}
.ts-page .mode .mi{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;
  background:var(--sky-dim);color:var(--sky);margin-bottom:16px;}
.ts-page .mode:nth-child(1) .mi{background:var(--blue-dim);color:var(--blue-soft);}
.ts-page .mode h3{font-size:19px;margin-bottom:7px;}
.ts-page .mode p{color:var(--muted);font-size:13.5px;margin:0;line-height:1.5;}
.ts-page .mode .go{margin-top:12px;font-family:var(--fm);font-size:10.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--sky-soft);display:inline-flex;align-items:center;gap:6px;}

/* ---- steps ---- */
.ts-page .steps{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:0;}
.ts-page .steps::before{content:"";position:absolute;top:28px;left:12%;right:12%;height:1px;
  background:linear-gradient(90deg,var(--blue),var(--sky));opacity:.4;}
.ts-page .step{padding:0 22px;text-align:center;position:relative;}
.ts-page .step .num{width:56px;height:56px;margin:0 auto 22px;border-radius:14px;display:grid;
  place-items:center;font-family:var(--fd);font-weight:700;font-size:22px;background:var(--panel-2);
  border:1px solid var(--line);color:var(--blue-soft);position:relative;z-index:1;}
.ts-page .step:last-child .num{color:var(--sky-soft);border-color:rgba(84,198,242,.35);}
.ts-page .step h3{font-size:17px;margin-bottom:9px;}
.ts-page .step p{color:var(--muted);font-size:13.5px;margin:0;}

/* ---- platforms ---- */
.ts-page .plat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.ts-page .plat{background:var(--panel);border:1px solid var(--line-soft);border-radius:14px;padding:18px;
  display:flex;flex-direction:column;align-items:center;text-align:center;
  transition:border-color .2s,transform .2s;}
.ts-page .plat:hover{border-color:var(--line);transform:translateY(-3px);}
.ts-page .badge{font-family:var(--fm);font-size:9.5px;font-weight:600;letter-spacing:.06em;
  text-transform:uppercase;padding:3px 9px;border-radius:6px;align-self:flex-start;}
.ts-page .b-live{background:rgba(74,222,128,.12);color:var(--up);border:1px solid rgba(74,222,128,.3);}
.ts-page .b-soon{background:var(--blue-dim);color:var(--blue-soft);border:1px solid rgba(76,141,255,.3);}
.ts-page .mono-mark{width:46px;height:46px;border-radius:11px;display:grid;place-items:center;
  margin:16px 0 12px;font-family:var(--fm);font-weight:600;font-size:16px;background:var(--panel-2);
  border:1px solid var(--line);color:var(--text);}
.ts-page .plat .pname{font-family:var(--fd);font-weight:700;font-size:16px;margin-bottom:14px;}
.ts-page .vote{display:flex;align-items:center;gap:10px;margin-top:auto;}
.ts-page .vbtn{display:inline-flex;align-items:center;gap:5px;font-family:var(--fb);font-weight:600;
  font-size:12.5px;padding:7px 12px;border-radius:8px;cursor:pointer;border:1px solid var(--line);
  background:var(--panel-2);color:var(--text);transition:all .15s;}
.ts-page .vbtn:hover{border-color:var(--sky);color:var(--sky-soft);}
.ts-page .vbtn.on{background:var(--sky-dim);border-color:rgba(84,198,242,.4);color:var(--sky-soft);}
.ts-page .vcount{font-family:var(--fm);font-size:13px;color:var(--muted);font-weight:500;}

/* ---- features + pricing ---- */
.ts-page .fp{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start;}
.ts-page .feat{display:flex;gap:16px;padding:18px 0;border-bottom:1px solid var(--line-soft);}
.ts-page .feat:last-child{border-bottom:none;}
.ts-page .feat .fic{width:42px;height:42px;border-radius:10px;flex-shrink:0;display:grid;
  place-items:center;background:var(--panel);border:1px solid var(--line);color:var(--blue-soft);}
.ts-page .feat h3{font-size:17px;margin-bottom:5px;}
.ts-page .feat p{color:var(--muted);font-size:14px;margin:0;line-height:1.5;}
.ts-page .price-card{background:linear-gradient(180deg,var(--panel-2),var(--panel));
  border:1px solid rgba(76,141,255,.3);border-radius:20px;padding:8px;
  box-shadow:0 24px 60px rgba(0,0,0,.4);position:sticky;top:16px;}
.ts-page .toggle{display:flex;background:var(--ink-2);border-radius:13px;padding:5px;
  border:1px solid var(--line-soft);}
.ts-page .toggle button{flex:1;padding:11px;border:none;border-radius:9px;background:transparent;
  color:var(--muted);font-family:var(--fb);font-weight:600;font-size:14px;cursor:pointer;transition:all .18s;}
.ts-page .toggle button.act{background:linear-gradient(150deg,var(--blue),#2C5AD0);color:#ffffff;}
.ts-page .toggle .save{font-family:var(--fm);font-size:10px;margin-left:6px;opacity:.85;}
.ts-page .pc-body{padding:24px 22px 22px;}
.ts-page .pc-tag{font-family:var(--fm);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--sky);}
.ts-page .pc-price{display:flex;align-items:baseline;gap:6px;margin:14px 0 4px;}
.ts-page .pc-price .amt{font-family:var(--fd);font-weight:900;font-size:58px;line-height:1;}
.ts-page .pc-price .per{color:var(--muted);font-size:15px;}
.ts-page .pc-was{font-family:var(--fm);font-size:13px;color:var(--faint);}
.ts-page .pc-was s{margin-right:8px;}
.ts-page .pc-was b{color:var(--blue-soft);font-weight:600;}
.ts-page .pc-sub{color:var(--muted);font-size:14px;margin:12px 0 20px;}
.ts-page .qty{display:flex;align-items:center;justify-content:space-between;background:var(--ink-2);
  border:1px solid var(--line-soft);border-radius:12px;padding:14px 16px;margin-bottom:16px;}
.ts-page .qty .qlbl{font-size:13.5px;color:var(--muted);}
.ts-page .qty .qctl{display:flex;align-items:center;gap:14px;}
.ts-page .qty .qbtn{width:30px;height:30px;border-radius:8px;border:1px solid var(--line);
  background:var(--panel);color:var(--text);cursor:pointer;display:grid;place-items:center;transition:all .15s;}
.ts-page .qty .qbtn:hover{border-color:var(--sky);color:var(--sky-soft);}
.ts-page .qty .qnum{font-family:var(--fm);font-size:17px;font-weight:600;min-width:26px;text-align:center;}
.ts-page .total{display:flex;justify-content:space-between;align-items:baseline;padding:0 2px 18px;}
.ts-page .total span{color:var(--muted);font-size:14px;}
.ts-page .total b{font-family:var(--fd);font-size:26px;font-weight:700;}
.ts-page .total b em{font-family:var(--fm);font-size:13px;color:var(--muted);font-style:normal;font-weight:400;}
.ts-page .pc-cta{width:100%;justify-content:center;padding:15px;font-size:15.5px;border:none;}
.ts-page .pc-note{text-align:center;color:var(--faint);font-size:12px;margin-top:14px;display:flex;
  align-items:center;justify-content:center;gap:7px;}

/* ---- FAQ ----
   KEPT DELIBERATELY. The supplied design has no FAQ, and these entries carry the only
   "we do not trade for you / we do not give signals or advice" statements on the product.
   Dropping them to match a mock would be a real regression on a copy-trading page. */
.ts-page .faq{max-width:760px;margin:0 auto;}
.ts-page .faq-item{border-bottom:1px solid var(--line-soft);}
.ts-page .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;
  background:none;border:none;color:var(--text);font-family:var(--fd);font-weight:700;font-size:17px;
  text-align:left;padding:20px 2px;cursor:pointer;transition:color .18s;}
.ts-page .faq-q:hover{color:var(--blue-soft);}
.ts-page .faq-q svg{flex-shrink:0;color:var(--muted);transition:transform .22s,color .18s;}
.ts-page .faq-item.open .faq-q svg{transform:rotate(180deg);color:var(--sky);}
.ts-page .faq-a{max-height:0;overflow:hidden;color:var(--muted);font-size:14.5px;line-height:1.65;
  transition:max-height .3s ease,padding .3s ease;padding:0 2px;}
.ts-page .faq-item.open .faq-a{max-height:340px;padding:0 2px 22px;}

/* ---- responsive ---- */
/* Grid children must be allowed to shrink or they force horizontal overflow. */
.ts-page .fp > *,.ts-page .hero-grid > *{min-width:0;}
@media (max-width:1000px){
  .ts-page .fx-wrap{padding:0 24px;}
  .ts-page .section{padding:88px 0;}
}
@media (max-width:920px){
  .ts-page .hero{padding:48px 0 80px;}
  .ts-page .hero-grid{grid-template-columns:1fr;gap:44px;}
  .ts-page .dg-outer{margin-top:8px;}
  .ts-page .modes{grid-template-columns:1fr 1fr;}
  .ts-page .steps{grid-template-columns:1fr 1fr;row-gap:44px;}
  .ts-page .steps::before{display:none;}
  .ts-page .plat-grid{grid-template-columns:repeat(3,1fr);}
  .ts-page .fp{grid-template-columns:1fr;gap:44px;}
  .ts-page .price-card{position:static;max-width:460px;margin:0 auto;}
  .ts-page .sec-head{margin-bottom:46px;}
}
@media (max-width:680px){
  .ts-page .section{padding:72px 0;}
  .ts-page .plat-grid{grid-template-columns:1fr 1fr;}
}
@media (max-width:560px){
  .ts-page .fx-wrap{padding:0 18px;}
  .ts-page .intro-card{padding:12px 15px;gap:11px;}
  .ts-page .intro-text{font-size:12.5px;line-height:1.55;}
  .ts-page .intro-ic{width:20px;height:20px;}
  .ts-page .hero .lede{font-size:16.5px;}
  .ts-page .cta-row .btn{flex:1;justify-content:center;}
  .ts-page .modes,.ts-page .plat-grid,.ts-page .steps{grid-template-columns:1fr;}
  .ts-page .steps{row-gap:34px;}
  .ts-page .step{padding:0;}
  .ts-page .dg-outer{height:395px;}
  .ts-page .diagram{transform:scale(.84);}
}
@media (max-width:430px){
  .ts-page .section{padding:60px 0;}
  .ts-page .dg-outer{height:338px;}
  .ts-page .diagram{transform:scale(.72);}
  .ts-page .pc-price .amt{font-size:50px;}
}
@media (max-width:360px){
  .ts-page .dg-outer{height:296px;}
  .ts-page .diagram{transform:scale(.62);}
}
@media (prefers-reduced-motion:reduce){
  .ts-page .pulse,.ts-page .emit,.ts-page .recv{animation:none!important;}
  .ts-page .pulse{display:none;}
  .ts-page .reveal{opacity:1;transform:none;transition:none;}
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING DATA
// ═══════════════════════════════════════════════════════════════════════════════

// The four ways the copier can be used. `go` names the destination each card opens, which is what
// turns them from decoration into the entry points for the provider/follower dashboards — a path
// that existed in state (`ts-dashboard`) but had no button anywhere until now.
const MODES: { icon: any; t: string; d: string; go: null | 'provider' | 'follower' | 'copier' }[] = [
  { icon: Radio,  t: "Provider",  d: "Broadcast your live trades to a network of followers in real time.", go: 'provider' },
  { icon: Users,  t: "Follower",  d: "Mirror a master account with your own lot sizing and risk limits.",  go: 'follower' },
  { icon: Repeat, t: "Self-copy", d: "Keep several of your own accounts moving in perfect lockstep.",      go: 'copier'   },
  { icon: Send,   t: "Telegram",  d: "Route signals straight from a Telegram channel into live orders.",   go: 'copier'   },
];

const STEPS = [
  { t: "Connect your master",     d: "Link the source account you want to broadcast from." },
  { t: "Choose followers & risk", d: "Pick the accounts to copy into and set each one's risk ratio." },
  { t: "Copying goes live",       d: "Orders replicate across every account, automatically and in real time." },
  { t: "Monitor & adjust",        d: "Track performance and change settings whenever you like." },
];

const FX_FEATURES = [
  { icon: Zap,               t: "Instant trade mirroring",       d: "Orders copy with extremely low latency, so you never miss a move." },
  { icon: Bell,              t: "Telegram notifications",        d: "Get pinged on Telegram or email the moment a trading event fires." },
  { icon: Cloud,             t: "Cloud-based copying",           d: "Nothing to install — everything runs in the cloud, around the clock." },
  { icon: SlidersHorizontal, t: "Flexible risk allocation",      d: "Scale risk per follower and adjust it on the fly." },
  { icon: Headphones,        t: "Priority support & onboarding", d: "One-on-one setup and a direct line whenever you need it." },
];

// Live/soon flags kept from the existing landing so the page does not start claiming support that
// was not being claimed before. Vote counts are the same figures too.
const FX_PLATFORMS = [
  { name: "MT5",         mark: "M5", live: true,  votes: 2061 },
  { name: "MT4",         mark: "M4", live: true,  votes: 419  },
  { name: "cTrader",     mark: "cT", live: true,  votes: 370  },
  { name: "TradeLocker", mark: "TL", live: true,  votes: 289  },
  { name: "Tradovate",   mark: "Tv", live: false, votes: 231  },
  { name: "MatchTrader", mark: "Ma", live: true,  votes: 182  },
  { name: "Binance",     mark: "Bn", live: true,  votes: 170  },
  { name: "NinjaTrader", mark: "Nj", live: false, votes: 124  },
  { name: "ProjectX",    mark: "Px", live: false, votes: 88   },
  { name: "DXTrade",     mark: "DX", live: true,  votes: 85   },
  { name: "Bitunix",     mark: "Bu", live: false, votes: 19   },
];

// THE DISCLAIMERS LIVE HERE. Two of these are the only place on the product that says it does not
// trade for you and does not give advice. Renamed to FX Copier; the substance is untouched.
const faqs = [
  { q:"Does FX Copier trade for me?",   a:"No. FX Copier is a copy trading tool that mirrors your own trades from a master account to one or more follower accounts. You remain in full control of all trading decisions." },
  { q:"Is this for accounts I own?",    a:"Yes. FX Copier is designed for traders who manage multiple accounts of their own. You must have authorized access to all accounts you connect to the platform." },
  { q:"Which platforms are supported?", a:"MT4, MT5, MatchTrader, cTrader, DXTrade, TradeLocker, and Binance (USDM Futures) are fully supported — all via API, no desktop terminal needed. More platforms are coming soon — vote for your favorites." },
  { q:"Do you provide signals or advice?", a:"No. FX Copier does not provide trading signals, advice, or recommendations. It solely syncs trades between accounts you control." },
  { q:"How are my credentials handled?", a:"Your account credentials are encrypted and stored securely. We use industry-standard encryption and never share your data with third parties." },
  { q:"Are alerts available?",          a:"Yes! You can receive real-time alerts via Telegram or email whenever a trade is copied, modified, or closed across your accounts." },
];

/** Fade sections in as they scroll into view. Scoped to this panel's own nodes, and it disconnects
 *  on unmount — the landing is mounted and unmounted every time the user leaves and returns. */
function useReveal(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const els = document.querySelectorAll(".ts-page .reveal");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.14 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [active]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TradeSyncPage() {
  // Same faces as the new UI. Loaded here too because the landing renders BEFORE that UI mounts.
  useCtFonts();
  // NOT persisted, deliberately. This used to be usePersistedState('ts-copier-v2'), which meant one
  // press of "Start Now" pinned every future visit — and every reload, in every later session — to
  // the copier UI. Combined with there being no exit control anywhere in that UI, the landing page
  // became permanently unreachable. User, 2026-08-08: "it is staying in the UI ... forever."
  // Session state is the right scope: entering is a deliberate act, and leaving or reloading should
  // put you back where you started.
  const [showCopier, setShowCopier] = useState(false);
  const [showDashboard, setShowDashboard] = usePersistedState<null | 'provider' | 'follower'>('ts-dashboard', null);

  // One-time sweep of the key that caused the lock-in. Nothing reads it any more, so leaving it in
  // storage would only confuse whoever finds it next.
  useEffect(() => { try { localStorage.removeItem('ts-copier-v2'); } catch {} }, []);
  const [plan, setPlan] = useState<"monthly"|"yearly">("monthly");
  const [qty, setQty] = useState(3);
  const [openFaq, setOpenFaq] = useState<number|null>(null);
  const [votes, setVotes] = useState<Record<string,{n:number;on:boolean}>>(() => {
    const v: Record<string,{n:number;on:boolean}> = {};
    FX_PLATFORMS.forEach(p => { v[p.name] = { n: p.votes, on: false }; });
    return v;
  });

  const onLanding = !showDashboard && !showCopier;
  useReveal(onLanding);

  const toggleVote = (name: string) =>
    setVotes(v => ({ ...v, [name]: { n: v[name].n + (v[name].on ? -1 : 1), on: !v[name].on } }));

  // WHERE EACH MODE CARD GOES. 'provider'/'follower' open the management dashboard — reachable from
  // the landing for the first time; anything else opens the copier UI, same as Start Now.
  const openMode = (go: null | 'provider' | 'follower' | 'copier') => {
    if (go === 'provider' || go === 'follower') setShowDashboard(go);
    else setShowCopier(true);
  };

  if (showDashboard) return <CopyManagementDashboard initialTab={showDashboard} onBack={() => setShowDashboard(null)} />;
  // "Start Now" opens the NEW Trade Sync UI (features/trade-sync); the old CopierWizard it used to
  // open is retired but still on disk. `panel` re-anchors that UI's viewport-sized frame to
  // Journal's scrolling <main> — see features/trade-sync/styles/panel.ts.
  if (showCopier) return <TradeSyncApp panel onExit={() => setShowCopier(false)} />;

  const perAcct = plan === "monthly" ? 7.5 : 6.0;
  const was     = plan === "monthly" ? 10.0 : 8.0;
  const billed  = plan === "monthly" ? perAcct * qty : perAcct * qty * 12;
  const cycle   = plan === "monthly" ? "/mo" : "/yr";

  return (
    <>
      <style>{landingStyles}</style>
      {/* BOTH CLASSES ARE REQUIRED. `.ts-page` is what exempts this subtree from Journal's
          `font-family: … !important` rule; without it the lucide icons render as text. `.fx` carries
          the styling. See the note at the top of landingStyles. */}
      <div className="ts-page fx">

        {/* INTRO */}
        <header className="intro">
          <div className="fx-wrap">
            <div className="intro-card reveal">
              <span className="intro-ic"><Info size={13} /></span>
              <p className="intro-text">
                <b>What is FX Copier?</b> <span className="dash">—</span> FX Copier is an automated
                copy-trading engine that links multiple brokerage accounts and replicates positions
                in real time. You can operate as a <b className="hl">Provider</b> (broadcasting your
                trades to followers), a <b className="hl">Follower</b> (mirroring a master account with
                configurable lot sizing and risk controls), perform <b className="hl">Self-Copy</b>{" "}
                between your own accounts, or route signals directly from a <b className="hl">Telegram</b>{" "}
                channel. All copying happens through an isolated bridge — no withdrawal permissions or
                sensitive credentials are ever required.
              </p>
            </div>
          </div>
        </header>

        {/* HERO */}
        <section className="hero">
          <div className="fx-wrap hero-grid">
            <div>
              <span className="eyebrow pf"><span className="dot" />Automated trade copying</span>
              <h1><span className="l1">FX Copier</span><span className="l2">mirror every trade.</span></h1>
              <p className="lede">
                Run all of your trading accounts from one place — one master broadcasts,
                every follower copies, automatically and in real time.
              </p>
              <div className="cta-row">
                {/* Buttons, not anchors. The mock linked to #pricing; here "Start now" is the gate
                    into the copier itself, and the ghost button scrolls to the steps below. */}
                <button className="btn btn-blue" onClick={() => setShowCopier(true)}>
                  Start now <ArrowRight size={17} />
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => document.querySelector('.ts-page #how')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  See how it works
                </button>
              </div>
              <div className="trust">
                <ShieldCheck size={18} />
                <span>Every copy runs through an <b>isolated bridge</b> — no withdrawal permissions and no sensitive credentials, ever.</span>
              </div>
            </div>

            {/* THE SIGNATURE — one master mirroring to three followers. Decorative only, so it is
                hidden from screen readers: the lede above already says what it shows. */}
            <div className="dg-outer" aria-hidden="true">
              <div className="diagram">
                <div className="dg-scene">
                  <svg className="wires" viewBox="0 0 460 470" preserveAspectRatio="none">
                    <path className="wire" d="M220 96 C 150 170, 95 250, 90 350" />
                    <path className="wire" d="M220 96 C 220 200, 220 280, 220 366" />
                    <path className="wire" d="M220 96 C 290 170, 345 250, 355 350" />
                  </svg>

                  <div className="node node-master">
                    <div className="row">
                      <span className="ic"><Radio size={17} /></span>
                      <div><div className="lbl">Master account</div><div className="id mono">#1000001</div></div>
                      <span className="tag tag-m">Master</span>
                    </div>
                  </div>

                  <div className="emit" />
                  <div className="pulse p1" /><div className="pulse p2" /><div className="pulse p3" />

                  {[
                    { cls: 'f-a d1', name: 'Follower A', lot: '1.0× lot', ms: '9 ms'  },
                    { cls: 'f-b d2', name: 'Follower B', lot: '0.5× lot', ms: '12 ms' },
                    { cls: 'f-c d3', name: 'Follower C', lot: '2.0× lot', ms: '15 ms' },
                  ].map(f => (
                    <div className={`node node-f recv ${f.cls}`} key={f.name}>
                      <div className="row">
                        <span className="ic"><Users size={15} /></span>
                        <div><div className="lbl" style={{ fontSize: 14 }}>{f.name}</div></div>
                        <span className="tag tag-f">Copy</span>
                      </div>
                      <div className="lot"><span>{f.lot}</span><span className="ms">{f.ms}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MODES */}
        <section className="section" style={{ paddingTop: 40 }}>
          <div className="fx-wrap">
            <div className="modes reveal">
              {MODES.map((m) => (
                <button className="mode" key={m.t} onClick={() => openMode(m.go)}>
                  <span className="mi"><m.icon size={19} /></span>
                  <h3>{m.t}</h3>
                  <p>{m.d}</p>
                  <span className="go">
                    {m.go === 'provider' ? 'Open provider' : m.go === 'follower' ? 'Open follower' : 'Set up'}
                    <ArrowRight size={12} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* HOW */}
        <section className="section" id="how">
          <div className="fx-wrap">
            <div className="sec-head reveal">
              <span className="eyebrow"><span className="dot" />Four steps</span>
              <h2>How <em>FX Copier</em> works</h2>
              <p>Manage many accounts from a single master — everything stays synced in real time.</p>
            </div>
            <div className="steps reveal">
              {STEPS.map((s, i) => (
                <div className="step" key={s.t}>
                  <div className="num">{i + 1}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLATFORMS */}
        <section className="section" id="platforms">
          <div className="fx-wrap">
            <div className="sec-head reveal">
              <span className="eyebrow"><span className="dot" />Supported platforms</span>
              <h2>Copy across <em>every</em> terminal</h2>
              <p>Live on MT4 &amp; MT5 today, with more on the way. Vote for the platform you want next.</p>
            </div>
            <div className="plat-grid reveal">
              {FX_PLATFORMS.map((p) => {
                const v = votes[p.name];
                return (
                  <div className="plat" key={p.name}>
                    <span className={`badge ${p.live ? "b-live" : "b-soon"}`}>{p.live ? "Live" : "Coming soon"}</span>
                    <span className="mono-mark">{p.mark}</span>
                    <span className="pname">{p.name}</span>
                    <div className="vote">
                      <button className={`vbtn ${v.on ? "on" : ""}`} onClick={() => toggleVote(p.name)}>
                        <ChevronUp size={14} />{v.on ? "Voted" : "Vote"}
                      </button>
                      <span className="vcount">{v.n.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FEATURES + PRICING */}
        <section className="section" id="features">
          <div className="fx-wrap fp">
            <div className="reveal">
              <span className="eyebrow"><span className="dot" />Key features &amp; benefits</span>
              <h2 style={{ fontSize: 34, margin: "16px 0 8px" }}>
                Built for<br /><em style={{ fontStyle: "italic", color: "var(--blue-soft)" }}>professional</em> copying
              </h2>
              <div style={{ marginTop: 24 }}>
                {FX_FEATURES.map((f) => (
                  <div className="feat" key={f.t}>
                    <span className="fic"><f.icon size={19} /></span>
                    <div><h3>{f.t}</h3><p>{f.d}</p></div>
                  </div>
                ))}
              </div>
            </div>

            <div id="pricing" className="reveal">
              <div className="price-card">
                <div className="toggle">
                  <button className={plan === "monthly" ? "act" : ""} onClick={() => setPlan("monthly")}>Monthly</button>
                  <button className={plan === "yearly" ? "act" : ""} onClick={() => setPlan("yearly")}>
                    Yearly<span className="save">−20%</span>
                  </button>
                </div>
                <div className="pc-body">
                  <div className="pc-tag">Early-bird pricing</div>
                  <div className="pc-price">
                    <span className="amt">${perAcct.toFixed(2)}</span>
                    <span className="per">per account / month</span>
                  </div>
                  <div className="pc-was"><s>${was.toFixed(2)}</s><b>Limited-time launch price</b></div>
                  <p className="pc-sub">Unlimited trade copying across every supported platform.</p>

                  <div className="qty">
                    <span className="qlbl">Accounts</span>
                    <div className="qctl">
                      <button className="qbtn" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Fewer accounts"><Minus size={15} /></button>
                      <span className="qnum mono">{qty}</span>
                      <button className="qbtn" onClick={() => setQty(q => Math.min(50, q + 1))} aria-label="More accounts"><Plus size={15} /></button>
                    </div>
                  </div>

                  <div className="total">
                    <span>You pay</span>
                    <b>${billed.toFixed(2)}<em> {cycle}</em></b>
                  </div>

                  <button className="btn btn-blue pc-cta" onClick={() => setShowCopier(true)}>
                    Start FX Copier <ArrowRight size={17} />
                  </button>
                  <div className="pc-note"><ShieldCheck size={14} />Secure checkout · cancel anytime</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ — carries the only "not advice / no signals" statements on the product. */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="fx-wrap">
            <div className="sec-head reveal">
              <span className="eyebrow"><span className="dot" />Questions</span>
              <h2>Before you <em>start</em></h2>
              <p>What FX Copier does, and — just as importantly — what it does not.</p>
            </div>
            <div className="faq reveal">
              {faqs.map((f, i) => (
                <div key={f.q} className={`faq-item ${openFaq === i ? "open" : ""}`}>
                  <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    {f.q}<ChevronDown size={17} />
                  </button>
                  <div className="faq-a">{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
