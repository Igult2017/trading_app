import { useEffect, useState } from "react";
import { BarChart3, Calendar, PieChart, Diamond, Star, Check, ArrowRight, TrendingUp } from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { TradingCalendar, PerformanceInsights } from '@/components/LandingDemoComponents';


export default function HomePage() {
  const { darkMode, setDarkMode } = usePublicTheme();
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
    calWin: '#dbeafe',
    calWinBorder: '#3b82f6',
    calLoss: '#fee2e2',
    calLossBorder: '#ef4444',
    calWinText: '#1e40af',
    calLossText: '#b91c1c',
    dayLabel: '#475569',
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

  const navFont = { fontFamily: "'Inter',sans-serif", fontWeight: 600 };
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
    { name: "Jordan K.", text: "I love how Myfmjournal helps me track my performance and improve my strategies.", rating: 5 },
    { name: "Sarah T.", text: "This tool is fantastic, the user interface could be even more intuitive.", rating: 5 },
    { name: "Michael R.", text: "Myfmjournal has changed the way I analyze my trading operations.", rating: 5 },
    { name: "Emily W.", text: "An excellent tool for traders. Easy to use and very comprehensive.", rating: 5 },
    { name: "David P.", text: "I've tried other journaling platforms, but Myfmjournal is by far the best!", rating: 5 },
    { name: "Jessica L.", text: "The stats dashboard is so detailed and customizable. It's made a huge difference to my trading.", rating: 5 },
    { name: "Chris N.", text: "The community features have helped me connect with other traders and share strategies.", rating: 5 }
  ];

  const brokers = ["InstaForex", "LMAX Exchange", "Pepperstone", "TICKMILL", "Admirals", "AXITRADER"];

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, color: t.text, transition: 'background 0.3s', fontFamily: "'Poppins',sans-serif",
      ['--hf-bg' as string]:              dm ? '#080c10' : '#f1f5f9',
      ['--hf-border' as string]:          dm ? '#0f1923' : '#e2e8f0',
      ['--hf-heading' as string]:         dm ? '#c8d8e8' : '#334155',
      ['--hf-logo' as string]:            dm ? '#ffffff' : '#0f172a',
      ['--hf-link' as string]:            '#3b82f6',
      ['--hf-link-hover' as string]:      dm ? '#60a5fa' : '#1d4ed8',
      ['--hf-input-bg' as string]:        dm ? '#0c1219' : '#ffffff',
      ['--hf-input-border' as string]:    dm ? '#172233' : '#cbd5e1',
      ['--hf-input-text' as string]:      dm ? '#c8d8e8' : '#334155',
      ['--hf-copyright' as string]:       dm ? '#4a6580' : '#64748b',
      ['--hf-copyright-hover' as string]: dm ? '#c8d8e8' : '#0f172a',
      ['--hf-risk' as string]:            dm ? '#2a3a4a' : '#94a3b8',
    } as React.CSSProperties}>
      <style>{`
        /* ── Responsive landing-page layout ───────────────────────── */
        .lp-nav { padding: 0; }
        .lp-section { padding: 80px 24px; }
        .lp-section-sm { padding: 60px 24px; }
        .lp-section-xs { padding: 48px 24px; }
        .lp-hero-h1 { font-size: clamp(28px, 4vw, 48px); }
        .lp-hero-p1 { font-size: 18px; }
        .lp-hero-p2 { font-size: 16px; }
        .lp-section-h2 { font-size: 36px; }
        .lp-section-h2-md { font-size: 32px; }
        .lp-section-sub { font-size: 18px; }
        .lp-dash-card { padding: 32px; border-radius: 16px; }
        .lp-dash-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .lp-stats-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
        .lp-dash-cell { padding: 24px; }
        .lp-dash-stat { font-size: 32px; }
        .lp-brokers-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 24px; }
        .lp-features-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
        .lp-mob-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
        .lp-pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .lp-testimonials-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .lp-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .lp-cal-cell { font-size: 10px; }
        .lp-stars-row { gap: 8px; flex-wrap: wrap; padding: 0 12px; text-align: center; }

        @media (max-width: 1024px) {
          .lp-pricing-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
          .lp-testimonials-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-section-h2 { font-size: 30px; }
          .lp-section-h2-md { font-size: 26px; }
        }

        @media (max-width: 768px) {
          .lp-nav { padding: 0; }
          .lp-section { padding: 56px 16px; }
          .lp-section-sm { padding: 40px 16px; }
          .lp-section-xs { padding: 32px 16px; }
          .lp-hero-p1 { font-size: 15px; line-height: 1.6; }
          .lp-hero-p2 { font-size: 13px; line-height: 1.7; }
          .lp-section-h2 { font-size: 24px; }
          .lp-section-h2-md { font-size: 22px; }
          .lp-section-sub { font-size: 14px; }
          .lp-dash-card { padding: 16px; border-radius: 12px; }
          .lp-dash-grid { grid-template-columns: 1fr; gap: 10px; }
          .lp-stats-strip { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .lp-dash-cell { padding: 16px; }
          .lp-dash-stat { font-size: 24px; }
          .lp-brokers-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .lp-features-grid { grid-template-columns: 1fr; gap: 14px; }
          .lp-mob-grid { grid-template-columns: 1fr; gap: 32px; }
          .lp-pricing-grid { grid-template-columns: 1fr; gap: 14px; }
          .lp-testimonials-grid { grid-template-columns: 1fr; gap: 14px; }
          .lp-cal-grid { gap: 3px; }
          .lp-cal-cell { font-size: 8px; }
          .lp-stars-row { font-size: 12px; gap: 6px; }
        }

        @media (max-width: 420px) {
          .lp-brokers-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath="/" />

      <div>

        {/* Hero */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <h1 className="lp-hero-h1" style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 900, marginBottom: 24, color: t.text, lineHeight: 1.2 }}>
            A Premium Trade Journal,<br />
            <span style={{ background: 'linear-gradient(to right,#3b82f6,#2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Without The Subscription.
            </span>
          </h1>
          <p className="lp-hero-p1" style={{ color: t.textMuted, maxWidth: 600, margin: '0 auto 12px', lineHeight: 1.7 }}>
            A complete execution database and performance analysis system for serious traders.
          </p>
          <p className="lp-hero-p2" style={{ color: t.textAccent, fontWeight: 500, maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.8 }}>
            Log trades. Capture decisions. Track psychology.<br />
            Identify patterns. Refine execution. <strong style={{ color: t.text }}>Build your edge.</strong>
          </p>
          <div className="lp-stars-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 48 }}>
            <div style={{ display: 'flex' }}>{[...Array(5)].map((_,i) => <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />)}</div>
            <span style={{ color: t.textMuted, fontSize: 14 }}>Trusted by thousands of traders · See our reviews on Trustpilot</span>
          </div>
          <div style={{ display: 'inline-block', padding: 6, borderRadius: 9999, border: '2px dashed #3b82f6' }}>
            <a href="/auth" target="myfm_journal" rel="noopener noreferrer" style={{ ...navFont, background: 'linear-gradient(to right,#2563eb,#3b82f6)', borderRadius: 9999, fontSize: 16, border: 'none', cursor: 'pointer', color: '#fff', padding: '12px 32px', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              Start Now - It's Free! <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </section>

        {/* Trading Calendar */}
        <section id="features" className="lp-section-sm" style={{ background: t.sectionAlt }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <TradingCalendar dm={dm} />
          </div>
        </section>

        {/* Brokers */}
        <section className="lp-section-xs">
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h3 style={{ ...oswald, textAlign: 'center', fontSize: 22, color: t.textMuted, marginBottom: 40 }}>Compatible with Brokers</h3>
            <div className="lp-brokers-grid" style={{ textAlign: 'center' }}>
              {brokers.map((b,i) => <div key={i} style={{ color: t.textMuted, fontWeight: 600, fontSize: 13 }}>{b}</div>)}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="lp-section-sm" style={{ background: t.sectionAlt }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 className="lp-section-h2" style={{ ...oswald, textAlign: 'center', color: t.text, marginBottom: 12 }}>Unlock Powerful Insights</h2>
            <p className="lp-section-sub" style={{ textAlign: 'center', color: t.textMuted, marginBottom: 48, maxWidth: 600, margin: '0 auto 48px' }}>The most comprehensive analytics dashboard that can be customised to your needs</p>
            <div className="lp-features-grid">
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

        {/* Performance Insights */}
        <section className="lp-section-sm">
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 32 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#2563eb,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TrendingUp size={24} color="#fff" />
              </div>
              <div>
                <h2 style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 'clamp(22px,3vw,30px)', color: t.text, margin: '0 0 8px' }}>Performance Insights</h2>
                <p style={{ color: t.textMuted, fontSize: 15, lineHeight: 1.6, margin: 0, maxWidth: 700 }}>Break down your win rate by instrument, session, market regime, strategy, and timeframe to find exactly where your edge lives.</p>
              </div>
            </div>
            <PerformanceInsights dm={dm} />
          </div>
        </section>

        {/* Mobile Section */}
        <section className="lp-section-sm">
          <div className="lp-mob-grid" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ width: 260, background: t.mobilePhoneBg, borderRadius: 40, border: `2px solid ${t.mobilePhoneBorder}`, boxShadow: t.mobilePhoneShadow, overflow: 'hidden' }}>
                <div style={{ background: t.mobileTopBar, padding: '16px 20px 12px', borderBottom: `1px solid ${t.mobileTopBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ ...oswald, fontSize: 10, letterSpacing: '0.01em', color: t.text, fontWeight: 900 }}>
                    Myfmjournal
                  </span>
                  <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#2563eb,#60a5fa)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={13} color="white" />
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    {[{ value:'67.92%', label:'Winrate', w:'68%' },{ value:'97.46%', label:'Daily Winrate', w:'97%' }].map((s,i) => (
                      <div key={i} style={{ background: t.mobileCard, borderRadius: 14, padding: '14px 12px', border: `1px solid ${t.mobileCardBorder}` }}>
                        <div style={{ fontSize: 16, fontWeight: 500, color: t.mobileStatValue, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
                        <div style={{ fontSize: 9, color: t.mobileLabel, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{s.label}</div>
                        <div style={{ marginTop: 8, height: 3, background: t.mobileBarBg, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: s.w, height: '100%', background: 'linear-gradient(to right,#2563eb,#60a5fa)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: t.mobileCard, borderRadius: 14, padding: 16, border: `1px solid ${t.mobileCardBorder}`, marginBottom: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: t.mobileStatValue, fontFamily: "'DM Mono', monospace" }}>$19,800.72</div>
                    <div style={{ fontSize: 9, color: t.mobileLabel, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>Total Profit</div>
                    <svg viewBox="0 0 180 30" style={{ width: '100%', height: 30, marginTop: 10 }}>
                      <defs><linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#60a5fa"/></linearGradient></defs>
                      <polyline points="0,25 20,20 40,22 60,15 80,17 100,12 120,10 140,13 160,9 180,6" fill="none" stroke="url(#cg)" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[{ value:'1,131', label:'Trades' },{ value:'0.89', label:'Avg Win/Loss' }].map((s,i) => (
                      <div key={i} style={{ background: t.mobileCard, borderRadius: 14, padding: '14px 12px', border: `1px solid ${t.mobileCardBorder}` }}>
                        <div style={{ fontSize: 16, fontWeight: 500, color: t.mobileStatValue, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
                        <div style={{ fontSize: 9, color: t.mobileLabel, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{s.label}</div>
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
              <h2 className="lp-section-h2-md" style={{ ...oswald, color: t.text, marginBottom: 16, lineHeight: 1.2 }}>Realtime Statistics Keep You Updated Anywhere In The World</h2>
              <p className="lp-section-sub" style={{ color: t.textMuted, marginBottom: 32 }}>Automatic import from your MT5 account makes tracking your performance easier than ever</p>
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

        {/* Pricing */}
        <section id="pricing" className="lp-section">
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 className="lp-section-h2" style={{ ...oswald, textAlign: 'center', color: t.text, marginBottom: 12 }}>Simple, Transparent Pricing</h2>
            <p className="lp-section-sub" style={{ textAlign: 'center', color: t.textMuted, marginBottom: 56 }}>Start free. Upgrade when you're ready.</p>
            <div className="lp-pricing-grid" style={{ maxWidth: 1160, margin: '0 auto' }}>

              {/* Free */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: t.textMuted, marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>FREE</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 44, fontWeight: 900, color: t.text, lineHeight: 1, fontFamily: "'Montserrat',sans-serif" }}>$0</span>
                    <span style={{ fontSize: 13, color: t.textMuted, marginBottom: 7 }}>/forever</span>
                  </div>
                  <p style={{ fontSize: 12, color: t.textMuted, marginTop: 8 }}>Core stats to get you started.</p>
                </div>
                <div style={{ width: '100%', height: 1, background: t.cardBorder }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Total P&L & Win Rate', 'R Expectancy & Profit Factor', 'Avg Trade & Trade Count', 'Trade calendar view', 'Link MT4 & MT5'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <Check size={13} color="#64748b" strokeWidth={3} />
                      <span style={{ fontSize: 12, color: t.textMuted }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/auth" target="myfm_journal" rel="noopener noreferrer" style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 8, border: `1px solid ${t.cardBorder}`, color: t.textMuted, fontWeight: 700, fontSize: 12, fontFamily: "'Montserrat',sans-serif", letterSpacing: '0.06em', textDecoration: 'none', transition: 'all 0.15s', background: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#475569'; (e.currentTarget as HTMLElement).style.color = t.text; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.cardBorder; (e.currentTarget as HTMLElement).style.color = t.textMuted; }}>
                  START FREE
                </a>
              </div>

              {/* Weekly */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#3b82f6', marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>WEEKLY</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 44, fontWeight: 900, color: t.text, lineHeight: 1, fontFamily: "'Montserrat',sans-serif" }}>$7</span>
                    <span style={{ fontSize: 13, color: t.textMuted, marginBottom: 7 }}>/week</span>
                  </div>
                  <p style={{ fontSize: 12, color: t.textMuted, marginTop: 8 }}>Try the full journal risk-free.</p>
                </div>
                <div style={{ width: '100%', height: 1, background: t.cardBorder }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Everything in Free', 'Full journal access', 'Detailed analytics & drawdown', 'Strategy audit engine', 'Edge building tools', 'Psychology scoring', 'Trade vault & filtering'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <Check size={13} color="#3b82f6" strokeWidth={3} />
                      <span style={{ fontSize: 12, color: t.textMuted }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/auth" target="myfm_journal" rel="noopener noreferrer" style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 8, border: `1px solid #3b82f6`, color: '#3b82f6', fontWeight: 700, fontSize: 12, fontFamily: "'Montserrat',sans-serif", letterSpacing: '0.06em', textDecoration: 'none', transition: 'all 0.15s', background: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  GET STARTED
                </a>
              </div>

              {/* Monthly — Most Popular */}
              <div style={{ background: dm ? 'linear-gradient(145deg,#1e3a5f,#0f172a)' : t.cardBg, border: '2px solid #3b82f6', borderRadius: 16, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', boxShadow: '0 0 40px rgba(59,130,246,0.18)' }}>
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(to right,#2563eb,#3b82f6)', borderRadius: 99, padding: '4px 16px', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#fff', whiteSpace: 'nowrap', fontFamily: "'Montserrat',sans-serif" }}>MOST POPULAR</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#3b82f6', marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>MONTHLY</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 44, fontWeight: 900, color: t.text, lineHeight: 1, fontFamily: "'Montserrat',sans-serif" }}>$20</span>
                    <span style={{ fontSize: 13, color: t.textMuted, marginBottom: 7 }}>/month</span>
                  </div>
                  <p style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>Full power for serious traders.</p>
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 7, background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)', fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
                    + TradeSync Copier included → <strong>$27/mo</strong>
                  </div>
                </div>
                <div style={{ width: '100%', height: 1, background: t.cardBorder }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    'Everything in Weekly',
                    'AI Coach (Trader AI Chat)',
                    'AI trade analysis & chart validation',
                    'Behavior pattern breakdown',
                    'Timeframe performance metrics',
                    'Multi-account tracking',
                    'Export reports',
                    'Performance comparisons',
                    'Priority support',
                  ].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <Check size={13} color="#3b82f6" strokeWidth={3} />
                      <span style={{ fontSize: 12, color: t.textMuted }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/auth" target="myfm_journal" rel="noopener noreferrer" style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 8, background: 'linear-gradient(to right,#2563eb,#3b82f6)', color: '#fff', fontWeight: 800, fontSize: 12, fontFamily: "'Montserrat',sans-serif", letterSpacing: '0.06em', textDecoration: 'none', border: 'none' }}>
                  GET STARTED
                </a>
              </div>

              {/* Yearly */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(to right,#16a34a,#22c55e)', borderRadius: 99, padding: '4px 16px', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#fff', whiteSpace: 'nowrap', fontFamily: "'Montserrat',sans-serif" }}>BEST VALUE</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#22c55e', marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>YEARLY</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 44, fontWeight: 900, color: t.text, lineHeight: 1, fontFamily: "'Montserrat',sans-serif" }}>$180</span>
                    <span style={{ fontSize: 13, color: t.textMuted, marginBottom: 7 }}>/year</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#22c55e', marginTop: 4, fontWeight: 600 }}>Save $60 vs monthly · $15/mo</p>
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 7, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                    + TradeSync Copier included → <strong>$220/yr</strong>
                  </div>
                </div>
                <div style={{ width: '100%', height: 1, background: t.cardBorder }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    'Everything in Monthly',
                    'Annual performance review',
                    'Early access to new features',
                    'Dedicated onboarding session',
                    'SMC signal scanner access',
                  ].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <Check size={13} color="#22c55e" strokeWidth={3} />
                      <span style={{ fontSize: 12, color: t.textMuted }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/auth" target="myfm_journal" rel="noopener noreferrer" style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 8, border: `1px solid #22c55e`, color: '#22c55e', fontWeight: 700, fontSize: 12, fontFamily: "'Montserrat',sans-serif", letterSpacing: '0.06em', textDecoration: 'none', transition: 'all 0.15s', background: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,0.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  GET STARTED
                </a>
              </div>

            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="reviews" className="lp-section-sm" style={{ background: t.sectionAlt }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2 className="lp-section-h2" style={{ ...oswald, textAlign: 'center', color: t.text, marginBottom: 48 }}>Join 10,000+ Traders Who Chose Myfmjournal</h2>
            <div className="lp-testimonials-grid">
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
                <a href="/auth" target="myfm_journal" rel="noopener noreferrer" style={{ ...navFont, background: 'linear-gradient(to right,#2563eb,#3b82f6)', borderRadius: 9999, fontSize: 16, border: 'none', cursor: 'pointer', color: '#fff', padding: '12px 32px', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                  Join us now <ArrowRight className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <HomeFooter darkMode={darkMode} />

      </div>
    </div>
  );
}
