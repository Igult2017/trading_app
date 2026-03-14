import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { SiTelegram } from 'react-icons/si';

// ─── Ticker Data ──────────────────────────────────────────────────────────────
const TICKER_DATA = [
  { symbol: 'EUR/USD', price: '1.0842', change: '+0.12%', up: true },
  { symbol: 'BTC/USD', price: '67,204', change: '-1.34%', up: false },
  { symbol: 'GOLD',    price: '2,318.4', change: '+0.45%', up: true },
  { symbol: 'SPX500',  price: '5,236.1', change: '+0.28%', up: true },
  { symbol: 'GBP/USD', price: '1.2691', change: '-0.08%', up: false },
  { symbol: 'ETH/USD', price: '3,512.7', change: '+2.11%', up: true },
  { symbol: 'OIL/WTI', price: '78.34',  change: '-0.67%', up: false },
  { symbol: 'USD/JPY', price: '156.72', change: '+0.19%', up: true },
];

// ─── Nav Links ────────────────────────────────────────────────────────────────
const navLinks = [
  { name: 'Home/Bias',          path: '/' },
  { name: 'Economic Calendar',  path: '/calendar' },
  { name: 'Major Pairs',        path: '/major-pairs' },
  { name: 'US Stocks',          path: '/stocks' },
  { name: 'Commodities',        path: '/commodities' },
  { name: 'Cryptocurrency',     path: '/crypto' },
  { name: 'History',            path: '/history' },
  { name: 'Blog',               path: '/blog' },
  { name: 'Premarket',          path: '/premarket' },
  { name: 'Stats',              path: '/stats' },
  { name: 'Charting',           path: '/charting' },
  { name: 'Research',           path: '/research' },
];

// ─── Session Detection ────────────────────────────────────────────────────────
const SESSIONS = [
  { name: 'Sydney',   start: 22, end: 7,  nextDayEnd: true },
  { name: 'Tokyo',    start: 0,  end: 9  },
  { name: 'London',   start: 7,  end: 16 },
  { name: 'New York', start: 12, end: 21 },
];

