import { useState } from "react";
import { Moon, Sun, Menu } from "lucide-react";
import { Link } from "wouter";

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

const NAV_LINKS: { label: string; href: string; newTab?: boolean }[] = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Reviews", href: "/#reviews" },
  { label: "Economic Calendar", href: "/calendar" },
  { label: "Assets", href: "/#assets" },
  { label: "Blog", href: "/blog" },
  { label: "TSC", href: "/tsc" },
  { label: "Login", href: "/auth" },
  { label: "Signup", href: "/auth?mode=signup" },
];

interface HomeHeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activePath?: string;
}

export default function HomeHeader({ darkMode, setDarkMode, activePath }: HomeHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dm = darkMode;

  const navBg = dm ? "rgba(8,12,16,0.97)" : "rgba(255,255,255,0.97)";
  const navBorder = dm ? "#172233" : "#e2e8f0";
  const navLink = dm ? "#4a6580" : "#475569";
  const navLinkHover = dm ? "#c8d8e8" : "#0f172a";
  const logoWhite = dm ? "#ffffff" : "#0f172a";
  const textMuted = dm ? "#94a3b8" : "#64748b";
  const text = dm ? "#ffffff" : "#0f172a";

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
      <style>{`
        .hh-nav-a { text-decoration:none; font-size:10px; font-weight:700; letter-spacing:0.1em; padding:6px 12px; border-radius:4px; border:1px solid transparent; cursor:pointer; background:none; display:inline-flex; align-items:center; transition:all 0.15s; white-space:nowrap; font-family:'Poppins',sans-serif; }
        .hh-nav-a.active { color:#3b82f6 !important; border-color:rgba(59,130,246,0.3) !important; background:rgba(59,130,246,0.08) !important; }
        .hh-nav-links { display:flex; align-items:center; gap:6px; }
        .hh-mob-controls { display:none; align-items:center; gap:8px; }
        @media (max-width: 1024px) {
          .hh-nav-links { display:none; }
          .hh-mob-controls { display:flex; }
        }
        .hh-mob-dropdown { display:none; }
        .hh-mob-dropdown.open { display:block; }
        @media (min-width: 1025px) {
          .hh-mob-dropdown { display:none !important; }
        }
      `}</style>

      <TickerTape />

      <nav style={{ background: navBg, backdropFilter: "blur(12px)", borderBottom: `1px solid ${navBorder}`, height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", transition: "background 0.3s" }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'Montserrat',sans-serif", flexShrink: 0, cursor: "pointer", textDecoration: "none" }}>
          <span style={{ color: logoWhite }}>FSD </span>
          <span style={{ color: "#3b82f6" }}>Journal</span>
        </Link>

        <div className="hh-nav-links">
          {NAV_LINKS.map(({ label, href, newTab }) => {
            const isActive = !newTab && (activePath === href || (href !== "/" && activePath?.startsWith(href)));
            const linkProps = {
              key: label,
              href,
              className: `hh-nav-a${isActive ? " active" : ""}`,
              style: { color: isActive ? "#3b82f6" : navLink } as React.CSSProperties,
              onMouseEnter: (e: React.MouseEvent<HTMLAnchorElement>) => {
                if (!isActive) {
                  e.currentTarget.style.color = navLinkHover;
                  e.currentTarget.style.borderColor = navBorder;
                  e.currentTarget.style.background = dm ? "#0c1219" : "#f1f5f9";
                }
              },
              onMouseLeave: (e: React.MouseEvent<HTMLAnchorElement>) => {
                if (!isActive) {
                  e.currentTarget.style.color = navLink;
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.background = "none";
                }
              },
            };
            return newTab
              ? <a {...linkProps} target="_blank" rel="noopener noreferrer">{label}</a>
              : <Link {...linkProps}>{label}</Link>;
          })}
          <button
            onClick={() => setDarkMode(!dm)}
            style={{ width: 40, height: 22, borderRadius: 11, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "background 0.3s", padding: 0, flexShrink: 0, marginLeft: 4 }}
          >
            <div style={{ position: "absolute", left: dm ? 20 : 2, top: 2, width: 18, height: 18, borderRadius: "50%", background: dm ? "#60a5fa" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "left 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
            </div>
          </button>
        </div>

        <div className="hh-mob-controls">
          <button
            onClick={() => setDarkMode(!dm)}
            style={{ width: 40, height: 22, borderRadius: 11, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "background 0.3s", padding: 0, flexShrink: 0 }}
          >
            <div style={{ position: "absolute", left: dm ? 20 : 2, top: 2, width: 18, height: 18, borderRadius: "50%", background: dm ? "#60a5fa" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "left 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
            </div>
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: dm ? "#0c1219" : "#f1f5f9", border: `1px solid ${navBorder}`, borderRadius: 4, cursor: "pointer", color: text }}
          >
            <Menu size={18} />
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="hh-mob-dropdown open" style={{ background: dm ? "#0c1219" : "#ffffff", borderBottom: `1px solid ${navBorder}` }}>
          {NAV_LINKS.map(({ label, href, newTab }) => {
            const mobStyle: React.CSSProperties = { display: "block", padding: "13px 24px", borderBottom: `1px solid ${navBorder}`, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: textMuted, fontFamily: "'Montserrat',sans-serif", textDecoration: "none" };
            const mobEvents = {
              onMouseEnter: (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = text; },
              onMouseLeave: (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = textMuted; },
            };
            return newTab
              ? <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={mobStyle} {...mobEvents}>{label}</a>
              : <Link key={label} href={href} onClick={() => setMobileMenuOpen(false)} style={mobStyle} {...mobEvents}>{label}</Link>;
          })}
        </div>
      )}
    </div>
  );
}
