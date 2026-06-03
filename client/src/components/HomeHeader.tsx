import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchIfEmpty } from "@/lib/prefetchCalendar";

const TICKER_DATA = [
  { symbol: "EUR/USD", price: "1.0847", change: "+0.12%", up: true },
  { symbol: "BTC/USD", price: "67,432", change: "+2.34%", up: true },
  { symbol: "GOLD",    price: "2,341.50", change: "-0.08%", up: false },
  { symbol: "SPX500",  price: "5,218.40", change: "+0.43%", up: true },
  { symbol: "GBP/USD", price: "1.2698",  change: "+0.07%", up: true },
  { symbol: "ETH/USD", price: "3,124.80", change: "+1.87%", up: true },
  { symbol: "OIL/WTI", price: "78.34",   change: "-0.55%", up: false },
  { symbol: "USD/JPY", price: "156.72",  change: "+0.21%", up: true },
];

const NAV_LINKS = [
  { label: "Features",          href: "/#features" },
  { label: "Pricing",           href: "/#pricing" },
  { label: "Reviews",           href: "/#reviews" },
  { label: "Economic Calendar", href: "/calendar" },
  { label: "Blog",              href: "/blog" },
  { label: "Sessions",          href: "/tsc" },
];

const PREFETCH_HREFS = new Set(["/calendar", "/blog"]);

export interface HomeHeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activePath?: string;
}

