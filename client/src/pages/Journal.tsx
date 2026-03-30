import { useState, useMemo, useEffect } from 'react';
import { Link } from 'wouter';
import { Activity, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import JournalHeader from '@/components/JournalHeader';
import MetricsPanel from '@/components/MetricsPanel';
import JournalForm from '@/components/JournalForm';
import StrategyAudit from '@/components/StrategyAudit';
import TradeVault from '@/components/TradeVault';
import TradingCalendar from '@/components/TradingCalendar';
import { CreateSessionForm, SessionsList } from '@/components/CreateSession';
import DrawdownPanel from '@/components/DrawdownPanel';
import TFMetricsPanel from '@/components/TFMetricsPanel';
import TraderAI from '@/components/TraderAI';
import Leaderboard from '@/components/Leaderboard';
import TradeSyncPage from '@/pages/TradeSyncPage';
import AccountsPage from '@/pages/AccountsPage';
import NoSessionPrompt from '@/components/NoSessionPrompt';
import AssetPage from '@/pages/AssetPage';

const SI = {
  Dashboard: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 12 8.5 8.5" strokeWidth="2"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M6.5 17.5a7 7 0 0 1 0-11" strokeWidth="1.4" opacity="0.4"/><path d="M17.5 17.5a7 7 0 0 0 0-11" strokeWidth="1.4" opacity="0.4"/><line x1="12" y1="3" x2="12" y2="4.5" strokeWidth="1.4"/><line x1="3" y1="12" x2="4.5" y2="12" strokeWidth="1.4"/><line x1="21" y1="12" x2="19.5" y2="12" strokeWidth="1.4"/><line x1="6.2" y1="6.2" x2="7.2" y2="7.2" strokeWidth="1.4"/><line x1="17.8" y1="6.2" x2="16.8" y2="7.2" strokeWidth="1.4"/></svg>,
  Journal: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="13" y2="11"/></svg>,
  Metrics: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Calendar: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Strategy: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>,
  Drawdown: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{filter:'drop-shadow(0 0 4px #38bdf8) drop-shadow(0 0 2px #0ea5e9)'}}><polyline points="5 4 12 11 19 4" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><polyline points="5 13 12 20 19 13" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Vault: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>,
  Leaderboard: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/><path d="M18 7h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-2"/><rect x="6" y="3" width="12" height="18" rx="2"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  Sync: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  Sessions: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  CreateSession: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  AddAccount: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  Accounts: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Settings: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  ChevronRight: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Close: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  FsdAi: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="6" r="1.5"/><circle cx="19" cy="6" r="1.5"/><circle cx="5" cy="18" r="1.5"/><circle cx="19" cy="18" r="1.5"/><circle cx="12" cy="3" r="1.5"/><circle cx="12" cy="21" r="1.5"/><line x1="12" y1="9.5" x2="5" y2="6"/><line x1="12" y1="9.5" x2="19" y2="6"/><line x1="12" y1="14.5" x2="5" y2="18"/><line x1="12" y1="14.5" x2="19" y2="18"/><line x1="12" y1="9.5" x2="12" y2="3"/><line x1="12" y1="14.5" x2="12" y2="21"/></svg>,
  TfMetrics: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/></svg>,
  Assets: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="2.5" height="10" rx="0.5"/><rect x="6.5" y="4" width="2.5" height="13" rx="0.5"/><rect x="11" y="9" width="2.5" height="8" rx="0.5"/><rect x="15.5" y="2" width="2.5" height="15" rx="0.5"/><rect x="20" y="6" width="2.5" height="11" rx="0.5"/><line x1="2" y1="21" x2="22" y2="21" strokeWidth="1.4"/></svg>,
};

interface NavItem {
  id: string;
  label: string;
  icon: () => JSX.Element;
  badge?: string;
  arrow?: boolean;
}

interface NavGroup {
  section: string | null;
  items: NavItem[];
}

const NAV_SECTIONS: NavGroup[] = [
  { section: null, items: [
    { id: 'dashboard', label: 'Dashboard', icon: SI.Dashboard },
    { id: 'journal', label: 'Journal', icon: SI.Journal },
    { id: 'metrics', label: 'Metrics', icon: SI.Metrics },
    { id: 'tfmetrics', label: 'Context', icon: SI.TfMetrics },
    { id: 'calendar', label: 'Calendar', icon: SI.Calendar },
    { id: 'strategy', label: 'Strategy Audit', icon: SI.Strategy },
    { id: 'drawdown', label: 'Drawdown', icon: SI.Drawdown },
    { id: 'vault', label: 'Trade Vault', icon: SI.Vault },
    { id: 'leaderboard', label: 'Leaderboard', icon: SI.Leaderboard },
    { id: 'sync', label: 'Sync Trade', icon: SI.Sync },
    { id: 'fsdai', label: 'Trader AI', icon: SI.FsdAi },
    { id: 'assets', label: 'Assets', icon: SI.Assets },
  ]},
  { section: 'Live Trading', items: [
    { id: 'sessions', label: 'Sessions', icon: SI.Sessions, arrow: true },
    { id: 'create', label: 'Create Session', icon: SI.CreateSession },
  ]},
  { section: 'Account', items: [
    { id: 'addaccount', label: 'Add Account', icon: SI.AddAccount },
    { id: 'accounts', label: 'Accounts', icon: SI.Accounts },
  ]},
  { section: null, items: [
    { id: 'settings', label: 'Settings', icon: SI.Settings },
  ]},
];

