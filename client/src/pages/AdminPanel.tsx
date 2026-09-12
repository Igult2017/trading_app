import React, { useState, useEffect, useRef, useCallback } from 'react';
import { countryToIso } from '@/lib/countryToIso';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import TrafficSection from '@/features/admin-traffic/TrafficSection';
import SupportSection from '@/features/admin-support/SupportSection';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer
} from 'recharts';
import { useAdminNotifications, AdminNotificationsPanel } from '@/features/admin-notifications';

import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import BlogPostEditor, { type BlogEditorData } from '@/components/BlogPostEditor';
import Wordmark from '@/components/Wordmark';
import { C, cs, inp, lbl, btn, R, FONT, HFONT, panelText } from '@/components/admin-ui/tokens';
import { PageHeader, StatCard, Pill, Panel } from '@/components/admin-ui/AdminUI';
import { readingTime } from '@shared/readingTime';
import {
  Users, FileText, BellRing, Smartphone, Search, TrendingUp,
  Plus, Mail, Bell, UserPlus, ShieldCheck,
  Globe, Clock, Cpu, Activity, Zap, AlertTriangle, CheckCircle,
  Database, Eye, EyeOff, Pencil, Trash2, Send, X, MailOpen,
  LayoutDashboard, UsersRound, LifeBuoy, Newspaper, Gauge, RefreshCw, SlidersHorizontal
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


const generateMetric = (base: number, variance: number) => +(base + (Math.random() - 0.5) * variance).toFixed(1);
const INITIAL_METRICS = { cpu: 34, memory: 61, latency: 42, uptime: 99.97, requestsPerSec: 847, errorRate: 0.12, dbQueryTime: 18, activeConnections: 1243 };
const INITIAL_LOGS: any[] = [];

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
// EVERY COLOUR THE PANEL USES IS A THEME TOKEN — it was not, and that is why the panel could only
// ever be dark. `text` and `muted` were hardcoded light-on-dark further down, so a light palette was
// impossible however the other values were set. `applyAdminTheme` turns each key here into a CSS
// variable (`--admin-<key>`), so adding a key here is all it takes to make it themeable.
//
// `light` is the reference look: a dark navigation rail against a pale page, white cards, one green
// accent used sparingly. The four dark palettes keep their character and gain the same new keys so
// they carry on working.
const ADMIN_THEMES: Record<string, Record<string, string>> = {
  // Every colour below that is ever set as TEXT was measured on this palette's own card (#ffffff)
  // and clears 4.5:1. accentL is the one to watch: #00c8e0 is the brand cyan and measures 2.03:1 on
  // white, so on this palette the readable cyan is the deep one and the bright one is not used for
  // text at all.
  light:    { bg:'#f5f7fa', sidebar:'#0a0f16', rail:'#0a0f16', railInk:'#e8f0fb', railDim:'#8ea6c4',
              card:'#ffffff', border:'#e4e9f0', border2:'#d7dfe8', dim:'#cbd5e1', thead:'#f4f7fa',
              text:'#0f172a', muted:'#5b6b7f', accent:'#0a7285', accentL:'#086070', accentSoft:'#e2f4f8',
              green:'#046c4e', greenL:'#047857', red:'#b91c1c', redL:'#dc2626',
              amber:'#92400e', amberL:'#b45309', blue:'#1e40af', blueL:'#2563eb',
              shadow:'0 1px 2px rgba(16,24,40,0.06)' },
  dark:     { bg:'#07090e', sidebar:'#07090e', rail:'#0a0e15', railInk:'#e8f0fb', railDim:'#8ea6c4',
              card:'#0c1018', border:'#131c28', border2:'#1b2840', dim:'#1b2840', thead:'#101825',
              text:'#e8f0fb', muted:'#9db5d1', accent:'#00c8e0', accentL:'#33d8f0', accentSoft:'rgba(0,200,224,0.10)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.35)' },
  midnight: { bg:'#000000', sidebar:'#050508', rail:'#050508', railInk:'#ece9fb', railDim:'#a99dd1',
              card:'#0d0d14', border:'#1a1a2e', border2:'#16213e', dim:'#16213e', thead:'#12121f',
              text:'#ece9fb', muted:'#a99dd1', accent:'#7c3aed', accentL:'#9d65f5', accentSoft:'rgba(124,58,237,0.12)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.5)' },
  slate:    { bg:'#0f172a', sidebar:'#0f172a', rail:'#0b1220', railInk:'#e6eefb', railDim:'#94a9c4',
              card:'#1e293b', border:'#334155', border2:'#475569', dim:'#475569', thead:'#243044',
              text:'#e6eefb', muted:'#a8bcd4', accent:'#0ea5e9', accentL:C.indigo, accentSoft:'rgba(14,165,233,0.12)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.3)' },
  forest:   { bg:'#052e16', sidebar:'#04200f', rail:'#04200f', railInk:'#e4f6e9', railDim:'#8fbf9f',
              card:'#073b1d', border:'#166534', border2:'#15803d', dim:'#15803d', thead:'#0a4523',
              text:'#e4f6e9', muted:'#a6d4b4', accent:'#22c55e', accentL:'#4ade80', accentSoft:'rgba(34,197,94,0.14)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.3)' },
};

/** A NEW KEY. The old `admin_theme` holds a value picked against the previous palette, when the panel
 *  could only be dark; honouring it would hide the redesign behind a months-old click. */
const ADMIN_THEME_KEY = 'admin_theme_v2';
const ADMIN_THEME_DEFAULT = 'light';

/** ONE font table. There used to be TWO, and that is the whole bug.
 *
 *  `ADMIN_FONTS` was what actually got applied; `FONT_OPTIONS`, 2,600 lines further down, was what
 *  the Appearance picker DREW. They shared no ids and neither knew about the other, so the picker
 *  offered five faces, said "✓ Font Applied", and changed nothing — while `applyAdminFont` ignored
 *  the chosen id outright. It also offered no Playfair at all, and defaulted its highlight to
 *  Montserrat, which is exactly what he screenshotted as "still being overriden by montserrat".
 *
 *  ONE FACE PER ENTRY, because that is what the journal dashboard actually does. I got this wrong
 *  first: the journal's Playfair definition carries a `bodyStack` of Montserrat, so I routed all of
 *  the admin's read-text to it — and the whole panel went Montserrat. His reply: *"The font is still
 *  montserat. Can you check where montserat is hardcoded."*
 *
 *  It is not hardcoded here. `bodyStack` is used in exactly ONE place in the journal
 *  (`Journal.tsx:1630`), where it is handed to the Drawdown panel alone — one of four panels that
 *  own their own typography and are EXCLUDED from the journal's global font rule
 *  (`Journal.tsx:1041`, which forces `F.stack` on everything else). So Montserrat is a companion
 *  inside one panel, not the journal's reading face. I copied the exception instead of the rule.
 */
type AdminFontDef = { id: string; label: string; stack: string };

const ADMIN_FONTS: AdminFontDef[] = [
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    // THE VARIABLE FAMILY FIRST — copied verbatim from the journal dashboard
    // (useJournalSettings.ts FONTS['playfair-display'].stack). This used to name the static
    // 'Playfair Display' first, which is the four fixed weights imported in index.css; the Variable
    // package carries the whole 100-900 axis, so a heading can be weighted up instead of relying on
    // a fixed 400 whose hairlines vanish at small sizes. That ordering IS the "variant that does not
    // disappear" he asked for.
    stack: "'Playfair Display Variable', 'Playfair Display', Georgia, serif",
  },
  { id: 'montserrat', label: 'Montserrat', stack: "'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'inter',      label: 'Inter',      stack: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'outfit',     label: 'Outfit',     stack: "'Outfit', system-ui, sans-serif" },
  { id: 'onest',      label: 'Onest',      stack: "'Onest', system-ui, sans-serif" },
];

const ADMIN_FONT_DEFAULT = 'playfair-display';

/** The stored preference. A NEW key on purpose: the old `admin_font` holds whatever was clicked
 *  while the picker was inert, so it was never a preference that took effect — reusing it would
 *  hand the panel a face nobody ever actually chose (his was 'montserrat'). */
const ADMIN_FONT_KEY = 'admin_font_v2';

function applyAdminTheme(id: string) {
  const t = ADMIN_THEMES[id] ?? ADMIN_THEMES.dark;
  const r = document.documentElement;
  Object.entries(t).forEach(([k, v]) => r.style.setProperty(`--admin-${k}`, v));
}

/** Apply a chosen font. THE CHOICE IS NOW HONOURED — it used to be ignored, with the id named `_id`
 *  and a comment saying so, which is why the picker's "✓ Font Applied" meant nothing.
 *
 *  BOTH VARIABLES GET THE SAME FACE, exactly as the journal does it: `Journal.tsx:1041` forces
 *  `F.stack` on everything inside the journal except four panels that own their typography. There
 *  is no second face for body text — that was my invention, and it turned the whole panel
 *  Montserrat.
 *
 *  What answers *"the variant of playfair that does not disappear or blurr on small font sizes"* is
 *  the ORDER inside the stack, not a different family: `'Playfair Display Variable'` comes first.
 *  The variable package carries the continuous 100-900 weight axis, so weight is real at any size,
 *  where the static `'Playfair Display'` this panel used to name first is four fixed cuts. */
/** The face that carries the small text when the chosen one is a DISPLAY face.
 *
 *  A TEXT SERIF — and the reason is worth writing down, because I got this wrong twice.
 *
 *  He pointed at DORIXÉ and said its type looks refined and his looks ugly. DORIXÉ's code loads
 *  `Playfair_Display` and `Inter` (app/layout.tsx:2), so I copied Inter. Wrong: DORIXÉ never
 *  applies Inter. Its `--font-sans` is defined as itself in globals.css:38, which is a circular
 *  reference and therefore invalid, so every unstyled element falls back to the browser's default
 *  standard font. Measured on the live site: 247 elements in Times New Roman, 29 in Playfair,
 *  ZERO in Inter — `getComputedStyle(document.body).fontFamily` returns "Times New Roman".
 *
 *  So the look he called refined is a TEXT serif, not a sans and not Playfair. That also resolves
 *  the contradiction that ran through this whole redesign: he kept asking for a serif and it kept
 *  coming out blurred, because Playfair is a DISPLAY serif whose hairlines die at 13px. A text
 *  serif is drawn to be read at exactly these sizes.
 *
 *  Times New Roman first because he asked to COPY, and that is literally what he is looking at.
 *  Georgia behind it is the same idea drawn for screens — a bigger x-height and sturdier strokes —
 *  and is the one to promote if he ever wants this crisper. Both ship with Windows and macOS, so
 *  there is no download either way. */
const ADMIN_BODY_TEXT = "'Times New Roman', Georgia, 'Liberation Serif', serif";

/** Faces drawn for headlines: very thick stems next to hairline thin strokes. That contrast is
 *  what makes them handsome at 28px and unreadable at 13. */
const DISPLAY_FACES = new Set(['playfair-display']);

function applyAdminFont(id: string) {
  const f = ADMIN_FONTS.find(o => o.id === id) ?? ADMIN_FONTS[0];
  // TWO ROLES, AND THE SPLIT IS BACK — the mistake last time was WHICH side got which face.
  //
  // For one day the whole panel was set in the chosen face. He looked at it and said the text was
  // blurred, and he is right; it is measurable. Rendering the same words at the same size and
  // counting the ink that actually lands on the pixels:
  //
  //     "New user registrations by month"  13px/600   Playfair 19.8%   Montserrat 24.3%
  //     "Henry Otieno"                     15px/600   Playfair 22.3%   Montserrat 25.0%
  //     "210m 2s"                          32px/600   Playfair 33.8%   Montserrat 34.5%
  //
  // A quarter of the ink is missing at caption size and NONE of it is missing at 32px. That is the
  // whole story: the face is fine doing the job it was drawn for and thin doing any other. No
  // weight and no size inside the body range closes the gap, because it is the shape of the
  // typeface and not a setting — which is why raising the weight to 600 everywhere did not fix it.
  //
  // So the chosen face keeps every DISPLAY role — page titles, card titles, the big figures, the
  // navigation rail — and the small text that is actually read takes the sans. What went wrong the
  // first time round was that the headings went sans as well, which took the chosen face off the
  // screen entirely and is what he was objecting to. `--admin-header-font` is what stops that.
  const isDisplay = DISPLAY_FACES.has(f.id);
  document.documentElement.style.setProperty('--admin-header-font', f.stack);
  document.documentElement.style.setProperty('--admin-font', isDisplay ? ADMIN_BODY_TEXT : f.stack);
}

// Apply saved preferences immediately on module load
try {
  applyAdminTheme(localStorage.getItem(ADMIN_THEME_KEY) ?? ADMIN_THEME_DEFAULT);
  applyAdminFont(localStorage.getItem(ADMIN_FONT_KEY) ?? ADMIN_FONT_DEFAULT);
} catch {}

/** The rail's own face. Brand chrome, like the wordmark — deliberately NOT the picker's font. */

/** An instant from the API -> the value a `datetime-local` input expects, in the viewer's own
 *  timezone. `toISOString()` would render UTC and silently shift the author's chosen time. */
const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toTitleCase = (s: string): string =>
  s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
// The reference card: one hairline, a shadow you can barely see, generously rounded. The old one
// carried an inset highlight and a heavy black drop shadow — both read only on a near-black page and
// turn to grime on a pale one.

const SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', ac: '#1877F2', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.791-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" /></svg> },
  { id: 'twitter', label: 'X / Twitter', ac: '#e2e8f0', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.261 5.638 5.902-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg> },
  { id: 'linkedin', label: 'LinkedIn', ac: '#0A66C2', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg> },
  { id: 'telegram', label: 'Telegram', ac: '#26A5E4', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg> },
  { id: 'whatsapp', label: 'WhatsApp', ac: '#25D366', icon: () => <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg> },
];

const EXPERTISE_OPTIONS = ['Technical Analysis', 'Fundamental Analysis', 'Forex', 'Crypto', 'Stocks', 'Commodities', 'Scalping', 'Swing Trading', 'Risk Management', 'Price Action'];
// A topic decides which section a post belongs to. Topics are TYPED now, not chosen from a list
// (2026-08-30), so this map only names the exceptions — everything it does not mention falls back
// to 'blog' at the two places it is read.
const CATEGORY_TO_SECTION: Record<string, string> = {
  'Equities': 'blog', 'Forex': 'blog', 'Digital Assets': 'blog',
  'Analysis': 'blog', 'Backtested Strategies': 'verified-strategies',
};
const EMPTY_FORM = { title: '', section: 'blog', category: 'Analysis', status: 'Draft', imageUrl: '', excerpt: '', content: '', readTime: '', authorName: '', authorBio: '', authorExpertise: [] as string[], authorTwitter: '', authorLinkedin: '', authorTelegram: '', shareOn: [] as string[], signal: { pair: '', action: 'BUY', market: 'Forex', timeframe: 'H1', entry: '', sl: '', tp1: '', tp2: '', tp3: '', rr: '', confidence: 'High', rationale: '' } };


// Snap to nearest valid FlagCDN PNG width (20, 40, 80, 160, 320, 640)
function snapCdnWidth(px: number): number {
  for (const w of [20, 40, 80, 160, 320, 640]) if (px <= w) return w;
  return 640;
}

