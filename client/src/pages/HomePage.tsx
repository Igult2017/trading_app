import { BarChart3, Calendar, PieChart, Diamond, Check, ArrowRight, Search, BookOpen, Brain, Copy, ClipboardCheck } from 'lucide-react';
import { openAuthModal } from "@/components/auth/AuthModal";
import HomeHeader from "@/components/HomeHeader";
import { usePublicTheme } from "@/context/PublicThemeContext";
import HomeFooter from "@/components/HomeFooter";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import HomeStatsSection from "@/components/HomeStatsSection";
import Brand from '@/components/Brand';
import StartFreeButton from '@/components/StartFreeButton';
import HeroBackground from '@/components/HeroBackground';

/**
 * THE THREE TYPE ROLES. `sans` used to be Playfair Display too (2026-08-30) — a constant named
 * "sans" that resolved to the serif, used 15 times on this page for body copy, labels and buttons.
 * The code READ as though it had a proper split, which is exactly why nobody caught it: there was
 * not one sans-serif font anywhere on the landing page, headlines to footnotes.
 *
 * Headlines stay in the serif — that is the brand. Everything meant to be READ is sans now.
 */
const display = { fontFamily: "'Playfair Display', Georgia, serif" } as const;
const serif   = { fontFamily: "'Playfair Display', Georgia, serif" } as const;
const sans    = { fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" } as const;

const features = [
  { icon: <BookOpen size={18} />,  title: "Trade Journal",   sub: "Free forever" },
  { icon: <Copy size={18} />,      title: "Copier",          sub: "Premium" },
  { icon: <Brain size={18} />,     title: "AI Coach",        sub: "Free" },
  { icon: <ClipboardCheck size={18} />, title: "Strategy Audit", sub: "Free" },
  { icon: <Diamond size={18} />,   title: "Edge Builder",    sub: "Included" },
  { icon: <PieChart size={18} />,  title: "Broker Sync",     sub: "50+ brokers" },
];

const steps = [
  { n: "01", icon: <Search size={20} />,    title: "Connect your broker",       desc: "Link your MT4/MT5 account in seconds. Trades import automatically — no manual entry needed." },
  { n: "02", icon: <Calendar size={20} />,  title: "Log & journal trades",      desc: "Capture context, screenshots, and psychology for every trade. Build a searchable decision database." },
  { n: "03", icon: <BarChart3 size={20} />, title: "Analyse & build your edge", desc: "Spot patterns in wins and losses. Refine strategy, timing, and execution habits with AI insights." },
];

const trustItems = ["MT5 Auto-Import", "No Subscription Required", "AI-Powered Analytics", "GDPR Compliant", "Real-time Sync", "50+ Brokers Supported"];

const BROKERS = [
  "Pepperstone", "IC Markets", "OANDA", "XM", "Exness",
  "FXCM", "AvaTrade", "Tickmill", "Admirals", "AxiTrader",
  "FxPro", "LMAX", "InstaForex", "HFM", "ThinkMarkets",
  "Vantage", "FP Markets", "EasyMarkets",
];

export default function HomePage() {
  const { darkMode, setDarkMode } = usePublicTheme();
  const dm     = darkMode;
  const bg     = dm ? '#020817' : '#ffffff';
  const bg2    = dm ? 'rgba(15,23,42,0.6)' : '#f8fafc';
  const text   = dm ? '#f1f5f9' : '#0f172a';
  const muted  = dm ? '#94a3b8' : '#64748b';
  const card   = dm ? '#0f172a' : '#ffffff';
  const border = dm ? '#1e293b' : '#e2e8f0';

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, transition: 'all 0.4s ease', ...sans }}>
      <style>{`@keyframes hp-mq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.hp-mq{display:inline-flex;animation:hp-mq 44s linear infinite}`}</style>
      <HomeHeader darkMode={dm} setDarkMode={setDarkMode} activePath="/" />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* `relative isolate` makes this the stacking context the background and scrims sit inside, so
          their negative z-index cannot slide behind the page itself. `overflow-hidden` keeps the
          covering image from bleeding past the section. Same shape as the cleaning marketplace's
          hero, which he asked me to copy. */}
      <section className="relative isolate overflow-hidden pt-24 pb-16 lg:pt-36 lg:pb-20" style={{ background: dm ? bg : '#0b1220', transition: 'background 0.4s' }}>
        {/* Screens of the app, crossfading behind everything. */}
        <HeroBackground />

        {/* CONTRAST SCRIMS — without these the headline sits on a busy dashboard and becomes
            unreadable. Two layers, each doing a different job, exactly as the cleaning site does it:
            one darkens top-to-bottom so the headline has a calm band to sit on, and one darkens the
            LEFT hard (82%) because that is where the text column is, fading to clear on the right so
            the screenshot still shows. */}
        {/* ⚠ THE BALANCE HERE IS THE WHOLE DESIGN, and the first attempt got it wrong in the safe
            direction: at 0.88 on the left and 0.62 overall the text was perfectly readable and the
            screenshot behind it was a dark smudge — which defeats the point of putting it there.
            Lightened so the app is actually visible on the right while the left stays dark enough
            to carry white text. The headline's own shadow does the rest, so the scrim does not have
            to be heavy enough to do both jobs. */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -10,
             background: 'linear-gradient(to bottom, rgba(5,10,20,0.42), rgba(5,10,20,0.16) 45%, rgba(5,10,20,0.38))' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -10,
             background: 'linear-gradient(to right, rgba(5,10,20,0.82), rgba(5,10,20,0.34) 46%, rgba(5,10,20,0.04))' }} />
        {/* Blends the bottom edge into whatever follows, so the photo does not stop on a hard line. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, zIndex: -10,
             background: `linear-gradient(to top, ${dm ? bg : '#f8fafc'}, transparent)` }} />

        {/* Stacks to one column below lg; matches HomeHeader's 1280/32px edges on desktop. */}
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-10 lg:gap-16 items-center">

          {/* Left — copy */}
          <div>
            {/* ⚠ THE HERO'S TEXT IS NOW WHITE IN BOTH THEMES, and that is not an oversight. Behind it
                sit dark screenshots under a dark scrim, so the light-mode charcoal this used to use
                would be invisible. The scrim makes this band dark whichever way his toggle is set —
                so the text follows the BACKGROUND IT IS ON, not the page theme. Frosted translucent
                chip, white headline with a shadow, and a lighter blue for the accent line (the old
                #2563eb is too dark to read against a photo). Same treatment as the cleaning site. */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(6px)', fontSize: 12, color: '#ffffff', marginBottom: 28, ...sans, fontWeight: 500 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', display: 'inline-block', flexShrink: 0 }} />
              Trusted by 10,000+ retail traders
            </div>

            <h1 style={{ ...serif, fontSize: 'clamp(1.9rem,4.1vw,3.4rem)', lineHeight: 1.08, marginBottom: 20, color: '#ffffff', fontWeight: 900, textShadow: '0 2px 16px rgba(0,0,0,0.55)' }}>
              Trade and<br />
              Journal,<br />
              <span style={{ color: '#7dd3fc' }}>Find your edge</span>
            </h1>

            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.90)', lineHeight: 1.8, marginBottom: 32, ...sans, textShadow: '0 1px 8px rgba(0,0,0,0.45)' }}>
              Log trades, capture decisions, and build your edge — for free.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {/* Kept SOLID white, not frosted. This is the one thing on the hero he actually types
                  into, and a translucent field over a moving picture is hard to read what you typed. */}
              <input type="email" placeholder="Enter your email address"
                style={{ flex: 1, padding: '13px 16px', borderRadius: 10, border: 'none', fontSize: 14, background: '#ffffff', color: '#0f172a', outline: 'none', ...sans, boxShadow: '0 2px 12px rgba(0,0,0,0.25)', minWidth: 0 }} />
              <StartFreeButton dark={dm} />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              {["MT5 Auto-Import", "No subscription", "Real-time sync"].map(t => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.92)', ...sans, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
                  <Check size={12} color="#34d399" strokeWidth={2.5} /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — feature cards */}
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', marginBottom: 14, ...sans }}>OUR FEATURES</p>
            {/* FROSTED, NOT SOLID. Six solid cards over the right half would hide the very screenshot
                they are sitting on — which is the whole point of putting it there. Translucent with a
                blur lets the app show through while the labels stay readable, and the hover lifts the
                card rather than changing a shadow nobody can see against a photo. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {features.map((f, i) => (
                <div key={i}
                  style={{ padding: '20px', borderRadius: 18, background: 'rgba(12,20,34,0.56)', border: '1px solid rgba(255,255,255,0.16)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', cursor: 'default', transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease' }}
                  onMouseEnter={e => { const t = e.currentTarget; t.style.transform = 'translateY(-2px)'; t.style.background = 'rgba(12,20,34,0.70)'; t.style.borderColor = 'rgba(125,211,252,0.45)'; }}
                  onMouseLeave={e => { const t = e.currentTarget; t.style.transform = 'none'; t.style.background = 'rgba(12,20,34,0.56)'; t.style.borderColor = 'rgba(255,255,255,0.16)'; }}>
                  <div style={{ marginBottom: 12, color: '#7dd3fc' }}>{f.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#ffffff', ...sans }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', ...sans }}>{f.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', textAlign: 'right', marginTop: 10, ...sans, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
              Or <button type="button" onClick={() => openAuthModal("login")} style={{ color: '#7dd3fc', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, font: 'inherit' }}>sign in →</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust marquee ────────────────────────────────────────────── */}
      <div style={{ background: bg2, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '14px 0' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', overflow: 'hidden' }}>
          <div className="hp-mq" style={{ gap: 56, fontWeight: 600, fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, ...sans }}>
            {[...trustItems, ...trustItems].map((t, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexShrink: 0, paddingRight: 56 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563eb', display: 'inline-block', flexShrink: 0 }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '96px 24px', background: bg, transition: 'all 0.4s ease' }}>
        <div className="max-w-6xl mx-auto">
          <h2 style={{ ...display, fontSize: 'clamp(1.7rem,2.8vw,2.4rem)', textAlign: 'center', marginBottom: 12, color: text, fontWeight: 700 }}>
            How <Brand /> works
          </h2>
          <p style={{ textAlign: 'center', fontSize: 15, color: muted, marginBottom: 72, maxWidth: 480, margin: '0 auto 72px', lineHeight: 1.75, ...sans }}>
            From broker connection to edge-building in three steps — no manual entry, no hassle.
          </p>
          <div className="grid md:grid-cols-3 gap-12">
            {steps.map((s, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <span style={{ ...display, fontSize: '2.55rem', lineHeight: 1, color: 'rgba(37,99,235,0.18)', fontWeight: 400 }}>{s.n}</span>
                  <div style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
                    {s.icon}
                  </div>
                </div>
                <h3 style={{ ...sans, fontSize: '1rem', fontWeight: 700, marginBottom: 10, color: text }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: muted, lineHeight: 1.8, ...sans }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Brokers ──────────────────────────────────────────────────── */}
      <section style={{ padding: '48px 0', borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <p style={{ textAlign: 'center', fontSize: 11, color: muted, marginBottom: 28, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', ...sans }}>
          Compatible with 50+ brokers
        </p>
        <div style={{ maxWidth: 1280, margin: '0 auto', overflow: 'hidden' }}>
          <div className="hp-mq" style={{ gap: 10, alignItems: 'center', animationDuration: '36s' }}>
            {[...BROKERS, ...BROKERS].map((name, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 16px', borderRadius: 999, border: `1px solid ${border}`, background: card, fontSize: 12.5, fontWeight: 600, color: muted, whiteSpace: 'nowrap', flexShrink: 0, ...sans, transition: 'color 0.2s, border-color 0.2s' }}
                onMouseEnter={e => { const t = e.currentTarget; t.style.color = '#2563eb'; t.style.borderColor = '#93c5fd'; }}
                onMouseLeave={e => { const t = e.currentTarget; t.style.color = dm ? '#94a3b8' : '#64748b'; t.style.borderColor = dm ? '#1e293b' : '#e2e8f0'; }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#94a3b8', flexShrink: 0 }} />
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <HomeStatsSection darkMode={dm} />
      <PricingSection darkMode={dm} />
      <TestimonialsSection darkMode={dm} />
      <HomeFooter darkMode={dm} />
    </div>
  );
}