const NavButton = ({ item, isActive, onClick, showLabels }: { item: NavItem; isActive: boolean; onClick: () => void; showLabels: boolean }) => (
  <button onClick={onClick} data-testid={`nav-${item.id}`} style={{
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: showLabels ? 'space-between' : 'center',
    padding: showLabels ? '16px 14px' : '14px', borderRadius: 10, marginBottom: 4,
    background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
    border: 'none',
    cursor: 'pointer', transition: 'background 0.18s', fontFamily: "'Montserrat',sans-serif",
  }}
    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
      <span style={{ color: isActive ? '#38bdf8' : '#4da8f0', flexShrink: 0, display: 'flex', transform: !showLabels ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.2s ease' }}><item.icon /></span>
      {showLabels && <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: isActive ? '#f1f5f9' : 'rgba(148,163,184,0.75)', whiteSpace: 'nowrap' }}>{item.label}</span>}
    </div>
    {showLabels && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {item.badge && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 4, background: item.badge === 'Pro' ? 'rgba(139,92,246,0.8)' : '#22d3ee', color: '#020617', textTransform: 'uppercase' }}>{item.badge}</span>}
        {item.arrow && <span style={{ color: 'rgba(100,116,139,0.5)', display: 'flex', marginLeft: 2 }}><SI.ChevronRight /></span>}
      </div>
    )}
  </button>
);

