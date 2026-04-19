import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import BlogPostEditor, { type BlogEditorData } from '@/components/BlogPostEditor';
import {
  Users, FileText, Megaphone, Settings, Search, TrendingUp,
  MoreVertical, Plus, Mail, Bell, AlertCircle, UserPlus, ShieldCheck,
  Globe, Clock, HeadphonesIcon, Cpu, Activity, Zap, AlertTriangle, CheckCircle,
  MessageSquare, Phone, Star, Timer, Database,
  Eye, Ban, Unlock, Trash2, Send, X, RotateCcw, Layers, BookOpen, ExternalLink
} from 'lucide-react';

// ─── BREAKPOINT HOOK ─────────────────────────────────────────────────────────
function useBreakpoint() {
  const [bp, setBp] = useState({ isMobile: false, isTablet: false, isDesktop: true, w: 1200 });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setBp({ isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024, w });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return bp;
}

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const MOCK_USERS = [
  { id: 1, name: 'Alex Thompson', email: 'alex@example.com', plan: 'Pro', status: 'Active', winRate: '68%', lastLogin: '2h ago', tickets: 2, country: 'US' },
  { id: 2, name: 'Sarah Chen', email: 'sarah.c@trading.io', plan: 'Free', status: 'Inactive', winRate: '42%', lastLogin: '3d ago', tickets: 0, country: 'SG' },
  { id: 3, name: 'Marcus Miller', email: 'marcus@fx.net', plan: 'Enterprise', status: 'Active', winRate: '71%', lastLogin: '15m ago', tickets: 1, country: 'DE' },
  { id: 4, name: 'Elena Rodriguez', email: 'elena.r@crypto.com', plan: 'Pro', status: 'Banned', winRate: '55%', lastLogin: '1w ago', tickets: 5, country: 'MX' },
];

const MOCK_POSTS = [
  { id: 1, title: 'Weekly Market Recap: CPI Volatility', author: 'Admin', date: '2023-10-24', status: 'Published', section: 'blog' },
  { id: 2, title: 'Top 5 Psychological Biases in Trading', author: 'Admin', date: '2023-10-22', status: 'Draft', section: 'blog' },
  { id: 3, title: 'Breakout Strategy: 3-EMA Confluence', author: 'Admin', date: '2023-10-20', status: 'Published', section: 'verified-strategies' },
  { id: 4, title: 'Scalping the London Open - Full Playbook', author: 'Admin', date: '2023-10-18', status: 'Draft', section: 'verified-strategies' },
  { id: 5, title: 'EUR/USD Buy Signal', author: 'Admin', date: '2023-10-24', status: 'Published', section: 'trade-signals', signal: { pair: 'EUR/USD', action: 'BUY', entry: '1.0632', sl: '1.0589', tp1: '1.0685', tp2: '1.0740', tp3: '', rr: '2.8', timeframe: 'H4', confidence: 'High', market: 'Forex', rationale: 'Price bounced off key demand zone with bullish engulfing. RSI divergence supports upside.' } },
  { id: 6, title: 'BTC/USDT Short Setup', author: 'Admin', date: '2023-10-23', status: 'Published', section: 'trade-signals', signal: { pair: 'BTC/USDT', action: 'SELL', entry: '34,280', sl: '35,100', tp1: '33,200', tp2: '32,000', tp3: '', rr: '1.9', timeframe: 'D1', confidence: 'Medium', market: 'Crypto', rationale: 'Rejection at key resistance with bearish divergence on daily RSI.' } },
];

const GROWTH_DATA_MONTHLY = [40, 55, 45, 70, 65, 85, 75, 90, 80, 95, 88, 110];
const GROWTH_DATA_DAILY = [12,18,14,22,19,25,17,30,28,24,32,27,20,35,33,29,38,31,26,40,36,34,42,39,37,44,41,43,46,45];

const MOCK_TICKETS = [
  { id: 'TK-1042', user: 'Alex Thompson', email: 'alex@example.com', subject: 'API connection drops intermittently', priority: 'High', status: 'Open', created: '10m ago', channel: 'email' },
  { id: 'TK-1041', user: 'Marcus Miller', email: 'marcus@fx.net', subject: 'Unable to export trade history CSV', priority: 'Medium', status: 'In Progress', created: '1h ago', channel: 'chat' },
  { id: 'TK-1040', user: 'Priya Sharma', email: 'priya@inv.co', subject: 'Billing discrepancy on last invoice', priority: 'High', status: 'Open', created: '3h ago', channel: 'phone' },
  { id: 'TK-1039', user: 'Daniel Park', email: 'dpark@trade.io', subject: 'Feature request: Dark mode toggle', priority: 'Low', status: 'Resolved', created: '1d ago', channel: 'chat', satisfaction: 5 },
  { id: 'TK-1038', user: 'Sarah Chen', email: 'sarah.c@trading.io', subject: 'Login 2FA not sending SMS code', priority: 'Critical', status: 'Resolved', created: '2d ago', channel: 'email', satisfaction: 4 },
];

const generateMetric = (base, variance) => +(base + (Math.random() - 0.5) * variance).toFixed(1);
const INITIAL_METRICS = { cpu: 34, memory: 61, latency: 42, uptime: 99.97, requestsPerSec: 847, errorRate: 0.12, dbQueryTime: 18, activeConnections: 1243 };
const INITIAL_LOGS = [
  { id: 1, time: '14:32:01', level: 'error', service: 'Binance-API', message: 'Connection timeout after 5000ms - retrying (3/5)', resolved: false },
  { id: 2, time: '14:31:44', level: 'warn', service: 'Auth-Service', message: 'Elevated failed login attempts from IP 185.220.x.x', resolved: false },
  { id: 3, time: '14:30:12', level: 'info', service: 'Trade-Engine', message: 'Successfully processed 1,240 trade signals in batch', resolved: true },
  { id: 4, time: '14:29:55', level: 'error', service: 'DB-Cluster', message: 'Replica lag exceeded threshold: 340ms', resolved: true },
  { id: 5, time: '14:27:11', level: 'warn', service: 'Payment-SVC', message: 'Stripe webhook delivery delayed by 12s', resolved: false },
];

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const ADMIN_THEMES: Record<string, Record<string, string>> = {
  dark:     { bg:'#07090e', sidebar:'#07090e', card:'#0c1018', border:'#131c28', border2:'#1b2840', dim:'#1b2840', accent:'#00c8e0', accentL:'#33d8f0' },
  midnight: { bg:'#000000', sidebar:'#050508', card:'#0d0d14', border:'#1a1a2e', border2:'#16213e', dim:'#16213e', accent:'#7c3aed', accentL:'#9d65f5' },
  slate:    { bg:'#0f172a', sidebar:'#0f172a', card:'#1e293b', border:'#334155', border2:'#475569', dim:'#475569', accent:'#0ea5e9', accentL:'#38bdf8' },
  forest:   { bg:'#052e16', sidebar:'#04200f', card:'#073b1d', border:'#166534', border2:'#15803d', dim:'#15803d', accent:'#22c55e', accentL:'#4ade80' },
};

const ADMIN_FONTS: Record<string, string> = {
  montserrat: "'Montserrat', sans-serif",
  onest:      "'Onest', sans-serif",
  inter:      "'Inter', sans-serif",
  mono:       "'DM Mono', monospace",
};

function applyAdminTheme(id: string) {
  const t = ADMIN_THEMES[id] ?? ADMIN_THEMES.dark;
  const r = document.documentElement;
  Object.entries(t).forEach(([k, v]) => r.style.setProperty(`--admin-${k}`, v));
}

function applyAdminFont(id: string) {
  const stack = ADMIN_FONTS[id] ?? ADMIN_FONTS.montserrat;
  document.documentElement.style.setProperty('--admin-font', stack);
}

// Apply saved preferences immediately on module load
applyAdminTheme(localStorage.getItem('admin_theme') ?? 'dark');
applyAdminFont(localStorage.getItem('admin_font') ?? 'montserrat');

const FONT = 'var(--admin-font)';
const C = {
  bg: 'var(--admin-bg)', sidebar: 'var(--admin-sidebar)', card: 'var(--admin-card)',
  border: 'var(--admin-border)', border2: 'var(--admin-border2)', dim: 'var(--admin-dim)',
  text: '#d0dff0', muted: '#3a5070',
  indigo: 'var(--admin-accent)', indigoL: 'var(--admin-accentL)',
  green: '#00d48a', greenL: '#00ff9d',
  red: '#ff3060', redL: '#ff6080',
  amber: '#ffb700', amberL: '#ffd030',
  blue: '#2888f0', blueL: '#50a8f8',
};
const cs = { background: C.card, border: `1px solid ${C.border}` };
const inp = { width: '100%', background: 'var(--admin-bg)', border: `1px solid ${C.border2}`, color: C.text, padding: '10px 14px', fontFamily: FONT, fontWeight: 500, fontSize: '13px', outline: 'none', boxSizing: 'border-box' } as const;
const lbl = { display: 'block', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.muted, marginBottom: '8px' } as const;
const btn = { fontFamily: FONT, fontWeight: 600, cursor: 'pointer', border: 'none', letterSpacing: '0.04em' };

const SECTION_META = {
  blog: { label: 'Blog', color: C.indigoL, bg: 'rgba(0,200,224,0.08)', border: 'rgba(0,200,224,0.25)', dot: C.indigo },
  'verified-strategies': { label: 'Verified Strategies', color: C.amberL, bg: 'rgba(255,183,0,0.08)', border: 'rgba(255,183,0,0.25)', dot: C.amber },
  'trade-signals': { label: 'Trade Signals', color: C.greenL, bg: 'rgba(0,212,138,0.08)', border: 'rgba(0,212,138,0.25)', dot: C.green },
};

const SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', ac: '#1877F2', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.791-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" /></svg> },
  { id: 'twitter', label: 'X / Twitter', ac: '#e2e8f0', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.261 5.638 5.902-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg> },
  { id: 'linkedin', label: 'LinkedIn', ac: '#0A66C2', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg> },
  { id: 'telegram', label: 'Telegram', ac: '#26A5E4', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg> },
  { id: 'whatsapp', label: 'WhatsApp', ac: '#25D366', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg> },
];

const EXPERTISE_OPTIONS = ['Technical Analysis', 'Fundamental Analysis', 'Forex', 'Crypto', 'Stocks', 'Commodities', 'Scalping', 'Swing Trading', 'Risk Management', 'Price Action'];
const BLOG_CATEGORIES = ['Equities', 'Forex', 'Digital Assets', 'Analysis', 'Backtested Strategies'];
const CATEGORY_TO_SECTION: Record<string, string> = {
  'Equities': 'blog', 'Forex': 'blog', 'Digital Assets': 'blog',
  'Analysis': 'blog', 'Backtested Strategies': 'verified-strategies',
};
const CATEGORY_META: Record<string, { sub: string; color: string; bg: string; border: string; dot: string }> = {
  'Equities':              { sub: 'Stocks & indices',    color: C.indigoL, bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.3)',  dot: C.indigo  },
  'Forex':                 { sub: 'Currency pairs',      color: C.blueL,   bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)',  dot: C.blue    },
  'Digital Assets':        { sub: 'Crypto & DeFi',       color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.3)', dot: '#a78bfa' },
  'Analysis':              { sub: 'Market analysis',     color: C.muted,   bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.3)', dot: C.muted   },
  'Backtested Strategies': { sub: 'Verified strategies', color: C.amberL,  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  dot: C.amber   },
};
const EMPTY_FORM = { title: '', section: 'blog', category: 'Analysis', status: 'Draft', imageUrl: '', excerpt: '', content: '', readTime: '5 min', authorName: '', authorBio: '', authorExpertise: [] as string[], authorTwitter: '', authorLinkedin: '', authorTelegram: '', shareOn: [] as string[], signal: { pair: '', action: 'BUY', market: 'Forex', timeframe: 'H1', entry: '', sl: '', tp1: '', tp2: '', tp3: '', rr: '', confidence: 'High', rationale: '' } };

