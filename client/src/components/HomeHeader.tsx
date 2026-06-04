import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchIfEmpty } from "@/lib/prefetchCalendar";
import { Menu, Sun, Moon } from "lucide-react";

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
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const prefetchedRef = useRef(new Set<string>());
  const dm = darkMode;

  // Same theme tokens as the landing page
  const navBg     = dm ? "rgba(2,8,23,0.85)"       : "rgba(255,255,255,0.92)";
  const navBorder = dm ? "#1e293b"                  : "#e2e8f0";
  const logoClr   = dm ? "#ffffff"                  : "#0f172a";
  const linkClr   = dm ? "#94a3b8"                  : "#475569";
  const linkHov   = dm ? "#ffffff"                  : "#0f172a";
  const mobBg     = dm ? "#0f172a"                  : "#ffffff";

  const headerFont = { fontFamily: "'Oswald', sans-serif",    fontWeight: 700, letterSpacing: "0.02em" } as const;
  const navFont    = { fontFamily: "'Montserrat', sans-serif", fontWeight: 800 } as const;

  const handleLinkHover = useCallback((href: string) => {
    if (!PREFETCH_HREFS.has(href)) return;
    if (prefetchedRef.current.has(href)) return;
    prefetchedRef.current.add(href);
    prefetchIfEmpty(qc);
  }, [qc]);

  const scrollToHash = (hash: string) => {
    const el = document.getElementById(hash);
    if (!el) return false;
    const header = document.querySelector("nav") as HTMLElement | null;
    const headerH = header ? header.getBoundingClientRect().height : 64;
    const top = el.getBoundingClientRect().top + window.scrollY - headerH - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&family=Poppins:wght@300;400;500;600;700&display=swap');
      `}</style>

      <nav style={{ position: "fixed", top: 0, width: "100%", background: navBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${navBorder}`, zIndex: 50, transition: "all 0.4s ease" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>

            {/* Logo — identical to footer and homepage nav */}
            <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
              <span style={{ ...headerFont, fontSize: 18, color: logoClr }}>
                Myfm<span style={{ color: "#3b82f6" }}>Journal</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center" style={{ gap: 4 }}>
              {NAV_LINKS.map(({ label, href }) => {
                const isHash = href.includes("#");
                const isActive = !isHash && !!activePath && (activePath === href || (href !== "/" && activePath.startsWith(href.split("?")[0])));
                const style: React.CSSProperties = {
                  ...navFont,
                  fontSize: 13,
                  color: isActive ? "#3b82f6" : linkClr,
                  textDecoration: "none",
                  padding: "6px 10px",
                  borderRadius: 6,
                  transition: "color 0.2s",
                  whiteSpace: "nowrap",
                };
                if (isHash) return (
                  <a key={label} href={href}
                    onClick={e => handleHashClick(e as any, href)}
                    onMouseEnter={e => { handleLinkHover(href); (e.currentTarget as HTMLElement).style.color = linkHov; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive ? "#3b82f6" : linkClr; }}
                    style={style}>{label}</a>
                );
                return (
                  <Link key={label} href={href}
                    onMouseEnter={e => { handleLinkHover(href); (e.currentTarget as HTMLElement).style.color = linkHov; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive ? "#3b82f6" : linkClr; }}
                    style={style}>{label}</Link>
                );
              })}

              {/* Login / Signup */}
              <Link href="/auth"
                style={{ ...navFont, fontSize: 13, color: linkClr, textDecoration: "none", padding: "6px 10px", transition: "color 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = linkHov; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = linkClr; }}>
                Login
              </Link>
              <Link href="/auth?mode=signup"
                style={{ ...navFont, fontSize: 13, color: linkClr, textDecoration: "none", padding: "6px 10px", transition: "color 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = linkHov; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = linkClr; }}>
                Signup
              </Link>

              {/* Dark mode toggle — same pill style as homepage */}
              <button
                onClick={() => setDarkMode(!dm)}
                aria-label="Toggle dark mode"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 22, borderRadius: 11, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "all 0.3s ease", padding: 0, flexShrink: 0, marginLeft: 4 }}>
                <div style={{ position: "absolute", left: dm ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: dm ? "#60a5fa" : "#ffffff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all 0.3s ease", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
                </div>
              </button>
            </div>

            {/* Mobile controls */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={() => setDarkMode(!dm)}
                aria-label="Toggle dark mode"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 22, borderRadius: 11, background: dm ? "#1e40af" : "#e2e8f0", border: "none", cursor: "pointer", position: "relative", transition: "all 0.3s ease", padding: 0 }}>
                <div style={{ position: "absolute", left: dm ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: dm ? "#60a5fa" : "#ffffff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", transition: "all 0.3s ease", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
                </div>
              </button>
              <button onClick={() => setMenuOpen(!menuOpen)}
                style={{ color: logoClr, background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <Menu size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div style={{ background: mobBg, borderTop: `1px solid ${navBorder}`, borderBottom: `1px solid ${navBorder}`, boxShadow: "0 16px 32px rgba(0,0,0,0.15)", transition: "all 0.4s ease" }}>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 grid grid-cols-3 gap-x-4 gap-y-3">
              {[...NAV_LINKS, { label: "Login", href: "/auth" }, { label: "Signup", href: "/auth?mode=signup" }].map(({ label, href }) => {
                const isHash = href.includes("#");
                const style: React.CSSProperties = { ...navFont, fontSize: 13, color: linkClr, textDecoration: "none", display: "block" };
                if (isHash) return (
                  <a key={label} href={href}
                    onClick={e => { setMenuOpen(false); handleHashClick(e as any, href); }}
                    style={style}>{label}</a>
                );
                return (
                  <Link key={label} href={href} onClick={() => setMenuOpen(false)} style={style}>{label}</Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
