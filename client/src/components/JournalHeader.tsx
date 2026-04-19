import { useState, useRef, useEffect, RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { Menu, Moon, Sun, Globe, Bell, Maximize2, SunMedium, UserCircle2, Settings, ChevronRight, Power, Flame, Shield } from 'lucide-react';
import { useAuth } from "@/context/AuthContext";

const TICKER_DATA = [
  { symbol: "EUR/USD", price: "1.0842", change: "+0.12%", up: true },
  { symbol: "BTC/USD", price: "67,204", change: "-1.34%", up: false },
  { symbol: "GOLD", price: "2,318.4", change: "+0.45%", up: true },
  { symbol: "SPX500", price: "5,236.1", change: "+0.28%", up: true },
  { symbol: "GBP/USD", price: "1.2691", change: "-0.08%", up: false },
  { symbol: "ETH/USD", price: "3,512.7", change: "+2.11%", up: true },
  { symbol: "OIL/WTI", price: "78.34", change: "-0.67%", up: false },
  { symbol: "USD/JPY", price: "156.72", change: "+0.19%", up: true },
];

function TickerTape() {
  const items = [...TICKER_DATA, ...TICKER_DATA];
  return (
    <div style={{ background: "#080c10", borderBottom: "1px solid #0f1923", height: 32, overflow: "hidden", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ticker-wrap { display:flex; animation: ticker 35s linear infinite; will-change:transform; }
        .ticker-wrap:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-wrap">
        {items.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 28px", borderRight: "1px solid #0f1923", whiteSpace: "nowrap" }}>
            <span style={{ color: "#4a6580", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>{t.symbol}</span>
            <span style={{ color: "#c8d8e8", fontSize: 10, fontWeight: 600 }}>{t.price}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: t.up ? "#22d3a5" : "#f4617f", background: t.up ? "rgba(34,211,165,0.08)" : "rgba(244,97,127,0.08)", padding: "1px 5px", borderRadius: 3 }}>{t.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface JournalHeaderProps {
  onToggleSidebar: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

function ProfileDropdown({ dm, dropdownRef, displayName, avatarLetter, onLogout }: {
  dm: boolean;
  dropdownRef: RefObject<HTMLDivElement>;
  displayName: string;
  avatarLetter: string;
  onLogout: () => void;
}) {
  const border = dm ? '#1a2d45' : '#e2e8f0';
  const muted  = dm ? '#4a6580' : '#94a3b8';
  const text   = dm ? '#c8d8e8' : '#0f172a';
  const rowBg  = dm ? '#111c2d' : '#f1f5f9';

  return createPortal(
    <div ref={dropdownRef} style={{
      position: 'fixed', top: 92, right: 12, width: 290,
      background: dm ? '#0d1520' : '#ffffff',
      border: `1px solid ${border}`, borderRadius: 14,
      boxShadow: dm ? '0 24px 64px rgba(0,0,0,0.75)' : '0 16px 48px rgba(0,0,0,0.15)',
      overflow: 'hidden', zIndex: 9999,
    }}>

      {/* ── Hello / user header ── */}
      <div style={{
        padding: '14px 16px 12px',
        background: dm ? 'linear-gradient(135deg,#0f1e35,#111c2d)' : 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
        borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'linear-gradient(135deg,#1e3a5f,#3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 16, fontWeight: 800, color: '#fff',
          fontFamily: "'Montserrat',sans-serif",
          boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
        }}>{avatarLetter}</div>
        <div>
          <div style={{ fontSize: 13, color: dm ? '#94a3b8' : '#475569', fontFamily: "'Inter',sans-serif" }}>
            Hello, <span style={{ fontWeight: 700, color: '#3b82f6' }}>{displayName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Shield size={9} color="#3b82f6" />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', fontFamily: "'Montserrat',sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>Premium</span>
          </div>
        </div>
      </div>

      {/* ── Login Streak ── */}
      <div style={{ padding: '12px 12px 6px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: rowBg, border: `1px solid ${dm ? '#1e3a5f' : '#e2e8f0'}`,
          borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'background 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dm ? '#162235' : '#e2e8f0'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = rowBg; }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Flame size={18} color="#60a5fa" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: muted, fontFamily: "'Montserrat',sans-serif", textTransform: 'uppercase' }}>Login Streak</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: text, fontFamily: "'Inter',sans-serif", marginTop: 2 }}>1 Days</div>
          </div>
          <ChevronRight size={15} color={muted} />
        </div>
      </div>

      {/* ── Menu items ── */}
      <div style={{ padding: '4px 6px 6px' }}>
        {[
          { icon: <Settings size={14} color={muted} />, label: 'Account settings', red: false, action: undefined },
          { icon: <Power   size={14} color="#ef4444" strokeWidth={2.2} />, label: 'Logout', red: true, action: onLogout },
        ].map(({ icon, label, red, action }) => (
          <button key={label} onClick={action} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 10px', background: 'transparent', border: 'none', borderRadius: 8,
            cursor: 'pointer', color: red ? '#ef4444' : (dm ? '#94a3b8' : '#475569'),
            fontSize: 13, fontFamily: "'Inter',sans-serif", fontWeight: red ? 600 : 500,
            transition: 'background 0.15s', textAlign: 'left',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = red ? 'rgba(239,68,68,0.08)' : rowBg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 7, background: red ? 'rgba(239,68,68,0.08)' : rowBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            {label}
          </button>
        ))}
      </div>

    </div>,
    document.body
  );
}

export default function JournalHeader({ onToggleSidebar, darkMode, onToggleDarkMode }: JournalHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dm = darkMode;

  const { user, signOut } = useAuth();
  const [, navigate] = useLocation();

  const displayName = user?.user_metadata?.full_name
    ?? user?.email?.split('@')[0]
    ?? 'Trader';
  const avatarLetter = (displayName[0] ?? 'T').toUpperCase();

  async function handleLogout() {
    setProfileOpen(false);
    await signOut();
    navigate('/');
  }

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      const inButton   = profileRef.current?.contains(e.target as Node);
      const inDropdown = dropdownRef.current?.contains(e.target as Node);
      if (!inButton && !inDropdown) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  const t = dm ? {
    navBg: 'rgba(8,12,16,0.97)',
    navBorder: '#172233',
    logoWhite: '#ffffff',
    navLink: '#4a6580',
    navLinkHover: '#c8d8e8',
    text: '#ffffff',
    iconColor: '#3b82f6',
    iconBtnHover: '#0c1219',
  } : {
    navBg: 'rgba(255,255,255,0.97)',
    navBorder: '#e2e8f0',
    logoWhite: '#0f172a',
    navLink: '#475569',
    navLinkHover: '#0f172a',
    text: '#0f172a',
    iconColor: '#3b82f6',
    iconBtnHover: '#f1f5f9',
  };


  const NAV_ITEMS = ['Brokers', 'Propfirms', 'New Features'];
  const NAV_LINKS: Record<string, string> = { 'Brokers': '#brokers', 'Propfirms': '#propfirms', 'New Features': '#new-features' };

  const iconButtonStyle = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: t.iconColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s',
    flexShrink: 0 as const,
  };

  return (
    <div>
      <style>{`
        .nav-a { text-decoration:none; font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; padding:6px 12px; border-radius:4px; border:1px solid transparent; cursor:pointer; background:none; display:inline-flex; align-items:center; transition:all 0.15s; white-space:nowrap; font-family:'Montserrat',sans-serif; }
        .nav-links { display:flex; align-items:center; gap:6px; }
        .nav-mob-controls { display:none; align-items:center; gap:8px; }
        .jh-icon-btn:hover { background: ${dm ? '#0c1219' : '#f1f5f9'} !important; }
        .avatar-btn { 
          width:32px; height:32px; border-radius:50%; border:none; 
          background: linear-gradient(135deg,#1e3a5f,#2563eb);
          display:flex; align-items:center; justify-content:center; 
          cursor:pointer; transition: background 0.15s; flex-shrink:0;
        }
        .avatar-btn:hover { background: linear-gradient(135deg,#2563eb,#3b82f6) !important; }
        .settings-btn {
          width:32px; height:32px; border-radius:50%; border:none;
          background: ${dm ? '#1a2535' : '#e2e8f0'};
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition: background 0.15s; flex-shrink:0;
          color: ${t.iconColor};
        }
        .settings-btn:hover { background: ${dm ? '#0c1219' : '#cbd5e1'} !important; }
        @media (max-width: 1024px) {
          .nav-links { display:none !important; }
          .nav-mob-controls { display:flex !important; }
        }
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 500 }}>
        <TickerTape />
        <nav style={{ background: t.navBg, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${t.navBorder}`, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', transition: 'background 0.3s' }}>

          {/* Left: Logo + Sidebar Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.04em', fontFamily: "'Montserrat',sans-serif", cursor: 'pointer', textTransform: 'uppercase' }}>
              <span style={{ color: t.logoWhite }}>FSD </span>
              <span style={{ color: '#3b82f6' }}>Journal</span>
            </span>
            <button
              onClick={onToggleSidebar}
              title="Toggle sidebar"
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#38bdf8', flexShrink: 0, transition: 'opacity 0.15s', boxShadow: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <Menu size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Desktop Nav Links + Icons */}
          <div className="nav-links">
            {NAV_ITEMS.map(item => (
              <a key={item} href={NAV_LINKS[item]} className="nav-a" style={{ color: t.navLink }}
                onMouseEnter={e => { e.currentTarget.style.color = t.navLinkHover; e.currentTarget.style.borderColor = t.navBorder; e.currentTarget.style.background = dm ? '#0c1219' : '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.color = t.navLink; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none'; }}
              >{item}</a>
            ))}

            <div style={{ width: 1, height: 24, background: t.navBorder, margin: '0 6px' }} />

            <button className="jh-icon-btn" style={iconButtonStyle} title="Language"><Globe size={16} /></button>
            <button className="jh-icon-btn" style={iconButtonStyle} title="Notifications"><Bell size={16} /></button>
            <button className="jh-icon-btn" style={iconButtonStyle} title="Fullscreen"><Maximize2 size={16} /></button>
            <button className="jh-icon-btn" style={iconButtonStyle} title="Brightness"><SunMedium size={16} /></button>

            <div style={{ width: 1, height: 24, background: t.navBorder, margin: '0 6px' }} />

            <div ref={profileRef} style={{ position: 'relative' }}>
              <button className="avatar-btn" title="Profile" onClick={() => setProfileOpen(o => !o)}>
                <UserCircle2 size={18} color="#60a5fa" />
              </button>
              {profileOpen && <ProfileDropdown dm={dm} dropdownRef={dropdownRef} displayName={displayName} avatarLetter={avatarLetter} onLogout={handleLogout} />}
            </div>
            <button className="settings-btn" title="Settings">
              <Settings size={15} />
            </button>

            <div style={{ width: 1, height: 24, background: t.navBorder, margin: '0 6px' }} />

            <button onClick={() => onToggleDarkMode()}
              style={{ width: 40, height: 22, borderRadius: 11, background: dm ? '#1e40af' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.3s', padding: 0, flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: dm ? 20 : 2, top: 2, width: 18, height: 18, borderRadius: '50%', background: dm ? '#60a5fa' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'left 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>

          </div>

          {/* Mobile Controls */}
          <div className="nav-mob-controls">
            <button onClick={() => onToggleDarkMode()}
              style={{ width: 40, height: 22, borderRadius: 11, background: dm ? '#1e40af' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.3s', padding: 0, flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: dm ? 20 : 2, top: 2, width: 18, height: 18, borderRadius: '50%', background: dm ? '#60a5fa' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'left 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dm ? '#0c1219' : '#f1f5f9', border: `1px solid ${t.navBorder}`, borderRadius: 4, cursor: 'pointer', color: t.text }}>
              <Menu size={18} />
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div style={{ background: dm ? '#0c1219' : '#ffffff', borderBottom: `1px solid ${t.navBorder}`, position: 'relative', zIndex: 99 }}>
          {NAV_ITEMS.map(item => (
            <a key={item} href={NAV_LINKS[item]}
              onClick={() => setMobileMenuOpen(false)}
              style={{ display: 'block', padding: '13px 24px', borderBottom: `1px solid ${t.navBorder}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: t.navLink, fontFamily: "'Montserrat',sans-serif", textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = t.text)}
              onMouseLeave={e => (e.currentTarget.style.color = t.navLink)}
            >{item}</a>
          ))}
        </div>
      )}
    </div>
  );
}
