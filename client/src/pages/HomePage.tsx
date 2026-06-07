import { useState } from 'react';
import { BarChart3, Calendar, PieChart, Diamond, Check, ArrowRight, Search, BookOpen, Brain } from 'lucide-react';
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import HomeStatsSection from "@/components/HomeStatsSection";

const display = { fontFamily: "'Playfair Display', serif" } as const;
const serif   = { fontFamily: "'Playfair Display', serif" } as const;
const sans    = { fontFamily: "'Inter', sans-serif" } as const;

const features = [
  { icon: <BookOpen size={18} />,  title: "Trade Journal",   sub: "Free forever" },
  { icon: <BarChart3 size={18} />, title: "Analytics",       sub: "Premium" },
  { icon: <Brain size={18} />,     title: "AI Coach",        sub: "From $20/mo" },
  { icon: <Calendar size={18} />,  title: "Econ. Calendar",  sub: "Free" },
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
  const [darkMode, setDarkMode] = useState(false);
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
      <section style={{ padding: '9rem 2rem 5rem', background: dm ? bg : '#f0f5ff', transition: 'background 0.4s' }}>
        <div className="max-w-6xl mx-auto" style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: '4rem', alignItems: 'center' }}>

          {/* Left — copy */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, border: `1px solid ${border}`, fontSize: 12, color: muted, marginBottom: 28, ...sans, fontWeight: 500 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', flexShrink: 0 }} />
              Trusted by 10,000+ retail traders
            </div>

            <h1 style={{ ...serif, fontSize: 'clamp(3rem,5vw,5rem)', lineHeight: 1.05, marginBottom: 20, color: text, fontWeight: 900 }}>
              Your trades,<br />
              <span style={{ color: '#2563eb' }}>analyzed smart.</span>
            </h1>

            <p style={{ fontSize: 16, color: muted, lineHeight: 1.8, marginBottom: 32, ...sans }}>
              Log trades, capture decisions, and build your edge — for free.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input type="email" placeholder="Enter your email address"
                style={{ flex: 1, padding: '13px 16px', borderRadius: 10, border: 'none', fontSize: 14, background: dm ? card : '#ffffff', color: text, outline: 'none', ...sans, boxShadow: dm ? `0 0 0 1.5px ${border}` : '0 1px 6px rgba(0,0,0,0.09)', minWidth: 0 }} />
              <a href="/auth?mode=signup" target="Smart_Journal"
                style={{ padding: '13px 22px', borderRadius: 10, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', ...sans }}>
                Start free <ArrowRight size={15} />
              </a>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              {["MT5 Auto-Import", "No subscription", "Real-time sync"].map(t => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: muted, ...sans }}>
                  <Check size={12} color="#10b981" strokeWidth={2.5} /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — feature cards */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, marginBottom: 14, ...sans }}>OUR FEATURES</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {features.map((f, i) => (
                <div key={i}
                  style={{ padding: '20px', borderRadius: 18, background: dm ? card : '#ffffff', border: dm ? `1px solid ${border}` : 'none', boxShadow: dm ? 'none' : '0 2px 14px rgba(0,0,0,0.07)', cursor: 'default', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = dm ? 'none' : '0 6px 28px rgba(37,99,235,0.13)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = dm ? 'none' : '0 2px 14px rgba(0,0,0,0.07)'; }}>
                  <div style={{ marginBottom: 12, color: '#2563eb' }}>{f.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: text, ...sans }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: muted, ...sans }}>{f.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: muted, textAlign: 'right', marginTop: 10, ...sans }}>
              Or <a href="/auth" target="Smart_Journal" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>sign in →</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust marquee ────────────────────────────────────────────── */}
      <div style={{ background: bg2, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '14px 0' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', overflow: 'hidden' }}>
          <div className="hp-mq" style={{ gap: 56, fontWeight: 600, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: muted, ...sans }}>
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
          <h2 style={{ ...display, fontSize: 'clamp(2rem,3.5vw,3rem)', textAlign: 'center', marginBottom: 12, color: text, fontWeight: 700 }}>
            How MyfmJournal works
          </h2>
          <p style={{ textAlign: 'center', fontSize: 15, color: muted, marginBottom: 72, maxWidth: 480, margin: '0 auto 72px', lineHeight: 1.75, ...sans }}>
            From broker connection to edge-building in three steps — no manual entry, no hassle.
          </p>
          <div className="grid md:grid-cols-3 gap-12">
            {steps.map((s, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <span style={{ ...display, fontSize: '3.2rem', lineHeight: 1, color: 'rgba(37,99,235,0.18)', fontWeight: 400 }}>{s.n}</span>
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
