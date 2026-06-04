import React, { useState } from 'react';
import { BarChart3, Calendar, PieChart, Diamond, Star, Check, ArrowRight, TrendingUp } from 'lucide-react';
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import { AuroraBackground } from "@/components/ui/aurora-background";

const headerFont = { fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: '0.02em' } as const;
const navFont = { fontFamily: "'Montserrat', sans-serif", fontWeight: 800 } as const;

const features = [
  { icon: <Calendar className="w-6 h-6" />, title: "Stay Organised", description: "Track your trades and review your performance by day, week, or month" },
  { icon: <BarChart3 className="w-6 h-6" />, title: "Analyze Strategies", description: "Easily analyze and compare the success rates of different strategies" },
  { icon: <Diamond className="w-6 h-6" />, title: "Spot Patterns", description: "Identify patterns in your wins and losses to refine your trading schedule" },
  { icon: <PieChart className="w-6 h-6" />, title: "Professional Journaling", description: "Journal your trades and thoughts like a pro trader" },
];

const mobileFeatures = [
  { icon: <Check className="w-5 h-5" />, title: "Fully automated process" },
  { icon: <Check className="w-5 h-5" />, title: "Mobile friendly" },
  { icon: <Check className="w-5 h-5" />, title: "Check your performance in realtime" },
  { icon: <Check className="w-5 h-5" />, title: "Lightweight and optimised" },
];

const brokers = [
  { name: "InstaForex",    logo: "/broker-instaforex.svg" },
  { name: "LMAX Exchange", logo: "/broker-lmax.png" },
  { name: "Pepperstone",   logo: "/broker-pepperstone.png" },
  { name: "TICKMILL",      logo: "/broker-tickmill.png" },
  { name: "Admirals",      logo: "/broker-admirals.png" },
  { name: "AXITRADER",     logo: "/broker-axitrader.png" },
];

