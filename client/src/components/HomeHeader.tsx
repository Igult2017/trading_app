import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchIfEmpty } from "@/lib/prefetchCalendar";
import { Menu, Sun, Moon, X } from "lucide-react";

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

  const navBg     = dm ? "rgba(2,8,23,0.88)"        : "rgba(255,255,255,0.94)";
  const navBorder = dm ? "#1e293b"                   : "#e2e8f0";
  const logoClr   = dm ? "#ffffff"                   : "#0f172a";
  const linkClr   = dm ? "#94a3b8"                   : "#64748b";
  const linkHov   = dm ? "#ffffff"                   : "#0f172a";
  const pillBg    = dm ? "rgba(30,41,59,0.5)"        : "rgba(241,245,249,0.8)";
  const mobBg     = dm ? "#0c1322"                   : "#ffffff";
  const shadow    = scrolled
    ? dm ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.08)"
    : "none";

  const hFont = { fontFamily: "'Oswald', sans-serif",           fontWeight: 700, letterSpacing: "0.02em" } as const;
  const nFont = { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 } as const;

  const handleLinkHover = useCallback((href: string) => {
    if (!PREFETCH_HREFS.has(href) || prefetchedRef.current.has(href)) return;
    prefetchedRef.current.add(href);
    prefetchIfEmpty(qc);
  }, [qc]);

  const scrollToHash = (hash: string) => {
    const el = document.getElementById(hash);
    if (!el) return false;
    const header = document.querySelector("nav") as HTMLElement | null;
    const offset = header ? header.getBoundingClientRect().height : 64;
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
    ...nFont, fontSize: 13,
    color: isActive ? "#3b82f6" : linkClr,
    textDecoration: "none",
    padding: "5px 11px",
    borderRadius: 9999,
    transition: "all 0.2s",
    whiteSpace: "nowrap",
    background: isActive ? (dm ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)") : "transparent",
  });

  return (
    <nav style={{
      position: "fixed", top: 0, width: "100%", zIndex: 50,
      background: navBg, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      borderBottom: `1px solid ${scrolled ? navBorder : "transparent"}`,
      boxShadow: shadow, transition: "all 0.3s ease",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>

          <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span style={{ ...hFont, fontSize: 18, color: logoClr }}>
              Myfm<span style={{ color: "#3b82f6" }}>Journal</span>
            </span>
          </Link>

          {/* Desktop — nav links in a pill capsule */}
          <div className="hidden md:flex items-center" style={{ gap: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 2,
              background: pillBg, border: `1px solid ${navBorder}`,
              borderRadius: 9999, padding: "3px 4px",
            }}>
              {NAV_LINKS.map(({ label, href }) => {
                const isHash = href.includes("#");
                const isActive = !isHash && !!activePath && (activePath === href || (href !== "/" && activePath.startsWith(href.split("?")[0])));
                const style = linkStyle(isActive);
                if (isHash) return (
                  <a key={label} href={href} style={style}
                    onClick={e => handleHashClick(e as any, href)}
                    onMouseEnter={e => { handleLinkHover(href); (e.currentTarget as HTMLElement).style.color = linkHov; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive ? "#3b82f6" : linkClr; }}>
                    {label}
                  </a>
                );
                return (
                  <Link key={label} href={href} style={style}
                    onMouseEnter={e => { handleLinkHover(href); (e.currentTarget as HTMLElement).style.color = linkHov; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive ? "#3b82f6" : linkClr; }}>
                    {label}
                  </Link>
                );
              })}
            </div>

            {/* Auth CTAs */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Link href="/auth" style={{
                ...nFont, fontSize: 13, color: linkClr, textDecoration: "none",
                padding: "6px 14px", borderRadius: 9999, border: `1px solid ${navBorder}`,
                transition: "all 0.2s", whiteSpace: "nowrap",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = linkHov; (e.currentTarget as HTMLElement).style.borderColor = dm ? "#475569" : "#cbd5e1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = linkClr; (e.currentTarget as HTMLElement).style.borderColor = navBorder; }}>
                Login
              </Link>
              <Link href="/auth?mode=signup" style={{
                ...nFont, fontSize: 13, color: "#ffffff", textDecoration: "none",
                padding: "6px 16px", borderRadius: 9999, background: "#2563eb",
                transition: "all 0.2s", whiteSpace: "nowrap",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#1d4ed8"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#2563eb"; }}>
                Sign up free
              </Link>
            </div>

            {/* Dark mode toggle */}
            <button onClick={() => setDarkMode(!dm)} aria-label="Toggle dark mode"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 22, borderRadius: 11, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "all 0.3s", padding: 0, flexShrink: 0 }}>
              <div style={{ position: "absolute", left: dm ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: dm ? "#60a5fa" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
          </div>

          {/* Mobile controls */}
          <div className="md:hidden flex items-center gap-2">
            <button onClick={() => setDarkMode(!dm)} aria-label="Toggle dark mode"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 22, borderRadius: 11, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "all 0.3s", padding: 0 }}>
              <div style={{ position: "absolute", left: dm ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: dm ? "#60a5fa" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)}
              style={{ color: logoClr, background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{ background: mobBg, borderTop: `1px solid ${navBorder}`, boxShadow: "0 16px 40px rgba(0,0,0,0.15)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 28px 24px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px 16px" }}>
            {[...NAV_LINKS, { label: "Login", href: "/auth" }, { label: "Sign up free", href: "/auth?mode=signup" }].map(({ label, href }) => {
              const isHash = href.includes("#");
              const style: React.CSSProperties = { ...nFont, fontSize: 13, color: linkClr, textDecoration: "none", display: "block" };
              if (isHash) return (
                <a key={label} href={href} style={style}
                  onClick={e => { setMenuOpen(false); handleHashClick(e as any, href); }}>{label}</a>
              );
              return <Link key={label} href={href} style={style} onClick={() => setMenuOpen(false)}>{label}</Link>;
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
