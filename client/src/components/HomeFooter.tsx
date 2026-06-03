import { useState } from "react";
import { Link } from "wouter";

const SOCIAL_ICONS = [
  { label: "Twitter (X)", href: "#", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: "YouTube",     href: "#", path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { label: "Facebook",    href: "#", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { label: "Instagram",   href: "#", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
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

export default function HomeFooter({ darkMode }: HomeFooterProps) {
  const [email, setEmail] = useState("");

  return (
    <footer style={{ background: "#ffffff", borderTop: "1px solid #e2e8f0", fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        .hf2-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.2fr;gap:60px;padding:60px 0 48px}
        .hf2-bottom{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
        .hf2-lnk{font-size:13px;color:#64748b;text-decoration:none;transition:color 0.2s;display:block;margin-bottom:10px;font-family:'DM Sans',sans-serif}
        .hf2-lnk:hover{color:#0f172a}
        .hf2-social-icon{width:34px;height:34px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid #e2e8f0;transition:all 0.2s;flex-shrink:0}
        .hf2-social-icon:hover{border-color:#2563eb;background:rgba(37,99,235,0.06)}
        .hf2-social-row{display:flex;align-items:center;gap:10px;color:#64748b;text-decoration:none;font-size:13px;transition:color 0.2s;margin-bottom:10px}
        .hf2-social-row:hover{color:#0f172a}
        .hf2-copy-lnk{font-size:12px;color:#94a3b8;text-decoration:none;transition:color 0.2s}
        .hf2-copy-lnk:hover{color:#0f172a}
        @media(max-width:900px){.hf2-grid{grid-template-columns:1fr 1fr;gap:36px;padding:48px 0 40px}}
        @media(max-width:520px){.hf2-grid{grid-template-columns:1fr;gap:28px;padding:36px 0 28px}.hf2-bottom{flex-direction:column;align-items:flex-start}}
      `}</style>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
        <div className="hf2-grid">

          {/* Brand + newsletter */}
          <div>
            <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 14 }}>
              <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>
                Myfm<span style={{ color: "#2563eb" }}>Journal</span>
              </span>
            </Link>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.75, marginBottom: 22, maxWidth: 240, margin: "0 0 22px" }}>
              A professional-grade trading journal and analytics platform built for serious traders.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "'DM Sans',sans-serif", background: "#fff", color: "#0f172a", outline: "none", minWidth: 0 }}
              />
              <button
                onClick={() => setEmail("")}
                style={{ padding: "8px 14px", borderRadius: 8, background: "#2563eb", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", flexShrink: 0 }}>
                Subscribe
              </button>
            </div>
          </div>

          {/* Community / social */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 18, letterSpacing: "0.02em" }}>Community</div>
            {SOCIAL_ICONS.map(({ label, href, path }) => (
              <a key={label} href={href} className="hf2-social-row">
                <span className="hf2-social-icon">
                  <svg viewBox="0 0 24 24" width={13} height={13} fill="#64748b"><path d={path} /></svg>
                </span>
                {label}
              </a>
            ))}
          </div>

          {/* Resources */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 18 }}>Resources</div>
            {RESOURCES.map(({ label, href }) => (
              <Link key={label} href={href} className="hf2-lnk">{label}</Link>
            ))}
          </div>

          {/* Legal */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 18 }}>Legal</div>
            {LEGAL.map(({ label, href }) => (
              <Link key={label} href={href} className="hf2-lnk">{label}</Link>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "18px 0" }}>
          <div className="hf2-bottom">
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              © {new Date().getFullYear()} MyfmJournal. All rights reserved.
            </span>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              {LEGAL.map(({ label, href }) => (
                <Link key={label} href={href} className="hf2-copy-lnk">{label}</Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