export default function HomePage() {
  const [darkMode, setDarkMode] = useState(false);

  const t = darkMode ? {
    pageBg: 'linear-gradient(to bottom, #020817, #0f172a, #020817)',
    sectionAlt: 'rgba(15,23,42,0.6)', cardBg: '#0f172a', cardBorder: '#1e293b',
    text: '#ffffff', textMuted: '#94a3b8', textAccent: '#60a5fa',
    featureCardBg: 'rgba(30,41,59,0.5)',
    mobilePhoneBg: 'linear-gradient(145deg, #0f172a, #1e293b)', mobilePhoneBorder: '#334155',
    mobilePhoneShadow: '0 0 60px rgba(59,130,246,0.15), 0 25px 50px rgba(0,0,0,0.6)',
    mobileTopBar: 'linear-gradient(to bottom, #0f172a, #1e293b)', mobileTopBorder: '#1e293b',
    mobileCard: 'linear-gradient(135deg, #0f172a, #1e3a5f)', mobileCardBorder: 'rgba(30,64,175,0.3)',
    mobileStatValue: '#60a5fa', mobileLabel: '#94a3b8', mobileBarBg: '#1e293b', mobileHomebar: '#334155',
  } : {
    pageBg: '#ffffff',
    sectionAlt: 'rgba(241,245,249,0.8)', cardBg: '#ffffff', cardBorder: '#e2e8f0',
    text: '#0f172a', textMuted: '#64748b', textAccent: '#2563eb',
    featureCardBg: 'rgba(248,250,252,0.9)',
    mobilePhoneBg: 'linear-gradient(145deg, #ffffff, #f1f5f9)', mobilePhoneBorder: '#cbd5e1',
    mobilePhoneShadow: '0 0 60px rgba(59,130,246,0.1), 0 25px 50px rgba(0,0,0,0.12)',
    mobileTopBar: 'linear-gradient(to bottom, #ffffff, #f8fafc)', mobileTopBorder: '#e2e8f0',
    mobileCard: 'linear-gradient(135deg, #eff6ff, #dbeafe)', mobileCardBorder: 'rgba(147,197,253,0.5)',
    mobileStatValue: '#1d4ed8', mobileLabel: '#64748b', mobileBarBg: '#e2e8f0', mobileHomebar: '#cbd5e1',
  };

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, color: t.text, transition: 'all 0.4s ease', fontFamily: "'Poppins', sans-serif" }}>
      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath="/" />

      {/* Hero with Aurora */}
      <AuroraBackground darkMode={darkMode} className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl mb-6 leading-tight" style={{ ...navFont, color: t.text }}>
            A Premium Trade Journal,
            <br />
            <span style={{ background: 'linear-gradient(to right, #3b82f6, #2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Without The Subscription.
            </span>
          </h1>
          <p className="text-lg mb-3 max-w-2xl mx-auto" style={{ color: t.textMuted, lineHeight: '1.7' }}>
            A complete execution database and performance analysis system for serious traders.
          </p>
          <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: t.textAccent, fontWeight: 500, lineHeight: '1.8' }}>
            Log trades. Capture decisions. Track psychology.<br />
            Identify patterns. Refine execution.{' '}
            <span style={{ color: t.text, fontWeight: 700 }}>Build your edge.</span>
          </p>
          <div className="flex items-center justify-center space-x-2 mb-12">
            <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />)}</div>
            <span style={{ color: t.textMuted }}>Trusted by thousands of traders · See our reviews on Trustpilot</span>
          </div>
          <div className="flex justify-center">
            <div style={{ padding: '6px', borderRadius: '9999px', border: '2px dashed #3b82f6', display: 'inline-block' }}>
              <a href="/auth?mode=signup" target="myfm_journal"
                className="flex items-center gap-2 px-8 py-3 text-white font-semibold transition-all hover:scale-105"
                style={{ ...navFont, background: 'linear-gradient(to right, #2563eb, #3b82f6)', borderRadius: '9999px', fontSize: '1rem', textDecoration: 'none' }}>
                <span>Start Now - It&apos;s Free!</span>
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </AuroraBackground>

      {/* Brokers */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-center text-2xl mb-12" style={{ ...headerFont, color: t.textMuted }}>Compatible with Brokers</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center justify-items-center">
            {brokers.map((b, i) => (
              <div key={i} className="flex flex-col items-center gap-2 group cursor-default">
                <img
                  src={b.logo}
                  alt={b.name}
                  className={`h-10 w-10 object-contain rounded-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-md ${darkMode ? 'opacity-70 group-hover:opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
                />
                <span className="text-xs font-semibold" style={{ color: t.textMuted }}>{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8" style={{ background: t.sectionAlt, transition: 'all 0.4s ease' }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl text-center mb-4" style={{ ...headerFont, color: t.text }}>Unlock Powerful Insights</h2>
          <p className="text-xl text-center mb-16 max-w-3xl mx-auto" style={{ color: t.textMuted }}>
            The most comprehensive analytics dashboard that can be customised to your needs
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((f, i) => (
              <div key={i} className="group flex items-start gap-4 p-6 rounded-xl border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                style={{ background: t.featureCardBg, borderColor: t.cardBorder }}>
                <div className="p-3 rounded-xl shrink-0 text-white transition-transform duration-300 group-hover:scale-110"
                  style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)' }}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-xl mb-2" style={{ ...headerFont, color: t.text }}>{f.title}</h3>
                  <p style={{ color: t.textMuted }}>{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats / Mobile mockup */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex justify-center lg:justify-start">
            <div style={{ width: '300px', background: t.mobilePhoneBg, borderRadius: '40px', border: `2px solid ${t.mobilePhoneBorder}`, boxShadow: t.mobilePhoneShadow, overflow: 'hidden', transition: 'all 0.4s ease' }}>
              <div style={{ background: t.mobileTopBar, padding: '16px 20px 12px', borderBottom: `1px solid ${t.mobileTopBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.05em' }}>
                  <span style={{ color: t.text }}>Myfm</span><span style={{ color: '#3b82f6' }}>Journal</span>
                </span>
                <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #2563eb, #60a5fa)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={13} color="white" />
                </div>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  {[{ value: '67.92%', label: 'Winrate', w: '68%' }, { value: '97.46%', label: 'Daily Winrate', w: '97%' }].map((s, i) => (
                    <div key={i} style={{ background: t.mobileCard, borderRadius: '14px', padding: '14px 12px', border: `1px solid ${t.mobileCardBorder}` }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: t.mobileStatValue }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: t.mobileLabel, marginTop: '4px' }}>{s.label}</div>
                      <div style={{ marginTop: '8px', height: '3px', background: t.mobileBarBg, borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: s.w, height: '100%', background: 'linear-gradient(to right, #2563eb, #60a5fa)' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background: t.mobileCard, borderRadius: '14px', padding: '16px', border: `1px solid ${t.mobileCardBorder}`, marginBottom: '10px' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: t.mobileStatValue }}>€19,800.72</div>
                  <div style={{ fontSize: '10px', color: t.mobileLabel, marginTop: '4px' }}>Total Profit</div>
                  <svg viewBox="0 0 180 30" style={{ width: '100%', height: '30px', marginTop: '10px' }}>
                    <defs><linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#60a5fa" /></linearGradient></defs>
                    <polyline points="0,25 20,20 40,22 60,15 80,17 100,12 120,10 140,13 160,9 180,6" fill="none" stroke="url(#cg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[{ value: '1,131', label: 'Trades' }, { value: '0.89', label: 'Avg Win/Loss' }].map((s, i) => (
                    <div key={i} style={{ background: t.mobileCard, borderRadius: '14px', padding: '14px 12px', border: `1px solid ${t.mobileCardBorder}` }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: t.mobileStatValue }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: t.mobileLabel, marginTop: '4px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '12px 20px 20px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '40px', height: '4px', background: t.mobileHomebar, borderRadius: '2px' }} />
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-4xl mb-4" style={{ ...headerFont, color: t.text }}>Realtime Statistics Keep You Updated Anywhere In The World</h2>
            <p className="text-xl mb-8" style={{ color: t.textMuted }}>Automatic import from your MT5 account makes tracking your performance easier than ever</p>
            <div className="space-y-4">
              {mobileFeatures.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="p-2 rounded-lg shrink-0 text-white" style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)' }}>{f.icon}</div>
                  <span style={{ fontSize: '18px', color: t.text }}>{f.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PricingSection darkMode={darkMode} />
      <TestimonialsSection darkMode={darkMode} />
      <HomeFooter darkMode={darkMode} />
    </div>
  );
}
