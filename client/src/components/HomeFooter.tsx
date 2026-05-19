import { Link } from 'wouter';

const SOCIAL_ICONS = [
  { label: 'Twitter',   color: '#ffffff', bg: '#000000',                                                       border: '#333333', path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: 'YouTube',   color: '#ffffff', bg: '#FF0000',                                                       border: '#FF0000', path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { label: 'Facebook',  color: '#ffffff', bg: '#1877F2',                                                       border: '#1877F2', path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { label: 'Instagram', color: '#ffffff', bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', border: '#dc2743', path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
];

const MARKETS = [
  { label: 'Major Forex Pairs',       href: '#' },
  { label: 'US Indices (NAS/SPX)',    href: '#' },
  { label: 'Commodities (Gold/Oil)',  href: '#' },
  { label: 'Cryptocurrency',          href: '#' },
];

const RESOURCES = [
  { label: 'Free Trading Journal', href: '/journal', newTab: true },
  { label: 'Session Clock (TSC)',  href: '/tsc' },
  { label: 'Economic Calendar',   href: '/calendar' },
  { label: 'Traders Blog',        href: '/blog' },
  { label: 'Copier',              href: '#' },
];

const LEGAL = [
  { label: 'Privacy Policy',  href: '/legal' },
  { label: 'Support',         href: '/legal' },
  { label: 'Terms of Service',href: '/legal' },
  { label: 'Contact',         href: '/legal' },
];

interface HomeFooterProps {
  darkMode?: boolean;
}

export default function HomeFooter({ darkMode = false }: HomeFooterProps) {
  const dm = darkMode;

  const bg          = dm ? '#080c10' : '#f1f5f9';
  const border      = dm ? '#0f1923' : '#e2e8f0';
  const heading     = dm ? '#c8d8e8' : '#334155';
  const logo        = dm ? '#ffffff' : '#0f172a';
  const linkClr     = '#3b82f6';
  const linkHover   = dm ? '#60a5fa' : '#1d4ed8';
  const inputBg     = dm ? '#0c1219' : '#ffffff';
  const inputBorder = dm ? '#172233' : '#cbd5e1';
  const inputText   = dm ? '#c8d8e8' : '#334155';
  const copyright   = dm ? '#4a6580' : '#64748b';
  const copyrightHv = dm ? '#c8d8e8' : '#0f172a';
  const risk        = dm ? '#2a3a4a' : '#94a3b8';

  return (
    <footer style={{ background: bg, borderTop: `1px solid ${border}`, padding: '60px 24px 0', transition: 'background 0.3s, border-color 0.3s' }}>
      <style>{`
        .hf-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:48px; padding-bottom:60px; }
        .hf-bottom { display:flex; justify-content:space-between; align-items:center; }
        .hf-legal { display:flex; gap:24px; }
        .hf-link { font-family:'Montserrat',sans-serif; font-weight:600; font-size:12px; letter-spacing:0.02em; color:${linkClr}; text-decoration:none; transition:color 0.2s; }
        .hf-link:hover { color:${linkHover}; }
        .hf-copyright-link { font-family:'Montserrat',sans-serif; font-weight:600; font-size:11px; letter-spacing:0.04em; color:${copyright}; text-decoration:none; transition:color 0.2s; white-space:nowrap; }
        .hf-copyright-link:hover { color:${copyrightHv}; }
        @media (max-width: 900px) { .hf-grid { grid-template-columns:1fr 1fr; gap:36px; } }
        @media (max-width: 560px) {
          .hf-grid { grid-template-columns:1fr; gap:32px; }
          .hf-bottom { flex-direction:column; align-items:flex-start; gap:12px; }
          .hf-legal { flex-wrap:wrap; gap:16px; }
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="hf-grid">

          {/* Brand + Social */}
          <div>
            <div style={{ marginBottom: 28 }}>
              <Link href="/" style={{ textDecoration: 'none' }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.01em', fontFamily: "'Montserrat',sans-serif" }}>
                  <span style={{ color: logo }}>My FM</span>
                  <span style={{ color: '#3b82f6' }}> | Journal</span>
                </span>
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {SOCIAL_ICONS.map(({ label, path, color, bg: iconBg, border: iconBorder }) => (
                <a key={label} href="#" aria-label={label}
                  style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${iconBorder}`, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, textDecoration: 'none', transition: 'opacity 0.2s, transform 0.15s', opacity: 0.85 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1)'; }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
                </a>
              ))}
            </div>
          </div>

          {/* Markets */}
          <div>
            <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', color: heading, marginBottom: 24, marginTop: 0 }}>Markets</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {MARKETS.map(({ label, href }) => (
                <a key={label} href={href} className="hf-link">{label}</a>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', color: heading, marginBottom: 24, marginTop: 0 }}>Resources</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {RESOURCES.map(({ label, href, newTab }) => (
                <Link key={label} href={href}
                  target={newTab ? 'myfm_journal' : undefined}
                  rel={newTab ? 'noopener noreferrer' : undefined}
                  className="hf-link">
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Stay Updated */}
          <div>
            <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', color: heading, marginBottom: 16, marginTop: 0 }}>Stay Updated</h4>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, fontWeight: 600, color: linkClr, letterSpacing: '0.02em', lineHeight: 1.7, marginBottom: 20 }}>
              Get data-backed strategies with real edge directly into your inbox
            </p>
            <div style={{ display: 'flex' }}>
              <input type="email" placeholder="Email address"
                style={{ flex: 1, minWidth: 0, background: inputBg, border: `1px solid ${inputBorder}`, borderRight: 'none', borderRadius: '4px 0 0 4px', padding: '10px 14px', color: inputText, fontSize: 12, fontFamily: "'Montserrat',sans-serif", fontWeight: 500, letterSpacing: '0.02em', outline: 'none', transition: 'background 0.3s, border-color 0.3s' }}
              />
              <button
                style={{ flexShrink: 0, background: '#2563eb', border: 'none', borderRadius: '0 4px 4px 0', padding: '10px 18px', color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}>
                Join
              </button>
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: `1px solid ${border}`, padding: '24px 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="hf-bottom">
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', color: copyright }}>
              © {new Date().getFullYear()} My FM | Journal — All rights reserved
            </span>
            <div className="hf-legal">
              {LEGAL.map(item => (
                <Link key={item.label} href={item.href} className="hf-copyright-link">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: '0.03em', color: risk, lineHeight: 1.6, margin: 0 }}>
            Risk warning: Trading financial markets involves significant risk. My FM | Journal provides educational content and data analytics for informational purposes only. Past performance is not indicative of future results. Never trade with money you cannot afford to lose.
          </p>
        </div>
      </div>
    </footer>
  );
}
