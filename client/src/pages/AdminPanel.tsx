import React, { useState, useEffect, useRef, useCallback } from 'react';
import TradingLoader from '@/components/TradingLoader';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import BlogPostEditor, { type BlogEditorData } from '@/components/BlogPostEditor';
import { useAdminNotifications, AdminNotificationsPanel } from '@/features/admin-notifications';
import {
  Users, FileText, Megaphone, Settings, Search, TrendingUp,
  MoreVertical, Plus, Mail, Bell, AlertCircle, UserPlus, ShieldCheck,
  Globe, Clock, HeadphonesIcon, Cpu, Activity, Zap, AlertTriangle, CheckCircle,
  MessageSquare, Phone, Star, Timer, Database, GitFork,
  Eye, Ban, Unlock, Trash2, Send, X, RotateCcw, Layers, BookOpen, ExternalLink
} from 'lucide-react';

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

const generateMetric = (base: number, variance: number) => +(base + (Math.random() - 0.5) * variance).toFixed(1);
const INITIAL_METRICS = { cpu: 34, memory: 61, latency: 42, uptime: 99.97, requestsPerSec: 847, errorRate: 0.12, dbQueryTime: 18, activeConnections: 1243 };
const INITIAL_LOGS = [
  { id: 1, time: '14:32:01', level: 'error', service: 'Binance-API', message: 'Connection timeout after 5000ms - retrying (3/5)', resolved: false },
  { id: 2, time: '14:31:44', level: 'warn', service: 'Auth-Service', message: 'Elevated failed login attempts from IP 185.220.x.x', resolved: false },
  { id: 3, time: '14:30:12', level: 'info', service: 'Trade-Engine', message: 'Successfully processed 1,240 trade signals in batch', resolved: true },
  { id: 4, time: '14:29:55', level: 'error', service: 'DB-Cluster', message: 'Replica lag exceeded threshold: 340ms', resolved: true },
  { id: 5, time: '14:27:11', level: 'warn', service: 'Payment-SVC', message: 'Stripe webhook delivery delayed by 12s', resolved: false },
];

const ADMIN_THEMES: Record<string, Record<string, string>> = {
  dark: { bg:'#07090e', sidebar:'#07090e', card:'#0c1018', border:'#131c28', border2:'#1b2840', dim:'#1b2840', accent:'#00c8e0', accentL:'#33d8f0' },
  midnight: { bg:'#000000', sidebar:'#050508', card:'#0d0d14', border:'#1a1a2e', border2:'#16213e', dim:'#16213e', accent:'#7c3aed', accentL:'#9d65f5' },
  slate: { bg:'#0f172a', sidebar:'#0f172a', card:'#1e293b', border:'#334155', border2:'#475569', dim:'#475569', accent:'#0ea5e9', accentL:'#38bdf8' },
  forest: { bg:'#052e16', sidebar:'#04200f', card:'#073b1d', border:'#166534', border2:'#15803d', dim:'#15803d', accent:'#22c55e', accentL:'#4ade80' },
};

const ADMIN_FONTS: Record<string, string> = {
  montserrat: "'Montserrat', sans-serif",
  onest: "'Onest', sans-serif",
  inter: "'Inter', sans-serif",
  mono: "'DM Mono', monospace",
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
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'facebook', label: 'Facebook' },
];

// keep existing component definitions below unchanged
