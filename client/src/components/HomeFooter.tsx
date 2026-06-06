import { useCallback } from "react";
import { Link, useLocation } from "wouter";
import { FaXTwitter, FaYoutube, FaInstagram, FaTelegram, FaLinkedinIn } from "react-icons/fa6";

const PLATFORM = [
  { label: "Trade Journal", href: "/journal"   },
  { label: "Analytics",     href: "/analytics" },
  { label: "Blog",          href: "/blog"      },
  { label: "Calendar",      href: "/calendar"  },
  { label: "Sessions",      href: "/tsc"       },
];
const COMPANY = [
  { label: "Pricing",  href: "/#pricing"  },
  { label: "Features", href: "/#features" },
  { label: "Reviews",  href: "/#reviews"  },
  { label: "Support",  href: "/support"   },
];
const LEGAL = [
  { label: "Privacy Policy",   href: "/legal?tab=privacy" },
  { label: "Terms of Service", href: "/legal?tab=terms"   },
  { label: "Cookie Policy",    href: "/legal?tab=privacy" },
  { label: "Contact",          href: "/legal?tab=contact" },
];
const LINK_COLS = [
  { heading: "Platform", links: PLATFORM },
  { heading: "Company",  links: COMPANY  },
  { heading: "Legal",    links: LEGAL    },
];
const SOCIALS = [
  { Icon: FaXTwitter,   href: "#", label: "Twitter / X", brand: "#000000"  },
  { Icon: FaYoutube,    href: "#", label: "YouTube",      brand: "#FF0000"  },
  { Icon: FaInstagram,  href: "#", label: "Instagram",    brand: "#E1306C"  },
  { Icon: FaTelegram,   href: "#", label: "Telegram",     brand: "#0088CC"  },
  { Icon: FaLinkedinIn, href: "#", label: "LinkedIn",     brand: "#0A66C2"  },
];

export interface HomeFooterProps { darkMode?: boolean; }

export default function HomeFooter({ darkMode = false }: HomeFooterProps) {
  const [, navigate] = useLocation();
  const dm      = darkMode;
  const footBg  = dm ? '#0a0f1e' : '#f8fafc';
  const divider = dm ? '#1e293b' : '#e2e8f0';
  const logoClr = dm ? '#f1f5f9' : '#0f172a';
  const linkClr = dm ? '#64748b' : '#64748b';
  const hover   = dm ? '#f1f5f9' : '#0f172a';
  const muted   = dm ? '#475569' : '#94a3b8';
  const capClr  = dm ? '#334155' : '#94a3b8';
  const descClr = dm ? '#475569' : '#64748b';

  const hFont = { fontFamily: "'DM Serif Display', serif", fontWeight: 400, letterSpacing: "0.01em" } as const;
  const bFont = { fontFamily: "'Inter', sans-serif" } as const;
  const cap: React.CSSProperties = { ...bFont, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: capClr, marginBottom: 20, display: "block" };

  const scrollToHash = (hash: string) => {
    const el = document.getElementById(hash);
    if (!el) return false;
    const nav = document.querySelector("nav") as HTMLElement | null;
    const offset = nav ? nav.getBoundingClientRect().height : 68;
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

  return (
    <footer style={{ background: footBg, borderTop: `1px solid ${divider}`, transition: 'background 0.4s', ...bFont }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "220px 160px 1fr 1fr 1fr", gap: "0 48px", padding: "60px 0 48px", alignItems: "flex-start" }}>

          {/* Col 1 — Brand */}
          <div>
            <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 14 }}>
              <span style={{ ...hFont, fontSize: 20, color: logoClr }}>
                Myfm<span style={{ color: "#3b82f6" }}>Journal</span>
              </span>
            </Link>
            <p style={{ fontSize: 13, color: descClr, lineHeight: 1.8, margin: 0, ...bFont }}>
              Professional trading journal<br />for serious traders.
            </p>
          </div>

          {/* Col 2 — Social vertical */}
          <div>
            <span style={cap}>Follow Us</span>
            {SOCIALS.map(({ Icon, href, label, brand }) => (
              <a key={label} href={href} aria-label={label}
                style={{ display: "flex", alignItems: "center", gap: 10, color: linkClr, textDecoration: "none", fontSize: 13, marginBottom: 12, ...bFont, transition: "color 0.18s, opacity 0.18s" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                <Icon size={16} color={brand} style={{ flexShrink: 0 }} />
                {label}
              </a>
            ))}
          </div>

          {/* Cols 3-5 — Link columns */}
          {LINK_COLS.map(({ heading, links }) => (
            <div key={heading}>
              <span style={cap}>{heading}</span>
              {links.map(({ label, href }) => {
                const base: React.CSSProperties = { display: "block", fontSize: 13.5, color: linkClr, textDecoration: "none", marginBottom: 11, ...bFont, transition: "color 0.18s" };
                if (href.includes("#")) return (
                  <a key={label} href={href} style={base}
                    onClick={e => handleHashClick(e, href)}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = hover)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = linkClr)}>
                    {label}
                  </a>
                );
                return (
                  <Link key={label} href={href} style={base}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = hover)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = linkClr)}>
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: `1px solid ${divider}`, padding: "18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 12, color: muted, ...bFont }}>
            © {new Date().getFullYear()} MyfmJournal. All rights reserved.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {LEGAL.map(({ label, href }, i) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span style={{ color: divider }}>·</span>}
                <Link href={href}
                  style={{ fontSize: 12, color: muted, textDecoration: "none", ...bFont, transition: "color 0.18s" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = linkClr)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = muted)}>
                  {label}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