const Sidebar = ({ activeNav, setActiveNav, open, isMobile, onClose }: { activeNav: string; setActiveNav: (id: string) => void; open: boolean; isMobile: boolean; onClose: () => void }) => {
  const showLabels = isMobile || open;
  const [hovered, setHovered] = useState(false);

  const sidebarStyle: React.CSSProperties = isMobile ? {
    position: 'fixed', top: 0, left: open ? 0 : '-280px', bottom: 0, width: 185,
    zIndex: 50, transition: 'left 0.3s ease', background: '#010409',
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto', overflowX: 'hidden', fontFamily: "'Montserrat',sans-serif",
  } : {
    width: open ? 185 : 72, minWidth: open ? 185 : 72, height: '100%',
    overflowY: 'auto', overflowX: 'hidden', background: '#010409',
    display: 'flex', flexDirection: 'column', position: 'relative',
    flexShrink: 0, transition: 'width 0.25s ease, min-width 0.25s ease',
    fontFamily: "'Montserrat',sans-serif",
  };

  return (
    <>
      {isMobile && open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />}
      <div
        style={{ position: 'relative', flexShrink: 0, display: 'flex', height: '100%' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <aside style={sidebarStyle} data-testid="journal-sidebar">
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(148,163,184,0.6)', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex' }} data-testid="button-close-sidebar"><SI.Close /></button>
            </div>
          )}
          <nav style={{ flex: 1, padding: '16px 12px 8px', overflowY: 'auto' }}>
            {NAV_SECTIONS.map((group, gi) => (
              <div key={gi} style={{ marginBottom: group.section ? 12 : 8 }}>
                {gi > 0 && !group.section && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 0' }} />}
                {showLabels && group.section && <p style={{ fontSize: 8, fontWeight: 800, color: 'rgba(100,116,139,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '16px 12px 8px', margin: 0, whiteSpace: 'nowrap' }}>{group.section}</p>}
                {group.items.map(item => (
                  <NavButton key={item.id} item={item} isActive={activeNav === item.id} showLabels={showLabels}
                    onClick={() => { setActiveNav(item.id); if (isMobile) onClose(); }} />
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Hover accent line — sits outside the aside so it is never clipped */}
        <div style={{
          position: 'absolute', top: 20, right: 0, width: 5, height: 'calc(100% - 20px)',
          background: hovered ? '#38bdf8' : 'transparent',
          transition: 'background 0.22s ease',
          pointerEvents: 'none',
        }} />
      </div>
    </>
  );
};

const KPI_ICONS = {
  PnL: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  WinRate: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>,
  Expectancy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>,
  Trades: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
  ProfitFactor: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>,
  AvgTrade: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
};

const StatCard = ({ stat }: { stat: { id: string; label: string; value: string; Icon: () => JSX.Element; color: string; bg: string } }) => (
  <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }} data-testid={`stat-${stat.id}`}>
    <div style={{ background: stat.bg, padding: 6, borderRadius: 6, color: stat.color, display: 'flex' }}><stat.Icon /></div>
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.7)', margin: '0 0 2px', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{stat.label}</p>
      <p style={{ fontSize: 13, fontWeight: 900, color: stat.color, margin: 0 }}>{stat.value}</p>
    </div>
  </div>
);

function catmullRomPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i-1,0)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(i+2,pts.length-1)];
    const cp1x = p1.x+(p2.x-p0.x)/6, cp1y = p1.y+(p2.y-p0.y)/6;
    const cp2x = p2.x-(p3.x-p1.x)/6, cp2y = p2.y-(p3.y-p1.y)/6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const NeonLineChart = ({ data }: { data: { label: string; pnl: number }[] }) => {
  const W=600, H=240, PL=36, PR=16, PT=18, PB=30;
  const vals = data.map(d=>d.pnl);
  const minV=Math.min(...vals), maxV=Math.max(...vals), range=maxV-minV||1;
  const toX = (i: number) => PL+(i/(data.length-1))*(W-PL-PR);
  const toY = (v: number) => PT+(1-(v-minV)/range)*(H-PT-PB);
  const pts = data.map((d,i)=>({x:toX(i),y:toY(d.pnl)}));
  const linePath = catmullRomPath(pts);
  const areaPath = linePath+` L ${pts[pts.length-1].x} ${H-PB} L ${pts[0].x} ${H-PB} Z`;
  const last = pts[pts.length-1];
  const labelIdxs = data.length<=7 ? data.map((_,i)=>i) : [0,Math.floor(data.length*.2),Math.floor(data.length*.4),Math.floor(data.length*.6),Math.floor(data.length*.8),data.length-1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{display:'block'}} preserveAspectRatio="none">
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="4" result="b1"/><feGaussianBlur stdDeviation="8" result="b2"/><feMerge><feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="neonFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="#080d18"/>
      {[0.25,0.5,0.75,1].map((t,i)=><line key={i} x1={PL} y1={PT+(1-t)*(H-PT-PB)} x2={W-PR} y2={PT+(1-t)*(H-PT-PB)} stroke="rgba(99,120,180,0.15)" strokeWidth="1" strokeDasharray="4 4"/>)}
      {[0,1,2,3].map(i=>{const v=minV+(i/3)*range; return <text key={i} x={PL-5} y={toY(v)+4} textAnchor="end" fontSize="9" fill="rgba(100,116,139,0.6)" fontFamily="Montserrat,sans-serif" fontWeight="900">{v>=1000?`${(v/1000).toFixed(1)}k`:Math.round(v)}</text>;})}
      {labelIdxs.map(i=><text key={i} x={toX(i)} y={H-PB+16} textAnchor="middle" fontSize="9" fill="rgba(100,116,139,0.6)" fontFamily="Montserrat,sans-serif" fontWeight="900">{data[i].label}</text>)}
      <path d={areaPath} fill="url(#neonFill)"/>
      <path d={linePath} fill="none" stroke="#7c6fff" strokeWidth="6" strokeOpacity="0.2" filter="url(#glow)" strokeLinecap="round"/>
      <path d={linePath} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={linePath} fill="none" stroke="#c4b5fd" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)"/>
      <circle cx={last.x} cy={last.y} r="8" fill="#a78bfa" opacity="0.2"/>
      <circle cx={last.x} cy={last.y} r="5" fill="#080d18" stroke="#a78bfa" strokeWidth="2"/>
      <circle cx={last.x} cy={last.y} r="2" fill="#c4b5fd"/>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SMART DATE PARSER
// Handles all formats that may come from OCR or manual entry:
//   "2024-01-15T09:30:00"   ISO with time
//   "2024-01-15"            ISO date only
//   "15/01/2024 09:30"      DD/MM/YYYY with time
//   "15/01/2024"            DD/MM/YYYY date only
//   "01/15/2024"            MM/DD/YYYY (US format, defensive)
// Returns { year, month (1-12), day } or null if unparseable.
// ─────────────────────────────────────────────────────────────────────────────
function parseTradeDate(raw: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // 1. ISO format: YYYY-MM-DD (with optional time component)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // 2. Slash-separated: DD/MM/YYYY or MM/DD/YYYY (with optional time)
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    // Disambiguate: if first part > 12 it must be a day (DD/MM/YYYY)
    if (a > 12) {
      // DD/MM/YYYY
      if (b >= 1 && b <= 12 && a >= 1 && a <= 31) return { year, month: b, day: a };
    } else if (b > 12) {
      // MM/DD/YYYY
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return { year, month: a, day: b };
    } else {
      // Ambiguous — default to DD/MM/YYYY (more common outside US)
      if (a >= 1 && a <= 31 && b >= 1 && b <= 12) return { year, month: b, day: a };
    }
  }

  // 3. Dot-separated: DD.MM.YYYY
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10);
    const year = parseInt(dotMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }

  // 4. Last resort — let JS Date try it
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    }
  } catch {}

  return null;
}