export function TickerTape({ dark }: { dark: boolean }) {
  const items = [...TICKER_DATA, ...TICKER_DATA];
  return (
    <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", overflow: "hidden", height: 36, display: "flex", alignItems: "center" }}>
      <style>{`@keyframes hh2-ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.hh2-ticker-wrap{display:flex;animation:hh2-ticker 35s linear infinite;white-space:nowrap}.hh2-ticker-wrap:hover{animation-play-state:paused}`}</style>
      <div className="hh2-ticker-wrap">
        {items.map((t, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 22px", borderRight: "1px solid rgba(255,255,255,0.07)", fontSize: 11, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
            <span style={{ color: "#64748b" }}>{t.symbol}</span>
            <span style={{ color: "#f1f5f9", fontWeight: 500 }}>{t.price}</span>
            <span style={{ color: t.up ? "#4ade80" : "#f87171" }}>{t.up ? "▲" : "▼"} {t.change}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HomeHeader({ darkMode, setDarkMode, activePath }: HomeHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const prefetchedRef = useRef(new Set<string>());
  const dm = darkMode;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLinkHover = useCallback((href: string) => {
    if (!PREFETCH_HREFS.has(href)) return;
    if (prefetchedRef.current.has(href)) return;
    prefetchedRef.current.add(href);
    prefetchIfEmpty(qc);
  }, [qc]);

  const scrollToHash = (hash: string) => {
    const el = document.getElementById(hash);
    if (!el) return false;
    const headerH = (document.getElementById("site-header")?.offsetHeight ?? 100) + 8;
    const top = el.getBoundingClientRect().top + window.scrollY - headerH;
    window.scrollTo({ top, behavior: "smooth" });
    return true;
  };

  const handleHashClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const hash = href.split("#")[1];
    if (!hash) return;
    if (scrollToHash(hash)) return;
    navigate("/");
    let attempts = 0;
    const tryScroll = () => {
      if (scrollToHash(hash)) return;
      if (attempts < 25) { attempts++; setTimeout(tryScroll, 60); }
    };
    setTimeout(tryScroll, 80);
  }, [navigate]);

  const navBg     = dm ? (scrolled ? "rgba(2,8,23,0.98)"    : "rgba(2,8,23,0.94)")    : (scrolled ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.93)");
  const navBorder = dm ? "#1e293b" : "#e2e8f0";
  const logoClr   = dm ? "#f1f5f9" : "#0f172a";
  const linkClr   = dm ? "#94a3b8" : "#64748b";
  const linkHov   = dm ? "#f1f5f9" : "#0f172a";
  const mobBg     = dm ? "#0c1219" : "#ffffff";
  const secClr    = dm ? "#94a3b8" : "#475569";
  const secBorder = dm ? "#334155" : "#cbd5e1";
  const toggleBg  = dm ? "#1e293b" : "#f1f5f9";

  return (
    <div id="site-header" style={{ position: "sticky", top: 0, zIndex: 100 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        .hh2-desktop{display:flex!important}.hh2-mobile{display:none!important}
        @media(max-width:1080px){.hh2-desktop{display:none!important}.hh2-mobile{display:flex!important}}
      `}</style>

      <TickerTape dark={dm} />

      <nav style={{ background: navBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${navBorder}`, transition: "background 0.3s ease" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, gap: 16 }}>

          {/* Logo */}
          <a href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 20, fontWeight: 800, color: logoClr, letterSpacing: "-0.5px" }}>
              Myfm<span style={{ color: "#2563eb" }}>Journal</span>
            </span>
          </a>

          {/* Desktop nav links */}
          <div className="hh2-desktop" style={{ display: "flex", gap: 2, alignItems: "center", flex: 1, justifyContent: "center" }}>
            {NAV_LINKS.map(({ label, href }) => {
              const isHash = href.includes("#");
              const isActive = !isHash && !!activePath && (activePath === href || (href !== "/" && activePath.startsWith(href.split("?")[0])));
              return (
                <a key={label} href={href}
                  onClick={isHash ? (e) => handleHashClick(e as any, href) : undefined}
                  onMouseEnter={(e) => { handleLinkHover(href); (e.currentTarget as HTMLElement).style.color = linkHov; (e.currentTarget as HTMLElement).style.background = dm ? "rgba(255,255,255,0.05)" : "#f8fafc"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = isActive ? "#2563eb" : linkClr; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, color: isActive ? "#2563eb" : linkClr, textDecoration: "none", padding: "7px 12px", borderRadius: 6, transition: "color 0.15s", whiteSpace: "nowrap", background: "transparent" }}>
                  {label}
                </a>
              );
            })}
          </div>

          {/* Desktop CTAs + toggle */}
          <div className="hh2-desktop" style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <a href="/auth" target="myfm_journal" rel="noopener noreferrer"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#2563eb"; (e.currentTarget as HTMLElement).style.color = "#2563eb"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = secBorder; (e.currentTarget as HTMLElement).style.color = secClr; }}
              style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: secClr, background: "transparent", border: `1.5px solid ${secBorder}`, padding: "8px 18px", borderRadius: 50, textDecoration: "none", transition: "all 0.2s", whiteSpace: "nowrap", cursor: "pointer" }}>
              Login
            </a>
            <a href="/auth?mode=signup" target="myfm_journal" rel="noopener noreferrer"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#1d4ed8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#2563eb"; }}
              style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: "#fff", background: "#2563eb", border: "none", padding: "8px 20px", borderRadius: 50, textDecoration: "none", transition: "all 0.2s", whiteSpace: "nowrap", cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}>
              Sign Up Free
            </a>
            <button onClick={() => setDarkMode(!dm)} title={dm ? "Light mode" : "Dark mode"}
              style={{ width: 40, height: 40, borderRadius: "50%", background: toggleBg, border: `1.5px solid ${navBorder}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, transition: "all 0.2s", flexShrink: 0 }}>
              {dm ? "☀️" : "🌙"}
            </button>
          </div>

          {/* Mobile controls */}
          <div className="hh2-mobile" style={{ display: "none", alignItems: "center", gap: 8 }}>
            <button onClick={() => setDarkMode(!dm)}
              style={{ width: 36, height: 36, borderRadius: "50%", background: toggleBg, border: `1.5px solid ${navBorder}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {dm ? "☀️" : "🌙"}
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)}
              style={{ width: 38, height: 38, borderRadius: 8, background: dm ? "#0c1219" : "#f1f5f9", border: `1px solid ${navBorder}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: logoClr }}>
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div style={{ background: mobBg, borderTop: `1px solid ${navBorder}`, padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {NAV_LINKS.map(({ label, href }) => {
              const isHash = href.includes("#");
              return (
                <a key={label} href={href}
                  onClick={e => { setMenuOpen(false); if (isHash) handleHashClick(e as any, href); }}
                  style={{ color: linkClr, textDecoration: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 15, padding: "4px 0" }}>
                  {label}
                </a>
              );
            })}
            <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
              <a href="/auth" target="myfm_journal" rel="noopener noreferrer"
                style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 50, border: `1.5px solid ${secBorder}`, color: secClr, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Login
              </a>
              <a href="/auth?mode=signup" target="myfm_journal" rel="noopener noreferrer"
                style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 50, background: "#2563eb", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                Sign Up Free
              </a>
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
