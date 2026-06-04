import { useState } from "react";
import { Link } from "wouter";
import { FaXTwitter, FaYoutube, FaFacebook, FaInstagram } from "react-icons/fa6";

const SOCIAL_LINKS = [
  { label: "Twitter (X)", href: "#", Icon: FaXTwitter,  color: "#000000" },
  { label: "YouTube",     href: "#", Icon: FaYoutube,   color: "#FF0000" },
  { label: "Facebook",    href: "#", Icon: FaFacebook,  color: "#1877F2" },
  { label: "Instagram",   href: "#", Icon: FaInstagram, color: "#E1306C" },
];

const RESOURCES = [
  { label: "Free Trading Journal", href: "/journal" },
  { label: "Sessions",             href: "/tsc" },
  { label: "Economic Calendar",    href: "/calendar" },
  { label: "Blog",                 href: "/blog" },
];

const LEGAL = [
  { label: "Privacy Policy",   href: "/legal?tab=privacy" },
  { label: "Terms of Service", href: "/legal?tab=terms" },
  { label: "Support",          href: "/support" },
  { label: "Contact",          href: "/legal?tab=contact" },
];

export interface HomeFooterProps {
  darkMode?: boolean;
}

export default function HomeFooter({ darkMode = false }: HomeFooterProps) {
  const [email, setEmail] = useState("");

  // Same theme tokens used by the landing page header
  const bg          = darkMode ? "#0f172a"  : "#ffffff";
  const border      = darkMode ? "#1e293b"  : "#e2e8f0";
  const text        = darkMode ? "#ffffff"  : "#0f172a";
  const textMuted   = darkMode ? "#94a3b8"  : "#64748b";
  const linkHover   = darkMode ? "#ffffff"  : "#0f172a";
  const inputBg     = darkMode ? "#1e293b"  : "#ffffff";
  const iconFill    = darkMode ? "#94a3b8"  : "#64748b";
  const iconBorder  = darkMode ? "#334155"  : "#e2e8f0";

  // Same font stack as the header
  const headerFont  = { fontFamily: "'Oswald', sans-serif",     fontWeight: 700, letterSpacing: "0.02em" } as const;
  const navFont     = { fontFamily: "'Montserrat', sans-serif",  fontWeight: 700 } as const;
  const bodyFont    = { fontFamily: "'Poppins', sans-serif" } as const;

  return (
    <footer style={{ background: bg, borderTop: `1px solid ${border}`, transition: "all 0.4s ease", ...bodyFont }}>

      {/* ── Same maxWidth:1280 + padding:28px as all page content ── */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 28px" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 py-14">

          {/* Brand + newsletter */}
          <div>
            <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 14 }}>
              {/* Identical logo to the nav: Oswald font, same colors */}
              <span style={{ ...headerFont, fontSize: 20, color: text }}>
                Myfm<span style={{ color: "#3b82f6" }}>Journal</span>
              </span>
            </Link>

            <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.75, marginBottom: 20, maxWidth: 240 }}>
              A professional-grade trading journal and analytics platform built for serious traders.
            </p>

            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${border}`, fontSize: 13, ...bodyFont, background: inputBg, color: text, outline: "none", minWidth: 0, transition: "all 0.4s ease" }}
              />
              <button
                onClick={() => setEmail("")}
                style={{ padding: "8px 14px", borderRadius: 8, background: "#2563eb", color: "#fff", border: "none", fontSize: 12, cursor: "pointer", ...navFont, whiteSpace: "nowrap", flexShrink: 0 }}>
                Subscribe
              </button>
            </div>
          </div>

          {/* Community */}
          <div>
            <div style={{ ...navFont, fontSize: 13, color: text, marginBottom: 16 }}>Community</div>
            {SOCIAL_LINKS.map(({ label, href, Icon, color }) => (
              <a key={label} href={href}
                style={{ display: "flex", alignItems: "center", gap: 10, color: textMuted, textDecoration: "none", fontSize: 13, marginBottom: 10, transition: "color 0.2s", ...bodyFont }}
                onMouseEnter={e => (e.currentTarget.style.color = linkHover)}
                onMouseLeave={e => (e.currentTarget.style.color = textMuted)}>
                <span style={{ width: 34, height: 34, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${iconBorder}`, flexShrink: 0, transition: "all 0.4s ease" }}>
                  <Icon size={15} color={color} />
                </span>
                {label}
              </a>
            ))}
          </div>

          {/* Resources */}
          <div>
            <div style={{ ...navFont, fontSize: 13, color: text, marginBottom: 16 }}>Resources</div>
            {RESOURCES.map(({ label, href }) => (
              <Link key={label} href={href}
                style={{ display: "block", fontSize: 13, color: textMuted, textDecoration: "none", marginBottom: 10, transition: "color 0.2s", ...bodyFont }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = linkHover)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = textMuted)}>
                {label}
              </Link>
            ))}
          </div>

          {/* Legal */}
          <div>
            <div style={{ ...navFont, fontSize: 13, color: text, marginBottom: 16 }}>Legal</div>
            {LEGAL.map(({ label, href }) => (
              <Link key={label} href={href}
                style={{ display: "block", fontSize: 13, color: textMuted, textDecoration: "none", marginBottom: 10, transition: "color 0.2s", ...bodyFont }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = linkHover)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = textMuted)}>
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: `1px solid ${border}`, padding: "18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, transition: "all 0.4s ease" }}>
          <span style={{ fontSize: 12, color: textMuted, ...bodyFont }}>
            © {new Date().getFullYear()} MyfmJournal. All rights reserved.
          </span>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {LEGAL.map(({ label, href }) => (
              <Link key={label} href={href}
                style={{ fontSize: 12, color: textMuted, textDecoration: "none", transition: "color 0.2s", ...bodyFont }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = linkHover)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = textMuted)}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
