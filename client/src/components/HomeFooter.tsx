import { Link } from 'wouter';

const SOCIAL_ICONS = [
  { label: 'Twitter',   color: '#ffffff', bg: '#000000',                                                             border: '#333333', path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: 'YouTube',   color: '#ffffff', bg: '#FF0000',                                                             border: '#FF0000', path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { label: 'Facebook',  color: '#ffffff', bg: '#1877F2',                                                             border: '#1877F2', path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { label: 'Instagram', color: '#ffffff', bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',       border: '#dc2743', path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
];

const RESOURCES = [
  { label: 'Free Trading Journal', href: '/journal', newTab: true },
  { label: 'Session Clock (TSC)',  href: '/tsc' },
  { label: 'Economic Calendar',   href: '/calendar' },
  { label: 'Blog',                href: '/blog' },
];

const LEGAL = [
  { label: 'Privacy Policy',   href: '/legal' },
  { label: 'Support',          href: '/support' },
  { label: 'Terms of Service', href: '/legal' },
  { label: 'Contact',          href: '/legal' },
];

interface HomeFooterProps {
  darkMode?: boolean;
}

export default function HomeFooter({ darkMode = false }: HomeFooterProps) {
  const dm = darkMode;

  /* ── Theme tokens aligned with landing page ─────────────────────────── */
  const bg        = dm ? '#08090d'              : '#f1f5f9';
  const topBorder = dm ? '#1e293b'              : '#cbd5e1';
  const botBorder = dm ? '#1e293b'              : '#cbd5e1';
  const logoClr   = dm ? '#ffffff'              : '#0f172a';
  const headLabel = '#3b82f6';
  const headTitle = dm ? '#f1f5f9'              : '#0f172a';
  const linkClr   = dm ? '#cbd5e1'              : '#1e293b';
  const linkHov   = dm ? '#ffffff'              : '#0f172a';
  const inputBg   = dm ? '#0c1219'              : '#ffffff';
  const inputBord = dm ? '#1e293b'              : '#cbd5e1';
  const inputTxt  = dm ? '#c8d8e8'              : '#0f172a';
  const mutedTxt  = dm ? '#94a3b8'              : '#334155';
  const copyTxt   = dm ? '#94a3b8'              : '#334155';

  return (
    <footer style={{ background: bg, borderTop: `1px solid ${topBorder}`, fontFamily: "'Montserrat',sans-serif", transition: 'background 0.3s' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;800;900&display=swap');
        .hf-grid { display:grid; grid-template-columns:1.4fr 1fr 1fr 1.2fr; gap:60px; padding:64px 0 56px; }
        .hf-bottom { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
        .hf-legal-links { display:flex; gap:20px; flex-wrap:wrap; }
        .hf-lnk { font-family:'Montserrat',sans-serif; font-weight:500; font-size:13px; color:${linkClr}; text-decoration:none; transition:color 0.2s; }
        .hf-lnk:hover { color:${linkHov}; }
        .hf-copy-lnk { font-family:'Montserrat',sans-serif; font-weight:500; font-size:11px; color:${copyTxt}; text-decoration:none; transition:color 0.2s; }
        .hf-copy-lnk:hover { color:${linkHov}; }
        @media (max-width:1000px) { .hf-grid { grid-template-columns:1fr 1fr; gap:40px; padding:48px 0 44px; } }
        @media (max-width:560px)  { .hf-grid { grid-template-columns:1fr; gap:36px; padding:40px 0 36px; } .hf-bottom { flex-direction:column; align-items:flex-start; } }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
        <div className="hf-grid">

          {/* ── Brand ──────────────────────────────────────────────────── */}
          <div>
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
              <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em' }}>
                <span style={{ color: logoClr }}>Myfm</span><span style={{ color: '#3b82f6' }}>journal</span>
              </span>
            </Link>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#64748b', lineHeight: 1.75, marginBottom: 24, marginTop: 0, maxWidth: 260 }}>
              A professional-grade trading journal and analytics platform built for serious traders.
            </p>
          </div>

          {/* ── Socials ────────────────────────────────────────────────── */}
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: headTitle, marginBottom: 16, letterSpacing: '-0.01em' }}>Community</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SOCIAL_ICONS.map(({ label, path, color, bg: iconBg, border: iconBorder }) => (
                <a key={label} href="#" aria-label={label}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', opacity: 0.85, transition: 'opacity 0.2s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateX(3px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateX(0)'; }}>
                  <span style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${iconBorder}`, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: linkClr, fontFamily: "'Montserrat',sans-serif" }}>{label}</span>
                </a>
              ))}
            </div>
          </div>

          {/* ── Resources ──────────────────────────────────────────────── */}
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: headTitle, marginBottom: 16, letterSpacing: '-0.01em' }}>Tools</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {RESOURCES.map(({ label, href, newTab }) => (
                <Link key={label} href={href}
                  target={newTab ? 'myfm_journal' : undefined}
                  rel={newTab ? 'noopener noreferrer' : undefined}
                  className="hf-lnk">
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* ── Newsletter ─────────────────────────────────────────────── */}
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: headTitle, marginBottom: 12, letterSpacing: '-0.01em' }}>Newsletter</div>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#64748b', lineHeight: 1.7, marginBottom: 20, marginTop: 0 }}>
              Data-backed strategies and market insights delivered to your inbox.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="email" placeholder="your@email.com"
                style={{ background: inputBg, border: `1px solid ${inputBord}`, borderRadius: 8, padding: '11px 14px', color: inputTxt, fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: 500, outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                onBlur={e => e.currentTarget.style.borderColor = inputBord}
              />
              <button
                style={{ width: '100%', background: '#2563eb', border: 'none', borderRadius: 8, padding: '12px 20px', color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}>
                Subscribe
              </button>
            </div>
          </div>

        </div>

        {/* ── Bottom bar ───────────────────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${botBorder}`, padding: '24px 0 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="hf-bottom">
            <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', color: copyTxt }}>
              © {new Date().getFullYear()} Myfmjournal — All rights reserved
            </span>
            <div className="hf-legal-links">
              {LEGAL.map(item => (
                <Link key={item.label} href={item.href} className="hf-copy-lnk">{item.label}</Link>
              ))}
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
}
