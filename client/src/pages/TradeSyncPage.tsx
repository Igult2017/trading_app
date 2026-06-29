import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, Settings2, Link2, Globe, User, ChevronRight, CheckCircle2,
  Bell, ArrowRight, Radio, Users, GitFork, Scale, Anchor, TrendingUp,
  Rocket, AlertTriangle, Filter, Hash, Send, Zap,
  MessageSquare, Menu, X, Check,
} from 'lucide-react';
import { PiInfoFill } from 'react-icons/pi';
import CopyManagementDashboard from '@/components/CopyManagementDashboard';
import CTraderAccountPicker from '@/components/copy/CTraderAccountPicker';
import TradeSyncNav from '@/components/copy/TradeSyncNav';
import QcShell from '@/components/copy/redesign/QcShell';
import QcRoleStep from '@/components/copy/redesign/QcRoleStep';
import { apiRequest, authFetch } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';

// ─── Fonts ────────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap');`;

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
    className="font-medium transition-all duration-150 inline-flex items-center gap-2 rounded-lg"
    style={{
      height: small ? 34 : 40, padding: small ? '0 14px' : '0 18px', fontSize: 14,
      fontFamily: 'inherit', border: '1px solid transparent', cursor: 'pointer',
      background: active ? 'var(--acc)' : 'var(--s2)',
      color: active ? '#fff' : 'var(--t2)',
      borderColor: active ? 'transparent' : 'var(--b2)',
    }}>
    {children}
  </button>
);

const TInput = ({ label, hint, ...props }: any) => (
  <div className="space-y-1.5">
    <label className="block" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</label>
    {hint && <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t3)' }}>{hint}</p>}
    <input {...props} className="qc-inp mono" />
  </div>
);

const TTextarea = ({ label, hint, ...props }: any) => (
  <div className="space-y-1.5">
    <label className="block" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</label>
    {hint && <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t3)' }}>{hint}</p>}
    <textarea {...props} className="qc-inp mono w-full resize-none" style={{ height: 'auto', minHeight: 96, padding: '10px 12px', lineHeight: 1.5 }} />
  </div>
);

const TSelect = ({ label, hint, options, value, onChange }: any) => (
  <div className="space-y-1.5">
    <label className="block" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</label>
    {hint && <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t3)' }}>{hint}</p>}
    <select value={value} onChange={(e: any) => onChange(e.target.value)} className="qc-inp">
      {options.map((o: any) => <option key={o.value} value={o.value} style={{ background: 'var(--s2)', color: 'var(--t1)' }}>{o.label}</option>)}
    </select>
  </div>
);

const Toggle = ({ label, sub, on, onChange }: any) => (
  <div className="flex items-center justify-between mb-3 rounded-lg" style={{ padding: '12px 14px', background: 'var(--s1)', border: '1px solid var(--b1)' }}>
    <div className="pr-4">
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{label}</div>
      {sub && <div className="mt-0.5" style={{ fontSize: 11, color: 'var(--t3)' }}>{sub}</div>}
    </div>
    <button onClick={() => onChange(!on)} className={`qc-sw${on ? '' : ' off'}`} style={{ border: 'none' }} aria-pressed={!!on} />
  </div>
);

const InfoBox = ({ children, color = 'blue' }: any) => {
  const styles: any = {
    blue:  { border: 'var(--acc-bd)',          bg: 'var(--acc-soft)', color: 'var(--t2)',  ic: 'var(--acc)' },
    amber: { border: 'rgba(245,166,35,.4)',     bg: 'var(--warn-s)',   color: 'var(--t2)',  ic: 'var(--warn)' },
    red:   { border: 'rgba(240,85,107,.4)',     bg: 'var(--bad-s)',    color: 'var(--t2)',  ic: 'var(--bad)' },
    green: { border: 'rgba(47,203,126,.4)',     bg: 'var(--ok-s)',     color: 'var(--t2)',  ic: 'var(--ok)' },
  };
  const s = styles[color] || styles.blue;
  return (
    <div className="flex items-start gap-3 rounded-lg" style={{ padding: '12px 14px', border: `1px solid ${s.border}`, background: s.bg, color: s.color }}>
      <PiInfoFill size={15} className="mt-0.5 flex-shrink-0" style={{ color: s.ic }} />
      <p className="leading-relaxed" style={{ fontSize: 11.5 }}>{children}</p>
    </div>
  );
};

const SectionTitle = ({ step, id, title }: any) => (
  <div style={{ marginBottom: 18 }}>
    <div className="qc-eyebrow">Step {String(step + 1).padStart(2, '0')} · {String(id).toUpperCase()}</div>
    <h1 className="qc-h1" style={{ marginTop: 10 }}>{title}</h1>
  </div>
);

const FeatureCard = ({ title, sub, icon: Icon, active, onClick }: any) => (
  <div onClick={onClick} className="cursor-pointer group rounded-xl transition-all duration-200"
    style={{
      padding: 20,
      border: `1px solid ${active ? 'var(--acc-bd)' : 'var(--b1)'}`,
      background: active ? 'var(--acc-soft)' : 'var(--s1)',
    }}>
    <div className="mb-3 flex items-center justify-center rounded-lg" style={{ width: 40, height: 40, background: active ? 'rgba(91,108,255,.18)' : 'var(--s2)' }}>
      <Icon size={20} style={{ color: active ? 'var(--acc-h)' : 'var(--t2)' }} strokeWidth={1.6} />
    </div>
    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 5, color: active ? 'var(--t1)' : 'var(--t2)' }}>{title}</h3>
    <p className="leading-relaxed" style={{ fontSize: 13, color: 'var(--t3)' }}>{sub}</p>
  </div>
);

// ─── Provider helpers ─────────────────────────────────────────────────────────
const AVATAR_PALETTES = [
  { bg:'rgba(91,108,255,0.14)', border:'rgba(91,108,255,0.30)', color:'#6F7DFF' },
  { bg:'rgba(70,180,230,0.12)', border:'rgba(70,180,230,0.24)', color:'#46B4E6' },
  { bg:'rgba(245,166,35,0.12)', border:'rgba(245,166,35,0.24)', color:'#F5A623' },
  { bg:'rgba(47,203,126,0.12)', border:'rgba(47,203,126,0.24)', color:'#2FCB7E' },
  { bg:'rgba(240,85,107,0.12)', border:'rgba(240,85,107,0.24)', color:'#F0556B' },
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
  const mono = "'JetBrains Mono', monospace";
  const { user } = useAuth();
  const isOwn = !!user?.id && provider.ownerId === user.id;
  const followable = !!provider.followingEnabled && !!provider.masterId;

  const name = provider.name || 'Unnamed Account';
  const avatar = providerAvatar(provider.brokerAccountId || name);
  const initials = providerInitials(name);
  const winRate = provider.winRate;
  const winColor = winRate == null ? 'var(--t3)' : winRate >= 60 ? 'var(--ok)' : winRate >= 45 ? 'var(--warn)' : 'var(--bad)';
  const trades = provider.trades ?? 0;
  const avgRR = provider.avgRR;
  const netPnl = provider.netPnl ?? 0;
  const pnlColor = netPnl > 0 ? 'var(--ok)' : netPnl < 0 ? 'var(--bad)' : 'var(--t2)';
  const instruments: string[] = provider.instruments || [];

  const stats = [
    { label: 'Win rate', value: winRate != null ? `${winRate}%` : '—', color: winColor },
    { label: 'Trades',   value: trades > 0 ? trades.toLocaleString() : '—', color: 'var(--t1)' },
    { label: 'Avg RR',   value: avgRR != null ? avgRR.toFixed(2) : '—', color: 'var(--t1)' },
    { label: 'Net P/L',  value: trades > 0 ? `${netPnl >= 0 ? '+' : ''}${netPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—', color: pnlColor },
  ];
  const badge = isOwn
    ? { t: 'Your account', c: 'qc-b-tg' }
    : followable ? { t: 'Copyable', c: 'qc-b-live' }
                 : { t: 'Not enabled', c: 'qc-b-demo' };

  const pick = () => { if (followable && !isOwn) onSelect(provider.masterId); };

  return (
    <div onClick={pick}
      className={`rounded-xl transition-all duration-200 flex flex-col ${followable && !isOwn ? 'cursor-pointer' : 'opacity-80'}`}
      style={{ padding: 20, border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--b1)'}`, background: selected ? 'var(--acc-soft)' : 'var(--s1)' }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, fontFamily: mono, background: avatar.bg, border: `1px solid ${avatar.border}`, color: avatar.color, flexShrink: 0 }}>{initials}</div>
          <div className="min-w-0">
            <h3 className="truncate" style={{ fontSize: 15, fontWeight: 600, color: selected ? 'var(--t1)' : 'var(--t2)' }}>{name}</h3>
            <p className="mono uppercase tracking-wider" style={{ fontSize: 10, color: 'var(--t3)' }}>{provider.platform} · {provider.accountType || 'demo'}</p>
          </div>
        </div>
        <span className={`qc-badge ${badge.c} flex-shrink-0`}>{badge.t}</span>
      </div>

      <div className="grid grid-cols-4 gap-px mb-3 rounded-lg overflow-hidden" style={{ background: 'var(--b1)', border: '1px solid var(--b1)' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--inset)', padding: 8 }}>
            <div className="mono" style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: '3px' }}>{s.label}</div>
            <div className="mono" style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {instruments.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {instruments.slice(0, 6).map(sym => (
            <span key={sym} className="mono rounded px-1.5 py-0.5" style={{ fontSize: 9, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--b1)' }}>{sym}</span>
          ))}
        </div>
      )}

      {isOwn ? (
        <div className="w-full py-2 text-center uppercase tracking-[0.12em] mono rounded-lg" style={{ fontSize: 10, fontWeight: 700, color: 'var(--info)', border: '1px solid var(--b1)' }}>
          Your account — use Self-Copy
        </div>
      ) : followable ? (
        <button onClick={(e: any) => { e.stopPropagation(); onSelect(provider.masterId); }}
          className="w-full py-2 uppercase tracking-[0.12em] mono transition-all duration-150 rounded-lg"
          style={{ fontSize: 10, fontWeight: 700, border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--b2)'}`, background: selected ? 'var(--acc-soft)' : 'transparent', color: selected ? 'var(--acc-h)' : 'var(--t2)' }}>
          {selected ? '● copying this account' : 'follow this account'}
        </button>
      ) : (
        <div className="w-full py-2 text-center uppercase tracking-[0.12em] mono rounded-lg" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', border: '1px solid var(--b1)' }}>
          Following not enabled
        </div>
      )}
    </div>
  );
};

