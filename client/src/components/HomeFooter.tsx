import { Link } from 'wouter';

const SOCIAL_ICONS = [
  { label: 'Twitter', path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: 'YouTube', path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { label: 'Facebook', path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { label: 'Instagram', path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
];

const MARKETS = [
  { label: 'MAJOR FOREX PAIRS', href: '#' },
  { label: 'US INDICES (NAS/SPX)', href: '#' },
  { label: 'COMMODITIES (GOLD/OIL)', href: '#' },
  { label: 'CRYPTOCURRENCY', href: '#' },
];

const RESOURCES = [
  { label: 'FREE TRADING JOURNAL', href: '/journal' },
  { label: 'SESSION CLOCK (TSC)', href: '/tsc' },
  { label: 'ECONOMIC CALENDAR', href: '/calendar' },
  { label: 'TRADERS BLOCK', href: '/blog' },
  { label: 'COPIER', href: '#' },
];

const LEGAL = ['PRIVACY POLICY', 'TERMS OF SERVICE', 'CONTACT'];

const linkStyle: React.CSSProperties = {
  fontFamily: "'Montserrat',sans-serif",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.08em',
  color: '#3b82f6',
  textDecoration: 'none',
  transition: 'color 0.2s',
};

export default function HomeFooter() {
  return (
    <footer style={{ background: '#080c10', borderTop: '1px solid #0f1923', padding: '60px 24px 0' }}>
      <style>{`
        .hf-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:48px; padding-bottom:60px; }
        .hf-bottom { display:flex; justify-content:space-between; align-items:center; }
        .hf-legal { display:flex; gap:24px; }
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
                <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', fontFamily: "'Montserrat',sans-serif" }}>
                  <span style={{ color: '#ffffff' }}>FSDZONES</span>
                  <span style={{ color: '#4da8f0' }}>.COM</span>
                </span>
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {SOCIAL_ICONS.map(({ label, path }) => (
                <a key={label} href="#" aria-label={label}
                  style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #172233', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a6580', textDecoration: 'none', transition: 'color 0.2s, border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#c8d8e8'; e.currentTarget.style.borderColor = '#2a3a4a'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#4a6580'; e.currentTarget.style.borderColor = '#172233'; }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
                </a>
              ))}
            </div>
          </div>

          {/* Markets */}
          <div>
            <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: '#c8d8e8', marginBottom: 24, marginTop: 0 }}>MARKETS</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {MARKETS.map(({ label, href }) => (
                <a key={label} href={href} style={linkStyle}
                  onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'}
                  onMouseLeave={e => e.currentTarget.style.color = '#3b82f6'}>
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: '#c8d8e8', marginBottom: 24, marginTop: 0 }}>RESOURCES</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {RESOURCES.map(({ label, href }) => (
                <Link key={label} href={href} style={linkStyle}
                  onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => e.currentTarget.style.color = '#60a5fa'}
                  onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => e.currentTarget.style.color = '#3b82f6'}>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Stay Updated */}
          <div>
            <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: '#c8d8e8', marginBottom: 16, marginTop: 0 }}>STAY UPDATED</h4>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: '#4a6580', letterSpacing: '0.04em', lineHeight: 1.7, marginBottom: 20 }}>
              GET INTRADAY ZONE ALERTS AND MACRO UPDATES DIRECTLY TO YOUR INBOX.
            </p>
            <div style={{ display: 'flex' }}>
              <input type="email" placeholder="EMAIL ADDRESS"
                style={{ flex: 1, minWidth: 0, background: '#0c1219', border: '1px solid #172233', borderRight: 'none', borderRadius: '4px 0 0 4px', padding: '10px 14px', color: '#c8d8e8', fontSize: 11, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, letterSpacing: '0.06em', outline: 'none' }}
              />
              <button
                style={{ flexShrink: 0, background: '#2563eb', border: 'none', borderRadius: '0 4px 4px 0', padding: '10px 18px', color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}>
                JOIN
              </button>
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid #0f1923', padding: '24px 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="hf-bottom">
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', color: '#4a6580' }}>
              © {new Date().getFullYear()} FSDZONES.COM | ALL RIGHTS RESERVED
            </span>
            <div className="hf-legal">
              {LEGAL.map(item => (
                <a key={item} href="#"
                  style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', color: '#4a6580', textDecoration: 'none', transition: 'color 0.2s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#c8d8e8'}
                  onMouseLeave={e => e.currentTarget.style.color = '#4a6580'}>
                  {item}
                </a>
              ))}
            </div>
          </div>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, letterSpacing: '0.06em', color: '#2a3a4a', lineHeight: 1.6, margin: 0 }}>
            RISK WARNING: TRADING FINANCIAL MARKETS INVOLVES SIGNIFICANT RISK. FSDZONES PROVIDES EDUCATIONAL CONTENT AND DATA ANALYTICS FOR INFORMATIONAL PURPOSES ONLY. PAST PERFORMANCE IS NOT INDICATIVE OF FUTURE RESULTS. NEVER TRADE WITH MONEY YOU CANNOT AFFORD TO LOSE.
          </p>
        </div>
      </div>
    </footer>
  );
}
