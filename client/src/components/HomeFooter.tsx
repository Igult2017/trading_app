import { Link } from "wouter";

const PLATFORM = [
  { label: "Trade Journal", href: "/journal"  },
  { label: "Analytics",     href: "/journal"  },
  { label: "Blog",          href: "/blog"     },
  { label: "Calendar",      href: "/calendar" },
  { label: "Sessions",      href: "/tsc"      },
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

const COLS = [
  { heading: "Platform", links: PLATFORM },
  { heading: "Company",  links: COMPANY  },
  { heading: "Legal",    links: LEGAL    },
];

export interface HomeFooterProps { darkMode?: boolean; }

export default function HomeFooter({ darkMode = false }: HomeFooterProps) {
  const bg      = darkMode ? "#0b1120" : "#0f172a";
  const text    = "#ffffff";
  const muted   = "#64748b";
  const linkClr = "#94a3b8";
  const hover   = "#ffffff";
  const divider = "#1e293b";

  const hFont = { fontFamily: "'DM Serif Display', serif",      fontWeight: 400, letterSpacing: "0.01em" } as const;
  const bFont = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const;
  const capStyle: React.CSSProperties = { ...bFont, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: muted, marginBottom: 18, display: "block" };

  return (
    <footer style={{ background: bg, ...bFont }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px" }}>

        {/* Main columns */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "48px 64px", padding: "64px 0 52px", alignItems: "flex-start" }}>

          {/* Brand */}
          <div style={{ flex: "0 0 220px" }}>
            <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
              <span style={{ ...hFont, fontSize: 20, color: text }}>
                Myfm<span style={{ color: "#3b82f6" }}>Journal</span>
              </span>
            </Link>
            <p style={{ fontSize: 13, color: linkClr, lineHeight: 1.8, margin: 0, maxWidth: 200 }}>
              Professional trading journal<br />
              for serious traders.
            </p>
          </div>

          {/* Link columns */}
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "40px 64px", justifyContent: "flex-end" }}>
            {COLS.map(({ heading, links }) => (
              <div key={heading} style={{ minWidth: 130 }}>
                <span style={capStyle}>{heading}</span>
                {links.map(({ label, href }) => {
                  const base: React.CSSProperties = { display: "block", fontSize: 13.5, color: linkClr, textDecoration: "none", marginBottom: 12, ...bFont, transition: "color 0.18s" };
                  const isHash = href.includes("#");
                  if (isHash) return (
                    <a key={label} href={href} style={base}
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
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: `1px solid ${divider}`, padding: "20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 12, color: muted, ...bFont }}>
            © {new Date().getFullYear()} MyfmJournal. All rights reserved.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {LEGAL.map(({ label, href }, i) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span style={{ color: divider, fontSize: 12 }}>·</span>}
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
