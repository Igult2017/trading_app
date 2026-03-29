import { useState, useEffect } from "react";
import { BarChart3, Calendar, PieChart, Diamond, Star, Check, ArrowRight, Menu, Sun, Moon, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';

const TICKER_DATA = [
  { symbol: "EUR/USD", price: "1.0842", change: "+0.12%", up: true },
  { symbol: "BTC/USD", price: "67,204", change: "-1.34%", up: false },
  { symbol: "GOLD", price: "2,318.4", change: "+0.45%", up: true },
  { symbol: "SPX500", price: "5,236.1", change: "+0.28%", up: true },
  { symbol: "GBP/USD", price: "1.2691", change: "-0.08%", up: false },
  { symbol: "ETH/USD", price: "3,512.7", change: "+2.11%", up: true },
  { symbol: "OIL/WTI", price: "78.34", change: "-0.67%", up: false },
  { symbol: "USD/JPY", price: "156.72", change: "+0.19%", up: true },
];

function TickerTape() {
  const items = [...TICKER_DATA, ...TICKER_DATA];
  return (
    <div style={{ background: "#080c10", borderBottom: "1px solid #0f1923", height: 32, overflow: "hidden", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ticker-wrap { display:flex; animation: ticker 35s linear infinite; will-change:transform; }
        .ticker-wrap:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-wrap">
        {items.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 28px", borderRight: "1px solid #0f1923", whiteSpace: "nowrap" }}>
            <span style={{ color: "#4a6580", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>{t.symbol}</span>
            <span style={{ color: "#c8d8e8", fontSize: 10, fontWeight: 600 }}>{t.price}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: t.up ? "#22d3a5" : "#f4617f", background: t.up ? "rgba(34,211,165,0.08)" : "rgba(244,97,127,0.08)", padding: "1px 5px", borderRadius: 3 }}>{t.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const dm = darkMode;

  const t = dm ? {
    pageBg: '#020817',
    navBg: 'rgba(8,12,16,0.97)',
    navBorder: '#172233',
    logoWhite: '#ffffff',
    navLink: '#4a6580',
    navLinkHover: '#c8d8e8',
    sectionAlt: 'rgba(15,23,42,0.6)',
    cardBg: '#0f172a',
    cardBorder: '#1e293b',
    text: '#ffffff',
    textMuted: '#94a3b8',
    textAccent: '#60a5fa',
    statValue: '#60a5fa',
    progressBg: '#1e293b',
    calWin: 'rgba(30,58,138,0.3)',
    calWinBorder: '#1d4ed8',
    calLoss: 'rgba(127,29,29,0.3)',
    calLossBorder: '#b91c1c',
    calWinText: '#60a5fa',
    calLossText: '#f87171',
    dayLabel: '#475569',
    featureCardBg: 'rgba(30,41,59,0.5)',
    testimonialBg: 'rgba(30,41,59,0.5)',
    mobilePhoneBg: 'linear-gradient(145deg,#0f172a,#1e293b)',
    mobilePhoneBorder: '#334155',
    mobilePhoneShadow: '0 0 60px rgba(59,130,246,0.15),0 25px 50px rgba(0,0,0,0.6)',
    mobileTopBar: 'linear-gradient(to bottom,#0f172a,#1e293b)',
    mobileTopBorder: '#1e293b',
    mobileCard: 'linear-gradient(135deg,#0f172a,#1e3a5f)',
    mobileCardBorder: 'rgba(30,64,175,0.3)',
    mobileStatValue: '#60a5fa',
    mobileLabel: '#94a3b8',
    mobileBarBg: '#1e293b',
    mobileHomebar: '#334155',
  } : {
    pageBg: '#f8fafc',
    navBg: 'rgba(255,255,255,0.97)',
    navBorder: '#e2e8f0',
    logoWhite: '#0f172a',
    navLink: '#475569',
    navLinkHover: '#0f172a',
    sectionAlt: 'rgba(241,245,249,0.8)',
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    text: '#0f172a',
    textMuted: '#64748b',
    textAccent: '#2563eb',
    statValue: '#2563eb',
    progressBg: '#e2e8f0',
    calWin: 'rgba(219,234,254,0.8)',
    calWinBorder: '#93c5fd',
    calLoss: 'rgba(254,226,226,0.8)',
    calLossBorder: '#fca5a5',
    calWinText: '#1d4ed8',
    calLossText: '#dc2626',
    dayLabel: '#94a3b8',
    featureCardBg: 'rgba(248,250,252,0.9)',
    testimonialBg: 'rgba(248,250,252,0.9)',
    mobilePhoneBg: 'linear-gradient(145deg,#ffffff,#f1f5f9)',
    mobilePhoneBorder: '#cbd5e1',
    mobilePhoneShadow: '0 0 60px rgba(59,130,246,0.1),0 25px 50px rgba(0,0,0,0.12)',
    mobileTopBar: 'linear-gradient(to bottom,#ffffff,#f8fafc)',
    mobileTopBorder: '#e2e8f0',
    mobileCard: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
    mobileCardBorder: 'rgba(147,197,253,0.5)',
    mobileStatValue: '#1d4ed8',
    mobileLabel: '#64748b',
    mobileBarBg: '#e2e8f0',
    mobileHomebar: '#cbd5e1',
  };

  const navFont = { fontFamily: "'Montserrat',sans-serif", fontWeight: 800 };
  const oswald = { fontFamily: "'Oswald',sans-serif", fontWeight: 700 };

  const features = [
    { icon: <Calendar className="w-6 h-6" />, title: "Stay Organised", description: "Track your trades and review your performance by day, week, or month" },
    { icon: <BarChart3 className="w-6 h-6" />, title: "Analyze Strategies", description: "Easily analyze and compare the success rates of different strategies" },
    { icon: <Diamond className="w-6 h-6" />, title: "Spot Patterns", description: "Identify patterns in your wins and losses to refine your trading schedule" },
    { icon: <PieChart className="w-6 h-6" />, title: "Professional Journaling", description: "Journal your trades and thoughts like a pro trader" }
  ];

  const mobileFeatures = [
    { icon: <Check className="w-5 h-5" />, title: "Fully automated process" },
    { icon: <Check className="w-5 h-5" />, title: "Mobile friendly" },
    { icon: <Check className="w-5 h-5" />, title: "Check your performance in realtime" },
    { icon: <Check className="w-5 h-5" />, title: "Lightweight and optimised" }
  ];

  const testimonials = [
    { name: "Alex M.", text: "The dashboard is incredibly customizable and very convenient to use.", rating: 5 },
    { name: "Jordan K.", text: "I love how FSD Journal helps me track my performance and improve my strategies.", rating: 5 },
    { name: "Sarah T.", text: "This tool is fantastic, the user interface could be even more intuitive.", rating: 5 },
    { name: "Michael R.", text: "FSD Journal has changed the way I analyze my trading operations.", rating: 5 },
    { name: "Emily W.", text: "An excellent tool for traders. Easy to use and very comprehensive.", rating: 5 },
    { name: "David P.", text: "I've tried other journaling platforms, but FSD Journal is by far the best!", rating: 5 },
    { name: "Jessica L.", text: "The stats dashboard is so detailed and customizable. It's made a huge difference to my trading.", rating: 5 },
    { name: "Chris N.", text: "The community features have helped me connect with other traders and share strategies.", rating: 5 }
  ];

  const brokers = ["InstaForex", "LMAX Exchange", "Pepperstone", "TICKMILL", "Admirals", "AXITRADER"];
  const calData = Array.from({ length: 35 }, () => (Math.random() - 0.45) * 900);

  const navItems = ['Features', 'Pricing', 'Reviews', 'Economic Calendar', 'Assets', 'Blog', 'TSC', 'Login', 'Signup'];
  const navHref = (item: string) => item === 'TSC' ? '/tsc' : `#${item.toLowerCase().replace(' ', '-')}`;

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, color: t.text, transition: 'background 0.3s', fontFamily: "'Poppins',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Montserrat:wght@700;800;900&family=Poppins:wght@300;400;500;600&display=swap');
        .nav-a { text-decoration:none; font-size:10px; font-weight:700; letter-spacing:0.1em; padding:6px 12px; border-radius:4px; border:1px solid transparent; cursor:pointer; background:none; display:inline-flex; align-items:center; transition:all 0.15s; white-space:nowrap; font-family:'Poppins',sans-serif; }
        .nav-journal-btn { text-decoration:none; font-size:10px; font-weight:800; letter-spacing:0.12em; padding:6px 16px; border-radius:4px; cursor:pointer; display:inline-flex; align-items:center; transition:all 0.15s; white-space:nowrap; font-family:'Montserrat',sans-serif; background:linear-gradient(to right,#2563eb,#3b82f6); color:#fff; border:none; }
        .nav-journal-btn:hover { background:linear-gradient(to right,#1d4ed8,#2563eb); }
        .nav-links { display:flex; align-items:center; gap:6px; }
        .nav-mob-controls { display:none; align-items:center; gap:8px; }
        @media (max-width: 1024px) {
          .nav-links { display:none; }
          .nav-mob-controls { display:flex; }
        }
        .mob-dropdown { display:none; }
        .mob-dropdown.open { display:block; }
        @media (min-width: 1025px) {
          .mob-dropdown { display:none !important; }
        }
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 100 }}>
        <TickerTape />
        <nav style={{ background: t.navBg, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${t.navBorder}`, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', transition: 'background 0.3s' }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', fontFamily: "'Montserrat',sans-serif", flexShrink: 0, cursor: 'pointer' }}>
            <span style={{ color: t.logoWhite }}>FSD </span>
            <span style={{ color: '#3b82f6' }}>Journal</span>
          </span>
          <div className="nav-links">
            {navItems.map(item => (
              <a key={item} href={navHref(item)} className="nav-a" style={{ color: t.navLink }}
                onMouseEnter={e => { e.currentTarget.style.color = t.navLinkHover; e.currentTarget.style.borderColor = t.navBorder; e.currentTarget.style.background = dm ? '#0c1219' : '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.color = t.navLink; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none'; }}
              >{item}</a>
            ))}
            <button onClick={() => setDarkMode(!dm)}
              style={{ width: 40, height: 22, borderRadius: 11, background: dm ? '#1e40af' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.3s', padding: 0, flexShrink: 0, marginLeft: 4 }}>
              <div style={{ position: 'absolute', left: dm ? 20 : 2, top: 2, width: 18, height: 18, borderRadius: '50%', background: dm ? '#60a5fa' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'left 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
          </div>
          <div className="nav-mob-controls">
            <button onClick={() => setDarkMode(!dm)}
              style={{ width: 40, height: 22, borderRadius: 11, background: dm ? '#1e40af' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.3s', padding: 0, flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: dm ? 20 : 2, top: 2, width: 18, height: 18, borderRadius: '50%', background: dm ? '#60a5fa' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'left 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {dm ? <Moon size={10} color="#0f172a" /> : <Sun size={10} color="#f59e0b" />}
              </div>
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dm ? '#0c1219' : '#f1f5f9', border: `1px solid ${t.navBorder}`, borderRadius: 4, cursor: 'pointer', color: t.text }}>
              <Menu size={18} />
            </button>
          </div>
        </nav>
      </div>

      {mobileMenuOpen && (
        <div className="mob-dropdown open" style={{ background: dm ? '#0c1219' : '#ffffff', borderBottom: `1px solid ${t.navBorder}` }}>
          {navItems.map(item => (
            <a key={item} href={navHref(item)}
              onClick={() => setMobileMenuOpen(false)}
              style={{ display: 'block', padding: '13px 24px', borderBottom: `1px solid ${t.navBorder}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: t.textMuted, fontFamily: "'Montserrat',sans-serif", textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = t.text}
              onMouseLeave={e => e.currentTarget.style.color = t.textMuted}
            >{item}</a>
          ))}
        </div>
      )}

      <div>

        {/* Hero */}
        <section style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center', padding: '80px 24px' }}>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 900, fontSize: 'clamp(28px,4vw,48px)', marginBottom: 24, color: t.text, lineHeight: 1.2 }}>
            A Premium Trade Journal,<br />
            <span style={{ background: 'linear-gradient(to right,#3b82f6,#2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Without The Subscription.
            </span>
          </h1>
          <p style={{ fontSize: 18, color: t.textMuted, maxWidth: 600, margin: '0 auto 12px', lineHeight: 1.7 }}>
            A complete execution database and performance analysis system for serious traders.
          </p>
          <p style={{ fontSize: 16, color: t.textAccent, fontWeight: 500, maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.8 }}>
            Log trades. Capture decisions. Track psychology.<br />
            Identify patterns. Refine execution. <strong style={{ color: t.text }}>Build your edge.</strong>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 48 }}>
            <div style={{ display: 'flex' }}>{[...Array(5)].map((_,i) => <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />)}</div>
            <span style={{ color: t.textMuted, fontSize: 14 }}>Trusted by thousands of traders · See our reviews on Trustpilot</span>
          </div>
          <div style={{ display: 'inline-block', padding: 6, borderRadius: 9999, border: '2px dashed #3b82f6' }}>
            <Link href="/journal" style={{ ...navFont, background: 'linear-gradient(to right,#2563eb,#3b82f6)', borderRadius: 9999, fontSize: 16, border: 'none', cursor: 'pointer', color: '#fff', padding: '12px 32px', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              Start Now - It's Free! <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        {/* Dashboard preview */}
        <section style={{ padding: '60px 24px', background: t.sectionAlt }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', background: dm ? 'linear-gradient(135deg,#1e293b,#0f172a)' : '#fff', borderRadius: 16, padding: 32, border: `1px solid ${t.cardBorder}`, boxShadow: dm ? '0 25px 50px rgba(0,0,0,0.4)' : '0 10px 40px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
              {[{ label:'Winrate', value:'69.67%', w:'69.67%' },{ label:'Avg Win / Avg Loss', value:'0.89', w:'45%' }].map((s,i) => (
                <div key={i} style={{ background: t.cardBg, borderRadius: 12, padding: 24, border: `1px solid ${t.cardBorder}` }}>
                  <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: t.statValue, marginBottom: 12 }}>{s.value}</div>
                  <div style={{ height: 10, background: t.progressBg, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: s.w, height: '100%', background: 'linear-gradient(to right,#2563eb,#60a5fa)', borderRadius: 5 }} />
                  </div>
                </div>
              ))}
              <div style={{ background: t.cardBg, borderRadius: 12, padding: 24, border: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 8 }}>Trade Count</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: t.statValue }}>1131</div>
                <svg viewBox="0 0 200 40" style={{ width: '100%', height: 48, marginTop: 12 }}>
                  <defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#60a5fa"/></linearGradient></defs>
                  <polyline points="0,30 20,25 40,28 60,20 80,22 100,18 120,15 140,20 160,17 180,15 200,12" fill="none" stroke="url(#g1)" strokeWidth="2"/>
                </svg>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, color: t.dayLabel, fontWeight: 500, paddingBottom: 4 }}>{d}</div>
              ))}
              {calData.map((profit, i) => {
                const pos = profit > 0;
                return (
                  <div key={i} style={{ aspectRatio: '1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, background: pos ? t.calWin : t.calLoss, border: `1px solid ${pos ? t.calWinBorder : t.calLossBorder}` }}>
                    <span style={{ color: pos ? t.calWinText : t.calLossText }}>{pos ? '+' : ''}{Math.round(profit)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Brokers */}
        <section style={{ padding: '48px 24px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h3 style={{ ...oswald, textAlign: 'center', fontSize: 22, color: t.textMuted, marginBottom: 40 }}>Compatible with Brokers</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 24, textAlign: 'center' }}>
              {brokers.map((b,i) => <div key={i} style={{ color: t.textMuted, fontWeight: 600, fontSize: 13 }}>{b}</div>)}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" style={{ padding: '60px 24px', background: t.sectionAlt }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ ...oswald, fontSize: 36, textAlign: 'center', color: t.text, marginBottom: 12 }}>Unlock Powerful Insights</h2>
            <p style={{ textAlign: 'center', color: t.textMuted, fontSize: 18, marginBottom: 48, maxWidth: 600, margin: '0 auto 48px' }}>The most comprehensive analytics dashboard that can be customised to your needs</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 24 }}>
              {features.map((f,i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: 24, borderRadius: 12, background: t.featureCardBg, border: `1px solid ${t.cardBorder}` }}>
                  <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', padding: 12, borderRadius: 10, flexShrink: 0, color: '#fff' }}>{f.icon}</div>
                  <div>
                    <h3 style={{ ...oswald, fontSize: 20, color: t.text, marginBottom: 6 }}>{f.title}</h3>
                    <p style={{ color: t.textMuted, lineHeight: 1.6 }}>{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mobile Section */}
        <section style={{ padding: '60px 24px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 260, background: t.mobilePhoneBg, borderRadius: 40, border: `2px solid ${t.mobilePhoneBorder}`, boxShadow: t.mobilePhoneShadow, overflow: 'hidden' }}>
                <div style={{ background: t.mobileTopBar, padding: '16px 20px 12px', borderBottom: `1px solid ${t.mobileTopBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ ...oswald, fontSize: 10, letterSpacing: '0.05em' }}>
                    <span style={{ color: t.text }}>FSD </span><span style={{ color: '#3b82f6' }}>Journal</span>
                  </span>
                  <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#2563eb,#60a5fa)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={13} color="white" />
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    {[{ value:'67.92%', label:'Winrate', w:'68%' },{ value:'97.46%', label:'Daily Winrate', w:'97%' }].map((s,i) => (
                      <div key={i} style={{ background: t.mobileCard, borderRadius: 14, padding: '14px 12px', border: `1px solid ${t.mobileCardBorder}` }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: t.mobileStatValue }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: t.mobileLabel, marginTop: 4 }}>{s.label}</div>
                        <div style={{ marginTop: 8, height: 3, background: t.mobileBarBg, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: s.w, height: '100%', background: 'linear-gradient(to right,#2563eb,#60a5fa)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: t.mobileCard, borderRadius: 14, padding: 16, border: `1px solid ${t.mobileCardBorder}`, marginBottom: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: t.mobileStatValue }}>€19,800.72</div>
                    <div style={{ fontSize: 10, color: t.mobileLabel, marginTop: 4 }}>Total Profit</div>
                    <svg viewBox="0 0 180 30" style={{ width: '100%', height: 30, marginTop: 10 }}>
                      <defs><linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#60a5fa"/></linearGradient></defs>
                      <polyline points="0,25 20,20 40,22 60,15 80,17 100,12 120,10 140,13 160,9 180,6" fill="none" stroke="url(#cg)" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[{ value:'1,131', label:'Trades' },{ value:'0.89', label:'Avg Win/Loss' }].map((s,i) => (
                      <div key={i} style={{ background: t.mobileCard, borderRadius: 14, padding: '14px 12px', border: `1px solid ${t.mobileCardBorder}` }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: t.mobileStatValue }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: t.mobileLabel, marginTop: 4 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: '12px 20px 20px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 40, height: 4, background: t.mobileHomebar, borderRadius: 2 }} />
                </div>
              </div>
            </div>
            <div>
              <h2 style={{ ...oswald, fontSize: 32, color: t.text, marginBottom: 16, lineHeight: 1.2 }}>Realtime Statistics Keep You Updated Anywhere In The World</h2>
              <p style={{ fontSize: 18, color: t.textMuted, marginBottom: 32 }}>Automatic import from your MT5 account makes tracking your performance easier than ever</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {mobileFeatures.map((f,i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', padding: 8, borderRadius: 8, flexShrink: 0, color: '#fff' }}>{f.icon}</div>
                    <span style={{ fontSize: 17, color: t.text }}>{f.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" style={{ padding: '60px 24px', background: t.sectionAlt }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ ...oswald, fontSize: 36, textAlign: 'center', color: t.text, marginBottom: 48 }}>Join 10,000+ Traders Who Chose FSD Journal</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
              {testimonials.map((r,i) => (
                <div key={i} style={{ background: t.testimonialBg, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: 24 }}>
                  <div style={{ display: 'flex', marginBottom: 10 }}>{[...Array(r.rating)].map((_,j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div>
                  <p style={{ color: t.textMuted, marginBottom: 12, fontSize: 13, fontStyle: 'italic' }}>"{r.text}"</p>
                  <div style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{r.name}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 48 }}>
              <div style={{ display: 'inline-block', padding: 6, borderRadius: 9999, border: '2px dashed #3b82f6' }}>
                <Link href="/journal" style={{ ...navFont, background: 'linear-gradient(to right,#2563eb,#3b82f6)', borderRadius: 9999, fontSize: 16, border: 'none', cursor: 'pointer', color: '#fff', padding: '12px 32px', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                  Join us now <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ background: '#080c10', borderTop: '1px solid #0f1923', padding: '60px 24px 0' }}>
          <style>{`
            .footer-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:48px; padding-bottom:60px; }
            .footer-bottom-bar { display:flex; justify-content:space-between; align-items:center; }
            .footer-legal-links { display:flex; gap:24px; }
            @media (max-width: 900px) { .footer-grid { grid-template-columns:1fr 1fr; gap:36px; } }
            @media (max-width: 560px) {
              .footer-grid { grid-template-columns:1fr; gap:32px; }
              .footer-bottom-bar { flex-direction:column; align-items:flex-start; gap:12px; }
              .footer-legal-links { flex-wrap:wrap; gap:16px; }
            }
          `}</style>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div className="footer-grid">
              <div>
                <div style={{ marginBottom: 28 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', fontFamily: "'Montserrat',sans-serif" }}>
                    <span style={{ color: '#ffffff' }}>FSDZONES</span>
                    <span style={{ color: '#4da8f0' }}>.COM</span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Twitter', path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
                    { label: 'YouTube', path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
                    { label: 'Facebook', path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
                    { label: 'Instagram', path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
                  ].map(({ label, path }) => (
                    <a key={label} href="#" aria-label={label} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #172233', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a6580', textDecoration: 'none', transition: 'color 0.2s, border-color 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#c8d8e8'; e.currentTarget.style.borderColor = '#2a3a4a'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#4a6580'; e.currentTarget.style.borderColor = '#172233'; }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={path}/></svg>
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: '#c8d8e8', marginBottom: 24, marginTop: 0 }}>MARKETS</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {['MAJOR FOREX PAIRS','US INDICES (NAS/SPX)','COMMODITIES (GOLD/OIL)','CRYPTOCURRENCY','INSTITUTIONAL ORDER FLOW'].map(item => (
                    <a key={item} href="#" style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: '#3b82f6', textDecoration: 'none', transition: 'color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'} onMouseLeave={e => e.currentTarget.style.color = '#3b82f6'}>
                      {item}
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: '#c8d8e8', marginBottom: 24, marginTop: 0 }}>RESOURCES</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {['FREE TRADING JOURNAL','SESSION CLOCK (TSC)','ECONOMIC CALENDAR','STRATEGY BLOG','BACKTESTING DATA'].map(item => (
                    <a key={item} href="#" style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: '#3b82f6', textDecoration: 'none', transition: 'color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'} onMouseLeave={e => e.currentTarget.style.color = '#3b82f6'}>
                      {item}
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <h4 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: '#c8d8e8', marginBottom: 16, marginTop: 0 }}>STAY UPDATED</h4>
                <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: '#4a6580', letterSpacing: '0.04em', lineHeight: 1.7, marginBottom: 20 }}>
                  GET INTRADAY ZONE ALERTS AND MACRO UPDATES DIRECTLY TO YOUR INBOX.
                </p>
                <div style={{ display: 'flex' }}>
                  <input type="email" placeholder="EMAIL ADDRESS"
                    style={{ flex: 1, minWidth: 0, background: '#0c1219', border: '1px solid #172233', borderRight: 'none', borderRadius: '4px 0 0 4px', padding: '10px 14px', color: '#c8d8e8', fontSize: 11, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, letterSpacing: '0.06em', outline: 'none' }}
                  />
                  <button style={{ flexShrink: 0, background: '#2563eb', border: 'none', borderRadius: '0 4px 4px 0', padding: '10px 18px', color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'} onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}>
                    JOIN
                  </button>
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #0f1923', padding: '24px 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="footer-bottom-bar">
                <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', color: '#4a6580' }}>
                  © 2026 FSDZONES.COM | ALL RIGHTS RESERVED
                </span>
                <div className="footer-legal-links">
                  {['PRIVACY POLICY','TERMS OF SERVICE','CONTACT'].map(item => (
                    <a key={item} href="#" style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', color: '#4a6580', textDecoration: 'none', transition: 'color 0.2s', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#c8d8e8'} onMouseLeave={e => e.currentTarget.style.color = '#4a6580'}>
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

      </div>
    </div>
  );
}
