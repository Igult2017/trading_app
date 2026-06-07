import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchIfEmpty } from "@/lib/prefetchCalendar";
import { Menu, Sun, Moon, X } from "lucide-react";

const TICKER_ITEMS = [
  { symbol: "BTC/USD",  price: "67,204",  change: "-1.34%", up: false },
  { symbol: "GOLD",     price: "2,318.4", change: "+0.45%", up: true  },
  { symbol: "SPX500",   price: "5,236.1", change: "+0.28%", up: true  },
  { symbol: "GBP/USD",  price: "1.2691",  change: "-0.08%", up: false },
  { symbol: "ETH/USD",  price: "3,512.7", change: "+2.11%", up: true  },
  { symbol: "OIL/WTI",  price: "78.34",   change: "-0.67%", up: false },
  { symbol: "USD/JPY",  price: "156.72",  change: "+0.19%", up: true  },
  { symbol: "EUR/USD",  price: "1.0842",  change: "+0.12%", up: true  },
];

function TickerBand() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{ background: "#080c10", borderBottom: "1px solid #0f1923", height: 32, overflow: "hidden", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes hh-ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .hh-ticker-wrap { display:flex; animation: hh-ticker 40s linear infinite; will-change:transform; }
        .hh-ticker-wrap:hover { animation-play-state: paused; }
      `}</style>
      <div className="hh-ticker-wrap">
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

const NAV_LINKS = [
  { label: "Features",  href: "/#features" },
  { label: "Pricing",   href: "/#pricing"  },
  { label: "Reviews",   href: "/#reviews"  },
  { label: "Calendar",  href: "/calendar"  },
  { label: "Blog",      href: "/blog"      },
  { label: "Sessions",  href: "/tsc"       },
];

const PREFETCH_HREFS = new Set(["/calendar", "/blog"]);

export interface HomeHeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activePath?: string;
}

export default function HomeHeader({ darkMode, setDarkMode, activePath }: HomeHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const prefetchedRef = useRef(new Set<string>());
  const dm = darkMode;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navBg     = dm ? "rgba(2,8,23,0.92)"  : "rgba(255,255,255,0.96)";
  const navBorder = dm ? "#1e293b"             : "#f1f5f9";
  const logoClr   = dm ? "#ffffff"             : "#0f172a";
  const linkClr   = dm ? "#94a3b8"             : "#64748b";
  const linkHov   = dm ? "#ffffff"             : "#0f172a";
  const mobBg     = dm ? "#0c1322"             : "#ffffff";
  const shadow    = scrolled
    ? dm ? "0 4px 24px rgba(0,0,0,0.5)" : "0 2px 16px rgba(0,0,0,0.06)"
    : "none";

  const hFont = { fontFamily: "'DM Serif Display', serif",     fontWeight: 400, letterSpacing: "0.01em" } as const;
  const nFont = { fontFamily: "'Inter', sans-serif", fontWeight: 400 } as const;

  const handleLinkHover = useCallback((href: string) => {
    if (!PREFETCH_HREFS.has(href) || prefetchedRef.current.has(href)) return;
    prefetchedRef.current.add(href);
    prefetchIfEmpty(qc);
  }, [qc]);

  const scrollToHash = (hash: string) => {
    const el = document.getElementById(hash);
    if (!el) return false;
    const header = document.querySelector("nav") as HTMLElement | null;
    const offset = header ? header.getBoundingClientRect().height : 68;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset - 16, behavior: "smooth" });
    return true;
  };

  const handleHashClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const hash = href.split("#")[1];
    if (!hash) return;
    if (scrollToHash(hash)) return;
    navigate("/");
    let tries = 0;
    const retry = () => { if (!scrollToHash(hash) && tries++ < 25) setTimeout(retry, 60); };
    setTimeout(retry, 80);
  }, [navigate]);

  const linkStyle = (isActive: boolean): React.CSSProperties => ({
    ...nFont, fontSize: 14,
    color: isActive ? "#2563eb" : linkClr,
    textDecoration: "none",
    padding: "4px 2px",
    borderBottom: isActive ? "1.5px solid #2563eb" : "1.5px solid transparent",
    transition: "color 0.2s, border-color 0.2s",
    whiteSpace: "nowrap",
  });

  const DarkToggle = () => (
    <button onClick={() => setDarkMode(!dm)} aria-label="Toggle dark mode"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 20, borderRadius: 3, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "all 0.3s", padding: 0, flexShrink: 0 }}>
      <div style={{ position: "absolute", left: dm ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: dm ? "#60a5fa" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {dm ? <Moon size={9} color="#0f172a" /> : <Sun size={9} color="#f59e0b" />}
      </div>
    </button>
  );

  return (
    <nav style={{
      position: "fixed", top: 0, width: "100%", zIndex: 50,
      background: navBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderBottom: `1px solid ${scrolled ? navBorder : "transparent"}`,
      boxShadow: shadow, transition: "all 0.3s ease",
    }}>
      <TickerBand />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 68 }}>

          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span style={{ ...hFont, fontSize: 21, color: logoClr }}>
              Myfm<span style={{ color: "#3b82f6" }}>Journal</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center" style={{ gap: 36 }}>
            {NAV_LINKS.map(({ label, href }) => {
              const isHash = href.includes("#");
              const isActive = !isHash && !!activePath && (activePath === href || (href !== "/" && activePath.startsWith(href.split("?")[0])));
              const style = linkStyle(isActive);
              if (isHash) return (
                <a key={label} href={href} style={style}
                  onClick={e => handleHashClick(e as any, href)}
                  onMouseEnter={e => { handleLinkHover(href); (e.currentTarget as HTMLElement).style.color = linkHov; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive ? "#2563eb" : linkClr; }}>
                  {label}
                </a>
              );
              return (
                <Link key={label} href={href} style={style}
                  onMouseEnter={e => { handleLinkHover(href); (e.currentTarget as HTMLElement).style.color = linkHov; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive ? "#2563eb" : linkClr; }}>
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right: Sign in + CTA + toggle */}
          <div className="hidden md:flex items-center" style={{ gap: 20 }}>
            <a href="/auth" target="myfm_journal"
              style={{ ...nFont, fontSize: 14, color: linkClr, textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = linkHov; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = linkClr; }}>
              Sign in
            </a>
            <a href="/auth?mode=signup" target="myfm_journal"
              style={{ ...nFont, fontSize: 13, fontWeight: 600, padding: "9px 18px", borderRadius: 4, background: "#2563eb", color: "#ffffff", textDecoration: "none", transition: "opacity 0.2s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}>
              Start free →
            </a>
            <DarkToggle />
          </div>

          {/* Mobile controls */}
          <div className="md:hidden flex items-center gap-3">
            <DarkToggle />
            <button onClick={() => setMenuOpen(!menuOpen)}
              style={{ color: logoClr, background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{ background: mobBg, borderTop: `1px solid ${navBorder}`, boxShadow: "0 16px 40px rgba(0,0,0,0.12)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 32px 24px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px 16px" }}>
            {[...NAV_LINKS, { label: "Sign in", href: "/auth", newTab: true }, { label: "Start free", href: "/auth?mode=signup", newTab: true }].map(({ label, href, newTab }) => {
              const isHash = href.includes("#");
              const style: React.CSSProperties = { ...nFont, fontSize: 14, color: linkClr, textDecoration: "none", display: "block" };
              if (isHash) return (
                <a key={label} href={href} style={style}
                  onClick={e => { setMenuOpen(false); handleHashClick(e as any, href); }}>{label}</a>
              );
              if (newTab) return (
                <a key={label} href={href} target="myfm_journal" style={style} onClick={() => setMenuOpen(false)}>{label}</a>
              );
              return <Link key={label} href={href} style={style} onClick={() => setMenuOpen(false)}>{label}</Link>;
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
