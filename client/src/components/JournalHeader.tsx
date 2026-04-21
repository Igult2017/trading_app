import { useState, useRef, useEffect, RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { Menu, Moon, Sun, Globe, Bell, Maximize2, SunMedium, UserCircle2, Settings } from 'lucide-react';
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

const PROFILE_CARD_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  .pc-root, .pc-root * { margin: 0; padding: 0; box-sizing: border-box; }

  .pc-root {
    font-family: 'DM Mono', monospace;
    width: 300px;
    background: #13131f;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px;
    overflow: hidden;
    animation: pc-rise .4s cubic-bezier(.34,1.56,.64,1) both;
    box-shadow: 0 24px 64px rgba(0,0,0,0.55);
  }

  @keyframes pc-rise {
    from { opacity: 0; transform: translateY(12px) scale(.96); }
    to   { opacity: 1; transform: none; }
  }
  @keyframes pc-fadex {
    from { opacity: 0; transform: translateX(-6px); }
    to   { opacity: 1; transform: none; }
  }
  @keyframes pc-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: .35; transform: scale(.7); }
  }

  .pc-top { padding: 20px 18px 18px; display: flex; align-items: center; gap: 14px; }

  .pc-av {
    width: 48px; height: 48px; border-radius: 8px;
    background: #1e1b3a;
    border: 1px solid rgba(120,100,255,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 500; color: #a899ff;
    flex-shrink: 0; position: relative;
  }
  .pc-av-ring {
    position: absolute; inset: -3px; border-radius: 11px;
    border: 1.5px solid rgba(120,100,255,0.18);
    pointer-events: none;
  }

  .pc-meta { flex: 1; min-width: 0; }
  .pc-name {
    font-size: 13.5px; font-weight: 500; color: #ede9ff;
    letter-spacing: -.3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pc-pill {
    display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;
    background: rgba(120,100,255,0.12);
    border: 1px solid rgba(120,100,255,0.22);
    border-radius: 3px; padding: 3px 8px;
    font-size: 9.5px; font-weight: 500; color: #9585f5;
    letter-spacing: 1.2px; text-transform: uppercase;
    font-family: 'DM Mono', monospace;
  }
  .pc-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #9585f5;
    animation: pc-pulse 2.2s ease-in-out infinite; flex-shrink: 0;
  }

  .pc-rule {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent);
    margin: 0 18px;
  }

  .pc-streak {
    margin: 10px 8px 6px; padding: 13px 14px;
    background: #0f0f1a;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    display: flex; align-items: center; gap: 12px;
    cursor: pointer;
    transition: background .18s, border-color .18s;
    animation: pc-fadex .35s .1s ease both;
  }
  .pc-streak:hover { background: #161625; border-color: rgba(255,255,255,0.1); }

  .pc-sk-ico {
    width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0;
    background: rgba(255,130,40,.1);
    border: 1px solid rgba(255,130,40,.2);
    display: flex; align-items: center; justify-content: center;
  }
  .pc-sk-body { flex: 1; }
  .pc-sk-label {
    font-size: 9px; color: rgba(255,255,255,.28);
    letter-spacing: 1.4px; text-transform: uppercase;
    font-family: 'DM Mono', monospace; margin-bottom: 3px;
  }
  .pc-sk-val { font-size: 14px; font-weight: 500; color: #ede9ff; letter-spacing: -.3px; }

  .pc-chevron {
    color: rgba(255,255,255,.18); font-size: 16px;
    transition: all .18s; line-height: 1;
  }
  .pc-streak:hover .pc-chevron { color: rgba(255,255,255,.45); transform: translateX(2px); }

  .pc-menu { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 1px; }

  .pc-item {
    display: flex; align-items: center; gap: 11px;
    padding: 10px 12px; border-radius: 5px; cursor: pointer;
    color: rgba(255,255,255,.5); font-size: 12.5px; font-weight: 400;
    font-family: 'DM Mono', monospace;
    transition: all .15s; background: transparent; border: none;
    width: 100%; text-align: left;
    animation: pc-fadex .35s ease both;
  }
  .pc-item:nth-child(1) { animation-delay: .14s; }
  .pc-item:nth-child(2) { animation-delay: .2s; }
  .pc-item:hover { background: rgba(255,255,255,.04); color: rgba(255,255,255,.82); }
  .pc-item.danger { color: rgba(235,80,75,.65); }
  .pc-item.danger:hover { background: rgba(235,80,75,.07); color: rgba(235,100,95,.9); }

  .pc-ico {
    width: 30px; height: 30px; border-radius: 4px; flex-shrink: 0;
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(255,255,255,.07);
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
  }
  .pc-item:hover .pc-ico { background: rgba(255,255,255,.09); }
  .pc-item.danger .pc-ico { background: rgba(235,80,75,.07); border-color: rgba(235,80,75,.15); }
  .pc-item.danger:hover .pc-ico { background: rgba(235,80,75,.13); }
`;

const PcFlameIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 14c-3 0-5-2.2-5-5 0-2 1-3.5 2.5-4.5C5 6 5.5 7 6.5 7.5 6.2 6.5 6.5 5 7.5 4c0 1.5 1 2.5 1.5 3.5C9.5 6.5 9 5 9.5 3.5 11 4.5 13 6.5 13 9c0 2.8-2 5-5 5z" fill="#ff8228" opacity=".9"/>
    <path d="M8 12.5c-1.4 0-2.5-1-2.5-2.5 0-1 .6-1.8 1.5-2.2-.1.7.2 1.4.8 1.8C7.6 9 7.8 8 8.5 7c.5.8 1 1.8 1 3 0 1.4-1 2.5-1.5 2.5z" fill="#ffb347" opacity=".8"/>
  </svg>
);

const PcSettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const PcLogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 2v4" stroke="rgba(235,80,75,.85)" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M4.2 3.5A5 5 0 1 0 9.8 3.5" stroke="rgba(235,80,75,.85)" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
  </svg>
);

function ProfileDropdown({ dropdownRef, displayName, avatarLetter, onLogout }: {
  dm: boolean;
  dropdownRef: RefObject<HTMLDivElement>;
  displayName: string;
  avatarLetter: string;
  onLogout: () => void;
}) {
  useEffect(() => {
    const id = 'pc-profile-card-css';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = PROFILE_CARD_CSS;
    document.head.appendChild(el);
  }, []);

  const streakDays = 1;
  const streakLabel = streakDays === 1 ? '1 day' : `${streakDays} days`;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: 92, right: 12, zIndex: 9999 }}
    >
      <div className="pc-root">
        <div className="pc-top">
          <div className="pc-av">
            {avatarLetter}
            <div className="pc-av-ring" />
          </div>
          <div className="pc-meta">
            <div className="pc-name">{displayName}</div>
            <div className="pc-pill">
              <span className="pc-dot" />
              premium
            </div>
          </div>
        </div>

        <div className="pc-rule" />

        <div className="pc-streak">
          <div className="pc-sk-ico"><PcFlameIcon /></div>
          <div className="pc-sk-body">
            <div className="pc-sk-label">login streak</div>
            <div className="pc-sk-val">{streakLabel}</div>
          </div>
          <span className="pc-chevron">›</span>
        </div>

        <div className="pc-menu">
          <button className="pc-item" type="button">
            <span className="pc-ico"><PcSettingsIcon /></span>
            account settings
          </button>
          <button className="pc-item danger" type="button" onClick={onLogout}>
            <span className="pc-ico"><PcLogoutIcon /></span>
            logout
          </button>
        </div>
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
