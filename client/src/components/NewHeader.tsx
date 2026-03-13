import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';

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

const navItems = [
  { label: "HOME", icon: "⌂", href: "/", isRoute: true },
  { label: "JOURNAL", icon: "▤", href: "/journal", isRoute: true },
  { label: "ECONOMIC CALENDAR", icon: "▦", href: "/calendar", isRoute: true },
  { label: "ASSETS", icon: "◈", href: "/major-pairs", isRoute: true },
  { label: "TSC", icon: "◉", href: "#tsc", isRoute: false },
  { label: "BLOG", icon: "≡", href: "/blog", isRoute: true },
];

interface NewHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export default function NewHeader({ isDark, toggleTheme }: NewHeaderProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
        .fsd-nav-link {
          color: #4a6580;
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
        .fsd-nav-link:hover { color: #c8d8e8; border-color: #172233; background: #0c1219; }
        .fsd-nav-link.fsd-active { color: #3b9eff; border-color: rgba(59,158,255,0.25); background: rgba(59,158,255,0.06); }
        .fsd-btn-subscribe {
          background: #3b9eff;
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
          text-decoration: none;
        }
        .fsd-btn-subscribe:hover { opacity: 0.9; }
        .fsd-btn-signin {
          background: transparent;
          color: #c8d8e8;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 6px 14px;
          border-radius: 4px;
          border: 1px solid #172233;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Montserrat', sans-serif;
          text-decoration: none;
        }
        .fsd-btn-signin:hover { border-color: #4a6580; background: #0c1219; }
        .fsd-icon-btn {
          background: #0c1219;
          border: 1px solid #172233;
          border-radius: 4px;
          color: #4a6580;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .fsd-icon-btn:hover { color: #c8d8e8; border-color: #3b9eff; }
        @media (max-width: 1024px) {
          .fsd-desktop-only { display: none !important; }
          .fsd-mobile-toggle { display: flex !important; }
        }
        @media (min-width: 1025px) {
          .fsd-desktop-only { display: flex !important; }
          .fsd-mobile-toggle { display: none !important; }
        }
        @keyframes fsd-slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fsd-fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>

      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <TickerTape />

        <header style={{
          background: "#080c10",
          borderBottom: "1px solid #172233",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          fontFamily: "'Montserrat', sans-serif",
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "baseline", cursor: "pointer", flexShrink: 0, textDecoration: "none" }}>
            <span style={{ fontSize: "20px", fontWeight: "900", color: "#fff", letterSpacing: "-0.02em", fontFamily: "'Montserrat', sans-serif" }}>
              FSDZONES
            </span>
            <span style={{ fontSize: "20px", fontWeight: "900", color: "#4da8f0", letterSpacing: "-0.02em", fontFamily: "'Montserrat', sans-serif" }}>
              .COM
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <nav className="fsd-desktop-only" style={{ alignItems: "center", gap: 2 }}>
              {navItems.map((item) =>
                item.isRoute ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`fsd-nav-link${isActive(item.href) ? " fsd-active" : ""}`}
                  >
                    <span style={{ opacity: 0.4, fontSize: 10 }}>{item.icon}</span>
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.label}
                    href={item.href}
                    className="fsd-nav-link"
                  >
                    <span style={{ opacity: 0.4, fontSize: 10 }}>{item.icon}</span>
                    {item.label}
                  </a>
                )
              )}

              <div style={{ width: 1, height: 20, background: "#0f1923", margin: "0 12px" }} />
              <a href="/join" className="fsd-btn-subscribe">SUBSCRIBE</a>
            </nav>

            <div className="fsd-desktop-only" style={{ width: 1, height: 32, background: "#172233", margin: "0 4px" }} />

            <a href="/login" className="fsd-desktop-only fsd-btn-signin">SIGN IN</a>

            <div style={{
              display: "flex", flexDirection: "column", alignItems: "flex-end",
              padding: "4px 12px",
              background: "#0c1219",
              border: "1px solid #172233",
              borderRadius: 4,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#c8d8e8", letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums", fontFamily: "'Montserrat', sans-serif" }}>{fmt(time)}</span>
              <span style={{ fontSize: 8, color: "#4a6580", letterSpacing: "0.08em", fontFamily: "'Montserrat', sans-serif" }}>{fmtDate(time)} · UTC</span>
            </div>

            <button
              className="fsd-mobile-toggle fsd-icon-btn"
              style={{ width: 34, height: 34, display: "none", flexDirection: "column", gap: 4, padding: 0 }}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
              ) : (
                [0, 1, 2].map(i => (
                  <div key={i} style={{ width: 16, height: 1.5, background: "currentColor", borderRadius: 2 }} />
                ))
              )}
            </button>
          </div>
        </header>
      </div>

      {mobileOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 98 }}
            onClick={() => setMobileOpen(false)}
          />
          <div style={{
            position: "fixed", top: 92, left: 0, right: 0, bottom: 0,
            background: "#080c10", zIndex: 99, padding: 20,
            overflowY: "auto", animation: "fsd-fadeIn 0.2s ease",
            borderTop: "1px solid #172233",
            fontFamily: "'Montserrat', sans-serif",
          }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <a href="/join" className="fsd-btn-subscribe" style={{ flex: 1, padding: "12px", textAlign: "center", display: "block" }}>SUBSCRIBE</a>
              <a href="/login" className="fsd-btn-signin" style={{ flex: 1, padding: "12px", textAlign: "center", display: "block" }}>SIGN IN</a>
            </div>
            {navItems.map(item =>
              item.isRoute ? (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    padding: "16px 0", borderBottom: "1px solid #0f1923",
                    fontSize: 14, fontWeight: 700, cursor: "pointer",
                    color: isActive(item.href) ? "#3b9eff" : "#c8d8e8",
                    display: "flex", alignItems: "center", gap: 10,
                    textDecoration: "none",
                    fontFamily: "'Montserrat', sans-serif",
                  }}
                >
                  <span style={{ opacity: 0.4 }}>{item.icon}</span>
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    padding: "16px 0", borderBottom: "1px solid #0f1923",
                    fontSize: 14, fontWeight: 700, cursor: "pointer",
                    color: "#c8d8e8",
                    display: "flex", alignItems: "center", gap: 10,
                    textDecoration: "none",
                    fontFamily: "'Montserrat', sans-serif",
                  }}
                >
                  <span style={{ opacity: 0.4 }}>{item.icon}</span>
                  {item.label}
                </a>
              )
            )}
          </div>
        </>
      )}
    </>
  );
}