const FlagImg = ({ country, size = 20 }: { country?: string; size?: number }) => {
  const code = countryToIso(country);
  if (!code) return <span style={{ fontSize: (size ?? 20) * 0.7, color: C.muted }}>🌐</span>;
  const w1 = snapCdnWidth(size ?? 20);
  const w2 = snapCdnWidth((size ?? 20) * 2);
  return (
    <img
      src={`https://flagcdn.com/w${w1}/${code}.png`}
      srcSet={`https://flagcdn.com/w${w2}/${code}.png 2x`}
      width={size}
      alt={country}
      title={country}
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: '2px', objectFit: 'cover', flexShrink: 0 }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
};

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
const GrowthChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const newUsers = payload.find((p: any) => p.dataKey === 'users')?.value ?? 0;
  const cumulative = payload.find((p: any) => p.dataKey === 'cumulative')?.value ?? 0;
  return (
    <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '10px 14px', fontFamily: FONT, minWidth: 140 }}>
      <p style={{ color: C.muted, fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: C.muted, fontSize: 12 }}>New signups</span>
          <span style={{ color: C.indigo, fontWeight: 700, fontSize: 12 }}>{newUsers}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: C.muted, fontSize: 12 }}>Cumulative</span>
          <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 12 }}>{cumulative}</span>
        </div>
      </div>
    </div>
  );
};

