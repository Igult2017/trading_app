import React, { useState, useEffect } from 'react';
import { BarChart3, Calendar, PieChart, Diamond, Star, Check, ArrowRight, TrendingUp, Shield, Zap } from 'lucide-react';
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: <Calendar className="w-6 h-6" />, title: "Stay Organised", description: "Track your trades and review your performance by day, week, or month with structured logging." },
  { icon: <BarChart3 className="w-6 h-6" />, title: "Analyze Strategies", description: "Easily analyze and compare the success rates of different strategies across timeframes." },
  { icon: <Diamond className="w-6 h-6" />, title: "Spot Patterns", description: "Identify patterns in your wins and losses to refine your trading schedule and remove bad habits." },
  { icon: <PieChart className="w-6 h-6" />, title: "Professional Journaling", description: "Journal your trades and thoughts like a prop firm trader — with psychology tags and replay." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Connect Your Broker", desc: "Link your MT4/MT5 or cTrader account. Trades import automatically — no manual entry." },
  { step: "02", title: "Analyse Everything", desc: "Win rate, profit factor, drawdown, session performance, and AI strategy insights — all auto-calculated." },
  { step: "03", title: "Build Your Edge", desc: "Identify what's working, cut what isn't, and execute with the discipline of a professional trader." },
];

const PRICING = [
  { name: "Free",    price: "$0",   period: "forever",  highlight: false, cta: "Get Started Free",  features: ["Core trade stats", "Trade calendar view", "MT4/MT5 integration", "Basic P&L tracking", "Up to 50 trades/month"] },
  { name: "Weekly",  price: "$7",   period: "/ week",   highlight: false, cta: "Start Weekly",       features: ["Everything in Free", "Full trade journal", "Detailed analytics", "Strategy audit", "Unlimited trades"] },
  { name: "Monthly", price: "$20",  period: "/ month",  highlight: true,  cta: "Start Monthly",      badge: "Most Popular", features: ["Everything in Weekly", "AI Coach (Trader AI)", "Behaviour analysis", "Export reports PDF/CSV", "TradeSync Copier"] },
  { name: "Yearly",  price: "$180", period: "/ year",   highlight: false, cta: "Start Yearly",       badge: "Best Value", features: ["Everything in Monthly", "SMC Signal Scanner", "Priority support", "Onboarding session", "TradeSync Copier"] },
];

const TESTIMONIALS = [
  { name: "Alex M.",    role: "Forex Trader",    text: "The dashboard is incredibly customizable and very convenient to use.", rating: 5 },
  { name: "Jordan K.",  role: "Crypto Trader",   text: "I love how MyfmJournal helps me track my performance and improve my strategies.", rating: 5 },
  { name: "Sarah T.",   role: "Swing Trader",    text: "This tool is fantastic — the strategy audit gave me an A- after cleaning up my late entries.", rating: 5 },
  { name: "Michael R.", role: "Day Trader",      text: "MyfmJournal has completely changed the way I analyze my trading operations.", rating: 5 },
  { name: "Emily W.",   role: "Options Trader",  text: "An excellent tool for traders. Easy to use and very comprehensive analytics.", rating: 5 },
  { name: "David P.",   role: "Prop Trader",     text: "The automatic data import from MT5 is a total game changer. Best journal I've used.", rating: 5 },
  { name: "Jessica L.", role: "SMC Trader",      text: "WOW. The stats dashboard is so detailed and customizable. Made a huge difference.", rating: 5 },
  { name: "Chris N.",   role: "Futures Trader",  text: "The community features have helped me connect with other traders and share strategies.", rating: 5 },
];

const BROKERS = [
  { name: "MetaTrader 4" }, { name: "MetaTrader 5" }, { name: "cTrader" },
  { name: "Pepperstone" }, { name: "LMAX Exchange" }, { name: "Admirals" },
  { name: "TICKMILL" }, { name: "AXITRADER" }, { name: "InstaForex" },
];

const AVATAR_COLORS = ["#6366f1","#8b5cf6","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6"];

// ─── Phone Mockup ─────────────────────────────────────────────────────────────