// Get the best date string from a journal entry row
function getEntryDateStr(entry: any): string | null {
  return entry.entryTime || entry.entryTimeUTC || entry.openedAt || entry.tradeDate || entry.createdAt || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY CALENDAR — month-navigable, date-format-agnostic
// ─────────────────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['S','M','T','W','T','F','S'];

function ActivityCalendar({ entries }: { entries: any[] }) {
  // Build full trade map: "YYYY-M" → { day: 'profit' | 'loss' | 'mixed' }
  const { tradeMap, sortedMonths } = useMemo(() => {
    // map: "YYYY-M" → { [day]: { wins, losses } }
    const raw: Record<string, Record<number, { wins: number; losses: number; pnl: number }>> = {};

    entries.forEach((e: any) => {
      const parsed = parseTradeDate(getEntryDateStr(e));
      if (!parsed) return;
      const { year, month, day } = parsed;
      const mk = `${year}-${month}`;
      if (!raw[mk]) raw[mk] = {};
      if (!raw[mk][day]) raw[mk][day] = { wins: 0, losses: 0, pnl: 0 };

      const outcome = (e.outcome || '').toLowerCase();
      const pnl = parseFloat(e.profitLoss || e.pnl || '0') || 0;
      raw[mk][day].pnl += pnl;
      if (outcome === 'win') raw[mk][day].wins++;
      else if (outcome === 'loss') raw[mk][day].losses++;
    });

    // Convert to status map
    const tradeMap: Record<string, Record<number, 'profit' | 'loss' | 'mixed'>> = {};
    for (const mk in raw) {
      tradeMap[mk] = {};
      for (const d in raw[mk]) {
        const { wins, losses } = raw[mk][d];
        if (wins > 0 && losses === 0) tradeMap[mk][Number(d)] = 'profit';
        else if (losses > 0 && wins === 0) tradeMap[mk][Number(d)] = 'loss';
        else if (wins > 0 && losses > 0) tradeMap[mk][Number(d)] = 'mixed';
        // else breakeven / no outcome — leave unset (neutral)
      }
    }

    // Sort months chronologically
    const sortedMonths = Object.keys(tradeMap).sort((a, b) => {
      const [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      return ay !== by ? ay - by : am - bm;
    });

    return { tradeMap, sortedMonths };
  }, [entries]);

  // Default to most recent month that has trades
  const defaultMonth = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : null;
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(defaultMonth);

  // Keep activeMonthKey in sync if entries change and current key disappears
  useEffect(() => {
    if (!activeMonthKey && defaultMonth) {
      setActiveMonthKey(defaultMonth);
    }
  }, [defaultMonth]);

  const activeIdx = activeMonthKey ? sortedMonths.indexOf(activeMonthKey) : -1;
  const canPrev = activeIdx > 0;
  const canNext = activeIdx < sortedMonths.length - 1;

  const prev = () => canPrev && setActiveMonthKey(sortedMonths[activeIdx - 1]);
  const next = () => canNext && setActiveMonthKey(sortedMonths[activeIdx + 1]);

  // Parse active month
  const activeYear = activeMonthKey ? parseInt(activeMonthKey.split('-')[0], 10) : new Date().getFullYear();
  const activeMonth = activeMonthKey ? parseInt(activeMonthKey.split('-')[1], 10) : new Date().getMonth() + 1;

  // Calendar grid
  const daysInMonth = new Date(activeYear, activeMonth, 0).getDate();
  const firstDayOfWeek = new Date(activeYear, activeMonth - 1, 1).getDay(); // 0=Sun
  const dayStatuses = tradeMap[activeMonthKey || ''] || {};

  // Summary counts for the active month
  const monthSummary = useMemo(() => {
    const days = dayStatuses;
    let profit = 0, loss = 0, mixed = 0;
    for (const d in days) {
      if (days[Number(d)] === 'profit') profit++;
      else if (days[Number(d)] === 'loss') loss++;
      else if (days[Number(d)] === 'mixed') mixed++;
    }
    return { profit, loss, mixed, total: profit + loss + mixed };
  }, [activeMonthKey, tradeMap]);

  const cellColor = (status: 'profit' | 'loss' | 'mixed' | undefined) => {
    if (status === 'profit') return { bg: 'rgba(16,185,129,0.2)', border: 'rgba(16,185,129,0.3)', color: '#34d399' };
    if (status === 'loss')   return { bg: 'rgba(244,63,94,0.2)',  border: 'rgba(244,63,94,0.3)',  color: '#fb7185' };
    if (status === 'mixed')  return { bg: 'rgba(251,191,36,0.15)',border: 'rgba(251,191,36,0.25)',color: '#fbbf24' };
    return { bg: 'rgba(22,27,34,0.8)', border: 'transparent', color: 'rgba(55,65,81,0.8)' };
  };

  return (
    <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', padding: 20, borderRadius: 8 }} data-testid="panel-activity-calendar">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.1)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
          <Activity size={14} strokeWidth={3} />
        </div>
        <h2 style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>ACTIVITY</h2>
      </div>

      {sortedMonths.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(100,116,139,0.5)', fontSize: 10 }}>
          No trade data yet
        </div>
      ) : (
        <>
          {/* Month navigator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              onClick={prev}
              disabled={!canPrev}
              style={{ background: 'none', border: 'none', cursor: canPrev ? 'pointer' : 'default', color: canPrev ? '#38bdf8' : 'rgba(55,65,81,0.4)', padding: 4, display: 'flex', borderRadius: 4, transition: 'all 0.15s' }}>
              <ChevronLeft size={14} strokeWidth={3} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>
                {MONTH_NAMES[activeMonth - 1]} {activeYear}
              </p>
              {/* Month dot indicators */}
              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 5 }}>
                {sortedMonths.map(mk => (
                  <button
                    key={mk}
                    onClick={() => setActiveMonthKey(mk)}
                    style={{
                      width: mk === activeMonthKey ? 16 : 5,
                      height: 5, borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0,
                      background: mk === activeMonthKey ? '#38bdf8' : 'rgba(56,189,248,0.25)',
                      transition: 'all 0.2s',
                    }}
                    title={(() => { const [y,m]=mk.split('-'); return `${MONTH_NAMES[parseInt(m)-1]} ${y}`; })()}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={next}
              disabled={!canNext}
              style={{ background: 'none', border: 'none', cursor: canNext ? 'pointer' : 'default', color: canNext ? '#38bdf8' : 'rgba(55,65,81,0.4)', padding: 4, display: 'flex', borderRadius: 4, transition: 'all 0.15s' }}>
              <ChevronRight size={14} strokeWidth={3} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
            {DAY_LABELS.map((d, i) => (
              <div key={i} style={{ fontSize: 8, color: 'rgba(55,65,81,0.8)', textAlign: 'center', paddingBottom: 2, fontWeight: 900 }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid — offset first day correctly */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
            {/* Empty cells before day 1 */}
            {Array.from({ length: firstDayOfWeek }, (_, i) => (
              <div key={`empty-${i}`} style={{ aspectRatio: '1' }} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const status = dayStatuses[day];
              const c = cellColor(status);
              return (
                <div
                  key={day}
                  style={{
                    aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4, fontSize: 9, fontWeight: 900,
                    background: c.bg, color: c.color,
                    border: `1px solid ${c.border}`,
                    opacity: status ? 1 : 0.5,
                    transition: 'all 0.15s',
                    cursor: status ? 'default' : 'default',
                  }}>
                  {day}
                </div>
              );
            })}
          </div>

          {/* Month summary */}
          {monthSummary.total > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {[
                { label: 'PROFIT', count: monthSummary.profit, color: '#34d399' },
                { label: 'LOSS',   count: monthSummary.loss,   color: '#fb7185' },
                { label: 'MIXED',  count: monthSummary.mixed,  color: '#fbbf24' },
              ].map(s => s.count > 0 && (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, background: s.color }} />
                  <span style={{ fontSize: 8, color: 'rgba(148,163,184,0.6)', letterSpacing: '0.1em' }}>
                    {s.count} {s.label}
                  </span>
                </div>
              ))}
              <span style={{ fontSize: 8, color: 'rgba(100,116,139,0.4)', marginLeft: 'auto', letterSpacing: '0.1em' }}>
                {monthSummary.total} TRADE DAYS
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DashboardView({ sessionId, isMobile, windowWidth }: { sessionId: string; isMobile: boolean; windowWidth: number }) {
  const metricsUrl = `/api/metrics/compute?sessionId=${sessionId}`;
  const entriesUrl = `/api/journal/entries?sessionId=${sessionId}`;

  const { data: metricsData, isLoading: metricsLoading } = useQuery<{ success: boolean; metrics: any }>({
    queryKey: ['/api/metrics/compute', sessionId],
    queryFn: async () => {
      const r = await fetch(metricsUrl);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      return r.json();
    },
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ['/api/journal/entries', sessionId],
    queryFn: async () => {
      const r = await fetch(entriesUrl);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      return r.json();
    },
  });

  const m = metricsData?.metrics;
  const core = m?.core || {};
  const equityCurve = m?.equityCurve || [];
  const equityGrowth = m?.equityGrowth;
  const instrumentBreakdown = m?.instrumentBreakdown || {};

  const totalPL = equityGrowth ? equityGrowth.totalPL : core.totalPL || 0;
  const plSign = totalPL >= 0 ? '+' : '';

  const pfRaw = core.profitFactor ?? 0;
  const pfDisplay = pfRaw >= 999 ? '∞' : pfRaw > 0 ? pfRaw.toFixed(2) : '0';
  const avgTradeRaw = core.totalTrades ? totalPL / core.totalTrades : 0;
  const avgTradeDisplay = `${avgTradeRaw >= 0 ? '+' : '-'}$${Math.abs(avgTradeRaw).toFixed(2)}`;

  const stats = [
    { id: 'pnl', label: 'TOTAL P&L', value: `${plSign}$${Math.abs(totalPL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, Icon: KPI_ICONS.PnL, color: totalPL >= 0 ? '#34d399' : '#fb7185', bg: totalPL >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)' },
    { id: 'winrate', label: 'WIN RATE', value: `${(core.winRate ?? 0).toFixed(1)}%`, Icon: KPI_ICONS.WinRate, color: '#818cf8', bg: 'rgba(99,102,241,0.1)' },
    { id: 'rexpect', label: 'R EXPECTANCY', value: `${(core.expectancy ?? 0).toFixed(2)}R`, Icon: KPI_ICONS.Expectancy, color: (core.expectancy ?? 0) >= 0 ? '#fbbf24' : '#fb7185', bg: 'rgba(245,158,11,0.1)' },
    { id: 'tradecount', label: 'TRADES', value: `${core.totalTrades || 0}`, Icon: KPI_ICONS.Trades, color: '#94a3b8', bg: 'rgba(100,116,139,0.1)' },
    { id: 'pfactor', label: 'PROFIT FACTOR', value: pfDisplay, Icon: KPI_ICONS.ProfitFactor, color: pfRaw >= 1 || pfRaw >= 999 ? '#c084fc' : '#fb7185', bg: 'rgba(168,85,247,0.1)' },
    { id: 'avgtrade', label: 'AVG TRADE', value: avgTradeDisplay, Icon: KPI_ICONS.AvgTrade, color: avgTradeRaw >= 0 ? '#34d399' : '#fb7185', bg: avgTradeRaw >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)' },
  ];

  const chartData = equityCurve.length > 0
    ? equityCurve.map((p: any) => ({ label: `#${p.tradeNumber}`, pnl: p.cumulativePL }))
    : [{ label: 'Start', pnl: 0 }];

  const recentTrades = [...entries].slice(0, 6).map((e: any) => ({
    id: e.id,
    ticker: e.instrument || 'N/A',
    date: e.entryTime || (e.createdAt ? new Date(e.createdAt).toLocaleString() : ''),
    type: (e.direction || 'LONG').toUpperCase(),
    pnl: parseFloat(e.profitLoss || e.pnl || '0'),
    status: (e.outcome || '').toLowerCase() === 'win' ? 'profit' : 'loss',
  }));

  const winCount = core.wins || 0;
  const lossCount = core.losses || 0;
  const totalCount = core.totalTrades || 0;
  const profitRatio = totalCount > 0 ? Math.round((winCount / totalCount) * 100) : 0;
  const lossRatio = totalCount > 0 ? 100 - profitRatio : 0;

  const instEntries = Object.entries(instrumentBreakdown).sort((a: any, b: any) => b[1].trades - a[1].trades).slice(0, 6);
  const maxInstTrades = instEntries.length > 0 ? (instEntries[0][1] as any).trades : 1;

  if (metricsLoading || entriesLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Loader2 size={24} style={{ color: '#38bdf8', animation: 'spin 1s linear infinite' }} />
        <span style={{ marginLeft: 12, fontSize: 12, color: 'rgba(148,163,184,0.7)' }}>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : windowWidth < 900 ? 3 : 6},1fr)`, gap: 4 }}>
        {stats.map(s => <StatCard key={s.id} stat={s} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: windowWidth >= 900 ? '7fr 5fr' : '1fr', gap: 6 }}>
        <div style={{ background: '#080d18', border: '1px solid rgba(255,255,255,0.1)', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }} data-testid="chart-equity-curve">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(56,189,248,0.1)', borderRadius: 8, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}><Activity size={16} strokeWidth={3} /></div>
              <h2 style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>EQUITY CURVE</h2>
            </div>
            {equityGrowth && (
              <span style={{ fontSize: 10, color: equityGrowth.totalReturnPct >= 0 ? '#34d399' : '#fb7185', fontWeight: 900 }}>
                {equityGrowth.totalReturnPct >= 0 ? '+' : ''}{equityGrowth.totalReturnPct.toFixed(2)}%
              </span>
            )}
          </div>
          <div style={{ height: 220, width: '100%' }}>
            {chartData.length > 1 ? <NeonLineChart data={chartData} /> : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(100,116,139,0.5)', fontSize: 11 }}>No equity data yet</div>
            )}
          </div>
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 180, height: 180, background: 'rgba(56,189,248,0.04)', filter: 'blur(70px)', pointerEvents: 'none' }} />
        </div>

        <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', padding: 20, borderRadius: 8 }} data-testid="panel-performance-mix">
          <h2 style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.2em' }}>PERFORMANCE MIX</h2>
          {[{ label: 'PROFIT RATIO', val: `${profitRatio}%`, color: '#10b981' }, { label: 'LOSS RATIO', val: `${lossRatio}%`, color: '#f43f5e' }].map(m => (
            <div key={m.label} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: 'rgba(100,116,139,0.7)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>{m.label}</span>
                <span style={{ fontSize: 9, color: m.color }}>{m.val}</span>
              </div>
              <div style={{ height: 2, background: '#161b22', borderRadius: 4 }}><div style={{ height: '100%', width: m.val, background: m.color, borderRadius: 4 }} /></div>
            </div>
          ))}
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 9, color: 'rgba(100,116,139,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>PAIR VOLUME / FREQUENCY</p>
            {instEntries.map(([name, data]: any) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: '#fff', width: 54, fontStyle: 'italic', flexShrink: 0 }}>{name}</span>
                <div style={{ flex: 1, height: 2, background: '#161b22', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.round((data.trades / maxInstTrades) * 100)}%`, background: '#38bdf8', borderRadius: 4 }} /></div>
                <span style={{ fontSize: 9, color: 'rgba(100,116,139,0.5)', width: 16, textAlign: 'right', flexShrink: 0 }}>{data.trades}</span>
              </div>
            ))}
            {instEntries.length === 0 && <p style={{ fontSize: 10, color: 'rgba(100,116,139,0.4)' }}>No instrument data yet</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: windowWidth >= 900 ? '7fr 5fr' : '1fr', gap: 6 }}>
        <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} data-testid="panel-trade-log">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.2em', fontStyle: 'italic' }}>RECENT TRADE LOG</span>
            <Activity size={14} strokeWidth={3} style={{ color: '#38bdf8', opacity: .3 }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            {recentTrades.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 260 }}>
                <thead style={{ background: 'rgba(22,27,34,0.5)' }}>
                  <tr>{['INSTRUMENT', 'ACTION', 'NET P&L'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: 8, color: 'rgba(100,116,139,0.6)', textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: i === 1 ? 'center' : i === 2 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {recentTrades.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} data-testid={`trade-row-${t.id}`}>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: '#fff' }}>{t.ticker}</div>
                        <div style={{ fontSize: 8, color: 'rgba(100,116,139,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>{t.date}</div>
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', background: t.type === 'LONG' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: t.type === 'LONG' ? '#34d399' : '#fb7185', border: `1px solid ${t.type === 'LONG' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)'}` }}>{t.type}</span>
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 11, fontWeight: 900, color: t.status === 'profit' ? '#34d399' : '#fb7185' }}>
                        {t.status === 'profit' ? '+' : '-'}${Math.abs(t.pnl).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'rgba(100,116,139,0.5)', fontSize: 11 }}>No trades in this session yet</div>
            )}
          </div>
        </div>

        {/* ── Smart Activity Calendar ── */}
        <ActivityCalendar entries={entries} />
      </div>
    </div>
  );
}