const Sparkline = ({ data, danger }: { data: number[]; danger?: boolean }) => {
  const W = 80, H = 32, pd = 2, max = Math.max(...data, 1);
  const pts = data.map((v: number, i: number) => `${(i / (data.length - 1)) * (W - pd * 2) + pd},${H - ((v / max) * (H - pd * 2) + pd)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '80px', height: '32px' }}><polyline fill="none" stroke={danger ? C.red : C.indigo} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} opacity="0.8" /></svg>;
};

const _skeletonStyle = document.createElement('style');
_skeletonStyle.textContent = '@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.9}}';
if (!document.head.querySelector('[data-sk]')) { _skeletonStyle.setAttribute('data-sk','1'); document.head.appendChild(_skeletonStyle); }

const GaugeRing = ({ value, max = 100, color, size = 44, sw = 4 }: { value: number; max?: number; color: string; size?: number; sw?: number }) => {
  const r = (size - sw) / 2, circ = 2 * Math.PI * r, pct = Math.min(value / max, 1), dash = pct * circ;
  const ring = pct > 0.8 ? C.red : pct > 0.6 ? C.amber : color;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#131c28" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring} strokeWidth={sw} strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
};


// ─── USERS SECTION ───────────────────────────────────────────────────────────
const PLAN_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Free:       { bg: C.border,                  color: C.muted,  border: C.border2 },
  Pro:        { bg: 'rgba(0,200,224,0.12)',    color: C.indigoL,  border: 'rgba(0,200,224,0.3)' },
  Enterprise: { bg: 'rgba(245,158,11,0.12)',    color: C.amberL,   border: 'rgba(245,158,11,0.3)' },
};
const STATUS_COLOR: Record<string, string> = { Active: C.greenL, Inactive: '#3d5878', Banned: C.redL, 'Pending Deletion': C.amberL };

const UsersSection = ({ bp, apiUsers, setApiUsers, getAdminToken }: { bp: any; apiUsers: any[]; setApiUsers: (fn: any) => void; getAdminToken: () => Promise<string | null> }) => {
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteMode, setDeleteMode] = useState<'immediate' | 'soft'>('immediate');
  const [deleting, setDeleting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [grantAccessUserId, setGrantAccessUserId] = useState<string | null>(null);
  const [grantAccessDays, setGrantAccessDays] = useState('30');
  const [grantingAccess, setGrantingAccess] = useState(false);

  const handleGrantJournalAccess = async () => {
    if (!grantAccessUserId) return;
    const days = parseInt(grantAccessDays, 10);
    if (!days || days < 1) return;
    setGrantingAccess(true);
    const token = await getAdminToken();
    if (token) {
      await fetch(`/api/admin/users/${grantAccessUserId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ journalAccessDays: String(days) }),
      });
    }
    setGrantingAccess(false);
    setGrantAccessUserId(null);
    setGrantAccessDays('30');
  };

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

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const token = await getAdminToken();
    if (token) {
      const r = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: deleteMode }),
      });
      if (r.ok) {
        if (deleteMode === 'immediate') {
          setApiUsers((prev: any[]) => prev.filter(u => u.id !== deleteTarget.id));
        } else {
          setApiUsers((prev: any[]) => prev.map(u => u.id === deleteTarget.id ? { ...u, status: 'Pending Deletion' } : u));
        }
      }
    }
    setDeleting(false);
    setDeleteTarget(null);
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
          <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search traders..." style={{ ...inp, width: bp.isMobile ? '100%' : '220px', paddingLeft: '34px', fontSize: '14px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: C.muted, fontSize: '13px' }}>{filtered.length} traders</span>
          <button onClick={() => setShowInvite(true)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '7px', background: C.indigo, color: 'white', padding: '9px 16px', fontSize: '13px', border: 'none', whiteSpace: 'nowrap', fontWeight: 700 }}>
            <UserPlus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cs, overflowX: 'auto', marginTop: '3px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: C.thead }}>
              {['User', 'Country', 'Plan', 'Status', 'Win Rate', 'Last Login', ''].map((h, i) => (
                <th key={i} style={{ padding: '11px 16px', textAlign: i === 6 ? 'right' : 'left', color: C.muted, fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
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
                    <p style={{ color: C.text, fontWeight: 600, fontSize: '14px', margin: 0 }}>{u.full_name ? toTitleCase(u.full_name) : '—'}</p>
                    <p style={{ color: C.muted, fontSize: '12px', margin: '2px 0 0' }}>{u.email}</p>
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    {u.country ? (
                      <span style={{ color: C.muted, fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FlagImg country={u.country} size={20} /> {u.country.toUpperCase()}
                      </span>
                    ) : <span style={{ color: '#1b2840', fontSize: '13px' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 8px', background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{u.plan || 'Free'}</span>
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: statusColor, fontSize: '13px', fontWeight: 600 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block', boxShadow: `0 0 5px ${statusColor}60` }} />
                      {u.status || 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ color: u.win_rate ? C.blueL : '#1b2840', fontSize: '14px', fontWeight: u.win_rate ? 700 : 400 }}>{u.win_rate || '—'}</span>
                  </td>
                  <td style={{ padding: '13px 16px', color: C.muted, fontSize: '13px', whiteSpace: 'nowrap' }}>{lastLogin}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'right', position: 'relative' }}>
                    <button onClick={e => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : u.id); }}
                      style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', padding: '4px 8px', fontSize: '16px', lineHeight: 1 }}>⋮</button>
                    {isMenuOpen && (
                      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: '12px', top: '100%', zIndex: 30, background: C.card, border: `1px solid ${C.border2}`, minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        {(['Free', 'Pro', 'Enterprise'] as const).map(p => (
                          <button key={p} onClick={() => { updateProfile(u.id, { plan: p }); setMenuOpenId(null); }}
                            style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: u.plan === p ? 'rgba(0,200,224,0.1)' : 'transparent', color: u.plan === p ? C.indigoL : '#607898', border: 'none', fontSize: '13px' }}>Plan: {p}</button>
                        ))}
                        <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                        {(['Active', 'Inactive', 'Banned'] as const).map(s => (
                          <button key={s} onClick={() => { updateProfile(u.id, { status: s }); setMenuOpenId(null); }}
                            style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: u.status === s ? 'rgba(0,200,224,0.1)' : 'transparent', color: u.status === s ? C.indigoL : STATUS_COLOR[s], border: 'none', fontSize: '13px' }}>Status: {s}</button>
                        ))}
                        <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                        <button onClick={() => { handleRoleChange(u.id, u.role === 'admin' ? 'user' : 'admin'); setMenuOpenId(null); }}
                          style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'transparent', color: C.amberL, border: 'none', fontSize: '13px' }}>
                          {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                        </button>
                        <button onClick={() => { setGrantAccessUserId(u.id); setGrantAccessDays('30'); setMenuOpenId(null); }}
                          style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'transparent', color: C.greenL, border: 'none', fontSize: '13px' }}>Grant Journal Access</button>
                        <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                        <button onClick={() => { setDeleteTarget({ id: u.id, name: u.full_name ? toTitleCase(u.full_name) : u.email }); setDeleteMode('immediate'); setMenuOpenId(null); }}
                          style={{ ...btn, display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'transparent', color: C.redL, border: 'none', fontSize: '13px' }}>Delete Account</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '32px', color: C.muted, fontSize: '14px', textAlign: 'center' }}>
                {search ? 'No traders match your search.' : 'No users found.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Grant Journal Access modal */}
      {grantAccessUserId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '360px', padding: '24px', border: `1px solid ${C.border2}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Grant Journal Access</h3>
              <button onClick={() => setGrantAccessUserId(null)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', padding: '4px' }}><X size={16} /></button>
            </div>
            <p style={{ color: C.muted, fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
              Grant this user access to the journal for a specified number of days, starting from now.
            </p>
            <label style={{ ...lbl }}>Number of Days</label>
            <input
              type="number"
              min="1"
              max="3650"
              value={grantAccessDays}
              onChange={e => setGrantAccessDays(e.target.value)}
              style={{ ...inp, marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setGrantAccessUserId(null)} style={{ ...btn, flex: 1, padding: '10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, fontSize: '14px' }}>Cancel</button>
              <button onClick={handleGrantJournalAccess} disabled={grantingAccess} style={{ ...btn, flex: 1, padding: '10px', background: C.green, color: 'white', border: 'none', fontSize: '14px', opacity: grantingAccess ? 0.6 : 1 }}>
                {grantingAccess ? 'Granting…' : 'Grant Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '360px', padding: '28px', border: `1px solid rgba(244,63,94,0.35)` }}>
            <div style={{ width: '44px', height: '44px', background: 'rgba(244,63,94,0.1)', border: `1px solid rgba(244,63,94,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={20} style={{ color: C.redL }} />
            </div>
            <p style={{ color: C.text, fontWeight: 700, fontFamily: HFONT, fontSize: '16px', textAlign: 'center', margin: '0 0 6px' }}>Delete Account</p>
            <p style={{ color: C.muted, fontSize: '13px', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
              You are about to delete <strong style={{ color: C.text }}>{deleteTarget.name}</strong>.<br />This cannot be undone.
            </p>

            {/* Mode toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
              {(['immediate', 'soft'] as const).map(m => (
                <button key={m} onClick={() => setDeleteMode(m)}
                  style={{ ...btn, padding: '10px 8px', fontSize: '12px', textAlign: 'center', border: `1px solid ${deleteMode === m ? C.red : C.border2}`, background: deleteMode === m ? 'rgba(244,63,94,0.12)' : 'transparent', color: deleteMode === m ? C.redL : '#607898' }}>
                  {m === 'immediate' ? 'Delete Now' : 'Delete in 24h'}
                </button>
              ))}
            </div>
            <p style={{ color: C.muted, fontSize: '12px', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.6 }}>
              {deleteMode === 'immediate'
                ? 'Account and all data will be permanently removed immediately.'
                : 'Account is marked for deletion and disappears automatically after 24 hours.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btn, padding: '10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, fontSize: '14px' }}>Cancel</button>
              <button onClick={handleDeleteUser} disabled={deleting}
                style={{ ...btn, padding: '10px', background: '#dc2626', color: 'white', border: 'none', fontSize: '14px', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting…' : deleteMode === 'immediate' ? 'Delete Now' : 'Schedule Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite user modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '360px', padding: '24px', border: `1px solid ${C.border2}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Invite User</h3>
              <button onClick={() => setShowInvite(false)} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', padding: '4px' }}><X size={16} /></button>
            </div>
            <label style={{ ...lbl }}>Email Address</label>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="trader@example.com" style={{ ...inp, marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowInvite(false)} style={{ ...btn, flex: 1, padding: '10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, fontSize: '14px' }}>Cancel</button>
              <button onClick={handleInvite} disabled={inviting} style={{ ...btn, flex: 1, padding: '10px', background: C.indigo, color: 'white', border: 'none', fontSize: '14px', opacity: inviting ? 0.6 : 1 }}>{inviting ? 'Sending…' : 'Send Invite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── CUSTOMER CARE ────────────────────────────────────────────────────────────
// ─── SYSTEM MONITOR ──────────────────────────────────────────────────────────
const SERVICE_GROUPS = {
  'Infrastructure': ['Database', 'Auth / Logins', 'Cache Layer', 'App Loading'],
  'Features':       ['Blog', 'Journal', 'Economic Calendar', 'TSC Page'],
  'Services':       ['Price Feed', 'Gemini AI', 'Telegram Bot', 'Copy Engine'],
};

// ─── SYNC PERFORMANCE SECTION ────────────────────────────────────────────────
async function getSyncAuthHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) h['Authorization'] = `Bearer ${token}`;
  } else {
    try {
      const stored = localStorage.getItem('local_admin_session');
      if (stored) {
        const { token } = JSON.parse(stored) as { token?: string };
        if (token) h['Authorization'] = `Bearer ${token}`;
      }
    } catch {}
  }
  return h;
}

const SyncPerformanceSection = ({ bp }: { bp: any }) => {
  type TabId = 'overview' | 'providers' | 'telegram' | 'followers' | 'trades' | 'leaderboard';
  const [tab, setTab] = useState<TabId>('overview');

  // ── Shared overview data (providers + followers + tg stats in one call) ────
  const [overview, setOverview]     = useState<any>(null);
  const [ovLoading, setOvLoading]   = useState(true);

  // ── Telegram trade list (detailed, with outcome marking) ──────────────────
  const [tgTrades, setTgTrades]     = useState<any[]>([]);
  const [tgLoading, setTgLoading]   = useState(false);
  const [tgLoaded, setTgLoaded]     = useState(false);
  const [marking, setMarking]       = useState<string | null>(null);

  // ── All copy trades (MT5 + telegram + self-copy) ───────────────────────────
  const [allTrades, setAllTrades]   = useState<any[]>([]);
  const [atLoading, setAtLoading]   = useState(false);
  const [atLoaded, setAtLoaded]     = useState(false);

  // ── Leaderboard management ─────────────────────────────────────────────────
  const [lbEntries, setLbEntries]   = useState<any[]>([]);
  const [lbLoading, setLbLoading]   = useState(false);
  const [lbLoaded, setLbLoaded]     = useState(false);
  const [lbConfirm, setLbConfirm]   = useState<{ userId: string; name: string; hide: boolean } | null>(null);
  const [lbBusy, setLbBusy]         = useState(false);

  // ── All-sessions management (precise per-session deletion) ──────────────────
  const [adminSessions, setAdminSessions] = useState<any[]>([]);
  const [sessLoading, setSessLoading]     = useState(false);
  const [sessConfirm, setSessConfirm]     = useState<{ id: string; name: string; owner: string; trades: number } | null>(null);
  const [sessBusy, setSessBusy]           = useState(false);

  const loadOverview = async () => {
    setOvLoading(true);
    try {
      const h = await getSyncAuthHeaders();
      const r = await fetch('/api/admin/copy/overview', { headers: h });
      if (r.ok) setOverview(await r.json());
    } catch {}
    setOvLoading(false);
  };

  const loadTgTrades = async () => {
    setTgLoading(true);
    try {
      const h = await getSyncAuthHeaders();
      const r = await fetch('/api/copy/telegram-journal?limit=500', { headers: h });
      if (r.ok) { setTgTrades(await r.json()); setTgLoaded(true); }
    } catch {}
    setTgLoading(false);
  };

  const loadAllTrades = async () => {
    setAtLoading(true);
    try {
      const h = await getSyncAuthHeaders();
      const r = await fetch('/api/admin/copy/all-trades', { headers: h });
      if (r.ok) { setAllTrades(await r.json()); setAtLoaded(true); }
    } catch {}
    setAtLoading(false);
  };

  const loadLbEntries = async () => {
    setLbLoading(true);
    try {
      const h = await getSyncAuthHeaders();
      const r = await fetch('/api/admin/leaderboard/entries', { headers: h });
      if (r.ok) { setLbEntries((await r.json()).entries ?? []); setLbLoaded(true); }
    } catch {}
    setLbLoading(false);
  };

  const loadAdminSessions = async () => {
    setSessLoading(true);
    try {
      const h = await getSyncAuthHeaders();
      const r = await fetch('/api/admin/sessions', { headers: h });
      if (r.ok) setAdminSessions((await r.json()).sessions ?? []);
    } catch {}
    setSessLoading(false);
  };

  const handleLbToggle = async () => {
    if (!lbConfirm) return;
    setLbBusy(true);
    try {
      const h = await getSyncAuthHeaders();
      const r = await fetch(`/api/admin/leaderboard/${lbConfirm.userId}`, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: lbConfirm.hide }),
      });
      if (r.ok) {
        setLbEntries(prev => prev.map(e =>
          e.userId === lbConfirm.userId ? { ...e, hidden: lbConfirm.hide } : e
        ));
      }
    } catch {}
    setLbBusy(false);
    setLbConfirm(null);
  };

  const handleSessDelete = async () => {
    if (!sessConfirm) return;
    setSessBusy(true);
    try {
      const h = await getSyncAuthHeaders();
      const r = await fetch(`/api/admin/sessions/${sessConfirm.id}`, { method: 'DELETE', headers: h });
      if (r.ok) {
        setAdminSessions(prev => prev.filter(s => s.id !== sessConfirm.id));
        loadLbEntries();  // refresh per-user aggregates so the leaderboard table stays consistent
      }
    } catch {}
    setSessBusy(false);
    setSessConfirm(null);
  };

  const renderLeaderboard = () => {
    const active = lbEntries.filter(e => !e.hidden);
    const hidden = lbEntries.filter(e => e.hidden);
    const row = (e: any, rank: number, isHidden: boolean) => (
      <tr key={e.userId} style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={{ padding: '8px 10px', color: C.muted, fontSize: '13px', width: 36, textAlign: 'center' }}>
          {isHidden ? '—' : rank}
        </td>
        <td style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlagImg country={e.country} size={20} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>
              {toTitleCase(e.name || 'Unknown')}
            </span>
          </div>
        </td>
        <td style={{ padding: '8px 10px', color: C.text, fontSize: '13px', textAlign: 'right' }}>{e.sessions ?? 0}</td>
        <td style={{ padding: '8px 10px', fontSize: '13px', textAlign: 'right',
          color: (e.pnl ?? 0) >= 0 ? C.green : C.red }}>
          {(e.pnl ?? 0) >= 0 ? '+' : ''}{Number(e.pnl ?? 0).toFixed(2)}
        </td>
        <td style={{ padding: '8px 10px', fontSize: '13px', textAlign: 'right',
          color: (e.winRate ?? 0) >= 50 ? C.green : C.muted }}>
          {Number(e.winRate ?? 0).toFixed(1)}%
        </td>
        <td style={{ padding: '8px 10px', color: C.muted, fontSize: '13px', textAlign: 'right' }}>{e.trades ?? 0}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
          <button
            onClick={() => setLbConfirm({ userId: e.userId, name: toTitleCase(e.name || 'Unknown'), hide: !isHidden })}
            style={{ ...btn, fontSize: '12px', padding: '4px 10px',
              background: isHidden ? C.green + '22' : C.red + '22',
              color: isHidden ? C.green : C.red,
              border: `1px solid ${isHidden ? C.green : C.red}40` }}>
            {isHidden ? 'Restore' : 'Remove'}
          </button>
        </td>
      </tr>
    );
    const thead = (
      <thead>
        <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
          {['#', 'User', 'Sessions', 'PnL', 'Win %', 'Trades', ''].map((h, i) => (
            <th key={i} style={{ padding: '6px 10px', fontSize: '14px', fontWeight: 500, color: C.muted,
              textAlign: i === 0 ? 'center' : i < 2 ? 'left' : i === 6 ? 'right' : 'right' }}>{h}</th>
          ))}
        </tr>
      </thead>
    );
    return (
      <div style={{ fontFamily: FONT }}>
        {lbLoading && <div style={{ color: C.muted, fontSize: '14px', padding: '24px 0', textAlign: 'center' }}>Loading…</div>}
        {!lbLoading && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: 8 }}>
                Active on Leaderboard ({active.length})
              </div>
              {active.length === 0
                ? <div style={{ color: C.muted, fontSize: '13px', padding: '12px 0' }}>No active entries.</div>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: C.bg }}>
                    {thead}
                    <tbody>{active.map((e, i) => row(e, i + 1, false))}</tbody>
                  </table>
                )}
            </div>
            {hidden.length > 0 && (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: 8 }}>
                  Hidden from Leaderboard ({hidden.length})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: C.bg, opacity: 0.65 }}>
                  {thead}
                  <tbody>{hidden.map((e, i) => row(e, i + 1, true))}</tbody>
                </table>
              </div>
            )}

            {/* All sessions — see every session in the DB and delete precisely */}
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: 8 }}>
                All Sessions ({adminSessions.length})
              </div>
              {sessLoading
                ? <div style={{ color: C.muted, fontSize: '13px', padding: '12px 0' }}>Loading sessions…</div>
                : adminSessions.length === 0
                  ? <div style={{ color: C.muted, fontSize: '13px', padding: '12px 0' }}>No sessions found.</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: C.bg }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                          {['Session', 'Owner', 'Trades', 'PnL', 'Created', ''].map((h, i) => (
                            <th key={i} style={{ padding: '6px 10px', fontSize: '14px', fontWeight: 500, color: C.muted,
                              textAlign: (i === 2 || i === 3 || i === 5) ? 'right' : 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {adminSessions.map((s) => (
                          <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '8px 10px', fontSize: '14px', fontWeight: 600, color: C.text }}>{s.name}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FlagImg country={s.country} size={18} />
                                <span style={{ fontSize: '13px', color: C.muted }}>{toTitleCase(s.owner || 'Unknown')}</span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', fontSize: '13px', textAlign: 'right', color: C.muted }}>{s.trades}</td>
                            <td style={{ padding: '8px 10px', fontSize: '13px', textAlign: 'right',
                              color: (s.pnl ?? 0) >= 0 ? C.green : C.red }}>
                              {(s.pnl ?? 0) >= 0 ? '+' : ''}{Number(s.pnl ?? 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 10px', fontSize: '12px', color: C.muted }}>
                              {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <button
                                onClick={() => setSessConfirm({ id: s.id, name: s.name, owner: toTitleCase(s.owner || 'Unknown'), trades: s.trades })}
                                style={{ ...btn, fontSize: '12px', padding: '4px 10px',
                                  background: C.red + '22', color: C.red, border: `1px solid ${C.red}40` }}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
            </div>
          </>
        )}
        {/* Confirm modal */}
        {lbConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: '28px 32px',
              minWidth: 340, fontFamily: FONT }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: C.text, marginBottom: 10 }}>
                {lbConfirm.hide ? 'Remove from Leaderboard' : 'Restore to Leaderboard'}
              </div>
              <div style={{ fontSize: '14px', color: C.muted, marginBottom: 24 }}>
                {lbConfirm.hide
                  ? <>Remove <strong style={{ color: C.text }}>{lbConfirm.name}</strong> from the public leaderboard? Their account and trade data are not affected.</>
                  : <>Restore <strong style={{ color: C.text }}>{lbConfirm.name}</strong> to the public leaderboard?</>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setLbConfirm(null)}
                  style={{ ...btn, flex: 1, padding: '9px', fontSize: '13px',
                    background: 'transparent', color: C.muted, border: `1px solid ${C.border2}` }}>
                  Cancel
                </button>
                <button onClick={handleLbToggle} disabled={lbBusy}
                  style={{ ...btn, flex: 1, padding: '9px', fontSize: '13px',
                    background: lbConfirm.hide ? C.red : C.green, color: C.text, opacity: lbBusy ? 0.6 : 1 }}>
                  {lbBusy ? '…' : lbConfirm.hide ? 'Remove' : 'Restore'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Delete-session confirm modal */}
        {sessConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: '28px 32px',
              minWidth: 360, maxWidth: 420, fontFamily: FONT }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: C.text, marginBottom: 10 }}>Delete Session</div>
              <div style={{ fontSize: '14px', color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
                Permanently delete <strong style={{ color: C.text }}>{sessConfirm.name}</strong>
                {sessConfirm.owner ? <> ({sessConfirm.owner})</> : null} and its{' '}
                <strong style={{ color: C.text }}>{sessConfirm.trades}</strong> trade{sessConfirm.trades === 1 ? '' : 's'}?
                <br />The owner's account and their other sessions are not affected. This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setSessConfirm(null)}
                  style={{ ...btn, flex: 1, padding: '9px', fontSize: '13px',
                    background: 'transparent', color: C.muted, border: `1px solid ${C.border2}` }}>
                  Cancel
                </button>
                <button onClick={handleSessDelete} disabled={sessBusy}
                  style={{ ...btn, flex: 1, padding: '9px', fontSize: '13px',
                    background: C.red, color: '#fff', opacity: sessBusy ? 0.6 : 1 }}>
                  {sessBusy ? 'Deleting…' : 'Delete Session'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { if (tab === 'telegram'    && !tgLoaded) loadTgTrades();  }, [tab]);
  useEffect(() => { if (tab === 'trades'      && !atLoaded) loadAllTrades(); }, [tab]);
  useEffect(() => { if (tab === 'leaderboard' && !lbLoaded) { loadLbEntries(); loadAdminSessions(); } }, [tab]);

  async function markOutcome(id: string, current: string | null, which: 'win' | 'loss') {
    const next = current === which ? null : which;
    setMarking(id);
    try {
      // Send credentials, like loadTgTrades does. This endpoint used to take an unauthenticated
      // write — anyone could mark any user's copied trade a win or a loss — so it now requires a
      // login, and a bare fetch would 401.
      const h = await getSyncAuthHeaders();
      const r = await fetch(`/api/copy/telegram-journal/${id}/outcome`, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: next }),
      });
      if (r.ok) {
        setTgTrades(prev => prev.map(t => t.id === id ? { ...t, manual_outcome: next } : t));
        setOverview((prev: any) => {
          if (!prev?.telegramStats) return prev;
          const s         = prev.telegramStats;
          const wasWin    = current === 'win';
          const wasLoss   = current === 'loss';
          const nowWin    = next    === 'win';
          const nowLoss   = next    === 'loss';
          const wins      = s.wins    + (nowWin  ? 1 : 0) - (wasWin  ? 1 : 0);
          const losses    = s.losses  + (nowLoss ? 1 : 0) - (wasLoss ? 1 : 0);
          const unmarked  = s.unmarked + (next == null ? 1 : 0) - (current == null ? 1 : 0);
          const marked    = wins + losses;
          return { ...prev, telegramStats: { ...s, wins, losses, unmarked, winRate: marked > 0 ? +((wins / marked) * 100).toFixed(1) : null } };
        });
      }
    } catch {}
    setMarking(null);
  }

  const fmt     = (v: any, dp = 5) => (v == null || v === '' ? '—' : parseFloat(v).toFixed(dp));
  const fmtDate = (v: any) => v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  // ── Shared UI helpers ──────────────────────────────────────────────────────
  const TAB_ITEMS: { id: TabId; label: string }[] = [
    { id: 'overview',     label: 'Overview'     },
    { id: 'providers',    label: 'Providers'    },
    { id: 'telegram',     label: 'Telegram'     },
    { id: 'followers',    label: 'Followers'    },
    { id: 'trades',       label: 'All Trades'   },
    { id: 'leaderboard',  label: 'Leaderboard'  },
  ];

  const tabBar = (
    <div style={{ display: 'flex', gap: '2px', background: C.card, border: `1px solid ${C.border}`, padding: '3px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {TAB_ITEMS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)}
          style={{ ...btn, padding: '6px 16px', fontSize: '12px', background: tab === t.id ? C.indigo : 'transparent', color: tab === t.id ? '#fff' : C.muted, transition: 'all 0.15s' }}>
          {t.label}
        </button>
      ))}
    </div>
  );

  const th = (label: string) => (
    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '14px', fontWeight: 500, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
      {label}
    </th>
  );

  const td = (content: any, mono = false, color?: string) => (
    <td style={{ padding: '8px 10px', fontSize: '12px', color: color ?? C.text, fontFamily: FONT, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
      {content}
    </td>
  );

  const pill = (label: string, color: string) => (
    <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 7px', border: `1px solid ${color}33`, color, background: `${color}15`, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
  );

  const emptyState = (msg: string) => (
    <div style={{ padding: '48px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>{msg}</div>
  );

  const spinner = (
    <div style={{ padding: '48px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>Loading…</div>
  );

  const statCard = (label: string, value: any, color = C.text) => (
    <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, padding: '14px 16px' }}>
      <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: FONT, color, lineHeight: 1 }}>{value ?? '—'}</div>
    </div>
  );

  // ── Overview Tab ───────────────────────────────────────────────────────────
  const renderOverview = () => {
    if (ovLoading) return spinner;
    const ov = overview;
    const masters   = ov?.masters   ?? [];
    const followers = ov?.followers ?? [];
    const tg        = ov?.telegramStats ?? {};
    const activeProviders = masters.filter((m: any) => m.is_active).length;
    const selfCopies      = ov?.selfCopyCount ?? 0;
    const totalTrades     = masters.reduce((s: number, m: any) => s + Number(m.total_trades ?? 0), 0);
    const totalWins       = masters.reduce((s: number, m: any) => s + Number(m.win_count ?? 0), 0);
    const overallWR       = totalTrades > 0 ? +((totalWins / totalTrades) * 100).toFixed(1) : null;
    const wrColor         = overallWR == null ? C.muted : overallWR >= 70 ? C.green : overallWR >= 55 ? C.amber : C.red;
    const tgWrColor       = tg.winRate == null ? C.muted : tg.winRate >= 70 ? C.green : tg.winRate >= 55 ? C.amber : C.red;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Top-line summary */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: '10px' }}>Platform Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: bp.isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '6px' }}>
            {statCard('Active Providers',  activeProviders,       C.indigoL)}
            {statCard('Active Followers',  followers.filter((f: any) => f.is_active).length, C.green)}
            {statCard('Self-Copy Active',  selfCopies,            C.amber)}
            {statCard('Total Copy Trades', totalTrades.toLocaleString(), C.text)}
          </div>
        </div>

        {/* MT5 copy trading */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: '10px' }}>MT5 Copy Trading</div>
          <div style={{ display: 'grid', gridTemplateColumns: bp.isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '6px' }}>
            {statCard('Total Providers',  masters.length,        C.indigoL)}
            {statCard('Total Trades',     totalTrades.toLocaleString(), C.text)}
            {statCard('Wins',             totalWins.toLocaleString(),   C.green)}
            {statCard('Win Rate',         overallWR != null ? `${overallWR}%` : '—', wrColor)}
          </div>
        </div>

        {/* Telegram signals */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: '10px' }}>Telegram Signal Performance</div>
          <div style={{ display: 'grid', gridTemplateColumns: bp.isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: '6px' }}>
            {statCard('Total',    tg.total    ?? 0, C.text)}
            {statCard('Wins',     tg.wins     ?? 0, C.green)}
            {statCard('Losses',   tg.losses   ?? 0, C.red)}
            {statCard('Unmarked', tg.unmarked ?? 0, C.amber)}
            {statCard('Win Rate', tg.winRate  != null ? `${tg.winRate}%` : '—', tgWrColor)}
          </div>
        </div>
      </div>
    );
  };

  // ── Providers Tab ──────────────────────────────────────────────────────────
  const renderProviders = () => {
    if (ovLoading) return spinner;
    const masters = overview?.masters ?? [];
    if (masters.length === 0) return emptyState('No providers registered yet.');
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: C.card }}>
              {th('Strategy')} {th('Type')} {th('Self-Copy')} {th('Market')} {th('Style')} {th('Win Rate')} {th('Trades')} {th('Followers')} {th('Status')} {th('Since')}
            </tr>
          </thead>
          <tbody>
            {masters.map((p: any) => {
              const trades   = Number(p.total_trades ?? 0);
              const wins     = Number(p.win_count    ?? 0);
              const wr       = trades > 0 ? +((wins / trades) * 100).toFixed(1) : null;
              const wrColor  = wr == null ? C.muted : wr >= 70 ? C.green : wr >= 55 ? C.amber : C.red;
              const isSelf   = overview?.followers?.some((f: any) => f.master_id === p.id && f.is_self_copy);
              return (
                <tr key={p.id} style={{ background: 'transparent' }}>
                  {td(p.strategy_name || '—')}
                  {td(pill(p.source_type || '—', p.source_type === 'telegram' ? '#26A5E4' : C.indigoL))}
                  {td(isSelf ? pill('Self', C.amber) : <span style={{ color: C.muted }}>—</span>)}
                  {td((p.primary_market || '—').toUpperCase(), true)}
                  {td(p.trading_style || '—')}
                  {td(wr != null ? `${wr}%` : '—', true, wrColor)}
                  {td(trades.toLocaleString(), true)}
                  {td(Number(p.follower_count ?? 0).toLocaleString(), true)}
                  {td(pill(p.is_active ? 'Active' : 'Inactive', p.is_active ? C.green : C.muted))}
                  {td(p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—')}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Telegram Tab ───────────────────────────────────────────────────────────
  const renderTelegram = () => {
    const tg      = overview?.telegramStats ?? {};
    const wrColor = tg.winRate != null ? (tg.winRate >= 70 ? C.green : tg.winRate >= 55 ? C.amber : C.red) : C.muted;
    return (
      <div>
        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: bp.isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: '6px', marginBottom: '18px' }}>
          {[
            { label: 'Total Trades', value: tg.total    ?? 0,  color: C.text },
            { label: 'Wins',         value: tg.wins     ?? 0,  color: C.green },
            { label: 'Losses',       value: tg.losses   ?? 0,  color: C.red },
            { label: 'Unmarked',     value: tg.unmarked ?? 0,  color: C.amber },
            { label: 'Win Rate',     value: tg.winRate  != null ? `${tg.winRate}%` : '—', color: wrColor },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, padding: '12px 14px' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: C.muted, marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: FONT, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Trade table */}
        {tgLoading ? spinner : !tgLoaded ? emptyState('Loading trades…') : tgTrades.length === 0 ? emptyState('No Telegram signal trades executed yet.') : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.card }}>
                  {th('Symbol')} {th('Action')} {th('Volume')} {th('Entry')} {th('SL')} {th('TP')} {th('Executed')} {th('Outcome')}
                </tr>
              </thead>
              <tbody>
                {tgTrades.map((t: any) => {
                  const outcome      = t.manual_outcome;
                  const isMarkingThis = marking === t.id;
                  return (
                    <tr key={t.id}>
                      {td(<span style={{ fontWeight: 700 }}>{t.symbol || '—'}</span>, false, C.indigoL)}
                      {td(pill(t.action || '—', t.action === 'BUY' ? C.green : C.red))}
                      {td(fmt(t.volume, 2), true)}
                      {td(fmt(t.entry_price), true)}
                      {td(fmt(t.stop_loss), true, C.red)}
                      {td(fmt(t.take_profit), true, C.green)}
                      {td(fmtDate(t.executed_at || t.created_at))}
                      <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button disabled={isMarkingThis} onClick={() => markOutcome(t.id, outcome, 'win')} title="Mark Win"
                            style={{ ...btn, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', border: `1px solid ${outcome === 'win' ? C.green : C.border2}`, background: outcome === 'win' ? `${C.green}20` : 'transparent', color: outcome === 'win' ? C.green : C.muted, borderRadius: 0, opacity: isMarkingThis ? 0.4 : 1 }}>
                            ✓
                          </button>
                          <button disabled={isMarkingThis} onClick={() => markOutcome(t.id, outcome, 'loss')} title="Mark Loss"
                            style={{ ...btn, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', border: `1px solid ${outcome === 'loss' ? C.red : C.border2}`, background: outcome === 'loss' ? `${C.red}20` : 'transparent', color: outcome === 'loss' ? C.red : C.muted, borderRadius: 0, opacity: isMarkingThis ? 0.4 : 1 }}>
                            ✕
                          </button>
                          {outcome && (
                            <span style={{ fontSize: '14px', fontWeight: 500, color: outcome === 'win' ? C.green : C.red }}>{outcome}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ── Followers Tab ──────────────────────────────────────────────────────────
  const renderFollowers = () => {
    if (ovLoading) return spinner;
    const followers = overview?.followers ?? [];
    if (followers.length === 0) return emptyState('No followers registered yet.');
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.card }}>
              {th('Strategy')} {th('Source')} {th('Self-Copy')} {th('Lot Mode')} {th('Multiplier')} {th('Risk %')} {th('Direction')} {th('Max Trades')} {th('DD Pause')} {th('Status')} {th('Deployed')}
            </tr>
          </thead>
          <tbody>
            {followers.map((f: any) => (
              <tr key={f.id}>
                {td(f.strategy_name || '—')}
                {td(pill(f.source_type || '—', f.source_type === 'telegram' ? '#26A5E4' : C.indigoL))}
                {td(f.is_self_copy ? pill('Self', C.amber) : <span style={{ color: C.muted }}>—</span>)}
                {td((f.lot_mode || '—').toUpperCase(), true)}
                {td(f.lot_multiplier ?? '—', true)}
                {td(f.risk_percent != null ? `${f.risk_percent}%` : '—', true)}
                {td((f.direction || '—').toUpperCase(), true)}
                {td(f.max_open_trades ?? '—', true)}
                {td(pill(f.pause_on_dd ? 'Yes' : 'No', f.pause_on_dd ? C.amber : C.muted))}
                {td(pill(f.is_active ? 'Active' : 'Inactive', f.is_active ? C.green : C.muted))}
                {td(fmtDate(f.deployed_at))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ── All Trades Tab ─────────────────────────────────────────────────────────
  const renderAllTrades = () => {
    if (atLoading) return spinner;
    if (!atLoaded) return emptyState('Loading trades…');
    if (allTrades.length === 0) return emptyState('No executed copy trades found.');
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.card }}>
              {th('Symbol')} {th('Action')} {th('Source')} {th('Self-Copy')} {th('Strategy')} {th('Volume')} {th('Entry')} {th('SL')} {th('TP')} {th('Close')} {th('Executed')}
            </tr>
          </thead>
          <tbody>
            {allTrades.map((t: any) => {
              const srcColor = t.source === 'telegram' || t.source_type === 'telegram' ? '#26A5E4' : C.indigoL;
              const srcLabel = t.source_type === 'telegram' ? 'Telegram' : t.source_type === 'mt5' ? 'MT5' : t.source ?? '—';
              return (
                <tr key={t.id}>
                  {td(<span style={{ fontWeight: 700 }}>{t.symbol || '—'}</span>, false, C.indigoL)}
                  {td(pill(t.action || '—', t.action === 'BUY' ? C.green : C.red))}
                  {td(pill(srcLabel, srcColor))}
                  {td(t.is_self_copy ? pill('Self', C.amber) : <span style={{ color: C.muted }}>—</span>)}
                  {td(t.strategy_name || '—')}
                  {td(fmt(t.volume, 2), true)}
                  {td(fmt(t.entry_price), true)}
                  {td(fmt(t.stop_loss), true, C.red)}
                  {td(fmt(t.take_profit), true, C.green)}
                  {td(fmt(t.closed_price), true)}
                  {td(fmtDate(t.executed_at || t.created_at))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const handleRefresh = () => {
    loadOverview();
    if (tgLoaded) { setTgLoaded(false); loadTgTrades(); }
    if (atLoaded) { setAtLoaded(false); loadAllTrades(); }
    if (lbLoaded) { setLbLoaded(false); loadLbEntries(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.text, letterSpacing: '0.04em', marginBottom: '2px' }}>Sync &amp; Copy Performance</div>
          <div style={{ fontSize: '12px', color: C.muted }}>All performance data — providers · self-copy · telegram signals · followers · executions</div>
        </div>
        <button onClick={handleRefresh}
          style={{ ...btn, padding: '6px 14px', fontSize: '12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}` }}>
          ↻ Refresh
        </button>
      </div>

      {/* Tab bar */}
      {tabBar}

      {/* Content */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: '16px', overflow: 'auto', flex: 1 }}>
        {tab === 'overview'     && renderOverview()}
        {tab === 'providers'    && renderProviders()}
        {tab === 'telegram'     && renderTelegram()}
        {tab === 'followers'    && renderFollowers()}
        {tab === 'trades'       && renderAllTrades()}
        {tab === 'leaderboard'  && renderLeaderboard()}
      </div>
    </div>
  );
};

const SystemMonitorSection = ({ bp, getAdminToken = null }: { bp: any; getAdminToken?: (() => Promise<string | null>) | null }) => {
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

  const resolveLog  = (id: number) => setResolvedIds(prev => new Set([...Array.from(prev), id]));
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
              <span style={{ color: C.muted, fontSize: '14px', fontWeight: 600 }}>{m.label}:</span>
              {loadingMetrics
                ? <Skeleton w={40} h={12} />
                : <span style={{ color: m.danger ? C.redL : 'white', fontSize: '12px', fontWeight: 700 }}>{m.val ?? '—'}<span style={{ fontSize: '12px', color: C.muted, marginLeft: '2px' }}>{m.unit}</span></span>
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
                <h3 style={{ color: C.text, fontWeight: 500, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>{group}</h3>
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
                      <span style={{ fontSize: '13px', color: isDeg ? C.redL : isNC ? C.amberL : isLoad ? C.muted : C.text, fontWeight: 600 }}>{svc.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {svc.latency && <span style={{ fontSize: '12px', fontFamily: FONT, color: C.muted }}>{svc.latency}</span>}
                      {isLoad
                        ? <Skeleton w={52} h={16} />
                        : <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', background: isOk ? 'rgba(16,185,129,0.1)' : isDeg ? 'rgba(244,63,94,0.1)' : isNC ? 'rgba(245,158,11,0.1)' : 'rgba(100,116,139,0.1)', color: isOk ? C.greenL : isDeg ? C.redL : isNC ? C.amberL : C.muted, border: `1px solid ${isOk ? 'rgba(16,185,129,0.2)' : isDeg ? 'rgba(244,63,94,0.2)' : isNC ? 'rgba(245,158,11,0.2)' : C.border2}` }}>
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
            <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.04em' }}>{label}</span>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, textAlign: 'right' }}>{children}</span>
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
                <h3 style={{ color: C.text, fontWeight: 500, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Economic Calendar</h3>
                {dot(cal ? cal.eventCount > 0 : null)}
              </div>
              <Row label="Source">{cal ? <span style={{ color: srcColor(cal.source) }}>{srcLabel(cal.source)}</span> : '—'}</Row>
              <Row label="Events cached">{cal?.eventCount ?? '—'}</Row>
              <Row label="Last fetch">{fmtAge(cal?.fetchedAt)}</Row>
              <Row label="In-flight">{cal?.inFlight ? <span style={{ color: C.amberL }}>fetching…</span> : 'idle'}</Row>
              {cal?.lastError && <Row label="Last error"><span style={{ color: C.redL, fontSize: 12 }}>{cal.lastError.slice(0, 40)}</span></Row>}
            </div>

            {/* Interest rates */}
            <div style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: C.text, fontWeight: 500, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Interest Rates</h3>
                {dot(rates ? rates.liveCount > 0 : null)}
              </div>
              <Row label="Live">{rates ? <span style={{ color: rates.liveCount > 0 ? C.greenL : C.muted }}>{rates.liveCount} currencies</span> : '—'}</Row>
              <Row label="Fallback">{rates ? <span style={{ color: rates.fallbackCount > 0 ? C.amberL : C.muted }}>{rates.fallbackCount} currencies</span> : '—'}</Row>
              <Row label="Last fetch">{fmtAge(rates?.fetchedAt)}</Row>
              <Row label="In-flight">{rates?.inFlight ? <span style={{ color: C.amberL }}>fetching…</span> : 'idle'}</Row>
              {rates?.lastError && <Row label="Last error"><span style={{ color: C.redL, fontSize: 12 }}>{rates.lastError.slice(0, 40)}</span></Row>}
            </div>

            {/* Signal monitor */}
            <div style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: C.text, fontWeight: 500, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Signal Monitor</h3>
                {dot(sig ? sig.running : null)}
              </div>
              <Row label="Status">{sig ? <span style={{ color: sig.running ? C.greenL : C.muted }}>{sig.running ? 'Running' : 'Stopped'}</span> : '—'}</Row>
              <Row label="Active signals">{sig?.lastActiveCount ?? '—'}</Row>
              <Row label="Last scan">{fmtAge(sig?.lastScanAt)}</Row>
              {sig?.lastError && <Row label="Last error"><span style={{ color: C.redL, fontSize: 12 }}>{sig.lastError.slice(0, 40)}</span></Row>}
            </div>

            {/* DB pool */}
            <div style={{ ...cs, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: C.text, fontWeight: 500, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>DB Connection Pool</h3>
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
              <h3 style={{ color: C.text, fontWeight: 500, margin: 0, fontSize: '16px', fontFamily: HFONT }}>Live Event Log</h3>
              {errorCount > 0 && <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', background: 'rgba(244,63,94,0.12)', color: C.redL, border: `1px solid rgba(244,63,94,0.25)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{errorCount} errors</span>}
              {warnCount > 0 && <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', background: 'rgba(245,158,11,0.12)', color: C.amberL, border: `1px solid rgba(245,158,11,0.25)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{warnCount} warn</span>}
            </div>
            <button onClick={() => setResolvedIds(new Set(logs.map(l => l.id)))} style={{ ...btn, background: 'transparent', color: C.muted, border: 'none', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Trash2 size={11} /> Clear</button>
          </div>
          {/* THE ONLY MONOSPACE LEFT IN THE PANEL, and it stays. This is a log console: every
              line is a timestamp and a level in a fixed position, and a proportional face makes
              those columns wander. DM Mono went everywhere else — figures, labels, the font
              picker — because there it was decoration, not alignment. */}
          <div style={{ overflowY: 'auto', fontFamily: 'ui-monospace, monospace', flex: 1 }}>
            {logs.filter(l => !resolvedIds.has(l.id)).length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <CheckCircle size={24} style={{ color: C.green, margin: '0 auto 8px' }} />
                <p style={{ color: C.muted, fontSize: '13px', margin: 0, fontFamily: FONT }}>No active incidents</p>
              </div>
            ) : logs.filter(l => !resolvedIds.has(l.id)).map(log => {
              const lc = LC[log.level as keyof typeof LC] ?? LC.info;
              const levelColor = log.level === 'error' ? C.red : log.level === 'warn' ? C.amber : '#3d5878';
              return (
                <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '11px 16px', borderBottom: `1px solid ${C.border}`, background: log.level === 'error' ? 'rgba(244,63,94,0.03)' : log.level === 'warn' ? 'rgba(245,158,11,0.02)' : 'transparent' }}>
                  <div style={{ width: '3px', alignSelf: 'stretch', background: levelColor, borderRadius: '2px', flexShrink: 0, minHeight: '36px', opacity: 0.8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', background: lc.bg, color: lc.c, border: `1px solid ${lc.b}`, letterSpacing: '0.06em' }}>{log.level}</span>
                      <span style={{ color: C.muted, fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em' }}>{log.service}</span>
                      <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>{log.time}</span>
                    </div>
                    <p style={{ color: log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fde68a' : '#607898', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>{log.message}</p>
                  </div>
                  {log.level !== 'info' && (
                    <button onClick={() => resolveLog(log.id)} title="Mark resolved" style={{ ...btn, background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, padding: '4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
const BlogSection = ({ bp }: { bp: any }) => {
  const [posts, setPosts] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState(() => localStorage.getItem('admin_active_section') || 'all');
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalTab, setModalTab] = useState('post');
  const [saving, setSaving] = useState(false);
  const [editorInitialData, setEditorInitialData] = useState<Partial<BlogEditorData>>({});

  const getToken = async (): Promise<string | null> => {
    // Supabase session (when configured)
    if (supabase) {
      const r = await supabase.auth.getSession();
      if (r.data?.session?.access_token) return r.data.session.access_token;
    }
    // Local-admin mode: token is stored in localStorage by AuthContext on login
    try {
      const stored = localStorage.getItem('local_admin_session');
      if (stored) {
        const { token } = JSON.parse(stored) as { token?: string };
        if (token) return token;
      }
    } catch { /* ignore parse errors */ }
    return null;
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
            slug: p.slug ?? '',
            publishAt: p.publishAt ?? p.publish_at ?? null,
            allowComments: p.allowComments ?? p.allow_comments ?? true,
            allowSharing: p.allowSharing ?? p.allow_sharing ?? true,
            imageUrl: p.imageUrl ?? p.image_url ?? '',
            excerpt: p.excerpt ?? '',
            content: p.content ?? '',
            readTime: p.readTime ?? p.read_time ?? '',
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
      imageUrl: post.imageUrl || '', excerpt: post.excerpt || '', content: post.content || '', readTime: post.readTime || '',
      authorName: post.author || '', authorBio: ad.bio || '', authorExpertise: ad.expertise || [],
      authorTwitter: ad.twitter || '', authorLinkedin: ad.linkedin || '', authorTelegram: ad.telegram || '',
      signal: post.signal || EMPTY_FORM.signal,
    });
    setEditorInitialData({
      title:           post.title,
      excerpt:         post.excerpt || '',
      summary:         post.summary || '',
      imageUrl:        post.imageUrl || '',
      readTime:        post.readTime || '',
      content:         post.content || '',
      category:        post.category || 'Analysis',
      status:          post.status || 'Draft',
      publishAt:       post.publishAt ? toLocalInput(post.publishAt) : '',
      slug:            post.slug || '',
      allowComments:   post.allowComments !== false,
      allowSharing:    post.allowSharing !== false,
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

  // Downscale + re-encode an image data URL to keep payloads small.
  // Most cover photos compress to < 300KB at 1600px wide / JPEG q=0.85.
  const compressDataUrl = async (dataUrl: string, maxWidth = 1600, quality = 0.85): Promise<string> => {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL('image/jpeg', quality);
      // If somehow the result grew (e.g., tiny PNG), keep the original
      return out.length < dataUrl.length ? out : dataUrl;
    } catch {
      return dataUrl;
    }
  };

  // Walk a markdown string, find every data:image/... URI and compress each one.
  // Keeps inline images (pasted screenshots, etc.) from blowing up the request body.
  const compressInlineImages = async (md: string): Promise<string> => {
    if (!md || !md.includes('data:image/')) return md;
    const RE = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
    const matches = Array.from(new Set(md.match(RE) || []));
    if (matches.length === 0) return md;
    const map = new Map<string, string>();
    for (const url of matches) {
      try {
        const compressed = await compressDataUrl(url);
        map.set(url, compressed);
      } catch {
        map.set(url, url);
      }
    }
    return md.replace(RE, m => map.get(m) || m);
  };

  const uploadCoverImage = async (dataUrl: string): Promise<string> => {
    // Try Supabase Storage first (when configured)
    if (supabase) {
      try {
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        const ext  = blob.type.split('/')[1] || 'jpg';
        const filePath = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { data: up, error } = await supabase.storage
          .from('blog-images')
          .upload(filePath, blob, { contentType: blob.type, upsert: false });
        if (!error && up) {
          const { data: pub } = supabase.storage.from('blog-images').getPublicUrl(up.path);
          return pub.publicUrl;
        }
      } catch { /* fall through */ }
    }
    // No Supabase — compress and store as a base64 data URL directly in the DB.
    // Disk-based /uploads paths are ephemeral on Replit and break after restarts.
    return await compressDataUrl(dataUrl);
  };

  const uploadFileForEditor = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => uploadCoverImage(reader.result as string).then(resolve).catch(reject);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
      // Compress any base64 images embedded inline in the body so the request
      // stays well under the dev-proxy / server payload limits.
      const compressedContent = await compressInlineImages(data.content || '');

      const payload = {
        title:      data.title.trim(),
        section:    derivedSection,
        status:     data.status,
        // The browser gives a local wall-clock string ("2026-09-12T09:30"); the server stores a real
        // instant. Converting here means the author's 9:30 is their own 9:30, not UTC's.
        publishAt:  data.publishAt ? new Date(data.publishAt).toISOString() : null,
        slug:       data.slug?.trim() || undefined,
        allowComments: data.allowComments,
        allowSharing:  data.allowSharing,
        category:   data.category,
        author:     data.authorName || 'Admin',
        date:       new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        imageUrl,
        videoUrl:   data.videoUrl || '',
        excerpt:    data.excerpt || '',
        summary:    data.summary || '',
        content:    compressedContent,
        readTime:   data.readTime || readingTime(data.content ?? ''),
        signalData: null,
        authorData,
      };
      const body = JSON.stringify(payload);
      if (editPost) {
        const r = await fetch(`/api/blog/${editPost.id}`, { method: 'PATCH', headers, body });
        if (r.ok) {
          const savedPost = await r.json();
          setPosts(p => p.map(x => x.id === editPost.id ? { ...x, ...savedPost, category: savedPost.category, authorData: savedPost.authorData } : x));
          localStorage.setItem('blog_post_published', Date.now().toString());
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
            content: savedPost.content ?? '', readTime: savedPost.readTime ?? '',
            authorData: savedPost.authorData,
          }]);
          localStorage.setItem('blog_post_published', Date.now().toString());
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

      // Shrink any base64 images embedded in the cover or body to keep the request
      // body well under the dev-proxy / server payload limits.
      let coverImage = f.imageUrl || '';
      if (coverImage.startsWith('data:')) {
        coverImage = await uploadCoverImage(coverImage);
      }
      const compressedContent = await compressInlineImages(f.content || '');

      const payload = {
        title: form.title.trim(), section: derivedSection, status: form.status,
        category: f.category || 'Analysis',
        author: f.authorName || 'Admin',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        imageUrl: coverImage,
        excerpt: f.excerpt || '',
        content: compressedContent,
        readTime: f.readTime || readingTime(f.content ?? ''),
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
          localStorage.setItem('blog_post_published', Date.now().toString());
        } else {
          const err = await r.json().catch(() => ({}));
          saveError = err.error || `Server error ${r.status}`;
        }
      } else {
        const r = await fetch('/api/blog', { method: 'POST', headers, body });
        if (r.ok) {
          savedPost = await r.json();
          setPosts(p => [...p, { id: savedPost.id, title: savedPost.title, section: savedPost.section, category: savedPost.category, status: savedPost.status, author: savedPost.author, date: savedPost.date, signal: savedPost.signalData, imageUrl: savedPost.imageUrl ?? '', excerpt: savedPost.excerpt ?? '', content: savedPost.content ?? '', readTime: savedPost.readTime ?? '', authorData: savedPost.authorData }]);
          localStorage.setItem('blog_post_published', Date.now().toString());
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
  const fv = (k: string) => (form as Record<string, unknown>)[k]; const setF = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));
  const setSig = (k: string, v: unknown) => setForm(p => ({ ...p, signal: { ...p.signal, [k]: v } }));
  const sg = (k: string) => (form.signal as Record<string, unknown>)[k];

  const TABS = [{ id: 'post', label: 'Post', icon: FileText }, { id: 'author', label: 'Author', icon: Users }, { id: 'share', label: 'Share', icon: Globe }];
  const postCols = bp.isMobile ? '1fr' : 'repeat(2, 1fr)';

  // Signal posts carry price levels a table row cannot show, so they keep their card. Articles —
  // which is everything currently published — go in the table.
  const signalPosts = filtered.filter(p => p.signal && p.section === 'trade-signals');
  const articlePosts = filtered.filter(p => !(p.signal && p.section === 'trade-signals'));

  // THE WHOLE SCREEN IS SET IN PLAYFAIR — see `serifText` in admin-ui/tokens.ts for why every
  // call carries a weight of at least 600: below that the face's hairline strokes vanish at these
  // sizes. Column headings go one step further (700) because they are the smallest text here.
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '13px 20px', background: C.thead, color: C.muted,
    ...panelText(13, 700), whiteSpace: 'nowrap',
    borderBottom: `1px solid ${C.border}`,
  };
  const td: React.CSSProperties = {
    padding: '15px 20px', borderBottom: `1px solid ${C.border}`,
    ...panelText(15), color: C.text, verticalAlign: 'middle', whiteSpace: 'nowrap',
  };
  const iconBtn = (color: string): React.CSSProperties => ({
    ...btn, background: 'transparent', border: 'none', color, padding: '6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, minHeight: 0, fontFamily: FONT }}>
      <PageHeader
        icon={Newspaper}
        title="Blog"
        hintStyle={panelText(13)}
        hint={`${posts.length} article${posts.length === 1 ? '' : 's'}`}
        right={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {showModal && (
              <button onClick={() => setShowModal(false)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', color: C.muted, padding: '10px 16px', border: `1px solid ${C.border2}`, ...panelText(15) }}>
                <X size={14} /> Back to posts
              </button>
            )}
            <button onClick={openNew} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '8px', background: C.indigo, color: 'white', padding: '11px 20px', borderRadius: '999px', whiteSpace: 'nowrap', ...panelText(15, 700) }}>
              <Plus size={16} /> New article
            </button>
          </div>
        }
      />

      {/* Our own filters — the reference has none, but these are real function and stay. */}
      {!showModal && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[{ id: 'all', label: 'All', count: posts.length },
            { id: 'blog', label: 'Blog', count: posts.filter(p => p.section === 'blog').length },
            { id: 'verified-strategies', label: bp.isMobile ? 'Strats' : 'Strategies', count: posts.filter(p => p.section === 'verified-strategies').length },
            { id: 'drafts', label: 'Drafts', count: posts.filter(p => p.status === 'Draft').length }].map(tab => {
            const on = activeSection === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveSection(tab.id); localStorage.setItem('admin_active_section', tab.id); }}
                style={{ ...btn, padding: '8px 16px', borderRadius: '999px', ...panelText(13, on ? 700 : 600),
                         background: on ? C.indigo : 'transparent', color: on ? 'white' : C.muted,
                         border: `1px solid ${on ? C.indigo : C.border}`,
                         display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap' }}>
                {tab.label}
                <span style={{ ...panelText(13, 700), opacity: 0.85 }}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {showModal ? (
        <BlogPostEditor
          initialData={editorInitialData}
          editPost={editPost}
          onSubmit={handleEditorSubmit}
          onCancel={() => setShowModal(false)}
          saving={saving}
          onImageUpload={uploadFileForEditor}
        />
      ) : (
        <>
          {signalPosts.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: postCols, gap: '18px' }}>
              {signalPosts.map(post => {
                const sig = post.signal;
                const isBuy = sig.action === 'BUY';
                return (
                  <div key={post.id} style={{ ...cs, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', background: isBuy ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: isBuy ? C.green : C.red, ...panelText(15, 700), letterSpacing: '0.02em' }}>{sig.pair}</span>
                        <Pill tone={isBuy ? 'good' : 'bad'}>{sig.action}</Pill>
                        <Pill tone="neutral">{sig.timeframe}</Pill>
                      </div>
                      <span style={{ color: C.muted, ...panelText(13) }}>{post.date}</span>
                    </div>
                    <div style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {[{ label: 'Entry', value: sig.entry, color: C.text }, { label: 'SL', value: sig.sl, color: C.red }, { label: 'TP1', value: sig.tp1, color: C.green }, { label: 'TP2', value: sig.tp2 || '—', color: C.muted }].map(({ label, value, color }) => (
                          <div key={label} style={{ background: C.thead, borderRadius: '8px', padding: '9px', textAlign: 'center' }}>
                            <p style={{ color: C.muted, ...panelText(13, 700), letterSpacing: '0.04em', margin: '0 0 3px' }}>{label}</p>
                            <p style={{ color, ...panelText(15, 700), margin: 0 }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Panel>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Title</th>
                    <th style={th}>Status</th>
                    <th style={th}>Author</th>
                    <th style={th}>Published</th>
                    <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {articlePosts.length === 0 && (
                    <tr><td style={{ ...td, whiteSpace: 'normal', color: C.muted, textAlign: 'center', padding: '36px 20px' }} colSpan={5}>
                      Nothing here yet.
                    </td></tr>
                  )}
                  {articlePosts.map(post => {
                    const published = post.status === 'Published';
                    return (
                      <tr key={post.id}>
                        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 420 }}>
                          <div style={{ ...panelText(15, 700), color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                            {post.title}
                          </div>
                          {post.slug && (
                            <div style={{ marginTop: 4, ...panelText(13), color: C.muted }}>/blog/{post.slug}</div>
                          )}
                        </td>
                        <td style={td}>
                          <Pill tone={post.status === 'Scheduled' ? 'accent' : published ? 'good' : 'neutral'}>
                            {post.status === 'Scheduled' ? 'scheduled' : published ? 'published' : 'draft'}
                          </Pill>
                        </td>
                        <td style={{ ...td, color: C.muted }}>{post.author}</td>
                        <td style={{ ...td, color: C.muted }}>
                          {post.status === 'Scheduled' && post.publishAt
                            ? new Date(post.publishAt).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : published ? (post.date || '—') : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button onClick={() => toggleStatus(post.id)} title={published ? 'Unpublish' : 'Publish'}
                              style={{ ...btn, background: 'transparent', border: 'none', color: C.muted, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px', ...panelText(13) }}>
                              {published ? <EyeOff size={15} /> : <Globe size={15} />}
                              {!bp.isMobile && (published ? 'Unpublish' : 'Publish')}
                            </button>
                            <button onClick={() => openEdit(post)} title="Edit" style={iconBtn(C.muted)}><Pencil size={15} /></button>
                            <button onClick={() => handleDelete(post.id)} title="Delete" style={iconBtn(C.red)}><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
};

// ─── MARKETING SECTION ───────────────────────────────────────────────────────
/** One labelled control in the compose form. */
function UpdateField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ ...lbl, marginBottom: hint ? 3 : 9 }}>{label}</label>
      {hint && <p style={{ margin: '0 0 10px', fontFamily: FONT, fontSize: '12.5px', color: C.muted, lineHeight: 1.55 }}>{hint}</p>}
      {children}
    </div>
  );
}

/** The three ways an update can reach someone, and what each one actually needs.
 *
 *  PUSH IS LISTED AND PERMANENTLY OFF, ON PURPOSE. `POST /api/admin/campaigns` has a branch for
 *  In-App (writes a `notifications` row) and a branch for Email (Resend + an open-tracking pixel)
 *  and NO BRANCH AT ALL for Push — ticking it sent the word "Push" to the server, which wrote it
 *  into the audit line and delivered nothing to anybody. The old screen's caption said "Push
 *  notifications require Web Push VAPID key setup", which reads as "set the key and it works";
 *  there is no key to set and no code behind it. It stays on screen, disabled and labelled, rather
 *  than being quietly dropped, so the gap is visible instead of silent. */
const UPDATE_CHANNELS: Array<{ label: string; icon: React.ElementType; what: string; blocked?: string }> = [
  { label: 'In-App', icon: Bell,       what: 'Lands in the bell menu the next time they open the app.' },
  { label: 'Email',  icon: Mail,       what: 'Sends a real email, and the opens are counted.',
                                       blocked: 'Needs RESEND_API_KEY set on the server.' },
  { label: 'Push',   icon: Smartphone, what: 'A browser notification, even with the app closed.',
                                       blocked: 'Not built — the server has no push step, so nothing would be delivered.' },
];

/** "06 Sep, 14:25" — the same shape the Support list uses. */
const whenSent = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}, `
       + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
};

const AUDIENCE_WORDS: Record<string, string> = {
  all:      'everyone',
  free:     'people on the free plan',
  inactive: 'people who have not signed in for 30 days',
};

const UpdatesSection = ({ bp, getAdminToken = null }: { bp: any; getAdminToken?: (() => Promise<string | null>) | null }) => {
  const [activeChannels, setActiveChannels] = useState(['In-App']);
  const [audience, setAudience] = useState('all');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

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
    const hr = await fetch('/api/admin/campaign-history', { headers: h }).catch(() => null);
    if (hr?.ok) { const rows = await hr.json(); if (Array.isArray(rows)) setHistory(rows); }
  };

  useEffect(() => { loadStats(); }, []);

  const toggleChannel = (label: string) => {
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

  /** Email waits on a server key; Push has no code behind it at all; In-App always works. */
  const emailReady = stats?.emailConfigured === true;
  const canDeliver = (label: string) => label === 'Push' ? false : label === 'Email' ? emailReady : true;

  const n = (v: any) => Number(v ?? 0);
  // A change string is "+3", "-1.2%" or "—". Only a leading minus means it went down.
  const trendOf = (c?: string): 'up' | 'down' => (typeof c === 'string' && c.trim().startsWith('-') ? 'down' : 'up');

  // Emails sent and emails opened are the two he named, so they are cards in their own right —
  // "sent" used to appear only inside another card's caption, and vanished entirely whenever email
  // was unconfigured.
  const cards = [
    { title: 'Emails sent',  icon: Mail,     tone: 'blue' as const,
      value: stats ? n(stats.emailSent).toLocaleString() : '–',
      caption: stats ? 'last 30 days' : 'loading…' },
    { title: 'Emails opened', icon: MailOpen, tone: 'good' as const,
      value: !stats ? '–' : n(stats.emailSent) === 0 ? '—' : `${n(stats.emailOpenRate).toFixed(1)}%`,
      caption: !stats ? 'loading…'
             : n(stats.emailSent) === 0 ? 'no emails sent yet'
             : `${n(stats.emailOpened).toLocaleString()} of ${n(stats.emailSent).toLocaleString()}` },
    { title: 'In-app sent',  icon: Send,     tone: 'accent' as const, change: stats?.sentChange,
      value: stats ? n(stats.inAppSent).toLocaleString() : '–', caption: stats ? 'last 30 days' : 'loading…' },
    { title: 'Read rate',    icon: Eye,      tone: 'violet' as const, change: stats?.readChange,
      value: stats ? `${n(stats.readRate).toFixed(1)}%` : '–',  caption: stats ? 'of in-app updates opened' : 'loading…' },
  ];

  const canSend = !sending && message.trim().length > 0 && activeChannels.length > 0;
  const summary = activeChannels.length === 0 ? 'Choose at least one channel.'
    : !message.trim() ? 'Write the message first.'
    : `Goes to ${AUDIENCE_WORDS[audience] ?? 'everyone'} by ${activeChannels.join(' and ')}.`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, minHeight: 0, fontFamily: FONT }}>

      {/* What the last 30 days did. */}
      <div style={{ display: 'grid', gap: '18px',
                    gridTemplateColumns: bp.isMobile ? '1fr' : bp.isDesktop ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))' }}>
        {cards.map(c => <StatCard key={c.title} {...c} trend={trendOf(c.change)} />)}
      </div>

      <div style={{ display: 'grid', gap: '18px', alignItems: 'start',
                    gridTemplateColumns: bp.isDesktop ? 'minmax(0, 1.7fr) minmax(0, 1fr)' : '1fr' }}>

        <Panel title="Write an update" hint="It goes out the moment you send it — there is no draft and no undo.">
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            <UpdateField label="Who gets it">
              <select value={audience} onChange={e => setAudience(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                <option value="all">Everyone</option>
                <option value="free">Free plan only</option>
                <option value="inactive">Not signed in for 30 days</option>
              </select>
            </UpdateField>

            <UpdateField label="How it reaches them">
              <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
                {UPDATE_CHANNELS.map(({ label, icon: Icon, blocked }) => {
                  const usable = canDeliver(label);
                  const on = usable && activeChannels.includes(label);
                  return (
                    <button key={label} type="button" disabled={!usable} title={usable ? undefined : blocked}
                      onClick={() => toggleChannel(label)}
                      style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: '8px',
                               padding: '9px 16px', borderRadius: '999px', fontSize: '13.5px', fontFamily: FONT,
                               background: on ? C.indigo : 'transparent',
                               color: on ? '#fff' : C.muted,
                               border: `1px solid ${on ? C.indigo : C.border2}`,
                               cursor: usable ? 'pointer' : 'not-allowed', opacity: usable ? 1 : 0.6,
                               transition: 'background 0.14s, color 0.14s, border-color 0.14s' }}>
                      <Icon size={15} /> {label}
                      {on && <CheckCircle size={14} />}
                    </button>
                  );
                })}
              </div>
            </UpdateField>

            <UpdateField label="Subject" hint="The heading people see. Leave it blank and it reads &ldquo;Announcement&rdquo;.">
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="What this update is about" style={{ ...inp }} />
            </UpdateField>

            <UpdateField label="Message">
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={7}
                placeholder="Write the update…"
                style={{ ...inp, resize: 'vertical', lineHeight: 1.7, minHeight: '150px' }} />
            </UpdateField>

            {result && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '13px 16px',
                            borderRadius: R.ctl, fontFamily: FONT, fontSize: '13.5px', fontWeight: 600,
                            background: result.ok ? 'rgba(16,185,129,0.10)' : 'rgba(220,38,38,0.09)',
                            color: result.ok ? C.green : C.red }}>
                {result.ok ? <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                           : <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />}
                <span>{result.msg}</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
                          borderTop: `1px solid ${C.border}`, paddingTop: '18px' }}>
              <button onClick={handleSend} disabled={!canSend}
                style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: '8px',
                         background: C.indigo, color: '#fff', padding: '12px 24px', borderRadius: '999px',
                         fontSize: '14px', fontFamily: FONT,
                         opacity: canSend ? 1 : 0.45, cursor: canSend ? 'pointer' : 'not-allowed' }}>
                <Send size={15} /> {sending ? 'Sending…' : 'Send update'}
              </button>
              <span style={{ fontFamily: FONT, fontSize: '13px', color: C.muted }}>{summary}</span>
            </div>
          </div>
        </Panel>

        <Panel title="Channels" hint="What each one does, and whether it can deliver right now.">
          {UPDATE_CHANNELS.map(({ label, icon: Icon, what, blocked }, i) => {
            const usable = canDeliver(label);
            const on = usable && activeChannels.includes(label);
            return (
              <div key={label} style={{ display: 'flex', gap: '13px', padding: '16px 22px',
                     borderBottom: i < UPDATE_CHANNELS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ width: '34px', height: '34px', flex: '0 0 34px', borderRadius: R.tile,
                              background: usable ? C.accentSoft : C.thead, color: usable ? C.indigo : C.dim,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: FONT, fontSize: '14px', fontWeight: 600, color: C.text }}>{label}</span>
                    <Pill tone={on ? 'accent' : usable ? 'good' : 'warn'}>
                      {on ? 'selected' : usable ? 'ready' : 'unavailable'}
                    </Pill>
                  </div>
                  <p style={{ margin: '5px 0 0', fontFamily: FONT, fontSize: '12.5px', color: C.muted, lineHeight: 1.6 }}>
                    {usable ? what : blocked}
                  </p>
                </div>
              </div>
            );
          })}
        </Panel>
      </div>

      {/* ── WHAT ACTUALLY WENT OUT ──────────────────────────────────────────────
          Every campaign already left two trails and neither was ever on screen: an audit row per
          campaign, and one `email_tracking` row PER EMAIL carrying when it was sent and whether
          the tracking pixel came back. This is that data. */}
      <Panel
        title="Campaigns sent"
        hint={history.length
          ? `${history.length} most recent · opens are counted by a tracking pixel, so treat them as indicative`
          : 'Nothing has gone out yet.'}>
        {history.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Campaign', 'Sent', 'Recipients', 'Emails', 'Opened', 'Open rate'].map((h, i) => (
                    <th key={h} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '12px 20px',
                                         background: C.thead, color: C.muted, fontFamily: FONT,
                                         fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                                         borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h: any, i: number) => {
                  const rate = h.emailsSent > 0 ? (h.emailsOpened / h.emailsSent) * 100 : null;
                  const cell: React.CSSProperties = {
                    padding: '13px 20px',
                    borderBottom: i < history.length - 1 ? `1px solid ${C.border}` : 'none',
                    fontFamily: FONT, fontSize: 14, color: C.text, whiteSpace: 'nowrap',
                  };
                  return (
                    <tr key={i}>
                      <td style={{ ...cell, whiteSpace: 'normal', maxWidth: 320 }}>
                        <div style={{ fontWeight: 600 }}>{h.name}</div>
                        {h.channels?.length > 0 && (
                          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                            via {h.channels.join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ ...cell, color: C.muted }}>{whenSent(h.sentAt)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {h.recipients == null ? '—' : Number(h.recipients).toLocaleString()}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {h.emailsSent > 0 ? Number(h.emailsSent).toLocaleString() : '—'}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {h.emailsSent > 0 ? Number(h.emailsOpened).toLocaleString() : '—'}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        {rate == null
                          ? <span style={{ color: C.muted }}>—</span>
                          : <Pill tone={rate >= 30 ? 'good' : rate >= 10 ? 'warn' : 'neutral'}>{rate.toFixed(1)}%</Pill>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

// ─── GROWTH ANALYTICS CARD ───────────────────────────────────────────────────
const GrowthAnalyticsCard = ({ monthlyData = null, dailyData = null }: { monthlyData?: number[] | null; dailyData?: number[] | null }) => {
  const [period, setPeriod] = useState('monthly');
  const isMonthly = period === 'monthly';
  const rawData   = isMonthly ? (monthlyData ?? GROWTH_DATA_MONTHLY) : (dailyData ?? GROWTH_DATA_DAILY);
  const safeData  = Array.isArray(rawData) ? rawData.map(v => Number(v) || 0) : [];

  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayLabels   = Array.from({ length: 30 }, (_, i) => String(i + 1));
  const labels      = isMonthly ? monthLabels : dayLabels;

  const chartData = safeData.map((v, i) => ({ label: labels[i] ?? String(i + 1), users: v }));

  // KPI summary
  const total    = safeData.reduce((a, b) => a + b, 0);
  const peak     = Math.max(...safeData, 0);
  const peakIdx  = safeData.indexOf(peak);
  const peakLbl  = labels[peakIdx] ?? '—';
  const nonZero  = safeData.filter(v => v > 0);
  const avg      = nonZero.length ? (total / nonZero.length).toFixed(1) : '0';
  const last     = safeData[safeData.length - 1] ?? 0;
  const prev     = safeData[safeData.length - 2] ?? 0;
  const momPct   = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;
  const momColor = momPct === null ? '#607898' : momPct >= 0 ? C.greenL : C.redL;
  const momLabel = momPct === null ? '—' : `${momPct >= 0 ? '+' : ''}${momPct}%`;

  const kpis = [
    { label: isMonthly ? 'Total · 12 mo' : 'Total · 30 d', value: total.toLocaleString(), color: C.text },
    { label: 'Peak',                                         value: `${peak} · ${peakLbl}`, color: C.text },
    { label: 'Avg / period',                                 value: String(avg),             color: C.text },
    { label: isMonthly ? 'vs prev month' : 'vs prev day',   value: momLabel,                color: momColor  },
  ];

  // Custom tooltip — minimal, just the count
  const BarTooltip = ({ active, payload, label: lbl }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.thead, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
        padding: '8px 12px', fontFamily: FONT }}>
        <p style={{ color: C.muted, fontSize: 14, fontWeight: 500, margin: '0 0 4px' }}>{lbl}</p>
        <p style={{ color: C.indigo, fontSize: 15, fontWeight: 800, margin: 0 }}>
          {payload[0].value} <span style={{ color: C.muted, fontSize: 12 }}>signups</span>
        </p>
      </div>
    );
  };

  return (
    <div style={{ ...cs, padding: '22px 24px 18px', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ color: C.text, fontWeight: 700, fontSize: 16, fontFamily: HFONT, margin: '0 0 2px',
            display: 'flex', alignItems: 'center', gap: 7 }}>
            <TrendingUp size={14} style={{ color: C.greenL }} /> Growth Analytics
          </h3>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            {isMonthly ? 'New user registrations by month' : 'New user registrations by day'}
          </p>
        </div>
        <div style={{ display: 'flex', background: C.thead, border: `1px solid ${C.border2}`,
          borderRadius: 5, overflow: 'hidden' }}>
          {[{ v: 'monthly', l: '12 Months' }, { v: 'daily', l: '30 Days' }].map(opt => (
            <button key={opt.v} onClick={() => setPeriod(opt.v)} style={{
              padding: '6px 16px', fontSize: 12, fontFamily: FONT, fontWeight: 600,
              letterSpacing: '0.03em',
              background: period === opt.v ? C.accentSoft : 'transparent',
              color: period === opt.v ? C.indigo : C.muted,
              borderRight: opt.v === 'monthly' ? `1px solid ${C.border2}` : 'none',
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            }}>{opt.l}</button>
          ))}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 22 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ borderLeft: `2px solid ${C.border2}`, paddingLeft: 12 }}>
            <p style={{ color: C.muted, fontSize: 14, fontWeight: 500, margin: '0 0 4px' }}>{k.label}</p>
            <p style={{ color: k.color, fontSize: 16, fontWeight: 800, margin: 0,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Bar chart ── */}
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={chartData} margin={{ top: 2, right: 4, left: -18, bottom: 0 }}
          barCategoryGap={isMonthly ? '28%' : '18%'}>
          <defs>
            <linearGradient id="gbGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#38bdf8" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#0c4a6e" stopOpacity={0.5} />
            </linearGradient>
            <linearGradient id="gbGradHov" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#7dd3fc" stopOpacity={1} />
              <stop offset="100%" stopColor="#0369a1" stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--admin-border)" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--admin-muted)', fontSize: isMonthly ? 12 : 11, fontWeight: 600, fontFamily: FONT }}
            axisLine={{ stroke: 'var(--admin-border2)' }}
            tickLine={false}
            interval={isMonthly ? 0 : 4}
          />
          <YAxis
            tick={{ fill: 'var(--admin-muted)', fontSize: 12, fontWeight: 600, fontFamily: FONT }}
            axisLine={false}
            tickLine={false}
            width={46}
            allowDecimals={false}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
          />
          <RechartTooltip content={<BarTooltip />} cursor={{ fill: 'var(--admin-accentSoft)' }} />
          <Bar dataKey="users" fill="url(#gbGrad)" radius={[4, 4, 0, 0]} maxBarSize={isMonthly ? 36 : 18} />
        </ComposedChart>
      </ResponsiveContainer>
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

const SettingsSection = ({ bp, getAdminToken = null }: { bp: any; getAdminToken?: (() => Promise<string | null>) | null }) => {
  const [settingsTab, setSettingsTab] = useState('agents');
  const [ccUsers, setCcUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem(ADMIN_THEME_KEY) || ADMIN_THEME_DEFAULT);
  const [activeFont, setActiveFont] = useState(() => localStorage.getItem(ADMIN_FONT_KEY) || ADMIN_FONT_DEFAULT);
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

  const selectTheme = (id: string) => { setActiveTheme(id); localStorage.setItem(ADMIN_THEME_KEY, id); applyAdminTheme(id); };

  const applyFont = () => {
    localStorage.setItem(ADMIN_FONT_KEY, activeFont);
    applyAdminFont(activeFont);
    setFontSaved(true); setTimeout(() => setFontSaved(false), 2000);
  };

  const SETTINGS_TABS = [
    { id: 'agents', label: 'Support agents' },
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
    const r = await fetch('/api/admin/cc-agents', { method: 'POST', headers: h, body: JSON.stringify({ name: newAgent.name, email: newAgent.email, password: newAgent.password, functions: newAgent.functions }) }).catch(() => null);
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
        <h2 style={{ color: C.text, fontWeight: 700, fontSize: '20px', margin: 0, fontFamily: HFONT }}>System Settings</h2>
        <p style={{ color: C.muted, fontSize: '14px', margin: '4px 0 0', fontFamily: FONT }}>Manage agents, tasks &amp; appearance</p>
      </div>

      <div style={{ display: 'flex', gap: '3px', background: C.card, border: `1px solid ${C.border}`, padding: '3px', width: 'fit-content' }}>
        {SETTINGS_TABS.map(t => (
          <button key={t.id} onClick={() => setSettingsTab(t.id)} style={{ ...btn, padding: '8px 18px', background: settingsTab === t.id ? C.indigo : 'transparent', color: settingsTab === t.id ? 'white' : C.muted, border: 'none', fontSize: '13px', fontFamily: FONT }}>{t.label}</button>
        ))}
      </div>

      {settingsTab === 'agents' && (
        <div style={{ display: 'grid', gridTemplateColumns: bp.isDesktop ? '1fr 1fr' : '1fr', gap: '6px', alignItems: 'start' }}>
          <div style={{ ...cs, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Support Agents</h3>
              <button onClick={() => setShowNewAgent(true)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '6px', background: C.indigo, color: 'white', padding: '7px 13px', fontSize: '12px', border: 'none' }}><Plus size={12} /> New Agent</button>
            </div>
            {ccUsers.map((user, idx) => (
              <div key={user.id} onClick={() => setSelectedAgent(selectedAgent?.id === user.id ? null : user)} style={{ padding: '12px 16px', borderBottom: idx < ccUsers.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', background: selectedAgent?.id === user.id ? 'rgba(0,200,224,0.07)' : 'transparent', borderLeft: `3px solid ${selectedAgent?.id === user.id ? C.indigo : 'transparent'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {user.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: C.text, fontWeight: 700, fontSize: '14px', margin: 0 }}>{toTitleCase(user.name)}</p>
                    <p style={{ color: C.muted, fontSize: '12px', margin: '2px 0 0' }}>{user.id} · {user.email}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 7px', background: 'rgba(16,185,129,0.1)', color: C.greenL, border: `1px solid rgba(16,185,129,0.2)`, textTransform: 'uppercase' }}>{user.status}</span>
                    <p style={{ color: C.muted, fontSize: '12px', margin: '4px 0 0' }}>{user.functions.length} permissions</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...cs, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>
                {selectedAgent ? `Permissions — ${toTitleCase(selectedAgent.name)}` : 'Select an agent to edit permissions'}
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
                        <p style={{ color: active ? 'white' : C.muted, fontSize: '14px', fontWeight: 600, margin: 0 }}>{fn.label}</p>
                        <p style={{ color: C.muted, fontSize: '12px', margin: '2px 0 0' }}>{fn.desc}</p>
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
                <p style={{ color: C.muted, fontSize: '14px', margin: 0 }}>Click an agent on the left to manage their permissions</p>
              </div>
            )}
          </div>
        </div>
      )}

      {settingsTab === 'agents' && showNewAgent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '480px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Create CC Agent</h3>
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
                        style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: active ? 'rgba(0,200,224,0.08)' : 'rgba(8,14,24,0.4)', border: `1px solid ${active ? 'rgba(0,200,224,0.3)' : C.border}`, color: active ? C.indigoL : C.muted, fontSize: '13px', textAlign: 'left' }}>
                        <span>{fn.label}</span>
                        <div style={{ width: '14px', height: '14px', background: active ? C.indigo : 'transparent', border: `2px solid ${active ? C.indigo : C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {active && <CheckCircle size={9} style={{ color: C.text }} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewAgent(false)} style={{ ...btn, padding: '9px 18px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCreateAgent} style={{ ...btn, padding: '9px 22px', background: C.indigo, color: 'white', border: 'none', fontSize: '14px' }}>Create Agent</button>
            </div>
          </div>
        </div>
      )}

      {settingsTab === 'tasks' && (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Scheduled Tasks</h3>
            <button onClick={() => setShowNewTask(true)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '6px', background: C.indigo, color: 'white', padding: '7px 13px', fontSize: '12px', border: 'none' }}><Plus size={12} /> Schedule Task</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 160px', padding: '8px 16px', background: 'rgba(8,14,24,0.5)', gap: '12px', minWidth: '560px' }}>
            {['Task', 'Assignee', 'Due Date', 'Status'].map(h => (
              <span key={h} style={{ color: C.muted, fontSize: '14px', fontWeight: 500 }}>{h}</span>
            ))}
          </div>
          {tasks.map((task, idx) => (
            <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 160px', padding: '13px 16px', borderBottom: idx < tasks.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', gap: '12px', background: task.status === 'Complete' ? 'rgba(16,185,129,0.03)' : 'transparent', minWidth: '560px' }}>
              <p style={{ color: task.status === 'Complete' ? C.muted : 'white', fontSize: '14px', fontWeight: 600, margin: 0, textDecoration: task.status === 'Complete' ? 'line-through' : 'none' }}>{task.title}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '22px', height: '22px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {task.assignee.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <span style={{ color: C.muted, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.assignee}</span>
              </div>
              <span style={{ color: C.muted, fontSize: '12px', fontFamily: FONT }}>{task.due || '—'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {task.status === 'Pending' ? (
                  <button onClick={() => approveTask(task.id)} style={{ ...btn, display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'rgba(16,185,129,0.1)', color: C.greenL, border: `1px solid rgba(16,185,129,0.25)`, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <CheckCircle size={10} /> Approve
                  </button>
                ) : (
                  <span style={{ fontSize: '12px', fontWeight: 700, padding: '5px 10px', background: 'rgba(16,185,129,0.08)', color: C.greenL, border: `1px solid rgba(16,185,129,0.2)`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Complete</span>
                )}
                <button onClick={() => deleteTask(task.id)} style={{ ...btn, background: 'transparent', color: C.muted, padding: '4px', border: 'none' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {showNewTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ ...cs, width: '100%', maxWidth: '420px' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: 0 }}>Schedule Task</h3>
              <button onClick={() => setShowNewTask(false)} style={{ ...btn, background: 'transparent', color: C.muted, padding: '4px', border: 'none' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><label style={{ ...lbl }}>Task Description</label><input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Describe the task..." style={{ ...inp }} /></div>
              <div>
                <label style={{ ...lbl }}>Assign To</label>
                <select value={newTask.assignee} onChange={e => setNewTask(p => ({ ...p, assignee: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">Select agent...</option>
                  {ccUsers.map(u => <option key={u.id} value={u.name}>{toTitleCase(u.name)}</option>)}
                </select>
              </div>
              <div><label style={{ ...lbl }}>Due Date</label><input type="date" value={newTask.due} onChange={e => setNewTask(p => ({ ...p, due: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} /></div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewTask(false)} style={{ ...btn, padding: '9px 18px', background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`, fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCreateTask} style={{ ...btn, padding: '9px 22px', background: C.indigo, color: 'white', border: 'none', fontSize: '14px' }}>Add Task</button>
            </div>
          </div>
        </div>
      )}

      {settingsTab === 'appearance' && (
        <div style={{ display: 'grid', gridTemplateColumns: bp.isDesktop ? '1fr 1fr' : '1fr', gap: '6px' }}>
          <div style={{ ...cs, padding: '20px' }}>
            <h3 style={{ color: C.text, fontWeight: 500, fontSize: '16px', fontFamily: HFONT, margin: '0 0 16px' }}>Dashboard Theme</h3>
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
                        <CheckCircle size={10} style={{ color: C.text }} />
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px', background: C.card }}>
                    <p style={{ color: activeTheme === theme.id ? C.indigoL : 'white', fontSize: '13px', fontWeight: 700, margin: 0 }}>{theme.label}</p>
                  </div>
                </button>
              ))}
            </div>
            <p style={{ color: C.muted, fontSize: '12px', margin: '12px 0 0', fontStyle: 'italic' }}>Theme applies instantly and is saved for future sessions</p>
          </div>

          <div style={{ ...cs, padding: '20px' }}>
            <h3 style={{ color: C.text, fontWeight: 500, fontSize: '16px', fontFamily: HFONT, margin: '0 0 16px' }}>Dashboard Font</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {ADMIN_FONTS.map(font => (
                <button key={font.id} onClick={() => { setActiveFont(font.id); setFontSaved(false); }} style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: activeFont === font.id ? 'rgba(0,200,224,0.08)' : 'rgba(8,14,24,0.4)', border: `1px solid ${activeFont === font.id ? 'rgba(0,200,224,0.35)' : C.border}`, textAlign: 'left' }}>
                  {/* The preview renders in the face itself — the one thing choosing it will do. */}
                  <div>
                    <p style={{ color: activeFont === font.id ? 'white' : C.muted, fontSize: '17px', fontWeight: 600, margin: 0, fontFamily: font.stack }}>{font.label}</p>
                    <p style={{ color: C.muted, fontSize: '13px', margin: '4px 0 0', fontFamily: font.stack }}>
                      The quick brown fox jumps over the lazy dog
                    </p>
                  </div>
                  {activeFont === font.id && (
                    <div style={{ width: '20px', height: '20px', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircle size={12} style={{ color: C.text }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button onClick={applyFont} style={{ ...btn, marginTop: '16px', width: '100%', background: fontSaved ? C.green : C.indigo, color: 'white', padding: '11px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', border: 'none', transition: 'background 0.3s' }}>{fontSaved ? '✓ Font Applied' : 'Apply Font'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── JOURNAL SETTINGS TAB ────────────────────────────────────────────────────
// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const bp = useBreakpoint();
  // `renderContent` has no default case, so an id it does not know renders an empty page. The
  // tab was renamed, and a browser that still has the old one saved would land on nothing.
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('admin_active_tab');
    if (saved === 'customer-care') return 'support';        // renamed
    if (saved === 'journal-settings') return 'dashboard';    // deleted
    return saved || 'dashboard';
  });
  // MOBILE ONLY. There is no collapsed rail any more — the button that used to toggle one is
  // gone, so a 64px icon-only sidebar had no way to be opened or closed and was deleted with it.
  // On a phone the rail is a drawer that slides over the page; this says whether it is showing.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // THE RED BADGE WAS A CONSTANT. It counted MOCK_TICKETS — five invented rows in this file —
  // so it read "2" for ever, whatever was really waiting. It counts real open conversations now.
  const [openTickets, setOpenTickets] = useState(0);

  // ── Admin notifications (Messages + Alerts) ───────────────────────────────
  const adminNotifs = useAdminNotifications();
  const [notifPanelOpen, setNotifPanelOpen] = useState<'messages' | 'alerts' | null>(null);
  const msgBtnRef = useRef<HTMLButtonElement>(null);
  const alertBtnRef = useRef<HTMLButtonElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const [notifPanelPos, setNotifPanelPos] = useState({ top: 49, right: 8 });

  const openNotifPanel = useCallback((mode: 'messages' | 'alerts') => {
    const ref = mode === 'messages' ? msgBtnRef : alertBtnRef;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setNotifPanelPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right - 4) });
    }
    setNotifPanelOpen(p => p === mode ? null : mode);
  }, []);

  useEffect(() => {
    if (!notifPanelOpen) return;
    const handler = (e: MouseEvent) => {
      const inPanel = notifPanelRef.current?.contains(e.target as Node);
      const inMsg   = msgBtnRef.current?.contains(e.target as Node);
      const inAlert = alertBtnRef.current?.contains(e.target as Node);
      if (!inPanel && !inMsg && !inAlert) setNotifPanelOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifPanelOpen]);

  const { user, session, role, signOut, loading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: apiUsers = [], error: usersQueryError } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const r = await authFetch('/api/admin/users');
      if (r.ok) return r.json();
      const e = await r.json().catch(() => ({}));
      throw new Error((e as any).error ?? `Failed to load users (${r.status})`);
    },
    enabled: role === 'admin',
    staleTime: Infinity,
    select: (data) => Array.isArray(data) ? data : [],
  });

  const { data: overviewStats = null } = useQuery<any>({
    queryKey: ['/api/admin/stats'],
    queryFn: () => authFetch('/api/admin/stats').then(r => r.ok ? r.json() : null).catch(() => null),
    enabled: role === 'admin',
    staleTime: Infinity,
  });

  const [myIpInfo, setMyIpInfo] = useState<{ ip: string; isExcluded: boolean; configuredAdminIps: string[]; geo?: { country: string; countryCode: string; region: string; city: string; isp: string } | null } | null>(null);

  const setApiUsers = (updater: ((prev: any[]) => any[]) | any[]) => {
    queryClient.setQueryData<any[]>(['/api/admin/users'], (prev) => {
      const current = prev ?? [];
      return typeof updater === 'function' ? updater(current) : updater;
    });
  };

  useEffect(() => {
    if (loading) return;
    if (!session) navigate('/auth');
    else if (role !== 'admin') navigate('/journal');
  }, [loading, session, role, navigate]);

  useEffect(() => {
    if (role !== 'admin') return;
    fetch('/api/track/my-ip').then(r => r.ok ? r.json() : null).then(d => { if (d) setMyIpInfo(d); }).catch(() => {});
  }, [role, session?.access_token]);

  // How many conversations are actually waiting — the number on the Support badge.
  useEffect(() => {
    if (role !== 'admin') return;
    const h: Record<string, string> = {};
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    fetch('/api/admin/tickets', { headers: h })
      .then(r => (r.ok ? r.json() : null))
      .then(rows => {
        if (!Array.isArray(rows)) return;
        setOpenTickets(rows.filter((t: any) => (t?.status ?? 'Open') === 'Open').length);
      })
      .catch(() => {});
  }, [role, session?.access_token]);

  async function handleRoleChange(userId: string, newRole: string) {
    const token = session?.access_token;
    if (!token) return;
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role: newRole }),
    });
    setApiUsers((prev: any[]) => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  }

  useEffect(() => { if (!bp.isMobile) setDrawerOpen(false); }, [bp.isMobile]);

  // Same as the journal shell: a blank surface in the app background while auth resolves, not a
  // spinner with an invented progress bar. See App.tsx LoadingScreen.
  if (loading) return <div style={{ position: 'fixed', inset: 0, background: '#07090f' }} aria-hidden="true" />;

  const adminEmail = user?.email ?? '';
  const adminName = toTitleCase((user?.user_metadata?.full_name ?? adminEmail.split('@')[0] ?? 'Admin') as string);
  const adminInitial = (adminName[0] ?? 'A').toUpperCase();

  const SIDEBAR_GROUPS = [
    { label: 'Core',             items: [{ id: 'dashboard',     label: 'Overview',        icon: LayoutDashboard, ready: true }] },
    { label: 'Users',            items: [{ id: 'users',         label: 'User Accounts',   icon: UsersRound,    ready: true }] },
    { label: 'Support',          items: [{ id: 'support',       label: 'Support',         icon: LifeBuoy,      badge: openTickets, ready: true }] },
    { label: 'Growth & Content', items: [{ id: 'blog',          label: 'Blogpost',        icon: Newspaper,     ready: true }, { id: 'updates', label: 'Updates', icon: BellRing, ready: true }] },
    { label: 'Platform',         items: [{ id: 'system-monitor', label: 'System Monitor', icon: Gauge, ready: true }, { id: 'sync-performance', label: 'Sync Performance', icon: RefreshCw, ready: true }, { id: 'traffic', label: 'Traffic Analytics', icon: TrendingUp, ready: true }] },
    { label: 'System',           items: [{ id: 'settings',      label: 'System Settings', icon: SlidersHorizontal, ready: true }] },
  ];

  /** One line per screen saying what it is for. Short and factual — this is the panel describing
   *  itself, not marketing copy. */
  /** Screens that render their own PageHeader, because the heading row carries an action. */
  const SELF_HEADED = new Set(['blog']);

  const PAGE_HINTS: Record<string, string> = {
    dashboard: 'Traders, signals, traffic and platform health in one place.',
    users: 'Accounts, roles and access.',
    // NOT "replies notify them" — PATCH /api/admin/tickets/:id writes the reply to the row and
    // sends nothing at all. Saying otherwise is how an unanswered trader looks answered.
    support: 'Conversations with traders. Replies are saved against the conversation.',
    blog: 'Articles, drafts and what is published.',
    updates: 'One message out to your traders — in the app, by email, or both.',
    'system-monitor': 'Live service health and resource use.',
    'sync-performance': 'How broker syncing is behaving.',
    traffic: 'Where visitors come from and what they read.',
    settings: 'Platform-wide configuration.',
  };

  const PAGE_TITLES = {
    dashboard: 'Overview', analytics: 'Analytics & Reports', health: 'Health Dashboard',
    users: 'User Accounts', 'user-activity': 'User Activity', roles: 'Roles & Permissions', flagged: 'Blocked / Flagged',
    support: 'Support', feedback: 'User Feedback',
    reported: 'Reported Content', 'audit-logs': 'Audit Logs', 'data-mgmt': 'Data Management',
    blog: 'Blogpost', updates: 'Updates', announcements: 'Announcements',
    'system-monitor': 'System Monitor', 'usage-metrics': 'Usage Metrics', 'error-logs': 'Error Logs',
    billing: 'Plans & Billing', promotions: 'Promotions',
    settings: 'System Settings', api: 'API & Integrations', 'feature-flags': 'Feature Flags', security: 'Security Settings',
    journal: 'Open Journal',
    'sync-performance': 'Sync Performance',
  };

  const navBtn = (item: any) => {
    const isActive = activeTab === item.id;
    const isSoon = !item.ready;
    // THE PAGE YOU ARE ON IS A FILLED PILL, not a tinted strip with a 2px edge. Colours come from the
    // rail tokens so the rail stays dark and legible under every palette, light or dark.
    const activeBg = isActive ? C.indigo : 'transparent';
    const activeColor = isActive ? '#ffffff' : isSoon ? C.railDim : C.railDim;
    const iconColor = isActive ? '#ffffff' : C.railDim;
    const handleClick = () => {
      setActiveTab(item.id);
      localStorage.setItem('admin_active_tab', item.id);
      if (bp.isMobile) setDrawerOpen(false);
    };
    return (
      <button key={item.id} onClick={handleClick} title={item.label}
        style={{ width: 'calc(100% - 20px)', margin: '2px 10px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', justifyContent: 'flex-start', background: activeBg, color: activeColor, border: 'none', borderRadius: '10px', cursor: isSoon ? 'default' : 'pointer', fontFamily: FONT, fontWeight: isActive ? 700 : 500, fontSize: '15px', letterSpacing: '0.01em', position: 'relative', transition: 'background 0.14s, color 0.14s', overflow: 'hidden' }}
        onMouseEnter={e => { if (!isActive && !isSoon) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = C.railInk; } }}
        onMouseLeave={e => { if (!isActive && !isSoon) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.railDim; } }}
      >
        <item.icon size={17} style={{ flexShrink: 0, color: iconColor }} />
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.label}</span>
        {isSoon && (
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '1px 5px', background: 'rgba(245,158,11,0.08)', color: '#6b5020', border: '1px solid rgba(245,158,11,0.15)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>soon</span>
        )}
        {item.badge > 0 && (
          <span style={{ background: C.red, color: 'white', fontSize: '12px', fontWeight: 700, padding: '1px 5px', flexShrink: 0, minWidth: '16px', textAlign: 'center' }}>{item.badge}</span>
        )}
      </button>
    );
  };

  const statCols = bp.isMobile ? 'repeat(2, 1fr)' : bp.isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const dashMainCols = bp.isDesktop ? '2fr 1fr' : '1fr';
  const formatChange = (v: any) => (v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${v}%`);
  const formatSession = (secs: number | null | undefined) => {
    if (secs == null || Number.isNaN(Number(secs))) return '—';
    const total = Math.max(0, Math.round(Number(secs)));
    const mins = Math.floor(total / 60);
    const secsR = total % 60;
    return mins > 0 ? `${mins}m ${secsR}s` : `${secsR}s`;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: statCols, gap: '18px' }}>
            <StatCard
              title="Total Traders"
              value={typeof overviewStats?.totalUsers === 'number' ? overviewStats.totalUsers.toLocaleString() : '—'}
              change={typeof overviewStats?.userChange === 'number' ? `+${overviewStats.userChange}%` : '—'}
              trend="up"
              icon={Users}
            />
            <StatCard
              title="Monthly Visitors"
              value={typeof overviewStats?.monthlyVisitors === 'number' ? (overviewStats.monthlyVisitors >= 1000 ? `${(overviewStats.monthlyVisitors / 1000).toFixed(1)}k` : String(overviewStats.monthlyVisitors)) : '—'}
              change={formatChange(overviewStats?.visitorChange)}
              trend="up"
              icon={TrendingUp}
            />
            <StatCard
              title="Avg. Session"
              value={formatSession(overviewStats?.avgSessionSeconds)}
              change={overviewStats?.avgSessionSeconds != null ? 'This month' : '—'}
              trend="up"
              icon={Clock}
            />
            <StatCard
              title="MRR"
              value={overviewStats?.mrr != null ? `$${Number(overviewStats.mrr).toLocaleString()}` : '—'}
              change={overviewStats?.mrrChange != null ? `+${overviewStats.mrrChange}%` : undefined}
              trend={overviewStats?.mrrChange != null ? 'up' : undefined}
              icon={Globe}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: dashMainCols, gap: '6px', alignItems: 'stretch', flex: 1 }}>
            <GrowthAnalyticsCard monthlyData={overviewStats?.signupsByMonth ?? null} dailyData={overviewStats?.signupsByDay ?? null} />
            <div style={{ ...cs, padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ color: C.text, fontWeight: 700, fontSize: '16px', fontFamily: HFONT, margin: '0 0 16px' }}>Recent Activity</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {overviewStats?.recentActivity?.length > 0
                  ? overviewStats.recentActivity.map((a: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: a.type === 'post' ? C.greenL : C.indigo, marginTop: '3px', flexShrink: 0 }} />
                      <div><p style={{ color: C.muted, fontSize: '14px', margin: 0 }}>{a.text}</p><p style={{ color: C.muted, fontSize: '12px', margin: '2px 0 0' }}>{timeAgo(a.ts)}</p></div>
                    </div>
                  ))
                  : !overviewStats
                    ? [1,2,3].map(i => (
                      <div key={i} style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: C.border, marginTop: '3px', flexShrink: 0 }} />
                        <div style={{ height: '13px', width: '180px', background: C.border, borderRadius: '2px' }} />
                      </div>
                    ))
                    : <p style={{ color: C.muted, fontSize: '14px', margin: 0 }}>No recent activity yet.</p>
                }
              </div>
            </div>
          </div>
        </div>
      );

      case 'users': return <UsersSection bp={bp} apiUsers={apiUsers} setApiUsers={setApiUsers} getAdminToken={async () => session?.access_token ?? null} />;
      case 'blog': return <BlogSection bp={bp} />;
      case 'updates': return <UpdatesSection bp={bp} getAdminToken={async () => session?.access_token ?? null} />;
      case 'support': return <SupportSection bp={bp} getAdminToken={async () => session?.access_token ?? null} />;
      case 'system-monitor': return <SystemMonitorSection bp={bp} getAdminToken={async () => session?.access_token ?? null} />;
      case 'sync-performance': return <SyncPerformanceSection bp={bp} />;
      case 'traffic': return <TrafficSection getAdminToken={async () => session?.access_token ?? null} />;
      case 'settings': return <SettingsSection bp={bp} getAdminToken={async () => session?.access_token ?? null} />;

    }
  };

  const contentPad = bp.isMobile ? '14px' : '24px';
  const isMobileDrawer = bp.isMobile;

  return (
    // `admin-shell` is what the base-weight rule in the <style> below hangs on. Playfair's regular
    // cut is thin by design, and anything here without an explicit weight was rendering at 400 —
    // which is the blurring he reported. The rule lifts only those: the inline 700s already set in
    // a hundred places still win over a stylesheet.
    <div className="admin-shell" style={{ display: 'flex', flexDirection: 'row', height: '100vh', background: C.bg, color: C.text, overflow: 'hidden', fontFamily: FONT }}>
      {/* Outfit, Inter and Montserrat are all self-hosted in client/src/index.css — the
          Google Fonts @import that used to head this rule went 2026-08-22. Outfit is the one the
          font picker below offers, so it is bundled as a variable font covering every weight. */}
      {/* THE REST OF THE DORIXÉ RECIPE — it is not just the two family names.

          GREY SMOOTHING instead of sub-pixel. DORIXÉ sets `-webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale` on its body (globals.css:86-87). Sub-pixel smoothing
          paints faint colour fringes down each stem, which is what makes small text read as soft
          and slightly coloured rather than clean.

          NO BLANKET WEIGHT. `.admin-shell * { font-weight: 600 }` used to sit here, pushing every
          element that did not name a weight to semibold. It existed for ONE reason — Playfair's
          hairlines vanish below 600 — and Inter has no such problem. Forcing it made the whole
          panel read heavy, which is a large part of why it looked less finished than DORIXÉ.
          DORIXÉ forces nothing: body 400, headings 700, and anything that wants a weight says so.
          Line-height 1.6 on read text is theirs as well. */}
      <style>{`* { box-sizing: border-box; scrollbar-width: none; } .admin-shell { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; line-height: 1.6; } *::-webkit-scrollbar { display: none; } input::placeholder { color: var(--admin-muted); } select option { background: var(--admin-card); color: var(--admin-text); } .admin-shell b, .admin-shell strong { font-weight: 700; }`}</style>

      {/* Mobile backdrop — closes the drawer when tapped */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 25, backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* SIDEBAR — runs the FULL height of the page, starting at the very top. */}
      <aside style={isMobileDrawer
        ? { position: 'fixed', top: 0, left: 0, bottom: 0, width: '240px', transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease', background: C.rail, boxShadow: drawerOpen ? '8px 0 32px rgba(0,0,0,0.28)' : 'none', display: 'flex', flexDirection: 'column', zIndex: 30 }
        : { width: '224px', minWidth: '224px', background: C.rail, display: 'flex', flexDirection: 'column', flexShrink: 0 }
      }>
        {/* Brand — the supplied artwork, unmodified. It carries the name itself, so the name is
            never set again as text beside it. */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '18px 16px 12px' }}>
          <Wordmark dark height="30px" />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 14px', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {/* One flat list. The groups only existed to hang the headings on, and those are gone. */}
          {SIDEBAR_GROUPS.flatMap(group => group.items).map(navBtn)}
        </div>

        {/* User profile + sign out */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 0 8px', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', color: 'white', flexShrink: 0 }}>
              {adminInitial}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ color: C.railInk, fontSize: '13px', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminName}</p>
              <p style={{ color: C.railDim, fontSize: '12px', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminEmail}</p>
            </div>
          </div>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            style={{ width: 'calc(100% - 20px)', margin: '2px 10px', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', justifyContent: 'flex-start', background: 'transparent', color: C.railDim, border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: '13px', transition: 'background 0.14s, color 0.14s', overflow: 'hidden' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(229,72,77,0.12)'; e.currentTarget.style.color = '#ff8087'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.railDim; }}
          >
            <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px', flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v6" />
              <path d="M6.8 4.8a9 9 0 1 0 10.4 0" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── EVERYTHING RIGHT OF THE RAIL ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

      {/* ── HEADER — sits over the content only; the rail runs past it to the top ── */}
      <header style={{ flexShrink: 0, zIndex: 20, background: C.card, borderBottom: `1px solid ${C.border}`, padding: `0 ${contentPad}`, height: '60px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>

        {/* On a phone the rail is hidden off-screen, so this is the ONLY way to reach the
            navigation and it stays. On anything wider the rail is always on screen and there is
            nothing for a toggle to do. */}
        {bp.isMobile && (
          <button
            onClick={() => setDrawerOpen(o => !o)}
            aria-label="Open navigation"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '5px', width: '36px', height: '36px', marginRight: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
          >
            <span style={{ display: 'block', width: '18px', height: '1.5px', background: C.muted, borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '18px', height: '1.5px', background: C.muted, borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '18px', height: '1.5px', background: C.muted, borderRadius: '2px' }} />
          </button>
        )}

        {/* ── Right: actions ── */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            ref={msgBtnRef}
            onClick={() => openNotifPanel('messages')}
            style={{ ...btn, background: notifPanelOpen === 'messages' ? C.accentSoft : 'transparent', color: notifPanelOpen === 'messages' ? C.indigo : C.muted, border: `1px solid ${notifPanelOpen === 'messages' ? C.indigo : C.border}`, padding: '8px 13px', display: 'flex', alignItems: 'center', gap: '7px', transition: 'background 0.14s, color 0.14s, border-color 0.14s', position: 'relative' }}
            onMouseEnter={e => { e.currentTarget.style.background = C.thead; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { if (notifPanelOpen !== 'messages') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted; } }}
          >
            <Mail size={16} />
            {!bp.isMobile && <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: FONT }}>Messages</span>}
            {adminNotifs.counts.messages > 0 && (
              <span style={{ background: C.indigo, color: 'white', fontSize: '12px', fontWeight: 700, minWidth: '18px', height: '18px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>
                {adminNotifs.counts.messages > 99 ? '99+' : adminNotifs.counts.messages}
              </span>
            )}
          </button>
          <div style={{ width: '1px', height: '24px', background: C.border2 }} />
          <button
            ref={alertBtnRef}
            onClick={() => openNotifPanel('alerts')}
            style={{ ...btn, background: notifPanelOpen === 'alerts' ? C.accentSoft : 'transparent', color: notifPanelOpen === 'alerts' ? C.indigo : C.muted, border: `1px solid ${notifPanelOpen === 'alerts' ? C.indigo : C.border}`, padding: '8px 13px', display: 'flex', alignItems: 'center', gap: '7px', position: 'relative', transition: 'background 0.14s, color 0.14s, border-color 0.14s' }}
            onMouseEnter={e => { e.currentTarget.style.background = C.thead; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { if (notifPanelOpen !== 'alerts') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted; } }}
          >
            <Bell size={16} />
            {!bp.isMobile && <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: FONT }}>Alerts</span>}
            {adminNotifs.counts.alerts > 0 && (
              <span style={{ background: C.red, color: 'white', fontSize: '12px', fontWeight: 700, minWidth: '18px', height: '18px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>
                {adminNotifs.counts.alerts > 99 ? '99+' : adminNotifs.counts.alerts}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Admin notification dropdown panel ── */}
      {notifPanelOpen && (
        <AdminNotificationsPanel
          panelRef={notifPanelRef}
          pos={notifPanelPos}
          mode={notifPanelOpen}
          hook={adminNotifs}
          onClose={() => setNotifPanelOpen(null)}
        />
      )}


        {/* MAIN CONTENT */}
        <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, background: 'var(--admin-bg)', display: 'flex', flexDirection: 'column' }}>
          <section style={{ padding: bp.isMobile ? '18px 14px 40px' : '28px 28px 48px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {(() => {
              // Screens that need their own action button in the heading row draw it themselves.
              if (SELF_HEADED.has(activeTab)) return null;
              const nav = SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.id === activeTab);
              const title = (PAGE_TITLES as Record<string, string>)[activeTab] ?? nav?.label;
              return title ? <PageHeader icon={nav?.icon} title={title} hint={PAGE_HINTS[activeTab]} /> : null;
            })()}
            {renderContent()}
          </section>
        </main>
      </div>
    </div>
  );
}