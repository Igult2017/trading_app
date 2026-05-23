import { useState, useCallback, useRef } from "react";
import { Moon, Sun, Menu, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchIfEmpty } from "@/lib/prefetchCalendar";

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

export function TickerTape({ dark }: { dark: boolean }) {
  const items = [...TICKER_DATA, ...TICKER_DATA];
  const bg     = dark ? "#080c10" : "#f1f5f9";
  const border = dark ? "#0f1923" : "#e2e8f0";
  const symClr = dark ? "#4a6580" : "#94a3b8";
  const prClr  = dark ? "#c8d8e8" : "#334155";
  return (
    <div style={{ background: bg, borderBottom: `1px solid ${border}`, height: 32, overflow: "hidden", display: "flex", alignItems: "center", transition: "background 0.3s" }}>
      <style>{`
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ticker-wrap { display:flex; animation: ticker 35s linear infinite; will-change:transform; }
        .ticker-wrap:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-wrap">
        {items.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 28px", borderRight: `1px solid ${border}`, whiteSpace: "nowrap" }}>
            <span style={{ color: symClr, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>{t.symbol}</span>
            <span style={{ color: prClr,  fontSize: 10, fontWeight: 600, fontFamily: "'Montserrat',sans-serif" }}>{t.price}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: t.up ? "#22d3a5" : "#f4617f", background: t.up ? "rgba(34,211,165,0.08)" : "rgba(244,97,127,0.08)", padding: "1px 5px", borderRadius: 3 }}>{t.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV_LINKS: { label: string; href: string; newTab?: boolean; cta?: "outline" | "solid" }[] = [
  { label: "Journal",           href: "/auth",            newTab: true },
  { label: "Features",          href: "/#features" },
  { label: "Pricing",           href: "/#pricing" },
  { label: "Reviews",           href: "/#reviews" },
  { label: "Economic Calendar", href: "/calendar" },
  { label: "Blog",              href: "/blog" },
  { label: "TSC",               href: "/tsc" },
  { label: "Login",             href: "/auth",            newTab: true, cta: "outline" },
  { label: "Signup",            href: "/auth?mode=signup", newTab: true, cta: "solid" },
];

interface HomeHeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activePath?: string;
}

export default function HomeHeader({ darkMode, setDarkMode, activePath }: HomeHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const dm = darkMode;
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  // Prefetch targets: fire on hover so data is ready before navigation completes
  const PREFETCH_HREFS = new Set(["/calendar", "/blog"]);
  const prefetchedRef = useRef(new Set<string>());
  const handleLinkHover = useCallback((href: string) => {
    if (!PREFETCH_HREFS.has(href)) return;
    if (prefetchedRef.current.has(href)) return;
    prefetchedRef.current.add(href);
    prefetchIfEmpty(qc);
  }, [qc]);

  // For hash-anchor links (/#features, /#pricing, /#reviews):
  // Always prevent the browser's default navigation (avoids full page reload).
  // If the section exists on the current page → scroll instantly.
  // Otherwise → SPA-navigate to "/" via wouter (no reload), then poll until
  // React renders the section and scroll to it.
  const handleHashClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const hash = href.split('#')[1];
    if (!hash) return;

    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Not on the homepage — navigate there via wouter (SPA, no reload)
    navigate('/');

    // Poll until the section mounts (React needs a render cycle or two)
    let attempts = 0;
    const tryScroll = () => {
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (attempts < 25) {
        attempts++;
        setTimeout(tryScroll, 60);
      }
    };
    setTimeout(tryScroll, 80);
  }, [navigate]);

  const navBg     = dm ? "rgba(8,12,16,0.97)"  : "rgba(255,255,255,0.97)";
  const navBorder = dm ? "#172233"              : "#e2e8f0";
  const linkClr   = dm ? "#94a3b8"              : "#475569";
  const linkHover = dm ? "#f1f5f9"              : "#0f172a";
  const logoClr   = dm ? "#ffffff"              : "#0f172a";
  const mobBg     = dm ? "#0c1219"              : "#ffffff";
  const mobRow    = dm ? "#172233"              : "#f1f5f9";

  function linkStyle(isActive: boolean, cta?: "outline" | "solid"): React.CSSProperties {
    if (cta === "solid") return {
      background: "#2563eb", color: "#ffffff",
      border: "none", borderRadius: 7,
      padding: "8px 18px", cursor: "pointer",
      fontFamily: "'Montserrat',sans-serif", fontWeight: 800,
      fontSize: 11, letterSpacing: "0.08em", textDecoration: "none",
      display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
      transition: "background 0.15s",
    };
    if (cta === "outline") return {
      background: "transparent",
      color: dm ? "#94a3b8" : "#334155",
      border: `1px solid ${navBorder}`, borderRadius: 7,
      padding: "7px 18px", cursor: "pointer",
      fontFamily: "'Montserrat',sans-serif", fontWeight: 700,
      fontSize: 11, letterSpacing: "0.08em", textDecoration: "none",
      display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
      transition: "all 0.15s",
    };
    return {
      color: isActive ? "#2563eb" : linkClr,
      background: isActive ? (dm ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.07)") : "transparent",
      border: `1px solid ${isActive ? "rgba(37,99,235,0.25)" : "transparent"}`,
      borderRadius: 6, padding: "7px 12px", cursor: "pointer",
      fontFamily: "'Montserrat',sans-serif", fontWeight: 700,
      fontSize: 11, letterSpacing: "0.06em", textDecoration: "none",
      display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
      transition: "all 0.15s",
    };
  }

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
      <TickerTape dark={dm} />

      <nav style={{ background: navBg, backdropFilter: "blur(12px)", borderBottom: `1px solid ${navBorder}`, height: 64, transition: "background 0.3s" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>

          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}>
              <span style={{ color: '#0f172a' }}>Myfm</span><span style={{ color: '#3b82f6' }}>journal</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, justifyContent: "center" }} className="hh-nav-desktop">
            {NAV_LINKS.filter(l => !l.cta).map(({ label, href, newTab }) => {
              const isActive = !newTab && (activePath === href || (href !== "/" && activePath?.startsWith(href)));
              const s = linkStyle(isActive);
              const handlers = !isActive ? {
                onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.color = linkHover;
                  e.currentTarget.style.background = dm ? "rgba(255,255,255,0.05)" : "#f8fafc";
                  e.currentTarget.style.borderColor = navBorder;
                  handleLinkHover(href);
                },
                onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.color = linkClr; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; },
              } : {};
              const isHashAnchor = href.includes('#');
              return (newTab || isHashAnchor)
                ? <a key={label} href={href} style={s}
                    target={newTab ? "myfm_journal" : undefined}
                    rel={newTab ? "noopener noreferrer" : undefined}
                    onClick={isHashAnchor ? (e) => handleHashClick(e, href) : undefined}
                    {...handlers}>{label}</a>
                : <Link key={label} href={href} style={s} {...handlers}>{label}</Link>;
            })}
          </div>

          {/* Right: CTA buttons + toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }} className="hh-nav-desktop">
            {NAV_LINKS.filter(l => l.cta).map(({ label, href, cta }) => (
              <a key={label} href={href} target="myfm_journal" rel="noopener noreferrer" style={linkStyle(false, cta)}
                onMouseEnter={e => { if (cta === "solid") e.currentTarget.style.background = "#1d4ed8"; }}
                onMouseLeave={e => { if (cta === "solid") e.currentTarget.style.background = "#2563eb"; }}>
                {label}
              </a>
            ))}

            {/* Dark mode toggle */}
            <button onClick={() => setDarkMode(!dm)}
              style={{ width: 42, height: 23, borderRadius: 12, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "background 0.3s", padding: 0, flexShrink: 0, marginLeft: 4 }}>
              <div style={{ position: "absolute", left: dm ? 21 : 2, top: 2, width: 19, height: 19, borderRadius: "50%", background: dm ? "#60a5fa" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "left 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
          </div>

          {/* Mobile controls */}
          <div style={{ display: "none", alignItems: "center", gap: 8 }} className="hh-mob-controls">
            <button onClick={() => setDarkMode(!dm)}
              style={{ width: 42, height: 23, borderRadius: 12, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "background 0.3s", padding: 0, flexShrink: 0 }}>
              <div style={{ position: "absolute", left: dm ? 21 : 2, top: 2, width: 19, height: 19, borderRadius: "50%", background: dm ? "#60a5fa" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "left 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
            <button onClick={() => setMobileOpen(!mobileOpen)}
              style={{ width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: dm ? "#0c1219" : "#f1f5f9", border: `1px solid ${navBorder}`, borderRadius: 7, cursor: "pointer", color: logoClr, transition: "background 0.2s" }}>
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div style={{ background: mobBg, borderBottom: `1px solid ${navBorder}` }} className="hh-mob-dropdown">
          {NAV_LINKS.map(({ label, href, newTab, cta }) => {
            const isActive = !newTab && (activePath === href || (href !== "/" && activePath?.startsWith(href)));
            const s: React.CSSProperties = {
              display: "flex", alignItems: "center",
              padding: "14px 24px", borderBottom: `1px solid ${mobRow}`,
              fontFamily: "'Montserrat',sans-serif", fontWeight: 700,
              fontSize: 12, letterSpacing: "0.08em",
              color: isActive ? "#2563eb" : (cta === "solid" ? "#2563eb" : (dm ? "#94a3b8" : "#475569")),
              textDecoration: "none", cursor: "pointer",
              background: isActive ? (dm ? "rgba(37,99,235,0.08)" : "rgba(37,99,235,0.05)") : "transparent",
            };
            const isHashAnchor = href.includes('#');
            return (newTab || isHashAnchor)
              ? <a key={label} href={href}
                  target={newTab ? "myfm_journal" : undefined}
                  rel={newTab ? "noopener noreferrer" : undefined}
                  style={s}
                  onClick={(e) => { setMobileOpen(false); if (isHashAnchor) handleHashClick(e, href); }}>{label}</a>
              : <Link key={label} href={href} style={s} onClick={() => setMobileOpen(false)}>{label}</Link>;
          })}
        </div>
      )}

      <style>{`
        @media (max-width: 1080px) {
          .hh-nav-desktop { display: none !important; }
          .hh-mob-controls { display: flex !important; }
        }
        .hh-mob-dropdown { display: none; }
        .hh-mob-dropdown.open { display: block; }
      `}</style>
    </div>
  );
}
