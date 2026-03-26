import { useState } from "react";
import { Menu, Moon, Sun, Globe, Bell, Maximize2, SunMedium, UserCircle2, Settings } from 'lucide-react';

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
}

export default function JournalHeader({ onToggleSidebar }: JournalHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const dm = darkMode;

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

  const NAV_ITEMS = ['Economic Calendar', 'Blog', 'TSC'];
  const NAV_LINKS: Record<string, string> = { 'Economic Calendar': '#economic-calendar', 'Blog': '#blog', 'TSC': '#tsc' };

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
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Poppins:wght@300;400;500;600&display=swap');
        .nav-a { text-decoration:none; font-size:10px; font-weight:700; letter-spacing:0.1em; padding:6px 12px; border-radius:4px; border:1px solid transparent; cursor:pointer; background:none; display:inline-flex; align-items:center; transition:all 0.15s; white-space:nowrap; font-family:'Poppins',sans-serif; }
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

      <div style={{ position: 'sticky', top: 0, zIndex: 100 }}>
        <TickerTape />
        <nav style={{ background: t.navBg, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${t.navBorder}`, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', transition: 'background 0.3s' }}>

          {/* Left: Sidebar hamburger + Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <button
              onClick={onToggleSidebar}
              title="Toggle sidebar"
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dm ? '#0c1219' : '#f1f5f9', border: `1px solid ${t.navBorder}`, borderRadius: 4, cursor: 'pointer', color: t.text, flexShrink: 0, transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = dm ? '#172233' : '#e2e8f0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = dm ? '#0c1219' : '#f1f5f9'; }}
            >
              <Menu size={18} />
            </button>

            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', fontFamily: "'Montserrat',sans-serif", cursor: 'pointer' }}>
              <span style={{ color: t.logoWhite }}>FSD </span>
              <span style={{ color: '#3b82f6' }}>Journal</span>
            </span>
          </div>

          {/* Desktop Nav Links + Icons */}
          <div className="nav-links">
            <a href="/assets" className="nav-a" style={{ color: t.navLink }}
              onMouseEnter={e => { e.currentTarget.style.color = t.navLinkHover; e.currentTarget.style.borderColor = t.navBorder; e.currentTarget.style.background = dm ? '#0c1219' : '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.color = t.navLink; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none'; }}
            >Assets</a>
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

            <button className="avatar-btn" title="Profile">
              <UserCircle2 size={18} color="#60a5fa" />
            </button>
            <button className="settings-btn" title="Settings">
              <Settings size={15} />
            </button>

            <div style={{ width: 1, height: 24, background: t.navBorder, margin: '0 6px' }} />

            <button onClick={() => setDarkMode(!dm)}
              style={{ width: 40, height: 22, borderRadius: 11, background: dm ? '#1e40af' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.3s', padding: 0, flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: dm ? 20 : 2, top: 2, width: 18, height: 18, borderRadius: '50%', background: dm ? '#60a5fa' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'left 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
          </div>

          {/* Mobile Controls */}
          <div className="nav-mob-controls">
            <button onClick={() => setDarkMode(!dm)}
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
          <a href="/assets" onClick={() => setMobileMenuOpen(false)}
            style={{ display: 'block', padding: '13px 24px', borderBottom: `1px solid ${t.navBorder}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: t.navLink, fontFamily: "'Montserrat',sans-serif", textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = t.text)}
            onMouseLeave={e => (e.currentTarget.style.color = t.navLink)}
          >Assets</a>
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
