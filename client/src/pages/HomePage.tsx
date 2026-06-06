import { useState } from 'react';
import { BarChart3, Calendar, PieChart, Diamond, Check, ArrowRight, Search, BookOpen, Brain } from 'lucide-react';
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import HomeStatsSection from "@/components/HomeStatsSection";

const serif = { fontFamily: "'Playfair Display', serif" } as const;
const sans  = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const;

const features = [
  { icon: <BookOpen size={18} />,  title: "Trade Journal",    sub: "Free forever" },
  { icon: <BarChart3 size={18} />, title: "Analytics",        sub: "Premium" },
  { icon: <Brain size={18} />,     title: "AI Coach",         sub: "From $20/mo" },
  { icon: <Calendar size={18} />,  title: "Econ. Calendar",   sub: "Free" },
  { icon: <Diamond size={18} />,   title: "Signals",          sub: "Included" },
  { icon: <PieChart size={18} />,  title: "Broker Sync",      sub: "50+ brokers" },
];

const steps = [
  { n: "01", icon: <Search size={20} />,    title: "Connect your broker",       desc: "Link your MT4/MT5 account in seconds. Trades import automatically — no manual entry needed." },
  { n: "02", icon: <Calendar size={20} />,  title: "Log & journal trades",      desc: "Capture context, screenshots, and psychology for every trade. Build a searchable decision database." },
  { n: "03", icon: <BarChart3 size={20} />, title: "Analyse & build your edge", desc: "Spot patterns in wins and losses. Refine strategy, timing, and execution habits with AI insights." },
];

const trustItems = ["MT5 Auto-Import", "No Subscription Required", "AI-Powered Analytics", "GDPR Compliant", "Real-time Sync", "50+ Brokers Supported"];

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
      <style>{`@keyframes hp-mq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.hp-mq{display:inline-flex;animation:hp-mq 40s linear infinite}`}</style>
      <HomeHeader darkMode={dm} setDarkMode={setDarkMode} activePath="/" />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6 lg:px-8">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:999, border:`1px solid ${border}`, fontSize:12, color:muted, marginBottom:28, fontWeight:600 }}>
              <span style={{ color:'#f59e0b' }}>★</span> The #1 Trade Journal for Retail Traders
            </div>
            <h1 style={{ ...serif, fontSize:'clamp(2.6rem,4.5vw,4rem)', fontWeight:900, lineHeight:1.1, marginBottom:20, color:text }}>
              Your trades,<br />
              <em style={{ fontStyle:'italic', color:'#2563eb' }}>analyzed smart.</em>
            </h1>
            <p style={{ fontSize:17, color:muted, lineHeight:1.8, marginBottom:32, maxWidth:440 }}>
              A complete execution database and performance analytics system. Log trades, capture decisions, and build your edge — for free.
            </p>
            <div style={{ display:'flex', gap:8, marginBottom:20, maxWidth:420 }}>
              <input type="email" placeholder="Enter your email address"
                style={{ flex:1, padding:'12px 16px', borderRadius:10, border:`1.5px solid ${border}`, fontSize:14, background:card, color:text, outline:'none' }} />
              <a href="/auth?mode=signup" target="myfm_journal"
                style={{ padding:'12px 20px', borderRadius:10, background:'#2563eb', color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
                Start free <ArrowRight size={15} />
              </a>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 20px' }}>
              {["MT5 Auto-Import", "No subscription", "Real-time sync"].map(t => (
                <span key={t} style={{ display:'flex', alignItems:'center', gap:5, fontSize:13, color:muted }}>
                  <Check size={13} color="#10b981" strokeWidth={3} /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Feature cards grid */}
          <div>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.2em', textTransform:'uppercase', color:muted, marginBottom:10 }}>OUR FEATURES</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {features.map((f, i) => (
                <div key={i} style={{ padding:'16px 14px', borderRadius:14, border:`1px solid ${border}`, background:card, cursor:'default', transition:'box-shadow 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                  <div style={{ marginBottom:8, color:'#2563eb' }}>{f.icon}</div>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:2, color:text }}>{f.title}</div>
                  <div style={{ fontSize:11, color:muted }}>{f.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:muted, textAlign:'right', marginTop:8 }}>
              Or <a href="/auth" style={{ color:'#2563eb', textDecoration:'none', fontWeight:600 }}>sign in to your account →</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust marquee ────────────────────────────────────────────── */}
      <div style={{ background:'#0f172a', borderTop:'1px solid #1e293b', borderBottom:'1px solid #1e293b', padding:'13px 0', overflow:'hidden', whiteSpace:'nowrap' }}>
        <div className="hp-mq" style={{ gap:48, fontWeight:700, fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'#4b5563' }}>
          {[...trustItems, ...trustItems].map((t, i) => (
            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:10, flexShrink:0, paddingRight:48 }}>
              <span style={{ width:4, height:4, borderRadius:'50%', background:'#3b82f6', display:'inline-block', flexShrink:0 }} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-8" style={{ background:bg2, transition:'all 0.4s ease' }}>
        <div className="max-w-6xl mx-auto">
          <p style={{ textAlign:'center', fontSize:10, fontWeight:800, letterSpacing:'0.22em', textTransform:'uppercase', color:'#2563eb', marginBottom:14 }}>HOW IT WORKS</p>
          <h2 style={{ ...serif, fontSize:'clamp(1.9rem,3vw,2.8rem)', fontWeight:900, textAlign:'center', marginBottom:12, color:text }}>
            How MyfmJournal works
          </h2>
          <p style={{ textAlign:'center', fontSize:16, color:muted, marginBottom:60, maxWidth:520, margin:'0 auto 60px' }}>
            From broker connection to edge-building in three steps — no manual entry, no hassle.
          </p>
          <div className="grid md:grid-cols-3 gap-12">
            {steps.map((s, i) => (
              <div key={i}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
                  <span style={{ ...serif, fontSize:'3.5rem', fontWeight:900, lineHeight:1, color:dm?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)', letterSpacing:'-0.02em' }}>{s.n}</span>
                  <div style={{ width:44, height:44, borderRadius:12, border:`1.5px solid ${border}`, display:'flex', alignItems:'center', justifyContent:'center', color:'#2563eb', flexShrink:0, background:card }}>
                    {s.icon}
                  </div>
                </div>
                <h3 style={{ ...serif, fontSize:'1.2rem', fontWeight:700, marginBottom:10, color:text }}>{s.title}</h3>
                <p style={{ fontSize:14, color:muted, lineHeight:1.8 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Brokers ──────────────────────────────────────────────────── */}
      <section className="py-14 px-6" style={{ borderTop:`1px solid ${border}`, borderBottom:`1px solid ${border}` }}>
        <div className="max-w-5xl mx-auto">
          <p style={{ textAlign:'center', fontSize:12, color:muted, marginBottom:22, fontWeight:600 }}>Compatible with 50+ brokers including</p>
          <div className="flex flex-wrap justify-center gap-8 items-center" style={{ opacity:0.5 }}>
            {["/broker-instaforex.svg","/broker-lmax.png","/broker-pepperstone.png","/broker-tickmill.png","/broker-admirals.png","/broker-axitrader.png"].map((l, i) => (
              <img key={i} src={l} alt="" className="h-8 object-contain grayscale hover:grayscale-0 transition-all" />
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