const StatusDot = ({ status }: any) => {
  const s = (({ ready:{color:'var(--ok)',shadow:'0 0 6px rgba(47,203,126,0.5)',label:'Ready'}, pending:{color:'var(--warn)',shadow:'none',label:'Pending'}, inactive:{color:'var(--t4)',shadow:'none',label:'Not verified'} } as Record<string,{color:string;shadow:string;label:string}>)[status as string]) || {color:'var(--t4)',shadow:'none',label:'—'};
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:s.color, boxShadow:s.shadow, display:'inline-block', flexShrink:0 }} />
      <span className="mono" style={{ fontSize:'11px', color:s.color }}>{s.label}</span>
    </span>
  );
};

// ─── STEPS ────────────────────────────────────────────────────────────────────
const StepRole = ({ data, setData, onNext }: any) => (
  <div className="border border-white/5">
    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5 border-b border-white/5">
      <FeatureCard icon={Radio}         title="Signal Provider"  active={data.role==='provider'} onClick={() => { setData({...data,role:'provider'}); onNext(); }} sub="Master account. Broadcast your trades to followers in real-time." />
      <FeatureCard icon={Users}         title="Copy Follower"    active={data.role==='follower'} onClick={() => { setData({...data,role:'follower'}); onNext(); }} sub="Follow a verified provider. Trades mirror automatically." />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
      <FeatureCard icon={GitFork}       title="Self-Copy"         active={data.role==='self'}     onClick={() => { setData({...data,role:'self'}); onNext(); }}     sub="Duplicate trades between your own accounts on any broker." />
      <FeatureCard icon={MessageSquare} title="Telegram Signals"  active={data.role==='telegram'} onClick={() => { setData({...data,role:'telegram',platform:'cTrader',lotMode:data.lotMode==='risk'?'risk':'fixed'}); onNext(); }} sub="Parse and auto-execute signals from a Telegram channel." accent="text-sky-400" />
    </div>
    <div className="border-t border-white/5">
      <FeatureCard icon={Send} title="Telegram — My Account (Advanced)" active={data.role==='relay'} onClick={() => { setData({...data,role:'relay',platform:'cTrader',lotMode:data.lotMode==='risk'?'risk':'fixed'}); onNext(); }} sub="Copy ANY channel you're subscribed to via your own Telegram account — no bot or listing needed. Requires authorizing your account." accent="text-amber-400" />
    </div>
  </div>
);

const StepConnect = ({ data, setData, label = "Trading Account" }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-6 md:space-y-8" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      {(data.role!=='telegram' && data.role!=='relay') && (
      <div className="space-y-2">
        <label className="block" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>Platform Type</label>
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          {["MT4","MT5","cTrader","Proprietary"].map(p => (
            <button key={p} onClick={() => setData({...data,platform:p})}
              className="py-3 px-4 uppercase tracking-widest transition-all flex items-center justify-between rounded-lg"
              style={{
                fontSize: 11, fontWeight: 600,
                border: `1px solid ${data.platform===p ? 'var(--acc-bd)' : 'var(--b2)'}`,
                background: data.platform===p ? 'var(--acc-soft)' : 'var(--s2)',
                color: data.platform===p ? 'var(--acc-h)' : 'var(--t3)',
              }}>
              {p}{data.platform===p && <CheckCircle2 size={12} />}
            </button>
          ))}
        </div>
      </div>
      )}
      {(data.platform==='cTrader' || data.role==='telegram' || data.role==='relay') ? (
        <CTraderAccountPicker value={data.brokerAccountId} onChange={(id: string) => setData({ ...data, brokerAccountId: id })} label={`${label} (cTrader)`} />
      ) : data.platform==='Proprietary' ? (
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
    <div className="rounded-xl flex flex-col gap-4 md:gap-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      {data.platform==='cTrader' ? (
        <>
          <div className="rounded-lg" style={{ padding: 16, border: '1px solid rgba(47,203,126,.4)', background: 'var(--ok-s)' }}>
            <div className="flex items-center gap-3 mb-3" style={{ color: 'var(--ok)' }}>
              <ShieldCheck size={16} strokeWidth={1.5} />
              <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>OAuth Secured</span>
            </div>
            <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t2)' }}>cTrader connects through Spotware's official OAuth — you sign in on cTrader's own page. We hold a revocable access token, never your password, and you can revoke it any time from cTrader.</p>
          </div>
          <div className="rounded-lg" style={{ padding: 16, border: '1px solid var(--b1)', background: 'var(--inset)' }}>
            <span className="mono uppercase tracking-widest block mb-4" style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)' }}>// how_copying_works</span>
            <ol className="space-y-3">
              {['Pick the connected account this terminal uses','Fills mirror in real time via the cTrader Open API','Risk limits & filters apply before every order'].map((t, i) => (
                <li key={i} className="flex gap-3 leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t2)' }}>
                  <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: 9, fontWeight: 700, background: 'var(--acc-soft)', color: 'var(--acc-h)' }}>{i+1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg" style={{ padding: 16, border: '1px solid var(--b1)', background: 'var(--inset)' }}>
            <div className="flex items-center gap-3 mb-3 md:mb-4" style={{ color: 'var(--acc)' }}>
              <Shield size={16} strokeWidth={1.5} />
              <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>Security Protocol</span>
            </div>
            <p className="leading-relaxed italic" style={{ fontSize: 12, color: 'var(--t3)' }}>TradeSync uses isolated bridge technology to monitor your margin and mirror executions. No withdrawal or sensitive personal data permissions are ever required.</p>
          </div>
          <div className="rounded-lg" style={{ padding: 16, border: '1px solid var(--b1)', background: 'var(--inset)' }}>
            <span className="mono uppercase tracking-widest block mb-3 md:mb-4" style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)' }}>// connection_status</span>
            <div>
              {[{label:'Bridge',status:'ready'},{label:'Broker server',status:'pending'},{label:'Login ID',status:'inactive'}].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2.5" style={{ borderTop: '1px solid var(--b1)' }}>
                  <span className="mono" style={{ fontSize:'11px', color:'var(--t3)' }}>{row.label}</span>
                  <StatusDot status={row.status} />
                </div>
              ))}
              <div className="flex items-center justify-between py-2.5" style={{ borderTop: '1px solid var(--b1)' }}>
                <span className="mono" style={{ fontSize:'11px', color:'var(--t3)' }}>Latency</span>
                <span className="mono" style={{ fontSize:'11px', color:'var(--t4)' }}>— ms</span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg" style={{ padding: 14, border: '1px solid var(--acc-bd)', background: 'var(--acc-soft)' }}>
            <PiInfoFill size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--acc)' }} />
            <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t2)' }}>Use your <span style={{ color: 'var(--t1)', fontWeight: 600 }}>investor (read-only) password</span> — never your master password.</p>
          </div>
        </>
      )}
    </div>
  </div>
);

