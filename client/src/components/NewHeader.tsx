import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";

const TICKER_DATA = [
  { symbol: "EUR/USD", price: "1.0842", change: "+0.12%", up: true },
  { symbol: "BTC/USD", price: "67,204", change: "-1.34%", up: false },
  { symbol: "GOLD",    price: "2,318.4", change: "+0.45%", up: true },
  { symbol: "SPX500",  price: "5,236.1", change: "+0.28%", up: true },
  { symbol: "GBP/USD", price: "1.2691",  change: "-0.08%", up: false },
  { symbol: "ETH/USD", price: "3,512.7", change: "+2.11%", up: true },
  { symbol: "OIL/WTI", price: "78.34",   change: "-0.67%", up: false },
  { symbol: "USD/JPY", price: "156.72",  change: "+0.19%", up: true },
];

function TickerTape() {
  const items = [...TICKER_DATA, ...TICKER_DATA];
  return (
    <div style={{
      background: "#080c10",
      borderBottom: "1px solid #0f1923",
      height: 32,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      position: "relative",
    }}>
      <style>{`
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ticker-wrap { display:flex; animation: ticker 35s linear infinite; will-change:transform; }
        .ticker-wrap:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-wrap" style={{ gap: 0 }}>
        {items.map((t, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "0 28px", borderRight: "1px solid #0f1923",
            whiteSpace: "nowrap",
          }}>
            <span style={{ color: "#4a6580", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "'Montserrat', sans-serif" }}>{t.symbol}</span>
            <span style={{ color: "#c8d8e8", fontSize: 10, fontWeight: 600, fontFamily: "'Montserrat', sans-serif" }}>{t.price}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: "'Montserrat', sans-serif",
              color: t.up ? "#22d3a5" : "#f4617f",
              background: t.up ? "rgba(34,211,165,0.08)" : "rgba(244,97,127,0.08)",
              padding: "1px 5px", borderRadius: 3,
            }}>{t.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// HOME and JOURNAL are real route links; others map to their pages
const navItems = [
  { label: "HOME",              icon: "⌂", href: "/" },
  { label: "JOURNAL",           icon: "▤", href: "/history" },
  { label: "ECONOMIC CALENDAR", icon: "▦", href: "/calendar" },
  { label: "ASSETS",            icon: "◈", href: "/major-pairs" },
  { label: "TSC",               icon: "◉", href: "/stats" },
  { label: "BLOG",              icon: "≡", href: "/blog" },
];

interface NewHeaderProps {
  isDark?: boolean;
  toggleTheme?: () => void;
}

export default function NewHeader({ isDark, toggleTheme }: NewHeaderProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", position: "sticky", top: 0, zIndex: 100 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
        :root {
          --bg: #080c10;
          --surface: #0c1219;
          --border: #0f1923;
          --border-lit: #172233;
          --accent: #3b9eff;
          --green: #22d3a5;
          --red: #f4617f;
          --text: #c8d8e8;
          --muted: #4a6580;
        }
        .nav-link {
          color: var(--muted);
          text-decoration: none;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          padding: 6px 12px;
          border-radius: 4px;
          transition: all 0.15s;
          white-space: nowrap;
          border: 1px solid transparent;
          font-family: 'Montserrat', sans-serif;
          cursor: pointer;
          background: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .nav-link:hover { color: var(--text); border-color: var(--border-lit); background: var(--surface); }
        .nav-link.nav-active { color: var(--accent); border-color: rgba(59,158,255,0.25); background: rgba(59,158,255,0.06); }
        .btn-subscribe {
          background: var(--accent);
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          padding: 7px 16px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
          font-family: 'Montserrat', sans-serif;
        }
        .btn-subscribe:hover { opacity: 0.9; }
        .btn-signin {
          background: transparent;
          color: var(--text);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 6px 14px;
          border-radius: 4px;
          border: 1px solid var(--border-lit);
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Montserrat', sans-serif;
        }
        .btn-signin:hover { border-color: var(--muted); background: var(--surface); }
        .icon-btn { background: var(--surface); border: 1px solid var(--border-lit); border-radius: 4px; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .icon-btn:hover { color: var(--text); border-color: var(--accent); }
        @media (max-width: 1024px) { .desktop-only { display: none !important; } .mobile-toggle { display: flex !important; } }
        @media (min-width: 1025px) { .desktop-only { display: flex !important; } .mobile-toggle { display: none !important; } }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>

      <TickerTape />

      <header style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--border-lit)",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "baseline", textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontSize: "20px", fontWeight: "900", color: "#fff", letterSpacing: "-0.02em", fontFamily: "'Montserrat', sans-serif" }}>FSDZONES</span>
          <span style={{ fontSize: "20px", fontWeight: "900", color: "#4da8f0", letterSpacing: "-0.02em", fontFamily: "'Montserrat', sans-serif" }}>.COM</span>
        </Link>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* Desktop nav */}
          <nav className="desktop-only" style={{ alignItems: "center", gap: 2 }}>
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-link${isActive(item.href) ? " nav-active" : ""}`}
              >
                <span style={{ opacity: 0.4, fontSize: 10 }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
            <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 12px" }} />
            <Link href="/join">
              <button className="btn-subscribe">SUBSCRIBE</button>
            </Link>
          </nav>

          <div className="desktop-only" style={{ width: 1, height: 32, background: "var(--border-lit)", margin: "0 4px" }} />

          <Link href="/login" className="desktop-only" style={{ textDecoration: "none" }}>
            <button className="btn-signin">SIGN IN</button>
          </Link>

          {/* Clock — always visible */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "flex-end",
            padding: "4px 12px",
            background: "var(--surface)",
            border: "1px solid var(--border-lit)",
            borderRadius: 4,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>{fmt(time)}</span>
            <span style={{ fontSize: 8, color: "var(--muted)", letterSpacing: "0.08em" }}>{fmtDate(time)} · UTC</span>
          </div>

          {/* Mobile hamburger */}
          <button
            className="mobile-toggle icon-btn"
            style={{ width: 34, height: 34, display: "none", flexDirection: "column", gap: 4, padding: 0 }}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Open menu"
            data-testid="button-mobile-menu"
          >
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 16, height: 1.5, background: "currentColor", borderRadius: 2 }} />
            ))}
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{
          position: "fixed", top: 92, left: 0, right: 0, bottom: 0,
          background: "var(--bg)", zIndex: 99, padding: 20,
          overflowY: "auto", animation: "fadeIn 0.2s ease",
          borderTop: "1px solid var(--border-lit)",
        }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <Link href="/join" style={{ flex: 1, textDecoration: "none" }} onClick={() => setMobileOpen(false)}>
              <button className="btn-subscribe" style={{ width: "100%", padding: "12px" }}>SUBSCRIBE</button>
            </Link>
            <Link href="/login" style={{ flex: 1, textDecoration: "none" }} onClick={() => setMobileOpen(false)}>
              <button className="btn-signin" style={{ width: "100%", padding: "12px" }}>SIGN IN</button>
            </Link>
          </div>
          {navItems.map(item => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                padding: "16px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                color: isActive(item.href) ? "var(--accent)" : "var(--text)",
                display: "flex", alignItems: "center", gap: 10,
                textDecoration: "none",
              }}
            >
              <span style={{ opacity: 0.4 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