export default function Journal() {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery<any[]>({ queryKey: ['/api/sessions'] });
  const handleSessionCreated = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveNav('dashboard');
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveNav('dashboard');
  };

  const handleDeleteSession = (deletedId: string) => {
    if (activeSessionId === deletedId) {
      setActiveSessionId(null);
    }
  };

  useEffect(() => {
    const check = () => {
      const mob = window.innerWidth < 768;
      setIsMobile(mob);
      setWindowWidth(window.innerWidth);
      if (mob) setSidebarOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    if (activeNav === 'journal') {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }
  }, [activeNav, isMobile]);

  return (
    <div style={{ fontFamily:'"Montserrat",sans-serif', height:'100dvh', overflow:'hidden', display:'flex', flexDirection:'column', background:'#010409', color:'#cbd5e1' }}>
      <style>{`
        .journal-root *{font-family:'Montserrat',sans-serif!important;font-weight:900!important;letter-spacing:.02em;box-sizing:border-box;}
        .journal-root svg text{font-family:'Montserrat',sans-serif!important;}
        .journal-root ::-webkit-scrollbar{display:none;}
        .journal-root *{scrollbar-width:none;-ms-overflow-style:none;}
        .primary-btn { background: #2563eb; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; font-size: 11px; border-radius: 0 !important; }
        .primary-btn:hover { background: #3b82f6; box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <JournalHeader onToggleSidebar={() => isMobile ? setMobileOpen(o => !o) : setSidebarOpen(o => !o)} />

      <div className="journal-root" style={{ flex:1, display:'flex', overflow:'hidden', position:'relative', gap: 12 }}>
        <Sidebar activeNav={activeNav} setActiveNav={setActiveNav} open={isMobile ? mobileOpen : sidebarOpen} isMobile={isMobile} onClose={()=>setMobileOpen(false)} />

        <main style={{ flex:1, overflowY:'auto', padding: isMobile ? '10px 10px 32px' : activeNav === 'dashboard' ? '14px 16px 32px' : activeNav === 'journal' ? '14px 0 32px' : activeNav === 'tfmetrics' ? '0 0 0 6px' : activeNav === 'sync' ? '0 0 0 6px' : activeNav === 'accounts' ? '0 0 0 6px' : activeNav === 'addaccount' ? '0 0 0 6px' : activeNav === 'vault' ? '0 0 0 6px' : activeNav === 'strategy' ? '0 0 0 6px' : activeNav === 'leaderboard' ? '0 0 0 6px' : '14px 8px 32px', minWidth:0 }}>

          {activeNav === 'metrics' ? (
            activeSessionId ? <MetricsPanel sessionId={activeSessionId} /> : <NoSessionPrompt onCreateSession={() => setActiveNav('create')} onViewSessions={() => setActiveNav('sessions')} />
          ) : activeNav === 'journal' ? (
            activeSessionId ? (
              <JournalForm sessionId={activeSessionId} />
            ) : (
              <NoSessionPrompt onCreateSession={() => setActiveNav('create')} onViewSessions={() => setActiveNav('sessions')} />
            )
          ) : activeNav === 'strategy' ? (
            <StrategyAudit />
          ) : activeNav === 'vault' ? (
            activeSessionId ? <TradeVault sessionId={activeSessionId} startingBalance={parseFloat((sessions.find((s: any) => s.id === activeSessionId)?.startingBalance) || "0") || undefined} /> : <NoSessionPrompt onCreateSession={() => setActiveNav('create')} onViewSessions={() => setActiveNav('sessions')} />
          ) : activeNav === 'calendar' ? (
            activeSessionId ? <TradingCalendar sessionId={activeSessionId} /> : <NoSessionPrompt onCreateSession={() => setActiveNav('create')} onViewSessions={() => setActiveNav('sessions')} />
          ) : activeNav === 'sessions' ? (
            <SessionsList onSelectSession={handleSelectSession} activeSessionId={activeSessionId} onDeleteSession={handleDeleteSession} />
          ) : activeNav === 'create' ? (
            <CreateSessionForm onCreated={handleSessionCreated} />
          ) : activeNav === 'tfmetrics' ? (
            activeSessionId ? <TFMetricsPanel sessionId={activeSessionId} /> : <NoSessionPrompt onCreateSession={() => setActiveNav('create')} onViewSessions={() => setActiveNav('sessions')} />
          ) : activeNav === 'drawdown' ? (
            activeSessionId ? <DrawdownPanel sessionId={activeSessionId} /> : <NoSessionPrompt onCreateSession={() => setActiveNav('create')} onViewSessions={() => setActiveNav('sessions')} />
          ) : activeNav === 'fsdai' ? (
            <TraderAI />
          ) : activeNav === 'leaderboard' ? (
            <Leaderboard />
          ) : activeNav === 'sync' ? (
            <TradeSyncPage />
          ) : activeNav === 'accounts' ? (
            <AccountsPage />
          ) : activeNav === 'addaccount' ? (
            <AccountsPage openModal={true} />
          ) : activeNav === 'assets' ? (
            <AssetPage />
          ) : (
            activeSessionId ? (
              <DashboardView sessionId={activeSessionId} isMobile={isMobile} windowWidth={windowWidth} />
            ) : (
              <NoSessionPrompt onCreateSession={() => setActiveNav('create')} onViewSessions={() => setActiveNav('sessions')} />
            )
          )}
        </main>
      </div>

    </div>
  );
}