// ─── MINI COMPONENTS ─────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const timeAgo = (ts: string | null) => {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const BarGraph = ({ data, labels, xAxisLabel }) => {
  const [hovered, setHovered] = useState(null);
  const w = 500, h = 210;
  const padLeft = 46, padRight = 12, padTop = 16, padBot = 52;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBot;
  const max = Math.max(...data);
  const rawStep = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / mag) * mag;
  const yTicks = Array.from({ length: 5 }, (_, i) => i * step);
  const yMax = yTicks[yTicks.length - 1];
  const barW = chartW / data.length;
  const gap = barW * 0.28;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '210px', overflow: 'visible' }}>
      <defs>
        <linearGradient id="bargrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00c8e0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#006e80" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="bargradhov" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#33d8f0" stopOpacity="1" />
          <stop offset="100%" stopColor="#00c8e0" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <text x={10} y={h / 2} textAnchor="middle" fill="#3d5878" fontSize="9" fontWeight="700"
        transform={`rotate(-90, 10, ${h / 2})`} letterSpacing="0.08em">USERS</text>
      {yTicks.map((tick, i) => {
        const y = padTop + chartH - (tick / yMax) * chartH;
        return (
          <g key={i}>
            <line x1={padLeft} y1={y} x2={padLeft + chartW} y2={y} stroke="#131c28" strokeWidth="1" />
            <text x={padLeft - 6} y={y + 3.5} textAnchor="end" fill="#3d5878" fontSize="9" fontWeight="600">
              {tick >= 1000 ? `${tick / 1000}k` : tick}
            </text>
          </g>
        );
      })}
      <text x={padLeft + chartW / 2} y={h - 4} textAnchor="middle" fill="#3d5878" fontSize="9" fontWeight="700" letterSpacing="0.08em">
        {xAxisLabel || 'MONTH'}
      </text>
      <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + chartH} stroke="#1b2840" strokeWidth="1" />
      <line x1={padLeft} y1={padTop + chartH} x2={padLeft + chartW} y2={padTop + chartH} stroke="#1b2840" strokeWidth="1" />
      {data.map((v, i) => {
        const barH = (v / yMax) * chartH;
        const x = padLeft + i * barW + gap / 2;
        const y = padTop + chartH - barH;
        const bw = barW - gap;
        const isHov = hovered === i;
        const lbl = labels ? labels[i] : MONTHS[i];
        return (
          <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
            <rect x={x - 1} y={padTop} width={bw + 2} height={chartH} fill={isHov ? 'rgba(0,200,224,0.05)' : 'transparent'} />
            <rect x={x} y={y} width={bw} height={barH} fill={isHov ? 'url(#bargradhov)' : 'url(#bargrad)'} rx="2" style={{ transition: 'fill 0.12s' }} />
            {isHov && (
              <g>
                <rect x={x + bw / 2 - 20} y={y - 22} width={40} height={17} fill="#0c1018" rx="3" stroke="#1b2840" strokeWidth="1" />
                <text x={x + bw / 2} y={y - 10} textAnchor="middle" fill="white" fontSize="10" fontWeight="700">{v} users</text>
              </g>
            )}
            {lbl !== '' && (
              <text x={x + bw / 2} y={padTop + chartH + 14} textAnchor="middle" fill="#3d5878" fontSize="9" fontWeight="600">{lbl}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const Sparkline = ({ data, danger }) => {
  const W = 80, H = 32, pd = 2, max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * (W - pd * 2) + pd},${H - ((v / max) * (H - pd * 2) + pd)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '80px', height: '32px' }}><polyline fill="none" stroke={danger ? C.red : C.indigo} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} opacity="0.8" /></svg>;
};

const _skeletonStyle = document.createElement('style');
_skeletonStyle.textContent = '@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.9}}';
if (!document.head.querySelector('[data-sk]')) { _skeletonStyle.setAttribute('data-sk','1'); document.head.appendChild(_skeletonStyle); }

const GaugeRing = ({ value, max = 100, color, size = 44, sw = 4 }) => {
  const r = (size - sw) / 2, circ = 2 * Math.PI * r, pct = Math.min(value / max, 1), dash = pct * circ;
  const ring = pct > 0.8 ? C.red : pct > 0.6 ? C.amber : color;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#131c28" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring} strokeWidth={sw} strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
};

const StatCard = ({ title, value, change, trend, icon: Icon }) => (
  <div style={{ ...cs, padding: '20px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
      <div style={{ padding: '8px', background: 'rgba(0,200,224,0.1)', color: C.indigoL }}><Icon size={18} /></div>
      <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 7px', background: trend === 'up' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: trend === 'up' ? C.greenL : C.redL }}>{change}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ color: C.muted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}:</span>
      <span style={{ color: 'white', fontSize: '10px', fontWeight: 700, letterSpacing: '0.01em', fontFamily: "'DM Mono', 'Courier New', monospace" }}>{value}</span>
    </div>
  </div>
);

// ─── USERS SECTION ───────────────────────────────────────────────────────────
const flagEmoji = (code: string) => {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1A5 + c.charCodeAt(0)));
};
const PLAN_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Free:       { bg: C.border,                  color: '#607898',  border: C.border2 },
  Pro:        { bg: 'rgba(0,200,224,0.12)',    color: C.indigoL,  border: 'rgba(0,200,224,0.3)' },
  Enterprise: { bg: 'rgba(245,158,11,0.12)',    color: C.amberL,   border: 'rgba(245,158,11,0.3)' },
};
const STATUS_COLOR: Record<string, string> = { Active: C.greenL, Inactive: '#3d5878', Banned: C.redL };

const UsersSection = ({ bp, apiUsers, setApiUsers, getAdminToken }: { bp: any; apiUsers: any[]; setApiUsers: (fn: any) => void; getAdminToken: () => Promise<string | null> }) => {
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const filtered = apiUsers.filter(u =>
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.country || '').toLowerCase().includes(search.toLowerCase())
  );

  const updateProfile = async (userId: string, patch: Record<string, string>) => {
    const token = await getAdminToken();
    if (!token) return;
    await fetch(`/api/admin/users/${userId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    setApiUsers((prev: any[]) => prev.map(u => u.id === userId ? { ...u, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k === 'win_rate' ? 'win_rate' : k, v])) } : u));
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const token = await getAdminToken();
    if (!token) return;
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role: newRole }),
    });
    setApiUsers((prev: any[]) => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const token = await getAdminToken();
    if (token) {
      await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
    }
    setInviting(false);
    setShowInvite(false);
    setInviteEmail('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', flex: 1 }}>
      {/* Header bar */}
      <div style={{ ...cs, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#3d5878' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search traders..." style={{ ...inp, width: bp.isMobile ? '100%' : '220px', paddingLeft: '34px', fontSize: '13px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#3d5878', fontSize: '12px' }}>{filtered.length} traders</span>
          <button onClick={() => setShowInvite(true)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '7px', background: C.indigo, color: 'white', padding: '9px 16px', fontSize: '12px', border: 'none', whiteSpace: 'nowrap', fontWeight: 700 }}>
            <UserPlus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cs, overflowX: 'auto', marginTop: '3px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: 'rgba(8,14,24,0.5)' }}>
              {['User', 'Country', 'Plan', 'Status', 'Win Rate', 'Last Login', ''].map((h, i) => (
                <th key={i} style={{ padding: '11px 16px', textAlign: i === 6 ? 'right' : 'left', color: C.muted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const planStyle = PLAN_STYLE[u.plan] || PLAN_STYLE.Free;
              const statusColor = STATUS_COLOR[u.status] || '#3d5878';
              const lastLogin = u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : 'Never';
              const isMenuOpen = menuOpenId === u.id;
              return (
                <tr key={u.id} style={{ borderTop: `1px solid ${C.bg}`, position: 'relative' }} onClick={() => setMenuOpenId(null)}>
                  <td style={{ padding: '13px 16px' }}>
                    <p style={{ color: 'white', fontWeight: 600, fontSize: '13px', margin: 0 }}>{u.full_name || '—'}</p>
                    <p style={{ color: '#3d5878', fontSize: '11px', margin: '2px 0 0' }}>{u.email}</p>
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    {u.country ? (
                      <span style={{ color: '#9ab4cc', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '16px' }}>{flagEmoji(u.country)}</span> {u.country.toUpperCase()}
                      </span>
                    ) : <span style={{ color: '#1b2840', fontSize: '12px' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 8px', background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{u.plan || 'Free'}</span>
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: statusColor, fontSize: '12px', fontWeight: 600 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block', boxShadow: `0 0 5px ${statusColor}60` }} />
                      {u.status || 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ color: u.win_rate ? C.blueL : '#1b2840', fontSize: '13px', fontWeight: u.win_rate ? 700 : 400 }}>{u.win_rate || '—'}</span>
                  </td>
                  <td style={{ padding: '13px 16px', color: '#3d5878', fontSize: '12px', whiteSpace: 'nowrap' }}>{lastLogin}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'right', position: 'relative' }}>
                    <button onClick={e => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : u.id); }}
                      style={{ ...btn, background: 'transparent', color: '#3d5878', border: 'none', padding: '4px 8px', fontSize: '16px', lineHeight: 1 }}>⋮</button>
                    {isMenuOpen && (
                      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: '12px', top: '100%', zIndex: 30, background: '#0c1018', border: `1px solid ${C.border2}`, minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        {(['Free', 'Pro', 'Enterprise'] as const).map(p => (
                          <button key={p} onClick={() => { updateProfile(u.id, { plan: p }); setMenuOpenId(null); }}
                            style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: u.plan === p ? 'rgba(0,200,224,0.1)' : 'transparent', color: u.plan === p ? C.indigoL : '#607898', border: 'none', fontSize: '12px' }}>Plan: {p}</button>
                        ))}
                        <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                        {(['Active', 'Inactive', 'Banned'] as const).map(s => (
                          <button key={s} onClick={() => { updateProfile(u.id, { status: s }); setMenuOpenId(null); }}
                            style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: u.status === s ? 'rgba(0,200,224,0.1)' : 'transparent', color: u.status === s ? C.indigoL : STATUS_COLOR[s], border: 'none', fontSize: '12px' }}>Status: {s}</button>
                        ))}
                        <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                        <button onClick={() => { handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin'); setMenuOpenId(null); }}
                          style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'transparent', color: C.amberL, border: 'none', fontSize: '12px' }}>
                          {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                        </button>
                        <button onClick={() => { setEditUser(u); setMenuOpenId(null); }}
                          style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'transparent', color: '#607898', border: 'none', fontSize: '12px' }}>Edit Profile</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '32px', color: '#3d5878', fontSize: '13px', textAlign: 'center' }}>
                {search ? 'No traders match your search.' : 'No users found.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Profile modal */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '400px', padding: '24px', border: `1px solid ${C.border2}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: '16px', margin: 0 }}>Edit Trader Profile</h3>
              <button onClick={() => setEditUser(null)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', padding: '4px' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><label style={{ ...lbl }}>Country Code (e.g. US, SG)</label>
                <input defaultValue={editUser.country || ''} id="ep-country" placeholder="US" style={{ ...inp }} /></div>
              <div><label style={{ ...lbl }}>Win Rate (e.g. 68%)</label>
                <input defaultValue={editUser.win_rate || ''} id="ep-winrate" placeholder="68%" style={{ ...inp }} /></div>
              <div><label style={{ ...lbl }}>Plan</label>
                <select id="ep-plan" defaultValue={editUser.plan || 'Free'} style={{ ...inp, cursor: 'pointer' }}>
                  {['Free', 'Pro', 'Enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                </select></div>
              <div><label style={{ ...lbl }}>Status</label>
                <select id="ep-status" defaultValue={editUser.status || 'Active'} style={{ ...inp, cursor: 'pointer' }}>
                  {['Active', 'Inactive', 'Banned'].map(s => <option key={s} value={s}>{s}</option>)}
                </select></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setEditUser(null)} style={{ ...btn, flex: 1, padding: '10px', background: 'transparent', color: '#607898', border: `1px solid ${C.border2}`, fontSize: '13px' }}>Cancel</button>
              <button onClick={() => {
                const country = (document.getElementById('ep-country') as HTMLInputElement)?.value || '';
                const win_rate = (document.getElementById('ep-winrate') as HTMLInputElement)?.value || '';
                const plan = (document.getElementById('ep-plan') as HTMLSelectElement)?.value || 'Free';
                const status = (document.getElementById('ep-status') as HTMLSelectElement)?.value || 'Active';
                updateProfile(editUser.id, { country, win_rate, plan, status });
                setEditUser(null);
              }} style={{ ...btn, flex: 1, padding: '10px', background: C.indigo, color: 'white', border: 'none', fontSize: '13px' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite user modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '360px', padding: '24px', border: `1px solid ${C.border2}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: '16px', margin: 0 }}>Invite User</h3>
              <button onClick={() => setShowInvite(false)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', padding: '4px' }}><X size={16} /></button>
            </div>
            <label style={{ ...lbl }}>Email Address</label>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="trader@example.com" style={{ ...inp, marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowInvite(false)} style={{ ...btn, flex: 1, padding: '10px', background: 'transparent', color: '#607898', border: `1px solid ${C.border2}`, fontSize: '13px' }}>Cancel</button>
              <button onClick={handleInvite} disabled={inviting} style={{ ...btn, flex: 1, padding: '10px', background: C.indigo, color: 'white', border: 'none', fontSize: '13px', opacity: inviting ? 0.6 : 1 }}>{inviting ? 'Sending…' : 'Send Invite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── CUSTOMER CARE ────────────────────────────────────────────────────────────
const CustomerCareSection = ({ bp, apiUsers = [], getAdminToken = null }) => {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [actionUser, setActionUser] = useState(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    const load = async () => {
      const token = await getAdminToken?.();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      try {
        const r = await fetch('/api/admin/tickets', { headers });
        if (r.ok) {
          const data = await r.json();
          setTickets(data.map((t: any) => ({
            id: `TK-${t.id}`, _id: t.id,
            user: t.user_name || 'Unknown', email: t.user_email || '',
            subject: t.subject || t.message?.slice(0, 60) || 'No subject',
            priority: t.priority || 'Medium', status: t.status || 'Open',
            created: new Date(t.created_at).toLocaleString(), channel: t.channel || 'email',
            reply: t.reply || '',
          })));
        } else {
          setTickets(MOCK_TICKETS);
        }
      } catch {
        setTickets(MOCK_TICKETS);
      }
      setLoadingTickets(false);
    };
    load();
  }, []);

  const openCount = tickets.filter(t => t.status === 'Open').length;
  const resolvedCount = tickets.filter(t => t.status === 'Resolved').length;
  const avgSat = (tickets.filter(t => t.satisfaction).reduce((a, t) => a + t.satisfaction, 0) / Math.max(tickets.filter(t => t.satisfaction).length, 1)).toFixed(1);
  const filtered = filterStatus === 'All' ? tickets : tickets.filter(t => t.status === filterStatus);

  const PC = {
    Critical: { bg: 'rgba(244,63,94,0.12)', c: C.redL, b: 'rgba(244,63,94,0.3)' },
    High: { bg: 'rgba(245,158,11,0.12)', c: C.amberL, b: 'rgba(245,158,11,0.3)' },
    Medium: { bg: 'rgba(59,130,246,0.12)', c: C.blueL, b: 'rgba(59,130,246,0.3)' },
    Low: { bg: C.border, c: '#607898', b: C.border2 },
  };
  const SC = { Open: C.amberL, 'In Progress': C.blueL, Resolved: C.greenL };
  const ChanIcon = { email: Mail, chat: MessageSquare, phone: Phone };

  const handleResolve = async (displayId: string, dbId: number) => {
    const token = await getAdminToken?.();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (dbId) {
      await fetch(`/api/admin/tickets/${dbId}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'Resolved' }) }).catch(() => {});
    }
    setTickets(p => p.map(t => t.id === displayId ? { ...t, status: 'Resolved' } : t));
    if (selectedTicket?.id === displayId) setSelectedTicket((p: any) => ({ ...p, status: 'Resolved' }));
  };

  const handleEscalate = async (displayId: string, dbId: number) => {
    const token = await getAdminToken?.();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (dbId) await fetch(`/api/admin/tickets/${dbId}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'Escalated', priority: 'Critical' }) }).catch(() => {});
    setTickets(p => p.map(t => t.id === displayId ? { ...t, status: 'Escalated', priority: 'Critical' } : t));
    if (selectedTicket?.id === displayId) setSelectedTicket((p: any) => ({ ...p, status: 'Escalated', priority: 'Critical' }));
  };

  const handleBanUser = async (userId: string) => {
    const token = await getAdminToken?.();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await fetch(`/api/admin/users/${userId}/ban`, { method: 'PATCH', headers, body: JSON.stringify({ action: 'ban' }) }).catch(() => {});
    setActionUser(null);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket || sendingReply) return;
    setSendingReply(true);
    const token = await getAdminToken?.();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (selectedTicket._id) {
      const r = await fetch(`/api/admin/tickets/${selectedTicket._id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ reply: replyText, status: 'In Progress' }),
      }).catch(() => null);
      if (r?.ok) {
        setTickets(p => p.map(t => t.id === selectedTicket.id ? { ...t, reply: replyText, status: 'In Progress' } : t));
        setSelectedTicket((p: any) => ({ ...p, reply: replyText, status: 'In Progress' }));
        setReplyText('');
      }
    }
    setSendingReply(false);
  };

  const statCols = bp.isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const mainCols = bp.isDesktop ? '1fr 1fr' : '1fr';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
      {/* ── STAT CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: '3px' }}>
        {[
          { label: 'Open Tickets', value: openCount, icon: MessageSquare, color: C.amberL, glow: 'rgba(245,158,11,0.12)' },
          { label: 'Avg Response', value: '4m 12s', icon: Timer, color: C.greenL, glow: 'rgba(16,185,129,0.12)' },
          { label: 'Resolved Today', value: resolvedCount, icon: CheckCircle, color: C.indigoL, glow: 'rgba(0,200,224,0.12)' },
          { label: 'CSAT Score', value: avgSat + '/5', icon: Star, color: C.amberL, glow: 'rgba(245,158,11,0.12)' },
        ].map((s, i) => (
          <div key={i} style={{ ...cs, padding: '16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '56px', height: '56px', background: s.glow, borderRadius: '0 0 0 56px', pointerEvents: 'none' }} />
            <s.icon size={16} style={{ color: s.color, marginBottom: '12px' }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ color: C.muted, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}:</span>
              <span style={{ color: s.color, fontSize: '11px', fontWeight: 700 }}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: mainCols, gap: '3px', alignItems: 'stretch' }}>
        {/* LEFT — Support Queue */}
        <div style={{ ...cs, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ color: 'white', fontWeight: 700, fontSize: '15px', margin: 0 }}>Support Queue</h3>
            <div style={{ display: 'flex', gap: '3px', background: C.bg, padding: '3px', border: `1px solid ${C.border}` }}>
              {['All', 'Open', 'In Progress', 'Resolved'].map(f => (
                <button key={f} onClick={() => setFilterStatus(f)} style={{ ...btn, fontSize: '9px', padding: '4px 9px', background: filterStatus === f ? C.indigo : 'transparent', color: filterStatus === f ? 'white' : C.muted, border: 'none', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f}</button>
              ))}
            </div>
          </div>
          {filtered.map((ticket, idx) => {
            const pc = PC[ticket.priority];
            const CI = ChanIcon[ticket.channel];
            const sel = selectedTicket?.id === ticket.id;
            const isLast = idx === filtered.length - 1;
            return (
              <div key={ticket.id} onClick={() => setSelectedTicket(sel ? null : ticket)}
                style={{ padding: '13px 16px', borderBottom: isLast ? 'none' : `1px solid ${C.border}`, cursor: 'pointer', background: sel ? 'rgba(0,200,224,0.07)' : 'transparent', borderLeft: `3px solid ${sel ? C.indigo : 'transparent'}`, transition: 'background 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#3d5878', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em' }}>{ticket.id}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', background: pc.bg, color: pc.c, border: `1px solid ${pc.b}`, letterSpacing: '0.05em' }}>{ticket.priority}</span>
                    </div>
                    <p style={{ color: 'white', fontSize: '13px', fontWeight: 600, fontStyle: 'italic', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</p>
                    <p style={{ color: '#3d5878', fontSize: '11px', margin: 0 }}>{ticket.user} · {ticket.created}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                    <span style={{ color: SC[ticket.status], fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>{ticket.status}</span>
                    <CI size={12} style={{ color: C.dim }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', height: '100%' }}>
          <div style={{ ...cs, overflow: 'hidden' }}>
            {selectedTicket ? (
              <>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: '#3d5878', fontSize: '10px', fontWeight: 700, margin: 0, letterSpacing: '0.06em' }}>{selectedTicket.id}</p>
                    <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTicket.subject}</p>
                  </div>
                  <button onClick={() => setSelectedTicket(null)} style={{ ...btn, background: 'transparent', color: C.muted, padding: '4px', marginLeft: '8px' }}><X size={15} /></button>
                </div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: 'rgba(8,14,24,0.6)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', borderLeft: `3px solid ${C.indigo}` }}>
                    <div style={{ width: '34px', height: '34px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {selectedTicket.user.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: 0 }}>{selectedTicket.user}</p>
                      <p style={{ color: '#3d5878', fontSize: '11px', margin: 0 }}>{selectedTicket.email}</p>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', background: selectedTicket.status === 'Resolved' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: SC[selectedTicket.status], border: `1px solid ${SC[selectedTicket.status]}40`, whiteSpace: 'nowrap', flexShrink: 0 }}>{selectedTicket.status}</span>
                  </div>
                  <div>
                    <p style={{ ...lbl }}>Quick Actions</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {[
                        { label: 'Resolve', icon: CheckCircle, color: C.greenL, bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', action: () => handleResolve(selectedTicket.id, selectedTicket._id) },
                        { label: 'Escalate', icon: AlertTriangle, color: C.amberL, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', action: () => handleEscalate(selectedTicket.id, selectedTicket._id) },
                        { label: 'Ban User', icon: Ban, color: C.redL, bg: 'rgba(244,63,94,0.1)', border: 'rgba(244,63,94,0.2)', action: () => setActionUser({ name: selectedTicket.user, userId: selectedTicket.userId }) },
                        { label: 'Re-open', icon: RotateCcw, color: C.blueL, bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', action: async () => { const token = await getAdminToken?.(); const h: any = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }; if (selectedTicket._id) await fetch(`/api/admin/tickets/${selectedTicket._id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'Open' }) }).catch(()=>{}); setTickets(p => p.map(t => t.id === selectedTicket.id ? { ...t, status: 'Open' } : t)); setSelectedTicket((p: any) => ({ ...p, status: 'Open' })); } },
                      ].map((b, i) => (
                        <button key={i} onClick={b.action} style={{ ...btn, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '10px 6px', background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <b.icon size={13} />{b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p style={{ ...lbl }}>Reply to Customer</p>
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3} placeholder="Type your response..." style={{ ...inp, resize: 'none', display: 'block', fontSize: '13px' }} />
                    <button onClick={handleSendReply} disabled={sendingReply} style={{ ...btn, marginTop: '8px', width: '100%', background: C.indigo, color: 'white', padding: '10px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: sendingReply ? 0.6 : 1 }}>
                      <Send size={12} /> {sendingReply ? 'Sending…' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', background: 'rgba(8,14,24,0.8)', border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <MessageSquare size={22} style={{ color: C.border2 }} />
                </div>
                <p style={{ color: '#3d5878', fontSize: '13px', margin: 0, fontWeight: 500 }}>Select a ticket to view details</p>
                <p style={{ color: '#2d3d52', fontSize: '11px', margin: '4px 0 0' }}>Click any ticket from the queue</p>
              </div>
            )}
          </div>
          <div style={{ ...cs, overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>User Quick Manage</h3>
              <Users size={13} style={{ color: '#3d5878' }} />
            </div>
            {apiUsers.slice(0, 5).map((u, idx) => {
              const isAdmin = u.role === 'admin';
              const displayName = (u.full_name || u.email?.split('@')[0] || 'User') as string;
              const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
              const statusColor = isAdmin ? C.amberL : C.green;
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: idx < Math.min(apiUsers.length, 5) - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: '30px', height: '30px', background: C.border, border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: 'white', fontSize: '12px', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }} />
                      <span style={{ color: statusColor, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{u.role}</span>
                    </div>
                  </div>
                  <Eye size={11} style={{ color: '#3d5878', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {actionUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, padding: '28px', maxWidth: '340px', width: '100%', border: `1px solid rgba(244,63,94,0.3)` }}>
            <div style={{ width: '44px', height: '44px', background: 'rgba(244,63,94,0.1)', border: `1px solid rgba(244,63,94,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Ban size={20} style={{ color: C.redL }} />
            </div>
            <p style={{ color: 'white', fontWeight: 700, fontSize: '17px', textAlign: 'center', margin: '0 0 8px' }}>Confirm Ban</p>
            <p style={{ color: '#3d5878', fontSize: '13px', textAlign: 'center', margin: '0 0 20px' }}>This will suspend <strong style={{ color: 'white' }}>{actionUser}</strong></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button onClick={() => setActionUser(null)} style={{ ...btn, padding: '10px', background: 'transparent', color: '#607898', border: `1px solid ${C.border2}`, fontSize: '13px' }}>Cancel</button>
              <button onClick={() => setActionUser(null)} style={{ ...btn, padding: '10px', background: '#dc2626', color: 'white', border: 'none', fontSize: '13px' }}>Ban Account</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SYSTEM MONITOR ──────────────────────────────────────────────────────────
const SERVICE_GROUPS = {
  'Infrastructure': ['Database', 'Auth / Logins', 'Cache Layer', 'App Loading'],
  'Features':       ['Blog', 'Journal', 'Economic Calendar', 'TSC Page'],
  'Services':       ['Price Feed', 'Gemini AI', 'Telegram Bot', 'Copy Trading Bridge'],
};

const SystemMonitorSection = ({ bp, getAdminToken = null }) => {
  const [metrics, setMetrics]     = useState<any>(null);
  const [logs, setLogs]           = useState<any[]>([]);
  const [services, setServices]   = useState<any[]>([]);
  const [svcState, setSvcState]   = useState<any>(null);
  const [history, setHistory]     = useState<any>({ cpu: [], memory: [], latency: [], requests: [] });
  const [isLive, setIsLive]       = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingHealth, setLoadingHealth]   = useState(true);
  const [resolvedIds, setResolvedIds] = useState(new Set<number>());
  const timerRef    = useRef<any>(null);
  const logTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!isLive) { clearInterval(timerRef.current); clearInterval(logTimerRef.current); return; }

    const getHeaders = async () => {
      const token = await getAdminToken?.();
      const h: Record<string, string> = {};
      if (token) h['Authorization'] = `Bearer ${token}`;
      return h;
    };

    const pollMetrics = async () => {
      try {
        const h = await getHeaders();
        const r = await fetch('/api/admin/metrics', { headers: h });
        if (r.ok) {
          const d = await r.json();
          const cpuVal = +(d.cpu ?? 0);
          const memVal = +(d.memory ?? 0);
          const reqVal = +(d.reqPerSec ?? 0);
          const lat    = +(d.latency ?? 0);
          setMetrics({ cpu: cpuVal, memory: memVal, uptime: +(d.uptimeSec / 3600 / 24).toFixed(2), requestsPerSec: Math.round(reqVal), latency: lat, errorRate: +(d.errorRate ?? 0) });
          setHistory((prev: any) => ({
            cpu:      [...(prev.cpu.slice(-11)),      cpuVal],
            memory:   [...(prev.memory.slice(-11)),   memVal],
            latency:  [...(prev.latency.slice(-11)),  lat],
            requests: [...(prev.requests.slice(-11)), Math.round(reqVal)],
          }));
          setLoadingMetrics(false);
        }
      } catch {}
    };

    const pollHealth = async () => {
      try {
        const h = await getHeaders();
        const r = await fetch('/api/admin/health', { headers: h });
        if (r.ok) {
          const d = await r.json();
          setServices(d.services ?? []);
          setLoadingHealth(false);
        }
      } catch {}
    };

    const pollLogs = async () => {
      try {
        const h = await getHeaders();
        const r = await fetch('/api/admin/logs', { headers: h });
        if (r.ok) { const d = await r.json(); if (d.logs?.length) setLogs(d.logs.slice(0, 20)); }
      } catch {}
    };

    const pollSvcState = async () => {
      try {
        const h = await getHeaders();
        const r = await fetch('/api/admin/services-state', { headers: h });
        if (r.ok) setSvcState(await r.json());
      } catch {}
    };

    pollMetrics(); pollHealth(); pollLogs(); pollSvcState();
    timerRef.current    = setInterval(pollMetrics, 4000);
    logTimerRef.current = setInterval(() => { pollHealth(); pollLogs(); pollSvcState(); }, 15000);
    return () => { clearInterval(timerRef.current); clearInterval(logTimerRef.current); };
  }, [isLive]);

  const resolveLog  = (id: number) => setResolvedIds(prev => new Set([...prev, id]));
  const errorCount  = logs.filter(l => l.level === 'error' && !resolvedIds.has(l.id)).length;
  const warnCount   = logs.filter(l => l.level === 'warn'  && !resolvedIds.has(l.id)).length;
  const allOk       = services.length > 0 && services.every(s => s.status === 'operational' || s.status === 'not-configured');
  const anyDegraded = services.some(s => s.status === 'degraded');
  const healthy     = !anyDegraded && (!metrics || (metrics.cpu < 80 && metrics.latency < 200));
  const statusLabel = loadingHealth ? 'Checking…' : anyDegraded ? 'Degraded Performance' : allOk ? 'All Systems Operational' : 'Checking…';
  const LC = { error: { bg: 'rgba(244,63,94,0.1)', c: C.redL, b: 'rgba(244,63,94,0.2)' }, warn: { bg: 'rgba(245,158,11,0.1)', c: C.amberL, b: 'rgba(245,158,11,0.2)' }, info: { bg: C.border, c: C.muted, b: C.border2 } };
  const metricCols = bp.isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const Skeleton = ({ w = '100%', h = 14 }: { w?: string|number; h?: number }) => (
    <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.06)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
      {/* ── Status banner ── */}
      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', border: `1px solid ${loadingHealth ? C.border : healthy ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`, background: loadingHealth ? 'transparent' : healthy ? 'rgba(16,185,129,0.05)' : 'rgba(244,63,94,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: loadingHealth ? C.muted : healthy ? C.green : C.red, boxShadow: loadingHealth ? 'none' : healthy ? `0 0 8px ${C.green}` : `0 0 8px ${C.red}` }} />
          <span style={{ color: loadingHealth ? C.muted : healthy ? C.greenL : C.redL, fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{statusLabel}</span>
        </div>
        <button onClick={() => setIsLive(p => !p)} style={{ ...btn, padding: '5px 12px', background: isLive ? 'rgba(16,185,129,0.1)' : C.border, color: isLive ? C.greenL : C.muted, border: `1px solid ${isLive ? 'rgba(16,185,129,0.3)' : C.border2}`, fontSize: '11px', textTransform: 'uppercase' }}>{isLive ? '● Live' : '⏸ Paused'}</button>
      </div>

      {/* ── Server metrics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: metricCols, gap: '6px' }}>
        {[
          { label: 'CPU Usage',  val: metrics?.cpu,            unit: '%',  icon: Cpu,      danger: (metrics?.cpu ?? 0) > 80  },
          { label: 'Memory',     val: metrics?.memory,         unit: '%',  icon: Database, danger: (metrics?.memory ?? 0) > 85 },
          { label: 'Latency',    val: metrics?.latency,        unit: 'ms', icon: Zap,      danger: (metrics?.latency ?? 0) > 200 },
          { label: 'Req / sec',  val: metrics?.requestsPerSec, unit: '',   icon: Activity, danger: false },
        ].map((m, i) => (
          <div key={i} style={{ ...cs, padding: '14px', borderColor: m.danger ? 'rgba(244,63,94,0.3)' : C.border }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <m.icon size={14} style={{ color: m.danger ? C.redL : '#3d5878' }} />
              {loadingMetrics ? <Skeleton w={36} h={36} /> : <GaugeRing value={m.unit === '%' ? (m.val ?? 0) : Math.min(((m.val ?? 0) / 2000) * 100, 100)} color={C.indigo} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ color: C.muted, fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}:</span>
              {loadingMetrics
                ? <Skeleton w={40} h={12} />
                : <span style={{ color: m.danger ? C.redL : 'white', fontSize: '11px', fontWeight: 700 }}>{m.val ?? '—'}<span style={{ fontSize: '9px', color: C.muted, marginLeft: '2px' }}>{m.unit}</span></span>
              }
            </div>
          </div>
        ))}
      </div>

      {/* ── Feature / service status (grouped) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: bp.isMobile ? '1fr' : 'repeat(3,1fr)', gap: '6px' }}>
        {Object.entries(SERVICE_GROUPS).map(([group, names]) => {
          const groupSvcs = loadingHealth
            ? names.map(n => ({ name: n, status: 'loading' }))
            : names.map(n => services.find(s => s.name === n) ?? { name: n, status: 'unknown' });
          const groupOk  = groupSvcs.every(s => s.status === 'operational' || s.status === 'not-configured');
          const groupBad = groupSvcs.some(s => s.status === 'degraded');
          return (
            <div key={group} style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '12px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group}</h3>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: loadingHealth ? C.muted : groupBad ? C.red : groupOk ? C.green : C.muted, boxShadow: loadingHealth ? 'none' : groupBad ? `0 0 5px ${C.red}` : `0 0 5px ${C.green}` }} />
              </div>
              {groupSvcs.map((svc: any, i: number) => {
                const isOk   = svc.status === 'operational';
                const isDeg  = svc.status === 'degraded';
                const isNC   = svc.status === 'not-configured';
                const isLoad = svc.status === 'loading';
                const dotClr = isOk ? C.green : isDeg ? C.red : isNC ? C.amber : C.muted;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: isDeg ? 'rgba(244,63,94,0.04)' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      {isLoad
                        ? <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.muted, opacity: 0.4 }} />
                        : <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotClr, boxShadow: (isOk || isDeg) ? `0 0 5px ${dotClr}` : 'none' }} />
                      }
                      <span style={{ fontSize: '12px', color: isDeg ? C.redL : isNC ? C.amberL : isLoad ? C.dim : '#cbd5e1', fontWeight: 600 }}>{svc.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {svc.latency && <span style={{ fontSize: '10px', fontFamily: 'monospace', color: C.dim }}>{svc.latency}</span>}
                      {isLoad
                        ? <Skeleton w={52} h={16} />
                        : <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', background: isOk ? 'rgba(16,185,129,0.1)' : isDeg ? 'rgba(244,63,94,0.1)' : isNC ? 'rgba(245,158,11,0.1)' : 'rgba(100,116,139,0.1)', color: isOk ? C.greenL : isDeg ? C.redL : isNC ? C.amberL : C.muted, border: `1px solid ${isOk ? 'rgba(16,185,129,0.2)' : isDeg ? 'rgba(244,63,94,0.2)' : isNC ? 'rgba(245,158,11,0.2)' : C.border2}` }}>
                            {isOk ? 'OK' : isDeg ? 'DOWN' : isNC ? 'not set' : svc.status}
                          </span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Background services state ── */}
      {(() => {
        const fmtAge = (ts: number | null) => {
          if (!ts) return '—';
          const s = Math.floor((Date.now() - ts) / 1000);
          if (s < 60)  return `${s}s ago`;
          if (s < 3600) return `${Math.floor(s/60)}m ago`;
          return `${Math.floor(s/3600)}h ago`;
        };
        const srcColor = (src: string) => src === 'myfxbook' ? C.greenL : src === 'tradingview' ? C.amberL : C.muted;
        const srcLabel = (src: string) => src === 'myfxbook' ? 'MyFXBook' : src === 'tradingview' ? 'TradingView ↩' : '—';
        const dot = (ok: boolean | null) => (
          <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: ok === null ? C.muted : ok ? C.green : C.red,
            boxShadow: ok === null ? 'none' : ok ? `0 0 5px ${C.green}` : `0 0 5px ${C.red}` }} />
        );
        const Row = ({ label, children }: { label: string; children: any }) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.04em' }}>{label}</span>
            <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600, textAlign: 'right' }}>{children}</span>
          </div>
        );
        const cal = svcState?.calendar;
        const rates = svcState?.rates;
        const sig = svcState?.signals;
        const db = svcState?.dbPool;
        return (
          <div style={{ display: 'grid', gridTemplateColumns: bp.isMobile ? '1fr' : 'repeat(2,1fr)', gap: '6px' }}>
            {/* Calendar */}
            <div style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '12px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Economic Calendar</h3>
                {dot(cal ? cal.eventCount > 0 : null)}
              </div>
              <Row label="Source">{cal ? <span style={{ color: srcColor(cal.source) }}>{srcLabel(cal.source)}</span> : '—'}</Row>
              <Row label="Events cached">{cal?.eventCount ?? '—'}</Row>
              <Row label="Last fetch">{fmtAge(cal?.fetchedAt)}</Row>
              <Row label="In-flight">{cal?.inFlight ? <span style={{ color: C.amberL }}>fetching…</span> : 'idle'}</Row>
              {cal?.lastError && <Row label="Last error"><span style={{ color: C.redL, fontSize: 10 }}>{cal.lastError.slice(0, 40)}</span></Row>}
            </div>

            {/* Interest rates */}
            <div style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '12px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Interest Rates</h3>
                {dot(rates ? rates.liveCount > 0 : null)}
              </div>
              <Row label="Live">{rates ? <span style={{ color: rates.liveCount > 0 ? C.greenL : C.muted }}>{rates.liveCount} currencies</span> : '—'}</Row>
              <Row label="Fallback">{rates ? <span style={{ color: rates.fallbackCount > 0 ? C.amberL : C.muted }}>{rates.fallbackCount} currencies</span> : '—'}</Row>
              <Row label="Last fetch">{fmtAge(rates?.fetchedAt)}</Row>
              <Row label="In-flight">{rates?.inFlight ? <span style={{ color: C.amberL }}>fetching…</span> : 'idle'}</Row>
              {rates?.lastError && <Row label="Last error"><span style={{ color: C.redL, fontSize: 10 }}>{rates.lastError.slice(0, 40)}</span></Row>}
            </div>

            {/* Signal monitor */}
            <div style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '12px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Signal Monitor</h3>
                {dot(sig ? sig.running : null)}
              </div>
              <Row label="Status">{sig ? <span style={{ color: sig.running ? C.greenL : C.muted }}>{sig.running ? 'Running' : 'Stopped'}</span> : '—'}</Row>
              <Row label="Active signals">{sig?.lastActiveCount ?? '—'}</Row>
              <Row label="Last scan">{fmtAge(sig?.lastScanAt)}</Row>
              {sig?.lastError && <Row label="Last error"><span style={{ color: C.redL, fontSize: 10 }}>{sig.lastError.slice(0, 40)}</span></Row>}
            </div>

            {/* DB pool */}
            <div style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '12px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>DB Connection Pool</h3>
                {dot(db ? db.waiting === 0 : null)}
              </div>
              <Row label="Total connections">{db?.total ?? '—'}</Row>
              <Row label="Idle">{db?.idle ?? '—'}</Row>
              <Row label="Waiting">{db ? <span style={{ color: (db.waiting ?? 0) > 0 ? C.amberL : C.muted }}>{db.waiting ?? '—'}</span> : '—'}</Row>
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ ...cs, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ color: 'white', fontWeight: 700, margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live Event Log</h3>
              {errorCount > 0 && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', background: 'rgba(244,63,94,0.12)', color: C.redL, border: `1px solid rgba(244,63,94,0.25)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{errorCount} errors</span>}
              {warnCount > 0 && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', background: 'rgba(245,158,11,0.12)', color: C.amberL, border: `1px solid rgba(245,158,11,0.25)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{warnCount} warn</span>}
            </div>
            <button onClick={() => setResolvedIds(new Set(logs.map(l => l.id)))} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Trash2 size={11} /> Clear</button>
          </div>
          <div style={{ overflowY: 'auto', fontFamily: 'monospace', flex: 1 }}>
            {logs.filter(l => !resolvedIds.has(l.id)).length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <CheckCircle size={24} style={{ color: C.green, margin: '0 auto 8px' }} />
                <p style={{ color: C.muted, fontSize: '12px', margin: 0 }}>No active incidents</p>
              </div>
            ) : logs.filter(l => !resolvedIds.has(l.id)).map(log => {
              const lc = LC[log.level];
              const levelColor = log.level === 'error' ? C.red : log.level === 'warn' ? C.amber : '#3d5878';
              return (
                <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '11px 16px', borderBottom: `1px solid ${C.border}`, background: log.level === 'error' ? 'rgba(244,63,94,0.03)' : log.level === 'warn' ? 'rgba(245,158,11,0.02)' : 'transparent' }}>
                  <div style={{ width: '3px', alignSelf: 'stretch', background: levelColor, borderRadius: '2px', flexShrink: 0, minHeight: '36px', opacity: 0.8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', background: lc.bg, color: lc.c, border: `1px solid ${lc.b}`, letterSpacing: '0.06em' }}>{log.level}</span>
                      <span style={{ color: '#3d5878', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em' }}>{log.service}</span>
                      <span style={{ color: C.dim, fontSize: '9px', marginLeft: 'auto' }}>{log.time}</span>
                    </div>
                    <p style={{ color: log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fde68a' : '#607898', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>{log.message}</p>
                  </div>
                  {log.level !== 'info' && (
                    <button onClick={() => resolveLog(log.id)} title="Mark resolved" style={{ ...btn, background: 'transparent', color: C.dim, border: `1px solid ${C.border2}`, padding: '4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── BLOG SECTION ────────────────────────────────────────────────────────────
const BlogSection = ({ bp }) => {
  const [posts, setPosts] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalTab, setModalTab] = useState('post');
  const [saving, setSaving] = useState(false);
  const [editorInitialData, setEditorInitialData] = useState<Partial<BlogEditorData>>({});

  const getToken = async () => {
    const r = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
    return (r as any).data?.session?.access_token as string | null;
  };

  const getAdminHeaders = async (withContentType = false): Promise<Record<string, string>> => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (withContentType) headers['Content-Type'] = 'application/json';
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      const secret = import.meta.env.VITE_ADMIN_SECRET;
      if (secret) headers['X-Admin-Secret'] = secret;
    }
    return headers;
  };

  useEffect(() => {
    getAdminHeaders().then(headers => {
      fetch('/api/blog/all', { headers })
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          setPosts(data.map((p: any) => ({
            id: p.id, title: p.title, section: p.section ?? 'blog',
            category: p.category ?? 'Analysis',
            status: p.status ?? 'Draft', author: p.author ?? 'Admin',
            date: p.date, signal: p.signalData ?? p.signal_data ?? null,
            imageUrl: p.imageUrl ?? p.image_url ?? '',
            excerpt: p.excerpt ?? '',
            content: p.content ?? '',
            readTime: p.readTime ?? p.read_time ?? '5 min',
            authorData: p.authorData ?? p.author_data ?? null,
          })));
        })
        .catch(() => {});
    });
  }, []);

  const filtered = activeSection === 'all' ? posts
    : activeSection === 'drafts' ? posts.filter(p => p.status === 'Draft')
    : posts.filter(p => p.section === activeSection);
  const openNew = () => {
    setEditPost(null);
    setForm(EMPTY_FORM);
    setEditorInitialData({});
    setModalTab('post');
    setShowModal(true);
  };
  const openEdit = (post: any) => {
    const ad = post.authorData || {};
    setEditPost(post);
    setForm({
      ...EMPTY_FORM,
      title: post.title, section: CATEGORY_TO_SECTION[post.category] ?? post.section ?? 'blog', category: post.category || 'Analysis', status: post.status,
      imageUrl: post.imageUrl || '', excerpt: post.excerpt || '', content: post.content || '', readTime: post.readTime || '5 min',
      authorName: post.author || '', authorBio: ad.bio || '', authorExpertise: ad.expertise || [],
      authorTwitter: ad.twitter || '', authorLinkedin: ad.linkedin || '', authorTelegram: ad.telegram || '',
      signal: post.signal || EMPTY_FORM.signal,
    });
    setEditorInitialData({
      title:           post.title,
      excerpt:         post.excerpt || '',
      summary:         post.summary || '',
      imageUrl:        post.imageUrl || '',
      readTime:        post.readTime || '5 min',
      content:         post.content || '',
      category:        post.category || 'Analysis',
      status:          post.status || 'Draft',
      authorName:      post.author || '',
      authorBio:       ad.bio || '',
      authorExpertise: ad.expertise || [],
      authorTwitter:   ad.twitter || '',
      authorLinkedin:  ad.linkedin || '',
      authorTelegram:  ad.telegram || '',
    });
    setModalTab('post');
    setShowModal(true);
  };

  const uploadCoverImage = async (dataUrl: string): Promise<string> => {
    if (!supabase) return dataUrl;
    try {
      const res  = await fetch(dataUrl);
      const blob = await res.blob();
      const ext  = blob.type.split('/')[1] || 'jpg';
      const path = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: up, error } = await supabase.storage
        .from('blog-images')
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (error || !up) return dataUrl;
      const { data: pub } = supabase.storage.from('blog-images').getPublicUrl(up.path);
      return pub.publicUrl;
    } catch {
      return dataUrl;
    }
  };

  const handleEditorSubmit = async (data: BlogEditorData) => {
    if (!data.title.trim() || saving) return;
    setSaving(true);
    try {
      const headers = await getAdminHeaders(true);

      // Upload base64 cover to Supabase Storage — avoids bloating the DB
      let imageUrl = data.imageUrl || '';
      if (imageUrl.startsWith('data:')) {
        imageUrl = await uploadCoverImage(imageUrl);
      }

      const derivedSection = CATEGORY_TO_SECTION[data.category] ?? 'blog';
      const authorData = {
        bio:       data.authorBio,
        expertise: data.authorExpertise,
        twitter:   data.authorTwitter,
        linkedin:  data.authorLinkedin,
        telegram:  data.authorTelegram,
      };
      const payload = {
        title:      data.title.trim(),
        section:    derivedSection,
        status:     data.status,
        category:   data.category,
        author:     data.authorName || 'Admin',
        date:       new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        imageUrl,
        videoUrl:   data.videoUrl || '',
        excerpt:    data.excerpt || '',
        summary:    data.summary || '',
        content:    data.content || '',
        readTime:   data.readTime || '5 min',
        signalData: null,
        authorData,
      };
      const body = JSON.stringify(payload);
      if (editPost) {
        const r = await fetch(`/api/blog/${editPost.id}`, { method: 'PATCH', headers, body });
        if (r.ok) {
          const savedPost = await r.json();
          setPosts(p => p.map(x => x.id === editPost.id ? { ...x, ...savedPost, category: savedPost.category, authorData: savedPost.authorData } : x));
        } else {
          const err = await r.json().catch(() => ({}));
          alert(`Failed to save post: ${err.error || `Server error ${r.status}`}`);
          return;
        }
      } else {
        const r = await fetch('/api/blog', { method: 'POST', headers, body });
        if (r.ok) {
          const savedPost = await r.json();
          setPosts(p => [...p, {
            id: savedPost.id, title: savedPost.title, section: savedPost.section,
            category: savedPost.category, status: savedPost.status, author: savedPost.author,
            date: savedPost.date, signal: savedPost.signalData,
            imageUrl: savedPost.imageUrl ?? '', excerpt: savedPost.excerpt ?? '',
            content: savedPost.content ?? '', readTime: savedPost.readTime ?? '5 min',
            authorData: savedPost.authorData,
          }]);
        } else {
          const err = await r.json().catch(() => ({}));
          alert(`Failed to save post: ${err.error || `Server error ${r.status}`}`);
          return;
        }
      }
      setShowModal(false);
    } catch (err: any) {
      alert(`Unexpected error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      const headers = await getAdminHeaders(true);
      const f = form as any;
      // Social media handles are optional — always send safe defaults
      const authorData = {
        bio:       f.authorBio       || '',
        expertise: f.authorExpertise || [],
        twitter:   f.authorTwitter   || '',
        linkedin:  f.authorLinkedin  || '',
        telegram:  f.authorTelegram  || '',
      };
      const derivedSection = CATEGORY_TO_SECTION[f.category] ?? 'blog';
      const payload = {
        title: form.title.trim(), section: derivedSection, status: form.status,
        category: f.category || 'Analysis',
        author: f.authorName || 'Admin',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        imageUrl: f.imageUrl || '',
        excerpt: f.excerpt || '',
        content: f.content || '',
        readTime: f.readTime || '5 min',
        signalData: f.category === 'Trade Signals' ? form.signal : null,
        authorData,
      };
      const body = JSON.stringify(payload);
      let savedPost: any = null;
      let saveError: string | null = null;
      if (editPost) {
        const r = await fetch(`/api/blog/${editPost.id}`, { method: 'PATCH', headers, body });
        if (r.ok) {
          savedPost = await r.json();
          setPosts(p => p.map(x => x.id === editPost.id ? { ...x, ...savedPost, category: savedPost.category, authorData: savedPost.authorData } : x));
        } else {
          const err = await r.json().catch(() => ({}));
          saveError = err.error || `Server error ${r.status}`;
        }
      } else {
        const r = await fetch('/api/blog', { method: 'POST', headers, body });
        if (r.ok) {
          savedPost = await r.json();
          setPosts(p => [...p, { id: savedPost.id, title: savedPost.title, section: savedPost.section, category: savedPost.category, status: savedPost.status, author: savedPost.author, date: savedPost.date, signal: savedPost.signalData, imageUrl: savedPost.imageUrl ?? '', excerpt: savedPost.excerpt ?? '', content: savedPost.content ?? '', readTime: savedPost.readTime ?? '5 min', authorData: savedPost.authorData }]);
        } else {
          const err = await r.json().catch(() => ({}));
          saveError = err.error || `Server error ${r.status}`;
        }
      }
      if (saveError) { alert(`Failed to save post: ${saveError}`); return; }
      // If publishing, trigger share links for selected platforms
      if (savedPost && form.status === 'Published' && (f.shareOn || []).length > 0) {
        const postUrl = encodeURIComponent(window.location.origin + '/blog');
        const postTitle = encodeURIComponent(form.title);
        const shareUrls: Record<string, string> = {
          twitter:  `https://twitter.com/intent/tweet?text=${postTitle}&url=${postUrl}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${postUrl}`,
          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${postUrl}`,
          telegram: `https://t.me/share/url?url=${postUrl}&text=${postTitle}`,
        };
        (f.shareOn as string[]).forEach((platform, i) => {
          const url = shareUrls[platform];
          if (url) setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500'), i * 400);
        });
      }
      setShowModal(false);
    } catch (err: any) {
      alert(`Unexpected error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: any) => {
    const headers = await getAdminHeaders();
    const r = await fetch(`/api/blog/${id}`, { method: 'DELETE', headers });
    if (r.ok) setPosts(p => p.filter(x => x.id !== id));
  };

  const toggleStatus = async (id: any) => {
    const post = posts.find(x => x.id === id);
    if (!post) return;
    const newStatus = post.status === 'Published' ? 'Draft' : 'Published';
    const headers = await getAdminHeaders(true);
    const r = await fetch(`/api/blog/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: newStatus }) });
    if (r.ok) setPosts(p => p.map(x => x.id === id ? { ...x, status: newStatus } : x));
  };
  const fv = k => form[k]; const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setSig = (k, v) => setForm(p => ({ ...p, signal: { ...p.signal, [k]: v } }));
  const sg = k => form.signal[k];

  const TABS = [{ id: 'post', label: 'Post', icon: FileText }, { id: 'author', label: 'Author', icon: Users }, { id: 'share', label: 'Share', icon: Globe }];
  const postCols = bp.isMobile ? '1fr' : 'repeat(2, 1fr)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
      <div>
        <h2 style={{ color: 'white', fontWeight: 700, fontSize: '20px', margin: 0 }}>Content Manager</h2>
        <p style={{ color: C.muted, fontSize: '13px', margin: '4px 0 0' }}>Blog & Verified Strategies</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '3px', background: C.card, border: `1px solid ${C.border}`, padding: '3px', flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All', count: posts.length }, { id: 'blog', label: 'Blog', count: posts.filter(p => p.section === 'blog').length }, { id: 'verified-strategies', label: bp.isMobile ? 'Strats' : 'Strategies', count: posts.filter(p => p.section === 'verified-strategies').length }, { id: 'drafts', label: 'Drafts', count: posts.filter(p => p.status === 'Draft').length }].map(tab => (
            <button key={tab.id} onClick={() => setActiveSection(tab.id)} style={{ ...btn, padding: '7px 13px', background: activeSection === tab.id ? (tab.id === 'drafts' ? 'rgba(245,158,11,0.12)' : C.indigo) : 'transparent', color: activeSection === tab.id ? (tab.id === 'drafts' ? C.amberL : 'white') : C.muted, fontSize: '12px', border: activeSection === tab.id && tab.id === 'drafts' ? `1px solid rgba(245,158,11,0.3)` : 'none', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              {tab.label}
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', background: activeSection === tab.id ? (tab.id === 'drafts' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.2)') : C.border, color: activeSection === tab.id ? (tab.id === 'drafts' ? C.amberL : 'white') : C.muted }}>{tab.count}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {showModal && (
            <button onClick={() => setShowModal(false)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', color: C.muted, padding: '9px 14px', fontSize: '13px', border: `1px solid ${C.border2}` }}>
              <X size={14} /> Back to Posts
            </button>
          )}
          <button onClick={openNew} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '7px', background: C.indigo, color: 'white', padding: '9px 16px', fontSize: '13px', border: 'none', whiteSpace: 'nowrap' }}><Plus size={15} /> New Post</button>
        </div>
      </div>
      {showModal ? (
        <BlogPostEditor
          initialData={editorInitialData}
          editPost={editPost}
          onSubmit={handleEditorSubmit}
          onCancel={() => setShowModal(false)}
          saving={saving}
        />
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: postCols, gap: '6px' }}>
        {filtered.map(post => {
          const sec = SECTION_META[post.section];
          const sig = post.signal;
          if (sig && post.section === 'trade-signals') {
            const isBuy = sig.action === 'BUY';
            return (
              <div key={post.id} style={{ ...cs, overflow: 'hidden', borderColor: isBuy ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)' }}>
                <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', background: isBuy ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: isBuy ? C.greenL : C.redL, fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em', fontFamily: "'DM Mono', monospace" }}>{sig.pair}</span>
                    <span style={{ background: isBuy ? C.green : C.red, color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 8px', textTransform: 'uppercase' }}>{sig.action}</span>
                    <span style={{ background: C.border, color: C.muted, fontSize: '10px', padding: '2px 6px' }}>{sig.timeframe}</span>
                  </div>
                  <span style={{ color: C.dim, fontSize: '10px' }}>{post.date}</span>
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
                    {[{ label: 'Entry', value: sig.entry, color: 'white' }, { label: 'SL', value: sig.sl, color: C.redL }, { label: 'TP1', value: sig.tp1, color: C.greenL }, { label: 'TP2', value: sig.tp2 || '-', color: sig.tp2 ? '#6ee7b7' : '#3d5878' }].map(({ label, value, color }) => (
                      <div key={label} style={{ background: 'rgba(8,14,24,0.6)', padding: '7px', textAlign: 'center' }}>
                        <p style={{ color: C.muted, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 3px' }}>{label}</p>
                        <p style={{ color, fontSize: '12px', fontWeight: 700, margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                  {sig.rationale && <p style={{ color: '#3d5878', fontSize: '12px', margin: '0 0 10px', fontStyle: 'italic', borderLeft: `2px solid ${C.border}`, paddingLeft: '8px' }}>{sig.rationale}</p>}
                  <div style={{ paddingTop: '10px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                    <button onClick={() => toggleStatus(post.id)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', fontSize: '11px', padding: '3px 7px' }}>{post.status === 'Published' ? 'Unpublish' : 'Publish'}</button>
                    <button onClick={() => openEdit(post)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', fontSize: '11px', padding: '3px 7px' }}>Edit</button>
                    <button onClick={() => handleDelete(post.id)} style={{ ...btn, background: 'transparent', color: C.redL, border: 'none', fontSize: '11px', padding: '3px 7px' }}>Delete</button>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={post.id} style={{ ...cs, padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', background: post.status === 'Published' ? 'rgba(16,185,129,0.1)' : C.border, color: post.status === 'Published' ? C.greenL : C.muted, border: `1px solid ${post.status === 'Published' ? 'rgba(16,185,129,0.2)' : C.border2}` }}>{post.status}</span>
                    {post.category && (() => { const m = CATEGORY_META[post.category]; return m ? <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>{post.category}</span> : null; })()}
                  </div>
                  <span style={{ color: C.dim, fontSize: '10px' }}>{post.date}</span>
                </div>
                <h4 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: '0 0 6px' }}>{post.title}</h4>
                {post.excerpt ? <p style={{ color: '#607898', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>{post.excerpt}</p> : <p style={{ color: '#3d5878', fontSize: '12px', margin: 0, fontStyle: 'italic' }}>No excerpt — add one when editing.</p>}
              </div>
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{ color: C.dim, fontSize: '11px' }}>By {post.author}{post.readTime ? ` · ${post.readTime}` : ''}</span>
                <div style={{ display: 'flex', gap: '3px' }}>
                  <button onClick={() => toggleStatus(post.id)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', fontSize: '11px', padding: '3px 7px' }}>{post.status === 'Published' ? 'Unpublish' : 'Publish'}</button>
                  <button onClick={() => openEdit(post)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', fontSize: '11px', padding: '3px 7px' }}>Edit</button>
                  <button onClick={() => handleDelete(post.id)} style={{ ...btn, background: 'transparent', color: C.redL, border: 'none', fontSize: '11px', padding: '3px 7px' }}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

// ─── MARKETING SECTION ───────────────────────────────────────────────────────
const MarketingSection = ({ bp, getAdminToken = null }) => {
  const [activeChannels, setActiveChannels] = useState(['In-App']);
  const [audience, setAudience] = useState('all');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [stats, setStats] = useState<any>(null);

  const getHdrs = async () => {
    const token = await getAdminToken?.();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const loadStats = async () => {
    const h = await getHdrs();
    const r = await fetch('/api/admin/campaign-stats', { headers: h }).catch(() => null);
    if (r?.ok) setStats(await r.json());
  };

  useEffect(() => { loadStats(); }, []);

  const toggleChannel = label => {
    setActiveChannels(prev =>
      prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]
    );
  };

  const handleSend = async () => {
    if (!message.trim() || activeChannels.length === 0 || sending) return;
    setSending(true); setResult(null);
    try {
      const h = await getHdrs();
      const r = await fetch('/api/admin/campaigns', {
        method: 'POST', headers: h,
        body: JSON.stringify({ channels: activeChannels, audience, subject, message }),
      });
      const data = await r.json();
      setResult({ ok: r.ok, msg: r.ok ? (data.message ?? `Sent to ${data.sent ?? 0} users`) : (data.error ?? 'Failed to send') });
      if (r.ok) { setSubject(''); setMessage(''); loadStats(); }
    } catch {
      setResult({ ok: false, msg: 'Network error — please retry' });
    }
    setSending(false);
  };

  const CHANNELS = [
    { icon: Mail, label: 'Email' },
    { icon: AlertCircle, label: 'Push' },
    { icon: ShieldCheck, label: 'In-App' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: bp.isDesktop ? '2fr 1fr' : '1fr', gap: '6px', flex: 1, alignContent: 'start' }}>
      <div style={{ ...cs, padding: '24px' }}>
        <h3 style={{ color: 'white', fontWeight: 700, fontStyle: 'italic', fontSize: '17px', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Megaphone size={17} style={{ color: C.indigoL }} /> Multi-Channel Broadcast
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ ...lbl }}>Target Audience</label>
            <select value={audience} onChange={e => setAudience(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="all">All Users</option>
              <option value="free">Free Plan Only</option>
              <option value="inactive">Inactive Users (30d+)</option>
            </select>
          </div>
          <div>
            <label style={{ ...lbl }}>Channel</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {CHANNELS.map(({ icon: Icon, label }) => {
                const active = activeChannels.includes(label);
                return (
                  <button key={label} onClick={() => toggleChannel(label)} style={{ ...btn, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', padding: '14px 8px', background: active ? 'rgba(0,200,224,0.15)' : 'rgba(8,14,24,0.5)', color: active ? C.indigoL : C.muted, border: `1px solid ${active ? 'rgba(0,200,224,0.5)' : C.border2}`, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', outline: active ? `2px solid rgba(0,200,224,0.25)` : 'none', outlineOffset: '2px', boxShadow: active ? '0 0 12px rgba(0,200,224,0.2)' : 'none', transition: 'all 0.15s ease', position: 'relative' }}>
                    <Icon size={20} />
                    {label}
                    {active && (
                      <div style={{ position: 'absolute', top: '6px', right: '6px', width: '14px', height: '14px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={9} style={{ color: 'white' }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {activeChannels.length > 0 && <p style={{ color: C.indigoL, fontSize: '11px', margin: '8px 0 0', fontWeight: 600 }}>✓ Sending via: {activeChannels.join(', ')}</p>}
            {activeChannels.length === 0 && <p style={{ color: C.redL, fontSize: '11px', margin: '8px 0 0', fontWeight: 600 }}>⚠ Select at least one channel</p>}
            {activeChannels.includes('Email') && <p style={{ color: C.muted, fontSize: '10px', margin: '4px 0 0', fontStyle: 'italic' }}>Email requires SMTP_HOST, SMTP_USER, SMTP_PASS env vars</p>}
            {activeChannels.includes('Push') && <p style={{ color: C.muted, fontSize: '10px', margin: '4px 0 0', fontStyle: 'italic' }}>Push notifications require Web Push VAPID key setup</p>}
          </div>
          <div>
            <label style={{ ...lbl }}>Subject (optional)</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Announcement subject..." style={{ ...inp }} />
          </div>
          <div>
            <label style={{ ...lbl }}>Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Enter your announcement..." style={{ ...inp, resize: 'none', display: 'block' }} />
          </div>
          {result && (
            <div style={{ padding: '10px 14px', background: result.ok ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', border: `1px solid ${result.ok ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`, color: result.ok ? C.greenL : C.redL, fontSize: '12px', fontWeight: 600 }}>
              {result.ok ? '✓ ' : '✕ '}{result.msg}
            </div>
          )}
          <button onClick={handleSend} disabled={sending || activeChannels.length === 0} style={{ ...btn, background: activeChannels.length > 0 && !sending ? C.indigo : C.border, color: activeChannels.length > 0 && !sending ? 'white' : C.muted, padding: '13px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em', border: 'none', cursor: activeChannels.length > 0 && !sending ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}>
            {sending ? 'Sending…' : 'Send Campaign Now'}
          </button>
        </div>
      </div>
      <div style={{ ...cs, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: C.indigo, boxShadow: `0 0 6px ${C.indigo}` }} />
            <h4 style={{ color: 'white', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Campaign Stats</h4>
          </div>
          <span style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', background: 'rgba(0,200,224,0.1)', color: C.indigoL, border: `1px solid rgba(0,200,224,0.25)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last 30d</span>
        </div>

        {/* Stats */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {stats === null ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Activity size={20} style={{ color: C.border2, margin: '0 auto 8px', display: 'block' }} />
              <p style={{ color: C.muted, fontSize: '12px', margin: 0 }}>Loading stats…</p>
            </div>
          ) : [
            { label: 'In-App Sent', value: stats.inAppSent?.toLocaleString() ?? '0', change: stats.sentChange ?? '—', up: (stats.inAppSent ?? 0) > 0, icon: Bell, pct: Math.min(stats.sentChangePct ?? 0, 100) },
            { label: 'Read Rate',   value: `${stats.readRate ?? 0}%`, change: stats.readChange ?? '—', up: (stats.readRate ?? 0) > 0, icon: TrendingUp, pct: stats.readRate ?? 0 },
            { label: 'Campaigns',   value: stats.campaignCount?.toString() ?? '0', change: '30d', up: true, icon: Megaphone, pct: Math.min((stats.campaignCount ?? 0) * 10, 100) },
            { label: 'Email / Push', value: 'N/A', change: 'config needed', up: false, icon: AlertTriangle, pct: 0 },
          ].map((s, i, arr) => (
            <div key={i} style={{ padding: '14px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Top row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', background: s.up ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${s.up ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <s.icon size={13} style={{ color: s.up ? C.greenL : C.redL }} />
                  </div>
                  <span style={{ color: '#607898', fontSize: '12px', fontWeight: 500 }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'white', fontWeight: 700, fontSize: '15px', fontFamily: "'DM Mono', monospace" }}>{s.value}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', background: s.up ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)', color: s.up ? C.greenL : C.redL, border: `1px solid ${s.up ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}` }}>{s.change}</span>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: '3px', background: 'rgba(8,14,24,0.8)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${s.pct}%`, background: s.up ? `linear-gradient(90deg, ${C.green}, ${C.greenL})` : `linear-gradient(90deg, ${C.red}, ${C.redL})`, opacity: 0.7, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── GROWTH ANALYTICS CARD ───────────────────────────────────────────────────
const GrowthAnalyticsCard = ({ monthlyData = null, dailyData = null }: { monthlyData?: number[] | null; dailyData?: number[] | null }) => {
  const [period, setPeriod] = useState('monthly');
  const isMonthly = period === 'monthly';
  const data = isMonthly ? (monthlyData ?? GROWTH_DATA_MONTHLY) : (dailyData ?? GROWTH_DATA_DAILY);
  const labels = isMonthly
    ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    : Array.from({ length: 30 }, (_, i) => (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '');
  const xAxisLabel = isMonthly ? 'MONTH' : 'DAY';
  return (
    <div style={{ ...cs, padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
          <TrendingUp size={15} style={{ color: C.greenL }} /> Growth Analytics
        </h3>
        <select value={period} onChange={e => setPeriod(e.target.value)} style={{ background: C.border, color: '#607898', border: `1px solid ${C.border2}`, padding: '5px 10px', fontFamily: FONT, fontSize: '12px', outline: 'none', cursor: 'pointer' }}>
          <option value="monthly">Last 12 Months</option>
          <option value="daily">Last 30 Days</option>
        </select>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <BarGraph data={data} labels={labels} xAxisLabel={xAxisLabel} />
      </div>
    </div>
  );
};

// ─── SETTINGS SECTION ────────────────────────────────────────────────────────
const AVAILABLE_FUNCTIONS = [
  { id: 'view_tickets', label: 'View Tickets', desc: 'See support queue' },
  { id: 'reply_tickets', label: 'Reply to Tickets', desc: 'Send responses' },
  { id: 'resolve_tickets', label: 'Resolve Tickets', desc: 'Close tickets' },
  { id: 'ban_users', label: 'Ban Users', desc: 'Suspend accounts' },
  { id: 'reset_passwords', label: 'Reset Passwords', desc: 'Reset user credentials' },
  { id: 'escalate', label: 'Escalate Issues', desc: 'Escalate to senior' },
  { id: 'view_analytics', label: 'View Analytics', desc: 'Access reporting' },
  { id: 'manage_content', label: 'Manage Content', desc: 'Edit blog/signals' },
];

const THEME_OPTIONS = [
  { id: 'dark', label: 'Dark', bg: '#020617', card: '#0f172a', accent: '#4f46e5' },
  { id: 'midnight', label: 'Midnight', bg: '#000000', card: '#111111', accent: '#7c3aed' },
  { id: 'slate', label: 'Slate', bg: '#0f172a', card: '#1e293b', accent: '#0ea5e9' },
  { id: 'forest', label: 'Forest', bg: '#052e16', card: '#14532d', accent: '#22c55e' },
];

const FONT_OPTIONS = [
  { id: 'montserrat', label: 'Montserrat', stack: "'Montserrat', sans-serif" },
  { id: 'onest', label: 'Onest', stack: "'Onest', sans-serif" },
  { id: 'inter', label: 'Inter', stack: "'Inter', sans-serif" },
  { id: 'mono', label: 'DM Mono', stack: "'DM Mono', monospace" },
];

const MOCK_CC_USERS = [
  { id: 'CC001', name: 'Jamie Reyes', email: 'jamie@support.io', functions: ['view_tickets', 'reply_tickets', 'resolve_tickets'], status: 'Active' },
  { id: 'CC002', name: 'Nadia Osei', email: 'nadia@support.io', functions: ['view_tickets', 'reply_tickets'], status: 'Active' },
];

const MOCK_TASKS = [
  { id: 1, title: 'Follow up with Alex Thompson on API issue', assignee: 'Jamie Reyes', due: '2023-10-25', status: 'Pending' },
  { id: 2, title: 'Review billing dispute for Priya Sharma', assignee: 'Nadia Osei', due: '2023-10-24', status: 'Complete' },
  { id: 3, title: 'Send 2FA resolution email to Sarah Chen', assignee: 'Jamie Reyes', due: '2023-10-26', status: 'Pending' },
  { id: 4, title: 'Prepare weekly support summary report', assignee: 'Nadia Osei', due: '2023-10-27', status: 'Pending' },
];

const SettingsSection = ({ bp, getAdminToken = null }) => {
  const [settingsTab, setSettingsTab] = useState('agents');
  const [ccUsers, setCcUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('admin_theme') || 'dark');
  const [activeFont, setActiveFont] = useState(() => localStorage.getItem('admin_font') || 'montserrat');
  const [fontSaved, setFontSaved] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', email: '', password: '', functions: [] as string[] });
  const [newTask, setNewTask] = useState({ title: '', assignee: '', due: '' });
  const [showPass, setShowPass] = useState(false);

  const getHdrs = async () => {
    const token = await getAdminToken?.();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  useEffect(() => {
    getHdrs().then(h => {
      fetch('/api/admin/cc-agents', { headers: h }).then(r => r.ok ? r.json() : []).then(d => setCcUsers(d.map((a: any) => ({ ...a, functions: Array.isArray(a.functions) ? a.functions : [] }))));
      fetch('/api/admin/tasks', { headers: h }).then(r => r.ok ? r.json() : []).then(d => setTasks(d));
    });
  }, []);

  const selectTheme = (id: string) => { setActiveTheme(id); localStorage.setItem('admin_theme', id); applyAdminTheme(id); };

  const applyFont = () => {
    localStorage.setItem('admin_font', activeFont);
    applyAdminFont(activeFont);
    setFontSaved(true); setTimeout(() => setFontSaved(false), 2000);
  };

  const SETTINGS_TABS = [
    { id: 'agents', label: 'CC Agents' },
    { id: 'tasks', label: 'Task Scheduler' },
    { id: 'appearance', label: 'Appearance' },
  ];

  const toggleAgentFn = async (agentId: string, fnId: string) => {
    const agent = ccUsers.find(u => u.id === agentId);
    if (!agent) return;
    const newFns = agent.functions.includes(fnId) ? agent.functions.filter((f: string) => f !== fnId) : [...agent.functions, fnId];
    setCcUsers(p => p.map(u => u.id === agentId ? { ...u, functions: newFns } : u));
    const h = await getHdrs();
    await fetch(`/api/admin/cc-agents/${agentId}`, { method: 'PATCH', headers: h, body: JSON.stringify({ functions: newFns }) }).catch(() => {});
  };

  const approveTask = async (id: string) => {
    setTasks(p => p.map(t => t.id === id ? { ...t, status: 'Complete' } : t));
    const h = await getHdrs();
    await fetch(`/api/admin/tasks/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'Complete' }) }).catch(() => {});
  };

  const deleteTask = async (id: string) => {
    setTasks(p => p.filter(t => t.id !== id));
    const h = await getHdrs();
    await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE', headers: h }).catch(() => {});
  };

  const handleCreateAgent = async () => {
    if (!newAgent.name || !newAgent.email) return;
    const h = await getHdrs();
    const r = await fetch('/api/admin/cc-agents', { method: 'POST', headers: h, body: JSON.stringify({ name: newAgent.name, email: newAgent.email, functions: newAgent.functions }) }).catch(() => null);
    if (r?.ok) {
      const created = await r.json();
      setCcUsers(p => [...p, { ...created, functions: created.functions ?? [] }]);
    } else {
      setCcUsers(p => [...p, { id: Date.now().toString(), name: newAgent.name, email: newAgent.email, functions: newAgent.functions, status: 'Active' }]);
    }
    setNewAgent({ name: '', email: '', password: '', functions: [] });
    setShowNewAgent(false);
  };

  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.assignee) return;
    const h = await getHdrs();
    const r = await fetch('/api/admin/tasks', { method: 'POST', headers: h, body: JSON.stringify(newTask) }).catch(() => null);
    if (r?.ok) {
      const created = await r.json();
      setTasks(p => [...p, created]);
    } else {
      setTasks(p => [...p, { id: Date.now().toString(), ...newTask, status: 'Pending' }]);
    }
    setNewTask({ title: '', assignee: '', due: '' });
    setShowNewTask(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
      <div>
        <h2 style={{ color: 'white', fontWeight: 700, fontSize: '20px', margin: 0 }}>System Settings</h2>
        <p style={{ color: C.muted, fontSize: '13px', margin: '4px 0 0' }}>Manage agents, tasks &amp; appearance</p>
      </div>

      <div style={{ display: 'flex', gap: '3px', background: C.card, border: `1px solid ${C.border}`, padding: '3px', width: 'fit-content' }}>
        {SETTINGS_TABS.map(t => (
          <button key={t.id} onClick={() => setSettingsTab(t.id)} style={{ ...btn, padding: '8px 18px', background: settingsTab === t.id ? C.indigo : 'transparent', color: settingsTab === t.id ? 'white' : C.muted, border: 'none', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.label}</button>
        ))}
      </div>

      {settingsTab === 'agents' && (
        <div style={{ display: 'grid', gridTemplateColumns: bp.isDesktop ? '1fr 1fr' : '1fr', gap: '6px', alignItems: 'start' }}>
          <div style={{ ...cs, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>Customer Care Agents</h3>
              <button onClick={() => setShowNewAgent(true)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '6px', background: C.indigo, color: 'white', padding: '7px 13px', fontSize: '11px', border: 'none' }}><Plus size={12} /> New Agent</button>
            </div>
            {ccUsers.map((user, idx) => (
              <div key={user.id} onClick={() => setSelectedAgent(selectedAgent?.id === user.id ? null : user)} style={{ padding: '12px 16px', borderBottom: idx < ccUsers.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', background: selectedAgent?.id === user.id ? 'rgba(0,200,224,0.07)' : 'transparent', borderLeft: `3px solid ${selectedAgent?.id === user.id ? C.indigo : 'transparent'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {user.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: 0 }}>{user.name}</p>
                    <p style={{ color: C.muted, fontSize: '11px', margin: '2px 0 0' }}>{user.id} · {user.email}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', background: 'rgba(16,185,129,0.1)', color: C.greenL, border: `1px solid rgba(16,185,129,0.2)`, textTransform: 'uppercase' }}>{user.status}</span>
                    <p style={{ color: C.muted, fontSize: '10px', margin: '4px 0 0' }}>{user.functions.length} permissions</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...cs, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>
                {selectedAgent ? `Permissions — ${selectedAgent.name}` : 'Select an agent to edit permissions'}
              </h3>
            </div>
            {selectedAgent ? (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {AVAILABLE_FUNCTIONS.map(fn => {
                  const agent = ccUsers.find(u => u.id === selectedAgent.id);
                  const active = agent?.functions.includes(fn.id);
                  return (
                    <div key={fn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: active ? 'rgba(0,200,224,0.07)' : 'rgba(8,14,24,0.4)', border: `1px solid ${active ? 'rgba(0,200,224,0.25)' : C.border}` }}>
                      <div>
                        <p style={{ color: active ? 'white' : C.muted, fontSize: '13px', fontWeight: 600, margin: 0 }}>{fn.label}</p>
                        <p style={{ color: C.muted, fontSize: '11px', margin: '2px 0 0' }}>{fn.desc}</p>
                      </div>
                      <button onClick={() => toggleAgentFn(selectedAgent.id, fn.id)} style={{ ...btn, width: '38px', height: '22px', background: active ? C.indigo : C.border, border: 'none', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ width: '16px', height: '16px', background: 'white', position: 'absolute', top: '3px', left: active ? '19px' : '3px', transition: 'left 0.2s' }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '48px', textAlign: 'center' }}>
                <ShieldCheck size={28} style={{ color: C.border2, margin: '0 auto 10px', display: 'block' }} />
                <p style={{ color: C.muted, fontSize: '13px', margin: 0 }}>Click an agent on the left to manage their permissions</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showNewAgent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '480px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: '16px', margin: 0 }}>Create CC Agent</h3>
              <button onClick={() => setShowNewAgent(false)} style={{ ...btn, background: 'transparent', color: C.muted, padding: '4px', border: 'none' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '20px 22px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><label style={{ ...lbl }}>Full Name</label><input value={newAgent.name} onChange={e => setNewAgent(p => ({ ...p, name: e.target.value }))} placeholder="Jane Smith" style={{ ...inp }} /></div>
              <div><label style={{ ...lbl }}>Email / User ID</label><input value={newAgent.email} onChange={e => setNewAgent(p => ({ ...p, email: e.target.value }))} placeholder="jane@support.io" style={{ ...inp }} /></div>
              <div>
                <label style={{ ...lbl }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPass ? 'text' : 'password'} value={newAgent.password} onChange={e => setNewAgent(p => ({ ...p, password: e.target.value }))} placeholder="Set initial password..." style={{ ...inp, paddingRight: '44px' }} />
                  <button onClick={() => setShowPass(p => !p)} style={{ ...btn, position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', color: C.muted, border: 'none', padding: '2px' }}><Eye size={14} /></button>
                </div>
              </div>
              <div>
                <label style={{ ...lbl }}>Assign Permissions</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {AVAILABLE_FUNCTIONS.map(fn => {
                    const active = newAgent.functions.includes(fn.id);
                    return (
                      <button key={fn.id} onClick={() => setNewAgent(p => ({ ...p, functions: active ? p.functions.filter(f => f !== fn.id) : [...p.functions, fn.id] }))}
                        style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: active ? 'rgba(0,200,224,0.08)' : 'rgba(8,14,24,0.4)', border: `1px solid ${active ? 'rgba(0,200,224,0.3)' : C.border}`, color: active ? C.indigoL : C.muted, fontSize: '12px', textAlign: 'left' }}>
                        <span>{fn.label}</span>
                        <div style={{ width: '14px', height: '14px', background: active ? C.indigo : 'transparent', border: `2px solid ${active ? C.indigo : C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {active && <CheckCircle size={9} style={{ color: 'white' }} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewAgent(false)} style={{ ...btn, padding: '9px 18px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, fontSize: '13px' }}>Cancel</button>
              <button onClick={handleCreateAgent} style={{ ...btn, padding: '9px 22px', background: C.indigo, color: 'white', border: 'none', fontSize: '13px' }}>Create Agent</button>
            </div>
          </div>
        </div>
      )}

      {settingsTab === 'tasks' && (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>Scheduled Tasks</h3>
            <button onClick={() => setShowNewTask(true)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '6px', background: C.indigo, color: 'white', padding: '7px 13px', fontSize: '11px', border: 'none' }}><Plus size={12} /> Schedule Task</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 160px', padding: '8px 16px', background: 'rgba(8,14,24,0.5)', gap: '12px' }}>
            {['Task', 'Assignee', 'Due Date', 'Status'].map(h => (
              <span key={h} style={{ color: C.muted, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
            ))}
          </div>
          {tasks.map((task, idx) => (
            <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 160px', padding: '13px 16px', borderBottom: idx < tasks.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', gap: '12px', background: task.status === 'Complete' ? 'rgba(16,185,129,0.03)' : 'transparent' }}>
              <p style={{ color: task.status === 'Complete' ? C.muted : 'white', fontSize: '13px', fontWeight: 600, margin: 0, textDecoration: task.status === 'Complete' ? 'line-through' : 'none' }}>{task.title}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '22px', height: '22px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {task.assignee.split(' ').map(n => n[0]).join('')}
                </div>
                <span style={{ color: C.muted, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.assignee}</span>
              </div>
              <span style={{ color: C.muted, fontSize: '11px', fontFamily: 'monospace' }}>{task.due || '—'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {task.status === 'Pending' ? (
                  <button onClick={() => approveTask(task.id)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'rgba(16,185,129,0.1)', color: C.greenL, border: `1px solid rgba(16,185,129,0.25)`, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <CheckCircle size={10} /> Approve
                  </button>
                ) : (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '5px 10px', background: 'rgba(16,185,129,0.08)', color: C.greenL, border: `1px solid rgba(16,185,129,0.2)`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Complete</span>
                )}
                <button onClick={() => deleteTask(task.id)} style={{ ...btn, background: 'transparent', color: '#3d5878', padding: '4px', border: 'none' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '420px' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: '16px', margin: 0 }}>Schedule Task</h3>
              <button onClick={() => setShowNewTask(false)} style={{ ...btn, background: 'transparent', color: C.muted, padding: '4px', border: 'none' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><label style={{ ...lbl }}>Task Description</label><input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Describe the task..." style={{ ...inp }} /></div>
              <div>
                <label style={{ ...lbl }}>Assign To</label>
                <select value={newTask.assignee} onChange={e => setNewTask(p => ({ ...p, assignee: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">Select agent...</option>
                  {ccUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
              <div><label style={{ ...lbl }}>Due Date</label><input type="date" value={newTask.due} onChange={e => setNewTask(p => ({ ...p, due: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} /></div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewTask(false)} style={{ ...btn, padding: '9px 18px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, fontSize: '13px' }}>Cancel</button>
              <button onClick={handleCreateTask} style={{ ...btn, padding: '9px 22px', background: C.indigo, color: 'white', border: 'none', fontSize: '13px' }}>Add Task</button>
            </div>
          </div>
        </div>
      )}

      {settingsTab === 'appearance' && (
        <div style={{ display: 'grid', gridTemplateColumns: bp.isDesktop ? '1fr 1fr' : '1fr', gap: '6px' }}>
          <div style={{ ...cs, padding: '20px' }}>
            <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Dashboard Theme</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {THEME_OPTIONS.map(theme => (
                <button key={theme.id} onClick={() => selectTheme(theme.id)} style={{ ...btn, padding: '0', overflow: 'hidden', border: `2px solid ${activeTheme === theme.id ? C.indigo : C.border}`, background: 'transparent', textAlign: 'left' }}>
                  <div style={{ height: '60px', background: theme.bg, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: '10px', left: '10px', width: '30px', height: '30px', background: theme.card, border: `1px solid ${theme.accent}30` }} />
                    <div style={{ position: 'absolute', top: '10px', left: '48px', right: '10px', height: '8px', background: theme.accent, opacity: 0.8 }} />
                    <div style={{ position: 'absolute', top: '24px', left: '48px', right: '20px', height: '5px', background: theme.card }} />
                    <div style={{ position: 'absolute', bottom: '10px', left: '10px', right: '10px', height: '14px', background: theme.card }} />
                    {activeTheme === theme.id && (
                      <div style={{ position: 'absolute', top: '6px', right: '6px', width: '16px', height: '16px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={10} style={{ color: 'white' }} />
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px', background: C.card }}>
                    <p style={{ color: activeTheme === theme.id ? C.indigoL : 'white', fontSize: '12px', fontWeight: 700, margin: 0 }}>{theme.label}</p>
                  </div>
                </button>
              ))}
            </div>
            <p style={{ color: C.muted, fontSize: '11px', margin: '12px 0 0', fontStyle: 'italic' }}>Theme applies instantly and is saved for future sessions</p>
          </div>

          <div style={{ ...cs, padding: '20px' }}>
            <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Dashboard Font</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {FONT_OPTIONS.map(font => (
                <button key={font.id} onClick={() => { setActiveFont(font.id); setFontSaved(false); }} style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: activeFont === font.id ? 'rgba(0,200,224,0.08)' : 'rgba(8,14,24,0.4)', border: `1px solid ${activeFont === font.id ? 'rgba(0,200,224,0.35)' : C.border}`, textAlign: 'left' }}>
                  <div>
                    <p style={{ color: activeFont === font.id ? 'white' : C.muted, fontSize: '15px', fontWeight: 600, margin: 0, fontFamily: font.stack }}>{font.label}</p>
                    <p style={{ color: C.muted, fontSize: '11px', margin: '3px 0 0', fontFamily: font.stack }}>The quick brown fox jumps over the lazy dog</p>
                  </div>
                  {activeFont === font.id && (
                    <div style={{ width: '20px', height: '20px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircle size={12} style={{ color: 'white' }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button onClick={applyFont} style={{ ...btn, marginTop: '16px', width: '100%', background: fontSaved ? C.green : C.indigo, color: 'white', padding: '11px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', border: 'none', transition: 'background 0.3s' }}>{fontSaved ? '✓ Font Applied' : 'Apply Font'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const bp = useBreakpoint();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const openTickets = MOCK_TICKETS.filter(t => t.status === 'Open').length;

  const { user, session, role, signOut, loading } = useAuth();
  const [, navigate] = useLocation();
  const [apiUsers, setApiUsers] = useState<any[]>([]);
  const [overviewStats, setOverviewStats] = useState<any>(null);
  const [myIpInfo, setMyIpInfo] = useState<{ ip: string; isExcluded: boolean; configuredAdminIps: string[]; geo?: { country: string; countryCode: string; region: string; city: string; isp: string } | null } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) navigate('/auth');
    else if (role !== 'admin') navigate('/journal');
  }, [loading, session, role, navigate]);

  useEffect(() => {
    if (role !== 'admin') return;
    supabase?.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!s) return;
      const hdrs = { Authorization: `Bearer ${s.access_token}` };
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: hdrs }),
        fetch('/api/admin/stats', { headers: hdrs }),
      ]);
      if (usersRes.ok) setApiUsers(await usersRes.json());
      if (statsRes.ok) setOverviewStats(await statsRes.json());
    });
    // Always fetch admin IP (doesn't need auth)
    fetch('/api/track/my-ip').then(r => r.ok ? r.json() : null).then(d => { if (d) setMyIpInfo(d); }).catch(() => {});
  }, [role]);

  async function handleRoleChange(userId: string, newRole: string) {
    const r = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
    const s = (r as any).data.session;
    if (!s) return;
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify({ role: newRole }),
    });
    setApiUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  }

  useEffect(() => { if (!bp.isDesktop) setCollapsed(true); else setCollapsed(false); }, [bp.isDesktop]);

  if (loading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--admin-bg)', color: '#3a5070', fontFamily: FONT, fontSize: '13px' }}>Loading…</div>;

  const adminEmail = user?.email ?? '';
  const adminName = (user?.user_metadata?.full_name ?? adminEmail.split('@')[0] ?? 'Admin') as string;
  const adminInitial = (adminName[0] ?? 'A').toUpperCase();

  const SIDEBAR_GROUPS = [
    { label: 'Core',             items: [{ id: 'dashboard',     label: 'Overview',        icon: Layers,        ready: true }] },
    { label: 'Users',            items: [{ id: 'users',         label: 'User Accounts',   icon: Users,         ready: true }] },
    { label: 'Support',          items: [{ id: 'customer-care', label: 'Customer Care',   icon: HeadphonesIcon, badge: openTickets, ready: true }] },
    { label: 'Growth & Content', items: [{ id: 'blog',          label: 'Blogpost',        icon: FileText,      ready: true }, { id: 'marketing', label: 'Marketing', icon: Megaphone, ready: true }] },
    { label: 'Platform',         items: [{ id: 'system-monitor', label: 'System Monitor', icon: Cpu,           ready: true }] },
    { label: 'System',           items: [{ id: 'settings',      label: 'System Settings', icon: Settings,      ready: true }] },
    { label: 'Journal',          items: [{ id: 'journal',       label: 'Open Journal',    icon: BookOpen,      ready: true }] },
  ];

  const PAGE_TITLES = {
    dashboard: 'Overview', analytics: 'Analytics & Reports', health: 'Health Dashboard',
    users: 'User Accounts', 'user-activity': 'User Activity', roles: 'Roles & Permissions', flagged: 'Blocked / Flagged',
    'customer-care': 'Customer Care', feedback: 'User Feedback',
    reported: 'Reported Content', 'audit-logs': 'Audit Logs', 'data-mgmt': 'Data Management',
    blog: 'Blogpost', marketing: 'Marketing', announcements: 'Announcements',
    'system-monitor': 'System Monitor', 'usage-metrics': 'Usage Metrics', 'error-logs': 'Error Logs',
    billing: 'Plans & Billing', promotions: 'Promotions',
    settings: 'System Settings', api: 'API & Integrations', 'feature-flags': 'Feature Flags', security: 'Security Settings',
    journal: 'Open Journal',
  };

  const navBtn = item => {
    const isActive = activeTab === item.id;
    const isSoon = !item.ready;
    const activeBg = isActive ? 'color-mix(in srgb, var(--admin-accent) 18%, transparent)' : 'transparent';
    const activeColor = isActive ? 'white' : isSoon ? '#2a3d54' : '#607898';
    const iconColor = isActive ? C.indigoL : isSoon ? '#1e3050' : '#3d5878';
    const handleClick = () => {
      if (item.id === 'journal') { window.open('/journal', '_blank', 'noopener,noreferrer'); return; }
      setActiveTab(item.id);
    };
    return (
      <button key={item.id} onClick={handleClick} title={item.label}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '8px 0' : '6px 10px', justifyContent: collapsed ? 'center' : 'flex-start', background: activeBg, color: activeColor, border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: isActive ? 600 : 400, fontSize: '12px', position: 'relative', transition: 'background 0.15s', borderLeft: isActive ? `2px solid ${C.indigoL}` : '2px solid transparent' }}>
        <item.icon size={14} style={{ flexShrink: 0, color: iconColor }} />
        {!collapsed && (
          <>
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.label}</span>
            {isSoon && (
              <span style={{ fontSize: '8px', fontWeight: 700, padding: '1px 5px', background: 'rgba(245,158,11,0.1)', color: '#92400e', border: '1px solid rgba(245,158,11,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>soon</span>
            )}
            {item.id === 'journal' && <ExternalLink size={10} style={{ color: '#3d5878', flexShrink: 0 }} />}
          </>
        )}
        {item.badge > 0 && (
          <span style={{ background: C.red, color: 'white', fontSize: '9px', fontWeight: 700, padding: '1px 5px', position: collapsed ? 'absolute' : 'static', top: collapsed ? '3px' : 'auto', right: collapsed ? '3px' : 'auto', flexShrink: 0, minWidth: '16px', textAlign: 'center' }}>{item.badge}</span>
        )}
      </button>
    );
  };

  const sectionLabel = label => !collapsed && (
    <p style={{ color: '#2d3d52', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', padding: '10px 12px 3px', margin: 0 }}>{label}</p>
  );

  const statCols = bp.isMobile ? 'repeat(2, 1fr)' : bp.isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const dashMainCols = bp.isDesktop ? '2fr 1fr' : '1fr';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: '6px' }}>
            <StatCard
              title="Total Traders"
              value={overviewStats ? overviewStats.totalUsers.toLocaleString() : '—'}
              change={overviewStats?.userChange != null ? `+${overviewStats.userChange}%` : '—'}
              trend="up"
              icon={Users}
            />
            <StatCard
              title="Monthly Visitors"
              value={overviewStats ? (overviewStats.monthlyVisitors >= 1000 ? `${(overviewStats.monthlyVisitors / 1000).toFixed(1)}k` : String(overviewStats.monthlyVisitors)) : '—'}
              change={overviewStats?.visitorChange != null ? `+${overviewStats.visitorChange}%` : 'Tracking…'}
              trend="up"
              icon={TrendingUp}
            />
            <StatCard
              title="Avg. Session"
              value={overviewStats?.avgSessionSeconds != null ? `${Math.floor(overviewStats.avgSessionSeconds / 60)}m ${overviewStats.avgSessionSeconds % 60}s` : '—'}
              change={overviewStats?.avgSessionSeconds != null ? 'This month' : 'Collecting…'}
              trend="up"
              icon={Clock}
            />
            <StatCard
              title="MRR"
              value="—"
              change="No billing data"
              trend="up"
              icon={Globe}
            />
          </div>
          {/* Admin IP filter notice */}
          {myIpInfo && (
            <div style={{
              background: myIpInfo.isExcluded ? 'rgba(29,158,117,0.06)' : 'rgba(255,170,0,0.06)',
              border: `1px solid ${myIpInfo.isExcluded ? 'rgba(29,158,117,0.2)' : 'rgba(255,170,0,0.25)'}`,
              borderRadius: 6, padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: myIpInfo.isExcluded ? '#1D9E75' : '#ffaa00', flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {myIpInfo.geo?.countryCode && (
                    <span style={{ fontSize: 18, lineHeight: 1 }}>
                      {myIpInfo.geo.countryCode.toUpperCase().split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')}
                    </span>
                  )}
                  <div>
                    <span style={{ fontSize: 11, color: myIpInfo.isExcluded ? '#1D9E75' : '#ffaa00', fontWeight: 600, letterSpacing: '0.05em' }}>
                      {myIpInfo.isExcluded ? 'Admin IP — excluded from visitor stats' : 'Your IP is counted in visitor stats'}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
                      <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 6px', borderRadius: 3, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{myIpInfo.ip}</code>
                      {myIpInfo.geo && (
                        <span style={{ marginLeft: 6 }}>
                          · {[myIpInfo.geo.city, myIpInfo.geo.region, myIpInfo.geo.country].filter(Boolean).join(', ')}
                          {myIpInfo.geo.isp && <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>via {myIpInfo.geo.isp}</span>}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              {!myIpInfo.isExcluded && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.03em' }}>
                  Add to <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>ADMIN_IPS</code> secret to exclude your traffic
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: dashMainCols, gap: '6px', alignItems: 'stretch', flex: 1 }}>
            <GrowthAnalyticsCard monthlyData={overviewStats?.signupsByMonth ?? null} dailyData={overviewStats?.signupsByDay ?? null} />
            <div style={{ ...cs, padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontStyle: 'italic', fontSize: '14px', margin: '0 0 16px' }}>Recent Activity</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {overviewStats?.recentActivity?.length > 0
                  ? overviewStats.recentActivity.map((a: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: a.type === 'post' ? C.greenL : C.indigo, marginTop: '3px', flexShrink: 0 }} />
                      <div><p style={{ color: '#9ab4cc', fontSize: '13px', fontWeight: 500, margin: 0 }}>{a.text}</p><p style={{ color: '#3d5878', fontSize: '11px', margin: '2px 0 0' }}>{timeAgo(a.ts)}</p></div>
                    </div>
                  ))
                  : !overviewStats
                    ? [1,2,3].map(i => (
                      <div key={i} style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: C.border, marginTop: '3px', flexShrink: 0 }} />
                        <div style={{ height: '13px', width: '180px', background: C.border, borderRadius: '2px' }} />
                      </div>
                    ))
                    : <p style={{ color: '#3d5878', fontSize: '13px', margin: 0 }}>No recent activity yet.</p>
                }
              </div>
            </div>
          </div>
        </div>
      );

      case 'users': return <UsersSection bp={bp} apiUsers={apiUsers} setApiUsers={setApiUsers} getAdminToken={async () => { const r = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } })); return (r as any).data?.session?.access_token ?? null; }} />;
      case 'blog': return <BlogSection bp={bp} />;
      case 'marketing': return <MarketingSection bp={bp} getAdminToken={async () => { const r = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } })); return (r as any).data?.session?.access_token ?? null; }} />;
      case 'customer-care': return <CustomerCareSection bp={bp} apiUsers={apiUsers} getAdminToken={async () => { const r = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } })); return (r as any).data?.session?.access_token ?? null; }} />;
      case 'system-monitor': return <SystemMonitorSection bp={bp} getAdminToken={async () => { const r = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } })); return (r as any).data?.session?.access_token ?? null; }} />;
      case 'settings': return <SettingsSection bp={bp} getAdminToken={async () => { const r = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } })); return (r as any).data?.session?.access_token ?? null; }} />;

    }
  };

  const sidebarW = collapsed ? '60px' : '180px';
  const contentPad = bp.isMobile ? '14px' : '24px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, overflow: 'hidden', fontFamily: FONT }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; scrollbar-width: none; } *::-webkit-scrollbar { display: none; } button:hover { opacity: 0.9; }`}</style>

      {/* ── HEADER — full width, always at the very top ── */}
      <header style={{ flexShrink: 0, zIndex: 20, background: 'color-mix(in srgb, var(--admin-bg) 92%, transparent)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}`, padding: `0 ${contentPad}`, height: '49px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

        {/* ── Left: hamburger + logo ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setCollapsed(p => !p)}
            aria-label="Toggle sidebar"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '5px', width: '36px', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ display: 'block', width: collapsed ? '14px' : '18px', height: '1.5px', background: '#607898', borderRadius: '2px', transition: 'all 0.25s', transform: collapsed ? 'rotate(45deg) translate(4px,4px)' : 'none' }} />
            <span style={{ display: 'block', width: '18px', height: '1.5px', background: '#607898', borderRadius: '2px', transition: 'all 0.25s', opacity: collapsed ? 0 : 1 }} />
            <span style={{ display: 'block', width: collapsed ? '14px' : '18px', height: '1.5px', background: '#607898', borderRadius: '2px', transition: 'all 0.25s', transform: collapsed ? 'rotate(-45deg) translate(4px,-4px)' : 'none' }} />
          </button>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', background: C.border, border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" style={{ width: '15px', height: '15px' }} fill="none">
                <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="#4F8EF7" />
                <path d="M12 6.5L17.5 12L12 17.5L6.5 12L12 6.5Z" fill="#07090e" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontStyle: 'italic', fontSize: '13px', letterSpacing: '0.1em', color: 'white', textTransform: 'uppercase' }}>FSDZONES</span>
          </div>
        </div>

        {/* ── Right: actions ── */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button style={{ ...btn, background: 'rgba(8,14,24,0.6)', color: '#607898', border: `1px solid ${C.border2}`, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0c1018'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#3d5878'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(8,14,24,0.6)'; e.currentTarget.style.color = '#607898'; e.currentTarget.style.borderColor = C.border2; }}>
            <Mail size={16} />
            {!bp.isMobile && <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: FONT }}>Messages</span>}
            <span style={{ background: C.indigo, color: 'white', fontSize: '10px', fontWeight: 700, minWidth: '18px', height: '18px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>3</span>
          </button>
          <div style={{ width: '1px', height: '24px', background: C.border2 }} />
          <button style={{ ...btn, background: 'rgba(8,14,24,0.6)', color: '#607898', border: `1px solid ${C.border2}`, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0c1018'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#3d5878'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(8,14,24,0.6)'; e.currentTarget.style.color = '#607898'; e.currentTarget.style.borderColor = C.border2; }}>
            <Bell size={16} />
            {!bp.isMobile && <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: FONT }}>Alerts</span>}
            <span style={{ background: C.red, color: 'white', fontSize: '10px', fontWeight: 700, minWidth: '18px', height: '18px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>5</span>
          </button>
        </div>
      </header>

      {/* ── BODY ROW — sidebar + content, fills remaining height ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <aside style={{ width: sidebarW, minWidth: sidebarW, transition: 'width 0.25s ease, min-width 0.25s ease', background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0 }}>
            {SIDEBAR_GROUPS.map((group, gi) => (
              <div key={gi}>
                {sectionLabel(group.label)}
                {group.items.map(navBtn)}
              </div>
            ))}
          </div>

          {/* User profile + sign out */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 0', flexShrink: 0 }}>
            {!collapsed && (
              <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <div style={{ width: '28px', height: '28px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', color: 'white', flexShrink: 0 }}>
                  {adminInitial}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ color: 'white', fontSize: '11px', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminName}</p>
                  <p style={{ color: C.muted, fontSize: '10px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminEmail}</p>
                </div>
              </div>
            )}
            <button
              onClick={async () => { await signOut(); navigate('/'); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '8px 0' : '7px 14px', justifyContent: collapsed ? 'center' : 'flex-start', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 500, fontSize: '12px', transition: 'background 0.15s' }}
            >
              <svg viewBox="0 0 24 24" style={{ width: '15px', height: '15px', flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v6" />
                <path d="M6.8 4.8a9 9 0 1 0 10.4 0" />
              </svg>
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, background: `radial-gradient(ellipse at top, var(--admin-card) 0%, var(--admin-bg) 60%)`, display: 'flex', flexDirection: 'column' }}>
          <section style={{ padding: contentPad, paddingTop: '10px', paddingLeft: bp.isMobile ? '8px' : '10px', flex: 1, display: 'flex', flexDirection: 'column' }}>{renderContent()}</section>
        </main>

      </div>
    </div>
  );
}