const StepLink = ({ data, setData, providers, providersLoading }: any) => {
  const mono = "'JetBrains Mono', monospace";
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
    <div className="w-full space-y-6 md:space-y-8">
      <TInput
        label="Browse Accounts"
        placeholder="Filter by name, platform, or instrument…"
        value={search}
        onChange={(e: any) => setSearch(e.target.value)}
      />
      <div className="space-y-4">
        <div className="mono uppercase" style={{ fontSize:'10px', fontWeight:700, letterSpacing:'0.18em', color:'var(--t3)' }}>
          // verified_providers
        </div>

        {providersLoading ? (
          <div className="rounded-xl p-10 flex items-center justify-center gap-3" style={{ border: '1px solid var(--b1)', background: 'var(--s1)' }}>
            <div className="w-4 h-4 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--acc)', borderTopColor: 'transparent' }} />
            <span className="mono" style={{ fontSize:'11px', color:'var(--t3)' }}>loading providers…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl p-10 text-center space-y-3" style={{ border: '1px solid var(--b1)', background: 'var(--s1)' }}>
            <div className="mono" style={{ fontSize:'11px', color:'var(--t3)' }}>
              {search.trim()
                ? `// no_providers_match "${search}"`
                : '// no_public_providers_registered'}
            </div>
            {!search.trim() && (
              <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                Be the first — register as a Signal Provider using the role selector above.
              </p>
            )}
          </div>
        ) : (
          <div className={`grid gap-3 ${filtered.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
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
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-6 md:space-y-8" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// symbol_filters</span>
      <InfoBox>Leave blank to copy everything from the provider. Filters only restrict — they never add symbols.</InfoBox>
      <TInput label="Symbol Whitelist" hint="Only copy trades on these symbols. Comma-separated." placeholder="EURUSD, XAUUSD, BTCUSD" value={data.whitelist??''} onChange={(e:any)=>setData({...data,whitelist:e.target.value})} />
      <TInput label="Symbol Blacklist" hint="Never copy trades on these symbols even if the provider opens them." placeholder="GBPJPY, USDZAR" value={data.blacklist??''} onChange={(e:any)=>setData({...data,blacklist:e.target.value})} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <TInput label="Max Open Trades"  hint="Cap on simultaneous copied positions." placeholder="10" type="number" value={data.maxOpenTrades??''} onChange={(e:any)=>setData({...data,maxOpenTrades:e.target.value})} />
        <TInput label="Trade Delay (sec)" hint="Buffer before a copied trade executes." placeholder="0" type="number" value={data.tradeDelay??''} onChange={(e:any)=>setData({...data,tradeDelay:e.target.value})} />
      </div>
    </div>
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// auto_pause_conditions</span>
      <Toggle label="Pause if provider hasn't traded in 7 days" sub="Prevents copying stale or abandoned signals" on={data.pauseInactive??true} onChange={(v: any) => setData({...data,pauseInactive:v})} />
      <Toggle label="Pause if my drawdown exceeds threshold"    sub="Set your drawdown limit in the Shield step"  on={data.pauseDD??true}       onChange={(v: any) => setData({...data,pauseDD:v})} />
      <Toggle label="Only copy during market sessions"          sub="Restrict copying to selected trading hours"  on={data.sessionFilter??false} onChange={(v: any) => setData({...data,sessionFilter:v})} />
      {data.sessionFilter && (
        <div className="space-y-3 pl-4" style={{ borderLeft: '1px solid var(--acc-bd)' }}>
          {['London (08:00–17:00 GMT)','New York (13:00–22:00 GMT)','Asia (00:00–09:00 GMT)'].map(s => (
            <Toggle key={s} label={s} on={data[`session_${s}`]??false} onChange={(v: any) => setData({...data,[`session_${s}`]:v})} />
          ))}
        </div>
      )}
    </div>
  </div>
);

const StepCopy = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="space-y-3">
      {(data.role!=='telegram' && data.role!=='relay') && <FeatureCard icon={Scale} title="Balance Multiplier" active={data.lotMode==='mult'}  onClick={() => setData({...data,lotMode:'mult'})}  sub="Scale lot relative to account size. Recommended for most users." />}
      <FeatureCard icon={Anchor}     title="Fixed Lot Size"     active={data.lotMode==='fixed'} onClick={() => setData({...data,lotMode:'fixed'})} sub="Always open a fixed lot regardless of the provider's size." />
      <FeatureCard icon={TrendingUp} title="Equity Risk %"      active={data.lotMode==='risk'}  onClick={() => setData({...data,lotMode:'risk'})}  sub="Dynamic sizing based on free margin and stop-loss distance." />
    </div>
    <div className="rounded-xl flex flex-col justify-center space-y-6 md:space-y-8" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>
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
      <div className="rounded-lg" style={{ padding: 14, border: '1px solid var(--b1)', background: 'var(--inset)' }}>
        <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>
          {data.lotMode==='mult'  && 'Best for accounts with a similar balance to the provider. The engine scales proportionally so risk stays consistent.'}
          {data.lotMode==='fixed' && 'Best for micro/cent accounts or when you want full manual control over position sizing.'}
          {data.lotMode==='risk'  && 'Best for accounts of any size. Lot is recalculated on every trade based on current equity and the stop-loss distance.'}
        </p>
      </div>
    </div>
  </div>
);

const StepProtect = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-6 md:space-y-8" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <TInput label="Global Drawdown (%)" hint="Stop all copying if total account drawdown exceeds this." placeholder="5.0" type="number" value={data.maxDdPercent??''} onChange={(e:any)=>setData({...data,maxDdPercent:e.target.value})} />
      <TInput label="Max Daily Loss ($)"  hint="Halt copying for the rest of the day if this dollar loss is hit." placeholder="1000" type="number" value={data.maxDailyLoss??''} onChange={(e:any)=>setData({...data,maxDailyLoss:e.target.value})} />
      <div className="pt-6 space-y-6" style={{ borderTop: '1px solid var(--b1)' }}>
        <div className="space-y-2">
          <label className="block" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>Symbol Prefix</label>
          <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>Characters your broker adds <span style={{ color: 'var(--t2)' }}>before</span> the symbol name.</p>
          <input type="text" placeholder="e.g. .m" value={data.symbolPrefix??''} onChange={(e:any)=>setData({...data,symbolPrefix:e.target.value})} className="qc-inp mono" />
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="mono px-2 py-1 rounded" style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--s2)', border: '1px solid var(--b1)' }}>EURUSD</span>
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>→</span>
            <span className="mono px-2 py-1 rounded" style={{ fontSize: 10, color: 'var(--acc-h)', background: 'var(--acc-soft)', border: '1px solid var(--acc-bd)' }}>.mEURUSD</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="block" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>Symbol Suffix</label>
          <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>Characters your broker adds <span style={{ color: 'var(--t2)' }}>after</span> the symbol name.</p>
          <input type="text" placeholder="e.g. +f" value={data.symbolSuffix??''} onChange={(e:any)=>setData({...data,symbolSuffix:e.target.value})} className="qc-inp mono" />
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="mono px-2 py-1 rounded" style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--s2)', border: '1px solid var(--b1)' }}>EURUSD</span>
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>→</span>
            <span className="mono px-2 py-1 rounded" style={{ fontSize: 10, color: 'var(--acc-h)', background: 'var(--acc-soft)', border: '1px solid var(--acc-bd)' }}>EURUSD+f</span>
          </div>
        </div>
        <InfoBox>Leave prefix/suffix blank if unsure — most brokers don't need them.</InfoBox>
      </div>
    </div>
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// safety_notifications</span>
      <Toggle label="Disconnection Alert" sub="Alert if bridge loses server connection"   on={data.notif1??true} onChange={(v: any) => setData({...data,notif1:v})} />
      <Toggle label="Execution Fail"      sub="Alert when an order is rejected by broker" on={data.notif2??true} onChange={(v: any) => setData({...data,notif2:v})} />
      <Toggle label="Drawdown Warning"    sub="Alert at 80% of your drawdown threshold"   on={data.notif3??true} onChange={(v: any) => setData({...data,notif3:v})} />
      <Toggle label="Daily Loss Warning"  sub="Alert at 80% of your daily loss limit"      on={data.notif4??true} onChange={(v: any) => setData({...data,notif4:v})} />
    </div>
  </div>
);

const StepRisk = ({ data, setData, isProvider }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <div className="space-y-3 rounded-lg" style={{ padding: 16, border: '1px solid rgba(240,85,107,.4)', background: 'var(--bad-s)' }}>
        <div className="flex items-center gap-3" style={{ color: 'var(--bad)' }}>
          <AlertTriangle size={16} />
          <span className="uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>{isProvider?'Provider Liability Disclosure':'Risk Warning'}</span>
        </div>
        <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t2)' }}>
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
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// what_this_means</span>
      {[
        { icon:Shield,        title:'Your account is your responsibility', body:'TradeSync executes trades on your behalf but you remain the account holder. Always monitor open positions.' },
        { icon:AlertTriangle, title:'Past results are not a guarantee',    body:"A provider's historical win rate does not predict future performance. Markets change." },
        { icon:TrendingUp,    title:'Only risk what you can afford',        body:'Never fund a copy trading account with money needed for living expenses or other obligations.' },
      ].map(({ icon:Icon, title, body }) => (
        <div key={title} className="flex items-start gap-3 rounded-lg" style={{ padding: 14, border: '1px solid var(--b1)', background: 'var(--inset)' }}>
          <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--t3)' }} strokeWidth={1.5} />
          <div>
            <p className="mb-1" style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{title}</p>
            <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>{body}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StepStrategy = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-6 md:space-y-8" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <TInput label="Strategy Name / Nickname" hint="Public-facing name followers will see on your profile." placeholder="e.g. Quantum Swing EA v3" value={data.strategyName??''} onChange={(e:any)=>setData({...data,strategyName:e.target.value})} />
      <TTextarea label="Strategy Description" hint="Describe your trading approach so followers know what to expect." placeholder="Describe your edge, timeframes, risk management approach..." rows={4} value={data.strategyDescription??''} onChange={(e:any)=>setData({...data,strategyDescription:e.target.value})} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <TSelect label="Trading Style" hint="Primary style that best describes your approach."
          options={[{value:'scalp',label:'Scalping (< 1 hour)'},{value:'intraday',label:'Intraday (same-day)'},{value:'swing',label:'Swing (multi-day)'},{value:'position',label:'Position (weeks/months)'},{value:'hft',label:'High-Frequency (HFT)'}]}
          value={data.tradingStyle??'swing'} onChange={(v: any) => setData({...data,tradingStyle:v})} />
        <TSelect label="Primary Markets" hint="Markets you primarily trade."
          options={[{value:'fx',label:'Forex (FX)'},{value:'crypto',label:'Cryptocurrency'},{value:'stocks',label:'Stocks / Indices'},{value:'commodities',label:'Commodities'},{value:'mixed',label:'Mixed / All markets'}]}
          value={data.primaryMarket??'fx'} onChange={(v: any) => setData({...data,primaryMarket:v})} />
      </div>
      <TInput label="Typical Symbols Traded" hint="Comma-separated list of instruments your strategy focuses on." placeholder="EURUSD, XAUUSD, GBPUSD" value={data.typicalSymbols??''} onChange={(e:any)=>setData({...data,typicalSymbols:e.target.value})} />
    </div>
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// active_trading_sessions</span>
      <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>Let followers know which market sessions you actively trade.</p>
      {['London (08:00–17:00 GMT)','New York (13:00–22:00 GMT)','Asia (00:00–09:00 GMT)'].map(s => (
        <Toggle key={s} label={s} on={data[`prov_session_${s}`]??false} onChange={(v: any) => setData({...data,[`prov_session_${s}`]:v})} />
      ))}
    </div>
  </div>
);

const StepLimits = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-6 md:space-y-8" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// trade_limits</span>
      <InfoBox>These limits protect your followers from overexposure and help them size positions correctly.</InfoBox>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <TInput label="Max Lot Size Per Signal"    hint="Highest lot you will ever broadcast."              placeholder="1.00" type="number" value={data.maxLotSize??''}          onChange={(e:any)=>setData({...data,maxLotSize:e.target.value})} />
        <TInput label="Max Open Trades at Once"    hint="Maximum simultaneous positions you'll carry."      placeholder="5"    type="number" value={data.provMaxOpenTrades??''}   onChange={(e:any)=>setData({...data,provMaxOpenTrades:e.target.value})} />
        <TInput label="Typical Stop-Loss (pips)"   hint="Average SL distance per trade."                   placeholder="30"   type="number" value={data.typicalSL??''}           onChange={(e:any)=>setData({...data,typicalSL:e.target.value})} />
        <TInput label="Typical Take-Profit (pips)" hint="Average TP distance."                             placeholder="60"   type="number" value={data.typicalTP??''}           onChange={(e:any)=>setData({...data,typicalTP:e.target.value})} />
      </div>
    </div>
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// signal_visibility</span>
      <Toggle label="Make profile publicly discoverable"         sub="Appear in the verified providers list for all users" on={data.isPublic??true}         onChange={(v: any) => setData({...data,isPublic:v})} />
      <Toggle label="Require approval before followers can copy" sub="You manually approve each follower request"          on={data.requireApproval??false} onChange={(v: any) => setData({...data,requireApproval:v})} />
      <Toggle label="Show live open trades to followers"         sub="Followers can see your current open positions"       on={data.showOpenTrades??true}   onChange={(v: any) => setData({...data,showOpenTrades:v})} />
    </div>
  </div>
);

const StepProviderNotif = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <TInput label="Notification Email" hint="Where to receive follower and performance alerts." placeholder="you@example.com" type="email" value={data.notifEmail??''} onChange={(e:any)=>setData({...data,notifEmail:e.target.value})} />
      <div className="pt-4 space-y-3" style={{ borderTop: '1px solid var(--b1)' }}>
        <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// alert_events</span>
        <Toggle label="New follower joined"           sub="Alert when someone starts copying you"           on={data.nNewFollower??true} onChange={(v: any) => setData({...data,nNewFollower:v})} />
        <Toggle label="Follower stopped copying"      sub="Alert when someone disconnects from your signal" on={data.nDropped??true}     onChange={(v: any) => setData({...data,nDropped:v})} />
        <Toggle label="Execution failure on follower" sub="Alert if a follower's copy trade was rejected"   on={data.nExecFail??true}    onChange={(v: any) => setData({...data,nExecFail:v})} />
        <Toggle label="Bridge disconnection"          sub="Alert if your bridge loses server connection"    on={data.nDisconnect??true}  onChange={(v: any) => setData({...data,nDisconnect:v})} />
        <Toggle label="Weekly performance digest"     sub="A weekly summary of your follower performance"   on={data.nWeekly??false}     onChange={(v: any) => setData({...data,nWeekly:v})} />
      </div>
    </div>
    <div className="rounded-xl space-y-4 md:space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// delivery_info</span>
      <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>All alerts are delivered to your notification email. You can update this at any time from your provider dashboard.</p>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="rounded-xl" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="qc-badge" style={{ color: 'var(--acc-h)', background: 'var(--acc-soft)' }}>Source</span>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>copy from</span>
        </div>
        <CTraderAccountPicker value={data.brokerAccountId} excludeId={data.brokerAccountId2} onChange={(id: string) => setData({ ...data, platform: 'cTrader', brokerAccountId: id })} label="Source cTrader account" />
      </div>
      <div className="rounded-xl" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="qc-badge qc-b-live">Target</span>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>copy to</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div onClick={() => setData({...data,copyAllSymbols:true})}
          className="cursor-pointer transition-all duration-200 rounded-xl"
          style={{ padding: 20, border: `1px solid ${copyAll?'var(--acc-bd)':'var(--b1)'}`, background: copyAll?'var(--acc-soft)':'var(--s1)' }}>
          <div className="flex items-start gap-4">
            <div className="mt-1 w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center" style={{ border: `2px solid ${copyAll?'var(--acc)':'var(--t3)'}` }}>
              {copyAll && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--acc)' }} />}
            </div>
            <div>
              <p className="mb-1" style={{ fontSize: 14, fontWeight: 600, color: copyAll?'var(--t1)':'var(--t2)' }}>Copy everything</p>
              <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>Mirror all symbols traded on the source account automatically.</p>
            </div>
          </div>
        </div>
        <div onClick={() => setData({...data,copyAllSymbols:false})}
          className="cursor-pointer transition-all duration-200 rounded-xl"
          style={{ padding: 20, border: `1px solid ${!copyAll?'var(--acc-bd)':'var(--b1)'}`, background: !copyAll?'var(--acc-soft)':'var(--s1)' }}>
          <div className="flex items-start gap-4">
            <div className="mt-1 w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center" style={{ border: `2px solid ${!copyAll?'var(--acc)':'var(--t3)'}` }}>
              {!copyAll && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--acc)' }} />}
            </div>
            <div>
              <p className="mb-1" style={{ fontSize: 14, fontWeight: 600, color: !copyAll?'var(--t1)':'var(--t2)' }}>Custom symbol mapping</p>
              <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t3)' }}>Specify exactly which symbols to copy and rename them if needed.</p>
            </div>
          </div>
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
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>Source Symbol</span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>Target Symbol</span>
          </div>
          {(data.symbolMaps??[{from:'',to:''},{from:'',to:''}]).map((m: any,i: number) => (
            <div key={i} className="grid grid-cols-2 gap-4 md:gap-8 items-center">
              <input placeholder="e.g. XAUUSD" value={m.from}
                onChange={(e: any) => { const maps=[...(data.symbolMaps??[])]; maps[i]={...maps[i],from:e.target.value}; setData({...data,symbolMaps:maps}); }}
                className="qc-inp mono" />
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0" style={{ fontSize: 12, color: 'var(--t3)' }}>→</span>
                <input placeholder="e.g. GOLD" value={m.to}
                  onChange={(e: any) => { const maps=[...(data.symbolMaps??[])]; maps[i]={...maps[i],to:e.target.value}; setData({...data,symbolMaps:maps}); }}
                  className="qc-inp mono" />
                {(data.symbolMaps??[]).length > 1 && (
                  <button onClick={() => setData({...data,symbolMaps:(data.symbolMaps??[]).filter((_: any,idx: number)=>idx!==i)})}
                    className="transition-colors flex-shrink-0 mono" style={{ fontSize: 12, color: 'var(--t3)' }}>✕</button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => setData({...data,symbolMaps:[...(data.symbolMaps??[]),{from:'',to:''}]})}
            className="uppercase tracking-widest transition-all rounded-lg px-4 py-2"
            style={{ fontSize: 10, color: 'var(--acc-h)', border: '1px solid var(--acc-bd)', background: 'var(--acc-soft)' }}>
            + Add Symbol
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 pt-6" style={{ borderTop: '1px solid var(--b1)' }}>
        <div className="space-y-6 md:pr-8">
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
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    {/* STEP 1 — add the bot (this is what grants access) */}
    <div className="rounded-xl space-y-5" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <div className="flex items-center gap-3" style={{ color: 'var(--info)' }}>
        <Send size={16} strokeWidth={1.5} />
        <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>Step 1 · Add our bot</span>
      </div>
      <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t2)' }}>Adding the bot as a channel admin is what grants access — no phone number, API keys or OTP. It then reads new signals automatically and securely.</p>
      <div className="rounded-lg flex items-center justify-between gap-3" style={{ padding: 12, border: '1px solid var(--b2)', background: 'var(--s2)' }}>
        <span className="mono select-all" style={{ fontSize: 14, color: 'var(--info)' }}>{TG_COPY_BOT}</span>
        <span className="mono uppercase tracking-widest" style={{ fontSize: 9, color: 'var(--t3)' }}>copy bot</span>
      </div>
      <ol className="space-y-3">
        {[
          <>In Telegram, open your channel → <span style={{ color: 'var(--t1)' }}>Manage → Administrators</span></>,
          <>Tap <span style={{ color: 'var(--t1)' }}>Add Admin</span>, search <span className="mono" style={{ color: 'var(--info)' }}>{TG_COPY_BOT}</span> and add it (read access is enough)</>,
        ].map((t, i) => (
          <li key={i} className="flex gap-3 leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t2)' }}>
            <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: 9, fontWeight: 700, background: 'var(--info-s)', color: 'var(--info)' }}>{i + 1}</span>{t}
          </li>
        ))}
      </ol>
    </div>
    {/* STEP 2 — identify the channel */}
    <div className="rounded-xl space-y-6" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <div className="flex items-center gap-3" style={{ color: 'var(--info)' }}>
        <Hash size={16} strokeWidth={1.5} />
        <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>Step 2 · Which channel?</span>
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
  const confColor = parsed ? (parsed.confidence === 'High' ? 'var(--ok)' : parsed.confidence === 'Medium' ? 'var(--warn)' : 'var(--bad)') : 'var(--t3)';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="rounded-xl space-y-6" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// parser_settings</span>
        <InfoBox color="green">The parser auto-detects symbol, side, entry, SL and TP for most channels. Only set keywords below if your channel uses an unusual format.</InfoBox>
        <div className="grid grid-cols-2 gap-4 md:gap-5">
          <TInput label="Entry keyword"  placeholder="auto" value={data.tgEntryKw??''}  onChange={(e:any)=>setData({...data,tgEntryKw:e.target.value})} />
          <TInput label="SL keyword"     placeholder="auto" value={data.tgSlKw??''}     onChange={(e:any)=>setData({...data,tgSlKw:e.target.value})} />
          <TInput label="TP keyword"     placeholder="auto" value={data.tgTpKw??''}     onChange={(e:any)=>setData({...data,tgTpKw:e.target.value})} />
          <TInput label="Symbol keyword" placeholder="auto" value={data.tgSymbolKw??''} onChange={(e:any)=>setData({...data,tgSymbolKw:e.target.value})} />
        </div>
        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--b1)' }}>
          <Toggle label="Execute without a Stop-Loss" sub="Open even if the signal has no SL (riskier)" on={data.tgNoSL??false}   onChange={(v:any)=>setData({...data,tgNoSL:v})} />
          <Toggle label="Use first TP only"            sub="For multi-TP signals, target TP1"           on={data.tgFirstTP??true} onChange={(v:any)=>setData({...data,tgFirstTP:v})} />
        </div>
      </div>
      <div className="rounded-xl space-y-4" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// live_test</span>
        <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t3)' }}>Paste a real message from the channel to preview how it parses. <span style={{ color: 'var(--t4)' }}>Final parsing runs server-side.</span></p>
        <textarea value={sample}
          onChange={(e) => { setSample(e.target.value); setData({ ...data, testMessage: e.target.value }); }}
          placeholder={"BUY EURUSD @ 1.0950\nSL 1.0900\nTP 1.1000"}
          className="qc-inp mono w-full resize-none" style={{ height: 112, padding: 12, lineHeight: 1.5, fontSize: 13 }} />
        {parsed ? (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--b1)' }}>
            {[['Symbol', parsed.symbol], ['Side', parsed.direction], ['Entry', parsed.entry], ['Stop-loss', parsed.sl], ['Take-profit', parsed.tp1], ['Confidence', parsed.confidence]].map(([k, v], idx) => (
              <div key={k as string} className="flex items-center justify-between px-3 py-2" style={idx > 0 ? { borderTop: '1px solid var(--b1)' } : undefined}>
                <span className="mono uppercase tracking-wider" style={{ fontSize: 10, color: 'var(--t3)' }}>{k}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: k === 'Confidence' ? confColor : 'var(--t1)' }}>{v}</span>
              </div>
            ))}
          </div>
        ) : sample.trim() ? (
          <div className="rounded-lg" style={{ padding: 12, border: '1px solid rgba(240,85,107,.4)', background: 'var(--bad-s)', fontSize: 11, color: 'var(--bad)' }}>No signal detected — check the message or set keywords on the left.</div>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="rounded-xl space-y-6" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// authorize_telegram</span>
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
          <div className="flex items-center gap-3 rounded-lg" style={{ padding: 16, border: '1px solid rgba(47,203,126,.4)', background: 'var(--ok-s)', color: 'var(--ok)' }}>
            <CheckCircle2 size={16} /><span style={{ fontSize: 12, fontWeight: 600 }}>Telegram account authorized.</span>
          </div>
        )}
        {err && <InfoBox color="amber">{err}</InfoBox>}
      </div>
      <div className="rounded-xl space-y-4" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <div className="flex items-center gap-3" style={{ color: 'var(--warn)' }}><Shield size={16} strokeWidth={1.5} /><span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>Advanced · your session</span></div>
        <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t2)' }}>This authorizes <span style={{ color: 'var(--t1)' }}>your own</span> Telegram account so the engine can read the channels you're subscribed to — including ones our bot can't join. No channel-owner involvement needed.</p>
        <ul className="space-y-2 leading-relaxed list-disc pl-4" style={{ fontSize: 11.5, color: 'var(--t3)' }}>
          <li>Your session is encrypted and used only to read the channels you choose.</li>
          <li>Automated user sessions are a Telegram grey area — use an account you're comfortable with.</li>
          <li>Revoke any time from Telegram → Settings → Devices.</li>
        </ul>
      </div>
    </div>
  );
};

const StepRelayChannel = ({ data, setData }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <div className="rounded-xl space-y-6" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// channel_to_copy</span>
      <TInput label="Channel @username or ID" hint="Any channel YOUR account is subscribed to. @username for public, numeric -100… id for private." placeholder="@forex_signals" value={data.relayChannel??''} onChange={(e:any)=>setData({...data,relayChannel:e.target.value})} />
      <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--b1)' }}>
        <Toggle label="Execute without a Stop-Loss" sub="Open even if the signal has no SL (riskier)" on={data.tgNoSL??false}   onChange={(v:any)=>setData({...data,tgNoSL:v})} />
        <Toggle label="Use first TP only"            sub="For multi-TP signals, target TP1"           on={data.tgFirstTP??true} onChange={(v:any)=>setData({...data,tgFirstTP:v})} />
      </div>
    </div>
    <div className="rounded-xl space-y-4" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
      <span className="mono uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>// note</span>
      <p className="leading-relaxed" style={{ fontSize: 12, color: 'var(--t2)' }}>You must already be subscribed to this channel on the Telegram account you authorized. The relay reads new posts as they arrive and mirrors valid signals to your cTrader account.</p>
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
      tradingStyle:      data.tradingStyle,
      primaryMarket:     data.primaryMarket,
      isPublic:          data.isPublic ?? true,
      requireApproval:   data.requireApproval ?? false,
      showOpenTrades:    data.showOpenTrades ?? true,
      maxLotSize:        data.maxLotSize        || undefined,
      provMaxOpenTrades: data.provMaxOpenTrades  ? parseInt(data.provMaxOpenTrades) : undefined,
      typicalSL:         data.typicalSL          || undefined,
      typicalTP:         data.typicalTP          || undefined,
      notifEmail:        data.notifEmail         || undefined,
      nNewFollower:      data.nNewFollower       ?? true,
      nDropped:          data.nDropped           ?? true,
      nExecFail:         data.nExecFail          ?? true,
      nDisconnect:       data.nDisconnect        ?? true,
      nWeekly:           data.nWeekly            ?? false,
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
    <div className="w-full max-w-3xl mx-auto space-y-3">
      {/* ── Hero status bar ─────────────────────────────────────────────── */}
      <div className="rounded-xl flex flex-col md:flex-row items-center md:items-start gap-6" style={{ padding: 24, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ border: '1px solid rgba(47,203,126,.4)' }}>
            <div className="absolute inset-0 rounded-full blur-xl animate-pulse" style={{ background: 'var(--ok-s)' }} />
            <CheckCircle2 size={32} className="relative z-10" style={{ color: 'var(--ok)' }} strokeWidth={1.5} />
          </div>
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full animate-pulse" style={{ background: 'var(--ok)', border: '2px solid var(--s1)' }} />
        </div>
        <div className="flex-1 text-center md:text-left space-y-1">
          <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <span className="mono uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ fontSize: 9, fontWeight: 700, color: roleColor, border: `1px solid ${roleColor}`, background: 'var(--s2)' }}>
              {roleLabel}
            </span>
            <span className="qc-badge qc-b-live">● Live</span>
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--t1)' }}>Copy Engine Active</h2>
          <p className="mono" style={{ fontSize: 12, color: 'var(--t3)' }}>{data?.nickname || loginId} · {platform} · {broker}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={fetchData}
            className="mono uppercase tracking-widest px-3 py-1.5 transition-all rounded-lg"
            style={{ fontSize: 9, color: 'var(--t3)', border: '1px solid var(--b1)' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-px rounded-xl overflow-hidden" style={{ background: 'var(--b1)', border: '1px solid var(--b1)' }}>
        {[
          { label:'Account ID', value: accountId ? accountId.slice(0,8)+'…' : '—', color:'var(--t1)' },
          { label:'Role',       value: roleLabel,                                    color: roleColor },
          { label:'Bridge',     value: followerId || masterId ? 'Linked' : 'Ready',  color:'var(--ok)' },
          { label:'Trades',     value: loading ? '…' : String(trades.length),        color:'var(--acc-h)' },
        ].map(s => (
          <div key={s.label} className="text-center" style={{ background: 'var(--s1)', padding: 14 }}>
            <div className="mono uppercase tracking-widest mb-1" style={{ fontSize: 8, fontWeight: 700, color: 'var(--t3)' }}>{s.label}</div>
            <div className="mono truncate" style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Recent logs ─────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b1)' }}>
          <span className="mono uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)' }}>// execution_log</span>
          {followerId && (
            <a href={`/api/copy/logs/${followerId}`} target="_blank" rel="noreferrer"
              className="mono uppercase tracking-widest transition-colors" style={{ fontSize: 9, color: 'var(--t3)' }}>
              View all →
            </a>
          )}
        </div>
        {loading ? (
          <div className="px-5 py-8 flex items-center justify-center">
            <div className="mono animate-pulse" style={{ fontSize: 10, color: 'var(--t3)' }}>Loading logs…</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: '1px solid var(--b1)' }}>
              <Radio size={14} style={{ color: 'var(--t3)' }} />
            </div>
            <p className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>Listening for first trade signal…</p>
            <p style={{ fontSize: 10, color: 'var(--t4)' }}>Logs appear here as trades execute</p>
          </div>
        ) : (
          <div>
            {logs.map((log: any, i: number) => {
              const levelColor: Record<string,string> = { INFO:'var(--ok)', WARN:'var(--warn)', ERROR:'var(--bad)', DEBUG:'var(--t2)' };
              const c = levelColor[log.level] || 'var(--t2)';
              return (
                <div key={log.id || i} className="px-5 py-2.5 flex items-start gap-3" style={i > 0 ? { borderTop: '1px solid var(--b1)' } : undefined}>
                  <span className="mono uppercase tracking-widest mt-0.5 flex-shrink-0"
                    style={{ fontSize: 8, fontWeight: 700, color: c }}>{log.level}</span>
                  <span className="mono flex-1 leading-relaxed" style={{ fontSize: 10, color: 'var(--t2)' }}>{log.message}</span>
                  <span className="mono flex-shrink-0 mt-0.5" style={{ fontSize: 8, color: 'var(--t3)' }}>
                    {log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent trades ───────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--b1)' }}>
          <span className="mono uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)' }}>// recent_trades</span>
        </div>
        {loading ? (
          <div className="px-5 py-6 flex items-center justify-center">
            <div className="mono animate-pulse" style={{ fontSize: 10, color: 'var(--t3)' }}>Loading trades…</div>
          </div>
        ) : trades.length === 0 ? (
          <div className="px-5 py-6 flex flex-col items-center justify-center gap-2">
            <p className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>No trades copied yet</p>
            <p style={{ fontSize: 10, color: 'var(--t4)' }}>Trades will appear here once the engine processes a signal</p>
          </div>
        ) : (
          <div>
            {trades.map((t: any, i: number) => (
              <div key={t.id || i} className="px-5 py-2.5 grid grid-cols-4 gap-2 items-center" style={i > 0 ? { borderTop: '1px solid var(--b1)' } : undefined}>
                <span className="mono truncate" style={{ fontSize: 10, color: 'var(--t2)' }}>{t.symbol || '—'}</span>
                <span className="mono uppercase" style={{ fontSize: 9, fontWeight: 700, color: t.action==='BUY'?'var(--ok)':'var(--bad)' }}>
                  {t.action || '—'}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--t3)' }}>{t.eventType || t.event_type || '—'}</span>
                <span className="mono uppercase text-right"
                  style={{ fontSize: 9, color: t.status==='executed'?'var(--ok)':t.status==='failed'?'var(--bad)':'var(--t3)' }}>
                  {t.status || '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl flex flex-col sm:flex-row items-center gap-3" style={{ padding: 20, background: 'var(--s1)', border: '1px solid var(--b1)' }}>
        <GlowButton active onClick={onSetupAnother}>
          Set Up Another Terminal <ArrowRight size={13} />
        </GlowButton>
        <button onClick={onHome}
          className="mono uppercase tracking-widest transition-colors px-4 py-2 rounded-lg"
          style={{ fontSize: 10, color: 'var(--t3)', border: '1px solid var(--b1)' }}>
          ← Back to Trade Sync Home
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
    : role === 'self'     ? !!(data.brokerAccountId && data.brokerAccountId2)
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
    follower: providerName ? <>Copying <span className="mono" style={{ color: 'var(--acc-h)' }}>{providerName}</span> in real-time.</> : 'Bridge is live.',
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
    <div className="rounded-xl p-8 md:p-20 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto" style={{ border: '1px solid var(--b1)', background: 'var(--s1)' }}>
      <div className="w-24 h-24 rounded-full flex items-center justify-center relative" style={{ border: '1px solid var(--acc-bd)' }}>
        <div className="absolute inset-0 blur-2xl animate-ping" style={{ background: 'var(--acc-soft)' }} />
        <Rocket size={40} className="animate-pulse" style={{ color: 'var(--acc)' }} strokeWidth={1.5} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)' }}>Deploying Terminal…</h2>
      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        {['Establishing bridge connection','Verifying account credentials','Activating copy engine'].map((msg, i) => (
          <div key={msg} className="flex items-center gap-3 w-full text-left">
            <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: '1px solid var(--acc-bd)', background: 'var(--acc-soft)' }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--acc)', animationDelay:`${i*0.3}s` }} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{msg}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (status === 'error') return (
    <div className="rounded-xl p-8 md:p-20 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto" style={{ border: '1px solid var(--b1)', background: 'var(--s1)' }}>
      <div className="w-24 h-24 rounded-full flex items-center justify-center relative" style={{ border: '1px solid rgba(240,85,107,.4)' }}>
        <div className="absolute inset-0 blur-2xl animate-pulse" style={{ background: 'var(--bad-s)' }} />
        <AlertTriangle size={40} className="relative z-10" style={{ color: 'var(--bad)' }} strokeWidth={1.5} />
      </div>
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mono uppercase tracking-widest rounded-full" style={{ fontSize: 10, fontWeight: 700, color: 'var(--bad)', background: 'var(--bad-s)', border: '1px solid rgba(240,85,107,.4)' }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--bad)' }} />
          Deployment Failed
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)' }}>Terminal Error</h2>
        <p className="mono max-w-md" style={{ fontSize: 13, color: 'var(--t3)' }}>{errorMsg}</p>
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
    <div className="rounded-xl max-w-2xl mx-auto flex flex-col items-center overflow-hidden" style={{ border: '1px solid var(--b1)', background: 'var(--s1)' }}>
      {/* ── Hero block ──────────────────────────────────────── */}
      <div className="w-full p-8 md:p-16 flex flex-col items-center text-center space-y-4" style={{ borderBottom: '1px solid var(--b1)' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center relative" style={{ border: '1px solid var(--acc-bd)' }}>
          <div className="absolute inset-0 blur-2xl animate-pulse" style={{ background: 'var(--acc-soft)' }} />
          <Rocket size={40} className="relative z-10" style={{ color: 'var(--acc)' }} strokeWidth={1.5} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)' }}>System Ready</h2>
        <p className="max-w-md" style={{ fontSize: 13, color: 'var(--t3)' }}>{summaries[role]}</p>
      </div>

      {/* ── Risk disclosure (inline) ─────────────────────────── */}
      {!disclosuresAccepted && (
        <div className="w-full p-6 md:p-8 space-y-4" style={{ borderBottom: '1px solid var(--b1)' }}>
          <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--warn)' }}>
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700 }}>Risk Disclosure Required</span>
          </div>

          <div className="space-y-2 rounded-lg" style={{ padding: 16, border: '1px solid rgba(240,85,107,.4)', background: 'var(--bad-s)' }}>
            <p className="leading-relaxed" style={{ fontSize: 11.5, color: 'var(--t2)' }}>
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
          <div className="flex items-center gap-2 mono uppercase tracking-widest mb-2" style={{ fontSize: 10, color: 'var(--ok)' }}>
            <CheckCircle2 size={13} />
            <span>All disclosures accepted — ready to deploy</span>
          </div>
        )}
        <GlowButton active={canDeploy} onClick={handleDeploy}>
          DEPLOY TERMINAL <ArrowRight size={14} />
        </GlowButton>
        {!canDeploy && (
          <p className="mono mt-1" style={{ fontSize: 10, color: 'var(--t3)' }}>
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
  const [step, setStep]               = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<any>({
    role:'follower', platform:'cTrader', platform2:'cTrader', lotMode:'mult', riskAmount:'1',
    selectedProvider:null, symbolMaps:[{from:'',to:''},{from:'',to:''}],
  });
  const [providers, setProviders]             = useState<any[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  useEffect(() => {
    fetch('/api/copy/providers')
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
      case 'role':       return <QcRoleStep value={data.role} onChange={(id) => { setData(id === 'telegram' ? { ...data, role: id, platform: 'cTrader', lotMode: data.lotMode === 'risk' ? 'risk' : 'fixed' } : { ...data, role: id }); setStep(0); }} />;
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

  const isGoLive = cur.id === 'go-live';
  return (
    <QcShell
      steps={steps.map((s: any) => ({ id: s.id, label: s.label }))}
      current={step}
      onExit={onBack}
      onProviders={() => onOpenDashboard('provider')}
      onFollowers={() => onOpenDashboard('follower')}
      onBack={handlePrev}
      onNext={handleNext}
      backDisabled={step === 0}
      hideFooter={isGoLive}
      nextLabel={step >= steps.length - 1 ? 'Finish' : 'Continue'}
      contentWidth={cur.id === 'link' ? 980 : cur.id === 'accounts' ? 880 : cur.id === 'role' ? 760 : 680}
    >
      {cur.id !== 'role' && (
        <div style={{ marginBottom: 18 }}>
          <div className="qc-eyebrow">Step {String(step + 1).padStart(2, '0')} · {cur.label}</div>
          <h1 className="qc-h1" style={{ marginTop: 10 }}>{STEP_TITLES[cur.id] ?? cur.label}</h1>
        </div>
      )}
      {renderStep()}
    </QcShell>
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
  .ts-hero h1 { font-family:'Montserrat',sans-serif; font-size:clamp(2rem,6vw,3.5rem); font-weight:800; line-height:1.1; margin-bottom:20px; background:linear-gradient(135deg,#fff 40%,var(--ts-blue)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .ts-hero p { font-size:clamp(0.9rem,2vw,1.05rem); color:var(--ts-muted); line-height:1.7; max-width:440px; margin-bottom:32px; }
  .ts-hero-actions { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  .ts-btn-primary { background:var(--ts-blue); color:#fff; border:none; padding:13px 28px; font-size:1rem; font-weight:600; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; gap:8px; }
  .ts-btn-primary:hover { background:var(--ts-blue-bright); transform:translateY(-1px); }
  .ts-btn-ghost { background:transparent; color:var(--ts-muted); border:1px solid var(--ts-border); padding:13px 24px; font-size:1rem; font-weight:500; cursor:pointer; transition:all 0.2s; }
  .ts-btn-ghost:hover { border-color:var(--ts-blue); color:var(--ts-text); }
  .ts-hero-visual { background:var(--ts-bg2); border:1px solid var(--ts-border); padding:32px; position:relative; overflow:hidden; }
  .ts-hero-visual::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 70% 30%,rgba(45,140,240,0.07) 0%,transparent 70%); pointer-events:none; }
  .ts-diagram { display:flex; flex-direction:column; align-items:center; gap:0; width:100%; }
  .ts-diagram-master { border:2px solid var(--ts-blue); padding:14px 20px; background:rgba(45,140,240,0.08); display:flex; align-items:center; gap:12px; min-width:0; max-width:100%; width:100%; max-width:280px; }
  .ts-diag-icon { width:38px; height:38px; background:rgba(45,140,240,0.2); display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; }
  .ts-diag-label { font-family:'Montserrat',sans-serif; font-weight:600; font-size:0.9rem; }
  .ts-diag-id { font-size:0.75rem; color:var(--ts-muted); }
  .ts-badge-master { background:var(--ts-blue); color:#fff; padding:3px 10px; font-size:0.72rem; font-weight:700; margin-left:auto; flex-shrink:0; }
  .ts-badge-slave  { background:var(--ts-green); color:#000; padding:3px 10px; font-size:0.72rem; font-weight:700; margin-left:auto; flex-shrink:0; }
  .ts-connector { width:100%; max-width:260px; height:70px; overflow:visible; }
  .ts-diagram-slaves { display:flex; gap:16px; flex-wrap:wrap; justify-content:center; width:100%; }
  .ts-diagram-slave { border:2px solid var(--ts-green); padding:14px 18px; background:rgba(0,200,150,0.06); display:flex; align-items:center; gap:10px; min-width:0; flex:1 1 180px; max-width:240px; }
  .ts-section { padding:64px 48px; max-width:1200px; margin:0 auto; }
  .ts-section-header { text-align:center; margin-bottom:48px; }
  .ts-section-title { font-family:'Montserrat',sans-serif; font-size:clamp(1.4rem,3.5vw,1.8rem); font-weight:700; color:var(--ts-blue); margin-bottom:10px; }
  .ts-section-sub { color:var(--ts-muted); font-size:clamp(0.85rem,1.8vw,1rem); }
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
  .ts-platform-card { background:var(--ts-card); border:1px solid var(--ts-border); padding:20px 14px; text-align:center; transition:border-color 0.2s; min-width:0; }
  .ts-platform-card:hover { border-color:var(--ts-blue); }
  .ts-status-badge { display:inline-block; padding:2px 8px; font-size:0.68rem; font-weight:700; margin-bottom:14px; white-space:nowrap; }
  .ts-status-available { background:rgba(0,200,150,0.15); color:var(--ts-green); border:1px solid rgba(0,200,150,0.3); }
  .ts-status-soon { background:rgba(240,165,0,0.15); color:var(--ts-gold); border:1px solid rgba(240,165,0,0.3); }
  .ts-platform-logo { width:48px; height:48px; background:var(--ts-card2); display:flex; align-items:center; justify-content:center; font-size:1.4rem; margin:0 auto 10px; }
  .ts-platform-name { font-weight:600; font-size:0.85rem; margin-bottom:12px; word-break:break-word; }
  .ts-vote-row { display:flex; align-items:center; gap:8px; justify-content:center; flex-wrap:wrap; }
  .ts-vote-btn { display:flex; align-items:center; gap:5px; background:var(--ts-blue); color:#fff; border:none; padding:5px 12px; font-size:0.75rem; font-weight:600; cursor:pointer; transition:background 0.2s; white-space:nowrap; }
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
  .ts-faq-item.open .ts-faq-a { max-height:600px; padding:14px 20px; }

  /* Tablet — 1024px and below */
  @media (max-width:1024px) {
    .ts-hero { padding:56px 32px 48px; gap:36px; }
    .ts-section { padding:56px 32px; }
    .ts-platforms-section { padding:56px 32px; }
    .ts-platforms-grid { grid-template-columns:repeat(4,1fr); }
    .ts-platforms-grid-2 { grid-template-columns:repeat(4,1fr); max-width:none; }
    .ts-fp-grid { gap:36px; }
  }

  /* Small tablet / large mobile — 900px and below */
  @media (max-width:900px) {
    .ts-hero { grid-template-columns:1fr; padding:40px 20px 36px; gap:28px; }
    .ts-hero-visual { padding:24px; }
    .ts-steps { grid-template-columns:1fr 1fr; }
    .ts-platforms-grid { grid-template-columns:repeat(3,1fr); }
    .ts-platforms-grid-2 { grid-template-columns:repeat(3,1fr); }
    .ts-fp-grid { grid-template-columns:1fr; gap:28px; }
    .ts-section { padding:48px 20px; }
    .ts-platforms-section { padding:48px 20px; }
    .ts-faq-section { padding:48px 20px; }
    .ts-pricing-card { padding:22px; }
  }

  /* Mobile — 600px and below */
  @media (max-width:600px) {
    .ts-hero { padding:32px 16px 28px; }
    .ts-hero-visual { padding:18px 14px; }
    .ts-section { padding:40px 16px; }
    .ts-platforms-section { padding:40px 16px; }
    .ts-faq-section { padding:40px 16px; }
    .ts-section-header { margin-bottom:32px; }
    .ts-platforms-grid { grid-template-columns:repeat(2,1fr); gap:12px; }
    .ts-platforms-grid-2 { grid-template-columns:repeat(2,1fr); gap:12px; }
    .ts-platform-card { padding:16px 10px; }
    .ts-platform-logo { width:42px; height:42px; font-size:1.2rem; }
    .ts-step-card { padding:22px 18px; }
    .ts-pricing-card { padding:18px; }
    .ts-price-amount { font-size:2rem; }
    .ts-checkout-card { padding:18px; }
    .ts-faq-q { padding:14px 16px; font-size:0.85rem; }
    .ts-btn-primary, .ts-btn-ghost { width:100%; justify-content:center; }
    .ts-hero-actions { width:100%; }
    .ts-diagram-slaves { gap:12px; }
    .ts-diagram-slave { padding:12px 14px; flex:1 1 100%; max-width:280px; }
  }

  /* Small mobile — 400px and below */
  @media (max-width:400px) {
    .ts-steps { grid-template-columns:1fr; }
    .ts-platforms-grid { grid-template-columns:repeat(2,1fr); gap:10px; }
    .ts-platforms-grid-2 { grid-template-columns:repeat(2,1fr); gap:10px; }
    .ts-vote-btn { padding:5px 10px; font-size:0.7rem; }
    .ts-vote-count { font-size:0.75rem; }
    .ts-feature-item { gap:12px; margin-bottom:18px; }
    .ts-feat-icon { width:38px; height:38px; }
  }
`;

const platformsRow1 = [
  { name:"MT5",         icon:"5️⃣", status:"available", votes:2061, voted:true  },
  { name:"MT4",         icon:"4️⃣", status:"available", votes:419,  voted:true  },
  { name:"MatchTrader", icon:"🔗", status:"available", votes:182,  voted:false },
  { name:"Bitunix",     icon:"🟢", status:"soon",      votes:19,   voted:false },
  { name:"DXTrade",     icon:"DX", status:"available",  votes:85,   voted:false },
  { name:"cTrader",     icon:"🔴", status:"available",  votes:370,  voted:false },
];
const platformsRow2 = [
  { name:"TradeLocker", icon:"🔒", status:"available", votes:289, voted:false },
  { name:"Binance",     icon:"🔶", status:"available", votes:170, voted:false },
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
  { q:"Does Trade Sync trade for me?",        a:"No. Trade Sync is a copy trading tool that mirrors your own trades from a master account to one or more slave accounts. You remain in full control of all trading decisions." },
  { q:"Is this for accounts I own?",          a:"Yes. Trade Sync is designed for traders who manage multiple accounts of their own. You must have authorized access to all accounts you connect to the platform." },
  { q:"Which platforms are supported?",       a:"MT4, MT5, MatchTrader, cTrader, DXTrade, TradeLocker, and Binance (USDM Futures) are fully supported — all via API, no desktop terminal needed. More platforms are coming soon — vote for your favorites." },
  { q:"Do you provide signals or advice?",    a:"No. Trade Sync does not provide trading signals, advice, or recommendations. It solely syncs trades between accounts you control." },
  { q:"How are my credentials handled?",      a:"Your account credentials are encrypted and stored securely. We use industry-standard encryption and never share your data with third parties." },
  { q:"Are alerts available?",               a:"Yes! You can receive real-time alerts via Telegram or email whenever a trade is copied, modified, or closed across your accounts." },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function TradeSyncPage() {
  const [showCopier, setShowCopier] = useState(false);
  const [showDashboard, setShowDashboard] = useState<null | 'provider' | 'follower'>(null);
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

  if (showDashboard) return <CopyManagementDashboard initialTab={showDashboard} onBack={() => setShowDashboard(null)} />;
  if (showCopier) return <CopierWizard onBack={() => setShowCopier(false)} onOpenDashboard={(tab) => setShowDashboard(tab)} />;

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

        {/* ── Overview Banner ── theme-aware via --jr-* vars (set on .journal-root)
             so it reads correctly in BOTH dark and light. Role keywords use the
             accent so they stand out and never vanish on a light background. The hex
             fallbacks keep the dark look if the vars aren't present. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--jr-panel, #0d1117)', border: '1px solid var(--jr-border, #1e293b)', borderRadius: 8, padding: '12px 16px', marginBottom: 0, fontSize: 11, color: 'var(--jr-muted, #94a3b8)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
          <PiInfoFill style={{ flexShrink: 0, marginTop: 2 }} size={16} color="var(--jr-accent, #38bdf8)" />
          <span><strong style={{ color: 'var(--jr-text, #e2e8f0)', fontWeight: 700 }}>What is Trade Sync?</strong> — Trade Sync is an automated copy-trading engine that links multiple brokerage accounts and replicates positions in real time. You can operate as a <strong style={{ color: 'var(--jr-accent, #38bdf8)', fontWeight: 600 }}>Provider</strong> (broadcasting your trades to followers), a <strong style={{ color: 'var(--jr-accent, #38bdf8)', fontWeight: 600 }}>Follower</strong> (mirroring a master account with configurable lot sizing and risk controls), perform <strong style={{ color: 'var(--jr-accent, #38bdf8)', fontWeight: 600 }}>Self-Copy</strong> between your own accounts, or route signals directly from a <strong style={{ color: 'var(--jr-accent, #38bdf8)', fontWeight: 600 }}>Telegram</strong> channel. All copying happens through an isolated bridge — no withdrawal permissions or sensitive credentials are ever required.</span>
        </div>

        {/* HERO */}
        <div className="ts-hero">
          <div>
            <div className="ts-hero-badge">⚡ Automated Trade Copying</div>
            <h1>Trade Sync</h1>
            <p>Control all your trading accounts from one place—automatically and in real time.</p>
            <div className="ts-hero-actions">
              <button className="ts-btn-primary" onClick={() => setShowCopier(true)}>Start Now →</button>
              <button className="ts-btn-ghost" onClick={() => document.getElementById('ts-learn-more')?.scrollIntoView({ behavior:'smooth' })}>Learn More</button>
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
        <div id="ts-learn-more" style={{ background:"var(--ts-bg2)", padding:"1px 0" }}>
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
              <div className="ts-section-sub">Everything you need to know about Trade Sync</div>
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