function getSessionInfo() {
  const now = new Date();
  const utcHours   = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();
  const totalMin   = utcHours * 60 + utcMinutes;
  const pad = (n: number) => String(n).padStart(2, '0');
  const utcTime = `${pad(utcHours)}:${pad(utcMinutes)}:${pad(utcSeconds)}`;

  let activeSession: string | null = null;
  let timeInMinutes = 0;

  for (const s of SESSIONS) {
    const startMin = s.start * 60;
    const endMin   = s.end   * 60;
    let isActive = false;

    if (s.nextDayEnd) {
      if (totalMin >= startMin || totalMin < endMin) {
        isActive = true;
        timeInMinutes = totalMin >= startMin ? totalMin - startMin : 24 * 60 - startMin + totalMin;
      }
    } else {
      if (totalMin >= startMin && totalMin < endMin) {
        isActive = true;
        timeInMinutes = totalMin - startMin;
      }
    }

    if (isActive) { activeSession = s.name; break; }
  }

  let timeInSession = '';
  if (activeSession) {
    const h = Math.floor(timeInMinutes / 60);
    const m = timeInMinutes % 60;
    timeInSession = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  return { utcTime, sessionName: activeSession, timeInSession };
}

// ─── Ticker Tape ─────────────────────────────────────────────────────────────
function TickerTape() {
  const items = [...TICKER_DATA, ...TICKER_DATA];
  return (
    <div style={{
      background: '#060a0e',
      borderBottom: '1px solid #0f1923',
      height: 30,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
    }}>
      <style>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          animation: ticker 38s linear infinite;
          will-change: transform;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-track">
        {items.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 24px', borderRight: '1px solid #0f1923',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#4a6580', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', fontFamily: "'Montserrat', sans-serif" }}>
              {t.symbol}
            </span>
            <span style={{ color: '#c8d8e8', fontSize: 9, fontWeight: 600, fontFamily: "'Montserrat', sans-serif" }}>
              {t.price}
            </span>
            <span style={{
              fontSize: 8, fontWeight: 700, fontFamily: "'Montserrat', sans-serif",
              color: t.up ? '#22d3a5' : '#f4617f',
              background: t.up ? 'rgba(34,211,165,0.1)' : 'rgba(244,97,127,0.1)',
              padding: '1px 5px', borderRadius: 2,
            }}>
              {t.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Header ──────────────────────────────────────────────────────────────
interface NewHeaderProps {
  isDark?: boolean;
  toggleTheme?: () => void;
}

export default function NewHeader({ isDark = true, toggleTheme }: NewHeaderProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(getSessionInfo());

  useEffect(() => {
    const id = setInterval(() => setSessionInfo(getSessionInfo()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location]);

  const isActive = (path: string) =>
    path === '/' ? location === '/' : location.startsWith(path);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');

        .fsd-header * { box-sizing: border-box; }

        /* ── Nav pill links ── */
        .fsd-nav-link {
          color: #4a6580;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.09em;
          padding: 5px 10px;
          border-radius: 3px;
          border: 1px solid transparent;
          font-family: 'Montserrat', sans-serif;
          cursor: pointer;
          background: none;
          text-decoration: none;
          white-space: nowrap;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          display: inline-block;
        }
        .fsd-nav-link:hover {
          color: #c8d8e8;
          border-color: #172233;
          background: #0c1219;
        }
        .fsd-nav-link.fsd-active {
          color: #3b9eff;
          border-color: rgba(59,158,255,0.25);
          background: rgba(59,158,255,0.07);
        }

        /* ── Buttons ── */
        .fsd-btn-primary {
          background: #3b9eff;
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 6px 14px;
          border-radius: 3px;
          border: none;
          cursor: pointer;
          font-family: 'Montserrat', sans-serif;
          transition: opacity 0.2s;
          white-space: nowrap;
        }
        .fsd-btn-primary:hover { opacity: 0.88; }

        .fsd-btn-outline {
          background: transparent;
          color: #c8d8e8;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          padding: 5px 12px;
          border-radius: 3px;
          border: 1px solid #172233;
          cursor: pointer;
          font-family: 'Montserrat', sans-serif;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .fsd-btn-outline:hover {
          border-color: #4a6580;
          background: #0c1219;
        }

        /* ── Telegram link ── */
        .fsd-telegram {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #3b9eff;
          font-size: 9px;
          font-weight: 700;
          font-family: 'Montserrat', sans-serif;
          text-decoration: none;
          padding: 5px 10px;
          border-radius: 3px;
          border: 1px solid rgba(59,158,255,0.2);
          background: rgba(59,158,255,0.05);
          transition: all 0.2s;
          white-space: nowrap;
        }
        .fsd-telegram:hover { background: rgba(59,158,255,0.12); border-color: rgba(59,158,255,0.4); }

        /* ── Clock widget ── */
        .fsd-clock {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          padding: 4px 10px;
          background: #0c1219;
          border: 1px solid #172233;
          border-radius: 3px;
          flex-shrink: 0;
        }

        /* ── Hamburger icon ── */
        .fsd-hamburger {
          background: #0c1219;
          border: 1px solid #172233;
          border-radius: 3px;
          color: #4a6580;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .fsd-hamburger:hover { color: #c8d8e8; border-color: #3b9eff; }

        /* ── Sub nav row ── */
        .fsd-subnav {
          border-top: 1px solid #0f1923;
          background: #080c10;
          padding: 6px 24px;
          overflow-x: auto;
          scrollbar-width: none;
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .fsd-subnav::-webkit-scrollbar { display: none; }

        /* ── Mobile drawer ── */
        .fsd-drawer {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(300px, 85vw);
          background: #080c10;
          border-left: 1px solid #172233;
          z-index: 200;
          overflow-y: auto;
          animation: fsdSlideIn 0.22s ease;
        }
        @keyframes fsdSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }

        .fsd-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 199;
          animation: fsdFadeIn 0.2s ease;
        }
        @keyframes fsdFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .fsd-mobile-link {
          display: flex;
          align-items: center;
          padding: 14px 0;
          border-bottom: 1px solid #0f1923;
          font-size: 12px;
          font-weight: 700;
          font-family: 'Montserrat', sans-serif;
          letter-spacing: 0.06em;
          cursor: pointer;
          text-decoration: none;
          transition: color 0.15s;
          color: #c8d8e8;
        }
        .fsd-mobile-link:hover { color: #3b9eff; }
        .fsd-mobile-link.fsd-active { color: #3b9eff; }

        /* ── Theme toggle ── */
        .fsd-theme-btn {
          background: #0c1219;
          border: 1px solid #172233;
          border-radius: 3px;
          color: #4a6580;
          cursor: pointer;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .fsd-theme-btn:hover { color: #c8d8e8; border-color: #3b9eff; }

        /* ── Responsive visibility ── */
        @media (min-width: 1024px) {
          .fsd-desktop { display: flex !important; }
          .fsd-mobile-only { display: none !important; }
        }
        @media (max-width: 1023px) {
          .fsd-desktop { display: none !important; }
          .fsd-mobile-only { display: flex !important; }
        }
      `}</style>

      <div className="fsd-header" style={{ fontFamily: "'Montserrat', sans-serif", position: 'sticky', top: 0, zIndex: 100 }}>

        {/* Ticker */}
        <TickerTape />

        {/* Main bar */}
        <div style={{
          background: '#080c10',
          borderBottom: '1px solid #172233',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          gap: 12,
        }}>

          {/* Logo */}
          <Link href="/" style={{
            display: 'flex',
            alignItems: 'baseline',
            textDecoration: 'none',
            flexShrink: 0,
            gap: 0,
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', fontFamily: "'Montserrat', sans-serif" }}>
              FSDZONES
            </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#4da8f0', letterSpacing: '-0.02em', fontFamily: "'Montserrat', sans-serif" }}>
              .COM
            </span>
          </Link>

          {/* Desktop right side */}
          <div className="fsd-desktop" style={{ alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Session info */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#0c1219', border: '1px solid #172233',
              borderRadius: 3, padding: '4px 12px',
            }}>
              <span style={{ fontSize: 9, color: '#4a6580', fontWeight: 600, letterSpacing: '0.06em' }}>UTC</span>
              <span style={{ fontSize: 10, color: '#c8d8e8', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }} data-testid="text-utc-time">
                {sessionInfo.utcTime}
              </span>
              <span style={{ width: 1, height: 12, background: '#172233' }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em' }} data-testid="text-session-status">
                {sessionInfo.sessionName ? (
                  <><span style={{ color: '#4a6580' }}>SESSION</span>{' '}
                    <span style={{ color: '#22d3a5' }}>{sessionInfo.sessionName}</span>{' '}
                    <span style={{ color: '#4a6580' }}>({sessionInfo.timeInSession} IN)</span>
                  </>
                ) : (
                  <span style={{ color: '#4a6580' }}>QUIET</span>
                )}
              </span>
            </div>

            <div style={{ width: 1, height: 20, background: '#172233' }} />

            <a href="https://t.me/BuySellZonesBot" target="_blank" rel="noopener noreferrer" className="fsd-telegram" data-testid="link-telegram">
              <SiTelegram size={11} />
              TELEGRAM
            </a>

            <button className="fsd-btn-primary" data-testid="link-subscribe">SUBSCRIBE</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="fsd-btn-outline" data-testid="link-signin">SIGN IN</button>
              <Link href="/signup" style={{
                background: '#22d3a5',
                color: '#060a0e',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.06em',
                padding: '6px 14px',
                borderRadius: 3,
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'Montserrat', sans-serif",
                textDecoration: 'none',
                display: 'inline-block',
              }} data-testid="link-signup">
                SIGN UP
              </Link>
            </div>

            {toggleTheme && (
              <button className="fsd-theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
                {isDark ? <Sun size={13} /> : <Moon size={13} />}
              </button>
            )}
          </div>

          {/* Mobile right side */}
          <div className="fsd-mobile-only" style={{ alignItems: 'center', gap: 8 }}>
            {/* Clock pill on mobile */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#0c1219', border: '1px solid #172233',
              borderRadius: 3, padding: '4px 10px',
            }}>
              <span style={{ fontSize: 10, color: '#c8d8e8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {sessionInfo.utcTime}
              </span>
              {sessionInfo.sessionName && (
                <>
                  <span style={{ width: 1, height: 10, background: '#172233' }} />
                  <span style={{ fontSize: 8, color: '#22d3a5', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {sessionInfo.sessionName.toUpperCase()}
                  </span>
                </>
              )}
            </div>

            <button
              className="fsd-hamburger"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              data-testid="button-mobile-menu"
            >
              <Menu size={15} />
            </button>
          </div>
        </div>

        {/* Sub-nav (desktop only) */}
        <div className="fsd-subnav fsd-desktop" style={{ display: 'flex' }}>
          {navLinks.map(link => (
            <Link
              key={link.path}
              href={link.path}
              className={`fsd-nav-link${isActive(link.path) ? ' fsd-active' : ''}`}
              data-testid={`link-nav-${link.name.toLowerCase().replace(/\s+/g, '-').replace('/', '-')}`}
            >
              {link.name.toUpperCase()}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile overlay + drawer */}
      {mobileOpen && (
        <>
          <div className="fsd-overlay" onClick={() => setMobileOpen(false)} />
          <div className="fsd-drawer">
            <div style={{ padding: '20px 20px 0' }}>
              {/* Drawer header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: "'Montserrat', sans-serif", letterSpacing: '-0.02em' }}>FSDZONES</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#4da8f0', fontFamily: "'Montserrat', sans-serif", letterSpacing: '-0.02em' }}>.COM</span>
                </div>
                <button
                  className="fsd-hamburger"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  data-testid="button-close-menu"
                >
                  <X size={15} />
                </button>
              </div>

              {/* CTA buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                <Link href="/signup" onClick={() => setMobileOpen(false)} style={{
                  flex: 1, textAlign: 'center',
                  background: '#22d3a5', color: '#060a0e',
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                  padding: '10px 0', borderRadius: 3,
                  textDecoration: 'none', fontFamily: "'Montserrat', sans-serif",
                }} data-testid="mobile-link-signup">
                  SIGN UP
                </Link>
                <button className="fsd-btn-outline" style={{ flex: 1 }} data-testid="mobile-link-signin">SIGN IN</button>
              </div>

              {/* Telegram */}
              <a
                href="https://t.me/BuySellZonesBot"
                target="_blank"
                rel="noopener noreferrer"
                className="fsd-telegram"
                style={{ width: '100%', justifyContent: 'center', marginBottom: 24 }}
                data-testid="mobile-link-telegram"
              >
                <SiTelegram size={13} />
                JOIN TELEGRAM
              </a>

              {/* Nav links */}
              <nav>
                {navLinks.map(link => (
                  <Link
                    key={link.path}
                    href={link.path}
                    className={`fsd-mobile-link${isActive(link.path) ? ' fsd-active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                    data-testid={`mobile-link-nav-${link.name.toLowerCase().replace(/\s+/g, '-').replace('/', '-')}`}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>

              {/* Session info at bottom of drawer */}
              <div style={{
                marginTop: 24, padding: '12px',
                background: '#0c1219', border: '1px solid #172233',
                borderRadius: 3,
              }}>
                <div style={{ fontSize: 8, color: '#4a6580', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>MARKET SESSION</div>
                <div style={{ fontSize: 11, color: '#c8d8e8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  UTC {sessionInfo.utcTime}
                </div>
                <div style={{ fontSize: 10, marginTop: 4 }}>
                  {sessionInfo.sessionName ? (
                    <span style={{ color: '#22d3a5', fontWeight: 700 }}>
                      {sessionInfo.sessionName} ({sessionInfo.timeInSession} In)
                    </span>
                  ) : (
                    <span style={{ color: '#4a6580' }}>Quiet Period</span>
                  )}
                </div>
              </div>

              {toggleTheme && (
                <button
                  onClick={toggleTheme}
                  style={{
                    marginTop: 16, width: '100%',
                    background: '#0c1219', border: '1px solid #172233',
                    borderRadius: 3, color: '#4a6580',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    padding: '10px 0', cursor: 'pointer',
                    fontFamily: "'Montserrat', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {isDark ? <Sun size={13} /> : <Moon size={13} />}
                  {isDark ? 'LIGHT MODE' : 'DARK MODE'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