function PhoneMockup({ t }: { t: any }) {
  return (
    <div style={{ width: 280, background: t.mobilePhoneBg, borderRadius: 36, border: `2px solid ${t.mobilePhoneBorder}`, boxShadow: t.mobilePhoneShadow, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ background: t.mobileTopBar, padding: '14px 18px 10px', borderBottom: `1px solid ${t.mobileTopBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>
          <span style={{ color: t.text }}>Myfm</span><span style={{ color: '#3b82f6' }}>Journal</span>
        </span>
        <div style={{ width: 26, height: 26, background: 'linear-gradient(135deg,#2563eb,#60a5fa)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrendingUp size={12} color="white" />
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          {[{ value: '67.9%', label: 'Win Rate', w: '68%' }, { value: '97.5%', label: 'Daily Rate', w: '97%' }].map((s, i) => (
            <div key={i} style={{ background: t.mobileCard, borderRadius: 12, padding: '12px 10px', border: `1px solid ${t.mobileCardBorder}` }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.mobileStatValue, lineHeight: 1.1, fontFamily: "'Montserrat',sans-serif" }}>{s.value}</div>
              <div style={{ fontSize: 9, color: t.mobileLabel, marginTop: 3 }}>{s.label}</div>
              <div style={{ marginTop: 7, height: 2, background: t.mobileBarBg, borderRadius: 1 }}>
                <div style={{ width: s.w, height: '100%', background: 'linear-gradient(to right,#2563eb,#60a5fa)', borderRadius: 1 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: t.mobileCard, borderRadius: 12, padding: 14, border: `1px solid ${t.mobileCardBorder}`, marginBottom: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.mobileStatValue, fontFamily: "'Montserrat',sans-serif" }}>€19,800.72</div>
          <div style={{ fontSize: 9, color: t.mobileLabel, marginTop: 3 }}>Total Profit</div>
          <svg viewBox="0 0 170 26" style={{ width: '100%', height: 26, marginTop: 8 }}>
            <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#60a5fa"/></linearGradient></defs>
            <polyline points="0,23 18,18 36,20 54,13 72,15 90,10 108,8 126,11 144,7 162,4 170,2" fill="none" stroke="url(#pg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[{ value: '1,131', label: 'Total Trades' }, { value: '0.89', label: 'Avg W/L' }].map((s, i) => (
            <div key={i} style={{ background: t.mobileCard, borderRadius: 12, padding: '12px 10px', border: `1px solid ${t.mobileCardBorder}` }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.mobileStatValue, fontFamily: "'Montserrat',sans-serif" }}>{s.value}</div>
              <div style={{ fontSize: 9, color: t.mobileLabel, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 18px 18px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, background: t.mobileHomebar, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&family=Poppins:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  const t = darkMode ? {
    pageBg: 'linear-gradient(to bottom,#020817,#0f172a,#020817)',
    sectionAlt: 'rgba(15,23,42,0.7)',
    sectionDark: '#020817',
    text: '#ffffff', textMuted: '#94a3b8', textAccent: '#60a5fa',
    cardBorder: '#1e293b', cardBg: '#0f172a',
    featureCardBg: 'rgba(30,41,59,0.5)', testimonialBg: 'rgba(30,41,59,0.5)',
    divider: '#1e293b',
    mobilePhoneBg: 'linear-gradient(145deg,#0f172a,#1e293b)', mobilePhoneBorder: '#334155',
    mobilePhoneShadow: '0 0 60px rgba(59,130,246,0.15),0 25px 50px rgba(0,0,0,0.6)',
    mobileTopBar: 'linear-gradient(to bottom,#0f172a,#1e293b)', mobileTopBorder: '#1e293b',
    mobileCard: 'linear-gradient(135deg,#0f172a,#1e3a5f)', mobileCardBorder: 'rgba(30,64,175,0.3)',
    mobileStatValue: '#60a5fa', mobileLabel: '#94a3b8', mobileBarBg: '#1e293b', mobileHomebar: '#334155',
    stepBg: 'rgba(30,41,59,0.5)', stepBorder: '#1e293b', stepNum: '#3b82f6',
    brokerBg: 'rgba(30,41,59,0.4)', brokerBorder: '#334155',
    pricingAlt: '#0f172a',
  } : {
    pageBg: '#ffffff',
    sectionAlt: '#f8fafc',
    sectionDark: '#0f172a',
    text: '#0f172a', textMuted: '#64748b', textAccent: '#2563eb',
    cardBorder: '#e2e8f0', cardBg: '#ffffff',
    featureCardBg: '#ffffff', testimonialBg: '#ffffff',
    divider: '#e2e8f0',
    mobilePhoneBg: 'linear-gradient(145deg,#ffffff,#f1f5f9)', mobilePhoneBorder: '#cbd5e1',
    mobilePhoneShadow: '0 0 60px rgba(59,130,246,0.08),0 25px 50px rgba(0,0,0,0.1)',
    mobileTopBar: 'linear-gradient(to bottom,#ffffff,#f8fafc)', mobileTopBorder: '#e2e8f0',
    mobileCard: 'linear-gradient(135deg,#eff6ff,#dbeafe)', mobileCardBorder: 'rgba(147,197,253,0.5)',
    mobileStatValue: '#1d4ed8', mobileLabel: '#64748b', mobileBarBg: '#e2e8f0', mobileHomebar: '#cbd5e1',
    stepBg: '#f8fafc', stepBorder: '#e2e8f0', stepNum: '#3b82f6',
    brokerBg: '#f8fafc', brokerBorder: '#e2e8f0',
    pricingAlt: '#f8fafc',
  };

  const headerFont = { fontFamily: "'Oswald',sans-serif", fontWeight: 700, letterSpacing: '0.02em' } as const;
  const montserrat  = { fontFamily: "'Montserrat',sans-serif", fontWeight: 800 } as const;
  const poppins     = { fontFamily: "'Poppins',sans-serif" } as const;

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, color: t.text, transition: 'all 0.4s ease', ...poppins }}>
      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath="/" />

      {/* ── HERO — split layout: copy left, mockup right ── */}
      <section style={{ paddingTop: 100, paddingBottom: 80, padding: '100px 0 80px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', gap: 64, flexWrap: 'wrap' }}>

          {/* Left: copy */}
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            {/* Social proof pill — immediately above headline */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 50, padding: '6px 14px', marginBottom: 24 }}>
              <div style={{ display: 'flex' }}>
                {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />)}
              </div>
              <span style={{ fontSize: 13, color: t.textAccent, fontWeight: 600, ...montserrat }}>2,400+ active traders</span>
            </div>

            <h1 style={{ ...montserrat, fontSize: 'clamp(32px,4.5vw,56px)', color: t.text, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 20 }}>
              Track Every Trade.<br />
              <span style={{ background: 'linear-gradient(to right,#3b82f6,#2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Find Your Edge.
              </span>
            </h1>

            <p style={{ fontSize: 18, color: t.textMuted, lineHeight: 1.7, marginBottom: 10, maxWidth: 480 }}>
              A complete execution database and performance analysis system — built for traders who take their craft seriously.
            </p>
            <p style={{ fontSize: 15, color: t.textAccent, fontWeight: 600, lineHeight: 1.8, marginBottom: 32, ...montserrat }}>
              Log trades · Track psychology · Spot patterns · Build your edge.
            </p>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 32, marginBottom: 36, flexWrap: 'wrap' }}>
              {[['$4.2M+','Trades tracked'], ['67.9%','Avg user win rate'], ['Free','Forever tier']].map(([val, label]) => (
                <div key={label}>
                  <div style={{ ...montserrat, fontSize: 22, color: t.text }}>{val}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ padding: '5px', borderRadius: 9999, border: '2px dashed #3b82f6', display: 'inline-block' }}>
                <a href="/auth?mode=signup" target="myfm_journal"
                  style={{ ...montserrat, background: 'linear-gradient(to right,#2563eb,#3b82f6)', borderRadius: 9999, padding: '12px 28px', color: '#fff', fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Create Free Account <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <span style={{ fontSize: 13, color: t.textMuted }}>No credit card · Cancel anytime</span>
            </div>
          </div>

          {/* Right: phone mockup */}
          <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
            <PhoneMockup t={t} />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: t.sectionAlt, padding: '80px 0', borderTop: `1px solid ${t.divider}`, borderBottom: `1px solid ${t.divider}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ ...montserrat, fontSize: 12, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>How It Works</p>
            <h2 style={{ ...headerFont, fontSize: 'clamp(26px,3vw,40px)', color: t.text, marginBottom: 12 }}>Up and running in 3 steps</h2>
            <p style={{ fontSize: 16, color: t.textMuted, maxWidth: 480, margin: '0 auto' }}>No spreadsheets. No manual data entry. Just connect and trade.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 24 }}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} style={{ background: t.stepBg, border: `1px solid ${t.stepBorder}`, borderRadius: 16, padding: 28, position: 'relative', transition: 'all 0.3s' }}>
                <div style={{ ...montserrat, fontSize: 40, color: t.stepNum, opacity: 0.15, position: 'absolute', top: 20, right: 24, lineHeight: 1 }}>{step.step}</div>
                <div style={{ ...montserrat, fontSize: 13, color: '#3b82f6', marginBottom: 10 }}>STEP {step.step}</div>
                <h3 style={{ ...headerFont, fontSize: 20, color: t.text, marginBottom: 10 }}>{step.title}</h3>
                <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.7 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '80px 0' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ ...montserrat, fontSize: 12, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Platform</p>
            <h2 style={{ ...headerFont, fontSize: 'clamp(26px,3vw,40px)', color: t.text, marginBottom: 12 }}>Unlock Powerful Insights</h2>
            <p style={{ fontSize: 16, color: t.textMuted, maxWidth: 500, margin: '0 auto' }}>The most comprehensive analytics dashboard that can be customised to your needs.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: 24, borderRadius: 14, background: t.featureCardBg, border: `1px solid ${t.cardBorder}`, transition: 'all 0.3s' }}>
                <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', padding: 12, borderRadius: 10, flexShrink: 0, color: 'white' }}>{f.icon}</div>
                <div>
                  <h3 style={{ ...headerFont, fontSize: 18, color: t.text, marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.7 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REALTIME STATS ── */}
      <section style={{ background: t.sectionAlt, padding: '80px 0', borderTop: `1px solid ${t.divider}`, borderBottom: `1px solid ${t.divider}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 64, alignItems: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PhoneMockup t={t} />
          </div>
          <div>
            <p style={{ ...montserrat, fontSize: 12, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Mobile Ready</p>
            <h2 style={{ ...headerFont, fontSize: 'clamp(24px,3vw,38px)', color: t.text, marginBottom: 16, lineHeight: 1.2 }}>
              Realtime Stats, Anywhere In The World
            </h2>
            <p style={{ fontSize: 16, color: t.textMuted, lineHeight: 1.7, marginBottom: 28 }}>
              Automatic import from your MT5 account means your stats are always current — no manual logging, no missed trades.
            </p>
            {[{ icon: <Check className="w-4 h-4" />, label: 'Fully automated trade import' },
              { icon: <Check className="w-4 h-4" />, label: 'Mobile-optimised dashboard' },
              { icon: <Check className="w-4 h-4" />, label: 'Real-time P&L and win rate' },
              { icon: <Check className="w-4 h-4" />, label: 'Lightweight and fast' }].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', padding: 6, borderRadius: 6, color: 'white', flexShrink: 0 }}>{f.icon}</div>
                <span style={{ fontSize: 16, color: t.text }}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BROKERS ── */}
      <section style={{ padding: '60px 0' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
          <p style={{ textAlign: 'center', fontSize: 13, color: t.textMuted, marginBottom: 28, fontWeight: 500 }}>Compatible with your existing broker</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            {BROKERS.map((b, i) => (
              <div key={i} style={{ background: t.brokerBg, border: `1px solid ${t.brokerBorder}`, borderRadius: 50, padding: '8px 18px', fontSize: 13, color: t.textMuted, fontWeight: 500 }}>
                {b.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ background: t.pricingAlt, padding: '80px 0', borderTop: `1px solid ${t.divider}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ ...montserrat, fontSize: 12, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Pricing</p>
            <h2 style={{ ...headerFont, fontSize: 'clamp(26px,3vw,40px)', color: t.text, marginBottom: 12 }}>Simple, Transparent Pricing</h2>
            <p style={{ fontSize: 16, color: t.textMuted }}>Free forever tier. Upgrade when you're ready. No credit card required.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, alignItems: 'start' }}>
            {PRICING.map((p, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: 16, padding: 24, background: p.highlight ? 'linear-gradient(145deg,#1e40af,#2563eb)' : t.cardBg, border: p.highlight ? 'none' : `1px solid ${t.cardBorder}`, boxShadow: p.highlight ? '0 0 60px rgba(37,99,235,0.25)' : 'none', transform: p.highlight ? 'scale(1.03)' : 'none' }}>
                {p.badge && <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: p.highlight ? '#fff' : '#0f172a', color: p.highlight ? '#1d4ed8' : '#fff', padding: '3px 14px', borderRadius: 50, fontSize: 11, ...montserrat, whiteSpace: 'nowrap' }}>{p.badge}</div>}
                <div style={{ ...montserrat, fontSize: 16, color: p.highlight ? '#fff' : t.text, marginBottom: 6 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
                  <span style={{ ...montserrat, fontSize: 36, color: p.highlight ? '#fff' : t.text }}>{p.price}</span>
                  <span style={{ fontSize: 13, color: p.highlight ? 'rgba(255,255,255,0.7)' : t.textMuted }}>{p.period}</span>
                </div>
                <div style={{ marginBottom: 20 }}>
                  {p.features.map((f, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <span style={{ color: p.highlight ? '#93c5fd' : '#22c55e', fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 13, color: p.highlight ? 'rgba(255,255,255,0.85)' : t.textMuted, lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/auth?mode=signup" target="myfm_journal" style={{ display: 'block', textAlign: 'center', ...montserrat, fontSize: 14, padding: '10px', borderRadius: 50, background: p.highlight ? '#fff' : 'transparent', color: p.highlight ? '#1d4ed8' : t.textAccent, border: p.highlight ? 'none' : `1.5px solid ${t.textAccent}`, textDecoration: 'none', transition: 'all 0.2s' }}>
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="reviews" style={{ padding: '80px 0', borderTop: `1px solid ${t.divider}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ ...montserrat, fontSize: 12, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Reviews</p>
            <h2 style={{ ...headerFont, fontSize: 'clamp(26px,3vw,40px)', color: t.text, marginBottom: 12 }}>
              Join 10,000+ Traders Who Chose MyfmJournal
            </h2>
            <p style={{ fontSize: 16, color: t.textMuted }}>Don't take our word for it.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18 }}>
            {TESTIMONIALS.map((t2, i) => (
              <div key={i} style={{ background: t.testimonialBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 24, transition: 'all 0.3s' }}>
                <div style={{ display: 'flex', marginBottom: 12 }}>
                  {[...Array(t2.rating)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p style={{ fontSize: 14, color: t.textMuted, marginBottom: 18, fontStyle: 'italic', lineHeight: 1.65 }}>"{t2.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 16, borderTop: `1px solid ${t.cardBorder}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', ...montserrat, fontSize: 14, flexShrink: 0 }}>
                    {t2.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{t2.name}</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>{t2.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div style={{ textAlign: 'center', marginTop: 52 }}>
            <p style={{ fontSize: 16, color: t.textMuted, marginBottom: 20 }}>
              Free forever tier · No credit card required · Cancel anytime
            </p>
            <div style={{ padding: '5px', borderRadius: 9999, border: '2px dashed #3b82f6', display: 'inline-block' }}>
              <a href="/auth?mode=signup" target="myfm_journal"
                style={{ ...montserrat, background: 'linear-gradient(to right,#2563eb,#3b82f6)', borderRadius: 9999, padding: '13px 32px', color: '#fff', fontSize: 16, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Create Your Free Account <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <HomeFooter darkMode={darkMode} />
    </div>
  );
}
