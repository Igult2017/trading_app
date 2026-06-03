import { useState } from "react";
import { usePublicTheme } from "@/context/PublicThemeContext";
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";

// ─────────────────────────────────────────────
//  Static data
// ─────────────────────────────────────────────

const FEATURES = [
  { icon: "📓", title: "Trade Journal",         desc: "Log every trade in a structured multi-step form. Capture entry, exit, risk, psychology, and confluence factors." },
  { icon: "📸", title: "Screenshot & OCR",      desc: "Upload a chart screenshot and let AI extract price, SL, TP, and symbol automatically." },
  { icon: "📊", title: "Performance Analytics", desc: "Track P&L, win rate, profit factor, R-expectancy, drawdown, and more — across sessions, strategies, and timeframes." },
  { icon: "📉", title: "Drawdown Analysis",     desc: "Visualise peak-to-valley declines, recovery time, and ulcer index to manage your risk precisely." },
  { icon: "🔬", title: "Strategy Audit Engine", desc: "Grade your trading system based on edge persistence, risk entropy, and Monte Carlo simulation." },
  { icon: "🤖", title: "Trader AI Coach",       desc: "Ask your AI coach to analyse your drawdown, identify your worst setups, or build a strategy from your own data." },
];

const AI_CHATS = [
  {
    prompt: "Analyse my drawdown from last month",
    metrics: [
      { label: "Max Drawdown", value: "-8.2%",    sub: "vs -12.5% limit", danger: true  },
      { label: "Avg Drawdown", value: "-3.1%",    sub: "below threshold", danger: false },
      { label: "Recovery Time",value: "4.2 days", sub: "within target",   danger: false },
    ],
    analysis: "Your worst drawdown occurred during the NY session on days with high-impact news. 6 of your 8 losing streaks started within 30 minutes of a red news event.",
    recommendation: "Avoid trading 1 hour before and after high-impact USD/GBP news events. This single rule would have prevented 73% of your worst drawdowns.",
    actions: ["View Drawdown Report", "Set News Filter Rule"],
  },
  {
    prompt: "What are my worst-performing setups?",
    metrics: [
      { label: "Worst Setup", value: "FOMO Entry",  sub: "-42% win rate",      danger: true  },
      { label: "Avg Loss",    value: "-$183",        sub: "on reactive trades", danger: true  },
      { label: "Best Setup",  value: "Structure BO", sub: "+71% win rate",      danger: false },
    ],
    analysis: "Trades entered more than 5 minutes after your original signal fire at a 38% win rate vs 71% for on-plan entries. Late entries are costing you significantly.",
    recommendation: "If you missed your original entry, skip the trade entirely. Late-entry trades have a negative expectancy of -0.4R vs +0.84R for on-time entries.",
    actions: ["See Full Setup Report", "Compare Entry Timing"],
  },
  {
    prompt: "Build a strategy from my best conditions",
    metrics: [
      { label: "Best Session", value: "London", sub: "+72% win rate",    danger: false },
      { label: "Best TF",      value: "H1/H4",  sub: "confluence stack", danger: false },
      { label: "Projected R",  value: "+1.2R",  sub: "per trade avg",    danger: false },
    ],
    analysis: "Your edge is concentrated in the London open (08:00–10:30 GMT) on H1 with H4 confirmation. Trend-following breakouts in this window achieve 72% win rate vs 51% at other times.",
    recommendation: "Restrict your trading to the London open window only. With H1/H4 confluence, target 2:1 RR minimum. This would have produced your best 3 months on record.",
    actions: ["Generate Strategy Blueprint", "Backtest Conditions"],
  },
];

const BROKERS = ["InstaForex","LMAX Exchange","Pepperstone","TICKMILL","Admirals","AXITRADER","MetaTrader 4","MetaTrader 5","cTrader"];

const PRICING_PLANS = [
  { name:"Free",    price:"$0",   period:"forever",  badge: null,                  highlight:false, desc:"Start tracking your trades with no commitment.",            cta:"Get Started Free",   features:["Core trade stats","Trade calendar view","MT4/MT5 integration","Basic P&L tracking","Up to 50 trades/month"] },
  { name:"Weekly",  price:"$7",   period:"/ week",   badge: null,                  highlight:false, desc:"Full access for traders testing the waters.",                cta:"Start Weekly",        features:["Everything in Free","Full trade journal","Detailed analytics","Strategy audit","Unlimited trades"] },
  { name:"Monthly", price:"$20",  period:"/ month",  badge:"Most Popular",         highlight:true,  desc:"The complete platform for serious traders.",                 cta:"Start Monthly",       features:["Everything in Weekly","AI Coach (Trader AI)","Behaviour analysis","Export reports (PDF/CSV)","TradeSync Copier add-on"] },
  { name:"Yearly",  price:"$180", period:"/ year",   badge:"Best Value — $15/mo",  highlight:false, desc:"Maximum value for committed traders.",                       cta:"Start Yearly",        features:["Everything in Monthly","SMC Signal Scanner","Priority support","Onboarding session","TradeSync Copier add-on"] },
];

const TESTIMONIALS = [
  { name:"James O.",  flag:"🇬🇧", role:"Forex Trader · 3 yrs",   quote:"The drawdown analysis alone is worth the subscription. I cut my max DD from 14% to 6% in two months just by following the AI recommendations." },
  { name:"Amara K.",  flag:"🇿🇦", role:"Crypto Trader · 1 yr",   quote:"Finally a journal that doesn't feel like a spreadsheet. The strategy audit gave me an A- grade after cleaning up my late entries." },
  { name:"Lucas M.",  flag:"🇧🇷", role:"Swing Trader · 5 yrs",   quote:"The timeframe matrix showed me I was losing money trading M15 when 80% of my profitable trades were on H4. Game changer." },
  { name:"Fatima R.", flag:"🇳🇬", role:"SMC Trader · 2 yrs",     quote:"TradeSync lets me share my trades with my students automatically. The signal provider mode is exactly what I needed to monetise my edge." },
  { name:"Chen W.",   flag:"🇨🇳", role:"Day Trader · 4 yrs",     quote:"I was sceptical about the AI coach but it pinpointed a pattern I had missed for 2 years — I was overtrading on Friday afternoons consistently." },
  { name:"Sophie D.", flag:"🇫🇷", role:"Options Trader · 2 yrs", quote:"The economic calendar integration means I never trade into a news event unaware. The sentiment overlay is a feature I didn't know I needed." },
];

// ─────────────────────────────────────────────
//  Inline sub-components
// ─────────────────────────────────────────────

function HeroDashboard() {
  return (
    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, padding:18, fontFamily:"'DM Mono',monospace", fontSize:12, boxShadow:"0 32px 80px rgba(37,99,235,0.15)", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,#2563eb,#3b82f6,transparent)" }}/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span style={{ color:"#94a3b8", fontSize:11 }}>PORTFOLIO OVERVIEW</span>
        <span style={{ color:"#16a34a", fontSize:11 }}>● LIVE</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
        {([["Net P&L","+$4,827","+12.4%"],["Win Rate","67.3%","142 trades"],["Profit Factor","2.41","R-Exp: 0.84"]] as [string,string,string][]).map(([label,val,sub],i)=>(
          <div key={i} style={{ background:"rgba(15,23,42,0.6)", borderRadius:10, padding:10, border:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ color:"#64748b", fontSize:10, marginBottom:4 }}>{label}</div>
            <div style={{ color:"#16a34a", fontSize:16, fontWeight:700, marginBottom:2 }}>{val}</div>
            <div style={{ color:"#64748b", fontSize:10 }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ background:"rgba(37,99,235,0.03)", borderRadius:10, padding:12, border:"1px solid #1e293b", marginBottom:12 }}>
        <div style={{ color:"#64748b", fontSize:10, marginBottom:8 }}>EQUITY CURVE (30D)</div>
        <svg viewBox="0 0 300 56" style={{ width:"100%", height:56 }}>
          <defs>
            <linearGradient id="lp2cg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d="M0,52 L20,46 L45,48 L65,38 L90,40 L115,28 L135,26 L155,17 L175,19 L195,11 L215,7 L240,9 L265,4 L300,1" fill="none" stroke="#3b82f6" strokeWidth="2"/>
          <path d="M0,52 L20,46 L45,48 L65,38 L90,40 L115,28 L135,26 L155,17 L175,19 L195,11 L215,7 L240,9 L265,4 L300,1 L300,56 L0,56 Z" fill="url(#lp2cg)"/>
        </svg>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {([["EUR/USD","BUY","+2.3R","09:42"],["GOLD","SELL","+1.1R","11:15"],["GBP/USD","BUY","-0.8R","14:33"]] as [string,string,string,string][]).map(([pair,dir,r,time],i)=>(
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", background:"rgba(37,99,235,0.04)", borderRadius:8, border:"1px solid #1e293b" }}>
            <span style={{ color:"#f1f5f9", fontWeight:600, fontSize:11 }}>{pair}</span>
            <span style={{ color:dir==="BUY"?"#16a34a":"#dc2626", fontSize:10 }}>{dir}</span>
            <span style={{ color:r.startsWith("+")?"#16a34a":"#dc2626", fontSize:11 }}>{r}</span>
            <span style={{ color:"#64748b", fontSize:10 }}>{time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoContent({ tab, c }: { tab: string; c: Record<string,string> }) {
  const bd      = c.border;
  const cardBg  = `rgba(37,99,235,0.04)`;
  const muted   = "#64748b";

  if (tab === "Journal") return (
    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        {[["Symbol","EUR/USD"],["Direction","BUY"],["Entry","1.08420"],["Stop Loss","1.08120"],["Take Profit","1.08960"],["Risk %","1.0%"]].map(([l,v],i)=>(
          <div key={i} style={{ background:cardBg, padding:10, borderRadius:8, border:`1px solid ${bd}` }}>
            <div style={{ color:muted, fontSize:10, marginBottom:4 }}>{l}</div>
            <div style={{ color:c.heading, fontWeight:600 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ background:cardBg, padding:12, borderRadius:8, border:`1px solid ${bd}`, marginBottom:12 }}>
        <div style={{ color:muted, fontSize:10, marginBottom:6 }}>PSYCHOLOGY & NOTES</div>
        <div style={{ color:c.text, fontSize:12, lineHeight:1.6 }}>London session breakout confirmed. Bullish structure on H4. Followed plan — no hesitation on entry. Mental state: confident.</div>
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {["Breakout","Trend Follow","London Session","H4 Bias"].map((t,i)=>(
          <span key={i} style={{ background:"rgba(59,130,246,0.15)", color:"#3b82f6", padding:"4px 10px", borderRadius:50, fontSize:10, border:"1px solid rgba(59,130,246,0.2)" }}>{t}</span>
        ))}
      </div>
    </div>
  );

  if (tab === "Analytics") return (
    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:14 }}>
        {([["P&L","+$4,827",true],["Win Rate","67.3%",true],["Max DD","-8.2%",false],["Profit F.","2.41",true]] as [string,string,boolean][]).map(([l,v,g],i)=>(
          <div key={i} style={{ background:cardBg, padding:10, borderRadius:8, border:`1px solid ${bd}`, textAlign:"center" }}>
            <div style={{ color:muted, fontSize:10, marginBottom:4 }}>{l}</div>
            <div style={{ color:g?"#16a34a":"#dc2626", fontSize:15, fontWeight:700 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ background:cardBg, borderRadius:10, padding:12, border:`1px solid ${bd}` }}>
        <div style={{ color:muted, fontSize:10, marginBottom:10 }}>WIN RATE BY SESSION</div>
        {([["London",72],["New York",65],["Asian",48],["NY/LN Overlap",78]] as [string,number][]).map(([s,p],i)=>(
          <div key={i} style={{ marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ color:muted, fontSize:10 }}>{s}</span>
              <span style={{ color:p>60?"#16a34a":"#d97706", fontSize:10 }}>{p}%</span>
            </div>
            <div style={{ background:"rgba(37,99,235,0.06)", borderRadius:4, height:6 }}>
              <div style={{ background:p>60?"#16a34a":"#d97706", width:`${p}%`, height:"100%", borderRadius:4 }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (tab === "Trade Vault") return (
    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {["All","Wins","Losses","BE"].map((f,i)=>(
          <button key={i} style={{ background:i===0?"#2563eb":"rgba(37,99,235,0.06)", color:i===0?"white":c.heading, border:"none", padding:"5px 12px", borderRadius:6, fontSize:11, cursor:"pointer" }}>{f}</button>
        ))}
      </div>
      {[{pair:"EUR/USD",date:"Jun 03",r:"+2.3R",status:"WIN",tag:"Breakout"},{pair:"GOLD",date:"Jun 03",r:"+1.1R",status:"WIN",tag:"Trend"},{pair:"GBP/USD",date:"Jun 02",r:"-0.8R",status:"LOSS",tag:"Reversal"},{pair:"BTC/USD",date:"Jun 02",r:"+3.1R",status:"WIN",tag:"Momentum"}].map((t,i)=>(
        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:10, background:cardBg, borderRadius:8, border:`1px solid ${bd}`, marginBottom:6 }}>
          <div>
            <div style={{ color:c.heading, fontWeight:600, fontSize:12 }}>{t.pair}</div>
            <div style={{ color:muted, fontSize:10 }}>{t.date}</div>
          </div>
          <span style={{ background:"rgba(59,130,246,0.1)", color:"#3b82f6", padding:"2px 8px", borderRadius:4, fontSize:10 }}>{t.tag}</span>
          <span style={{ color:t.status==="WIN"?"#16a34a":"#dc2626", fontSize:13, fontWeight:700 }}>{t.r}</span>
        </div>
      ))}
    </div>
  );

  // Strategy Audit
  return (
    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>
      <div style={{ textAlign:"center", marginBottom:16 }}>
        <div style={{ color:muted, fontSize:10, marginBottom:6 }}>STRATEGY GRADE</div>
        <div style={{ fontSize:48, fontWeight:900, color:"#16a34a", lineHeight:1 }}>A-</div>
        <div style={{ color:muted, fontSize:11 }}>Breakout Momentum System</div>
      </div>
      {([["Edge Persistence",84,"#16a34a"],["Risk Entropy",72,"#d97706"],["Execution Quality",91,"#16a34a"],["Monte Carlo (95%)",68,"#d97706"]] as [string,number,string][]).map(([label,val,color],i)=>(
        <div key={i} style={{ marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ color:muted, fontSize:10 }}>{label}</span>
            <span style={{ color, fontSize:10 }}>{val}/100</span>
          </div>
          <div style={{ background:"rgba(37,99,235,0.06)", borderRadius:4, height:6 }}>
            <div style={{ background:color, width:`${val}%`, height:"100%", borderRadius:4 }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────

export default function HomePage() {
  const { darkMode, setDarkMode } = usePublicTheme();
  const dm = darkMode;

  const [demoTab,    setDemoTab]    = useState("Journal");
  const [activeChat, setActiveChat] = useState(0);

  const chat = AI_CHATS[activeChat];

  // Theme palette
  const c: Record<string,string> = {
    page:       dm ? "#020817" : "#ffffff",
    soft:       dm ? "#0c1219" : "#f8fafc",
    alt:        dm ? "#0f172a" : "#f1f5f9",
    card:       dm ? "#0f172a" : "#ffffff",
    border:     dm ? "#1e293b" : "#e2e8f0",
    borderDark: dm ? "#334155" : "#cbd5e1",
    muted:      "#64748b",
    text:       dm ? "#94a3b8" : "#334155",
    heading:    dm ? "#f1f5f9" : "#0f172a",
  };

  const sec = (bg: string): React.CSSProperties => ({ padding:"100px 0", background: bg });
  const wrap: React.CSSProperties = { maxWidth:1200, margin:"0 auto", padding:"0 24px" };
  const lbl: React.CSSProperties  = { fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, fontWeight:700, letterSpacing:3, textTransform:"uppercase", color:"#2563eb", marginBottom:16, display:"block" };
  const ttl: React.CSSProperties  = { fontFamily:"'Sora',sans-serif", fontSize:"clamp(26px,4vw,48px)" as any, fontWeight:800, color:c.heading, lineHeight:1.12, marginBottom:16 };
  const grad: React.CSSProperties = { background:"linear-gradient(135deg,#2563eb,#3b82f6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" };
  const card: React.CSSProperties = { background:c.card, border:`1px solid ${c.border}`, borderRadius:16, transition:"all 0.3s ease" };

  return (
    <div style={{ background:c.page, color:c.text, fontFamily:"'DM Sans',sans-serif", overflowX:"hidden" }}>
      <style>{`
        @keyframes lp2-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes lp2-blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes lp2-fadeup{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        .lp2-fi{animation:lp2-fadeup .7s ease forwards}
        .lp2-fi1{animation:lp2-fadeup .7s .1s ease forwards;opacity:0}
        .lp2-fi2{animation:lp2-fadeup .7s .2s ease forwards;opacity:0}
        .lp2-fi3{animation:lp2-fadeup .7s .3s ease forwards;opacity:0}
        .lp2-fi4{animation:lp2-fadeup .7s .4s ease forwards;opacity:0}
        .lp2-fi5{animation:lp2-fadeup .7s .5s ease forwards;opacity:0}
        .lp2-ch:hover{border-color:rgba(37,99,235,0.3)!important;box-shadow:0 8px 40px rgba(37,99,235,0.09)!important;transform:translateY(-4px)!important}
        .lp2-bp{background:#2563eb;color:#fff;border:none;padding:14px 32px;border-radius:50px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15px;cursor:pointer;transition:all .3s;box-shadow:0 4px 20px rgba(37,99,235,.25);text-decoration:none;display:inline-block}
        .lp2-bp:hover{background:#1d4ed8;transform:translateY(-2px);box-shadow:0 8px 32px rgba(37,99,235,.4)}
        .lp2-bs{background:transparent;border:1.5px solid #cbd5e1;padding:13px 28px;border-radius:50px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:all .3s;text-decoration:none;display:inline-block}
        .lp2-bs:hover{border-color:#2563eb!important;color:#2563eb!important;background:rgba(37,99,235,.05)!important}
        .lp2-gbg{background-image:linear-gradient(rgba(37,99,235,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.04) 1px,transparent 1px);background-size:40px 40px}
        .lp2-aib{background:rgba(37,99,235,.05);border:1px solid #e2e8f0;border-radius:10px;padding:11px 16px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:#64748b;transition:all .2s;text-align:left;width:100%;display:flex;align-items:center;gap:8px}
        .lp2-aib.act{background:rgba(37,99,235,.12);border-color:rgba(37,99,235,.4)}
        .lp2-aib:hover:not(.act){background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.2)}
        .lp2-hg{display:grid;grid-template-columns:90px repeat(6,1fr);gap:4px}
        .lp2-er{display:grid;grid-template-columns:58px 44px 88px 1fr 60px 60px 60px;gap:6px;align-items:center;padding:13px 18px;border-bottom:1px solid ${c.border};font-size:12px;font-family:'DM Mono',monospace}
        @media(max-width:768px){
          .lp2-s{padding:56px 0!important}
          .lp2-hi{flex-direction:column!important;gap:36px!important}
          .lp2-hd{max-width:100%!important;min-width:unset!important;animation:none!important;opacity:1!important}
          .lp2-tc{flex-direction:column!important;gap:32px!important}
          .lp2-fg{grid-template-columns:1fr!important}
          .lp2-pg{grid-template-columns:1fr!important}
          .lp2-pf{transform:none!important}
          .lp2-dt button{flex:1 1 45%!important;font-size:11px!important}
          .lp2-tg{grid-template-columns:1fr!important}
          .lp2-hs{overflow-x:auto;-webkit-overflow-scrolling:touch}
          .lp2-hg{min-width:480px}
          .lp2-es{overflow-x:auto;-webkit-overflow-scrolling:touch}
          .lp2-er{min-width:540px}
        }
        @media(max-width:480px){
          .lp2-stat{flex-direction:column!important;gap:14px!important}
          .lp2-dt button{flex:1 1 100%!important}
          .lp2-aim{flex-wrap:wrap!important}
        }
      `}</style>

      <HomeHeader darkMode={dm} setDarkMode={setDarkMode} activePath="/" />

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="lp2-s lp2-gbg" style={{ ...sec(c.soft), paddingTop:72, paddingBottom:100, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"10%", left:"5%", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(37,99,235,.07) 0%,transparent 70%)", pointerEvents:"none" }}/>
        <div style={wrap}>
          <div className="lp2-hi" style={{ display:"flex", alignItems:"center", gap:52, flexWrap:"wrap" }}>
            <div style={{ flex:1, minWidth:280, position:"relative", zIndex:1 }}>
              <div className="lp2-fi" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(37,99,235,.08)", border:"1px solid rgba(37,99,235,.2)", borderRadius:50, padding:"6px 14px", marginBottom:22, fontSize:13, color:"#2563eb" }}>
                <span style={{ color:"#d97706" }}>★★★★★</span>
                <span>Trusted by 10,000+ traders</span>
              </div>
              <h1 className="lp2-fi1" style={{ ...ttl, fontSize:"clamp(32px,5vw,60px)" as any, letterSpacing:"-1.5px", marginBottom:18 }}>
                The Trading Journal<br/>
                <span style={grad}>That Works As Hard</span><br/>
                As You Do
              </h1>
              <p className="lp2-fi2" style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, marginBottom:16, lineHeight:1.6 }}>
                Execution database + performance analytics for Forex, Crypto & Commodities traders.
              </p>
              <div className="lp2-fi3" style={{ display:"flex", gap:14, marginBottom:30, flexWrap:"wrap" }}>
                {["Log trades","Capture decisions","Track psychology","Build your edge"].map((item,i)=>(
                  <span key={i} style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#2563eb", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ color:"#16a34a" }}>◆</span>{item}
                  </span>
                ))}
              </div>
              <div className="lp2-fi4" style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
                <a href="/auth?mode=signup" target="myfm_journal" className="lp2-bp" style={{ fontSize:15, padding:"14px 32px" }}>Start Free — No Credit Card</a>
                <button className="lp2-bs" style={{ color:dm?"#94a3b8":"#475569" }} onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior:"smooth" })}>See How It Works ↓</button>
              </div>
              <div className="lp2-fi5 lp2-stat" style={{ marginTop:36, display:"flex", gap:28, flexWrap:"wrap" }}>
                {[["$0","Free forever tier"],["67.3%","Avg user win rate"],["2.4x","Profit factor tracked"]].map(([val,label],i)=>(
                  <div key={i}>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, color:c.heading }}>{val}</div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:c.muted }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lp2-hd" style={{ flex:1, minWidth:300, maxWidth:460, animation:"lp2-fadeup .9s ease .4s forwards", opacity:0 }}>
              <HeroDashboard/>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────── */}
      <section className="lp2-s" id="features" style={sec(c.soft)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <span style={lbl}>Platform Features</span>
            <h2 style={ttl}>Everything You Need to <span style={grad}>Build Your Edge</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:560, margin:"0 auto" }}>A complete workspace built for serious traders who measure everything.</p>
          </div>
          <div className="lp2-fg" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:18 }}>
            {FEATURES.map((f,i)=>(
              <div key={i} className="lp2-ch" style={{ ...card, padding:26 }}>
                <div style={{ fontSize:34, marginBottom:14 }}>{f.icon}</div>
                <h3 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:18, fontWeight:600, color:c.heading, marginBottom:10 }}>{f.title}</h3>
                <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:c.muted, lineHeight:1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE DEMO ─────────────────────────────────────────────── */}
      <section className="lp2-s" id="demo" style={sec(c.page)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <span style={lbl}>Live Preview</span>
            <h2 style={ttl}>See The Platform <span style={grad}>In Action</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto" }}>A genuine look at the product. No marketing fluff.</p>
          </div>
          <div style={{ maxWidth:680, margin:"0 auto" }}>
            <div className="lp2-dt" style={{ display:"flex", gap:4, background:c.card, borderRadius:"12px 12px 0 0", padding:8, border:`1px solid ${c.border}`, borderBottom:"none", flexWrap:"wrap" }}>
              {["Journal","Analytics","Trade Vault","Strategy Audit"].map(t=>(
                <button key={t} onClick={()=>setDemoTab(t)} style={{ flex:1, minWidth:80, padding:"8px 4px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontFamily:"'DM Sans',sans-serif", fontWeight:600, transition:"all .2s", background:demoTab===t?"#2563eb":"transparent", color:demoTab===t?"white":c.muted }}>{t}</button>
              ))}
            </div>
            <div style={{ background:c.card, border:`1px solid ${c.border}`, borderTop:"none", borderRadius:"0 0 16px 16px", padding:20, position:"relative", minHeight:300 }}>
              <div style={{ position:"absolute", top:10, right:12, display:"flex", gap:5, alignItems:"center" }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:"#16a34a", display:"inline-block", animation:"lp2-blink 2s ease infinite" }}/>
                <span style={{ fontSize:10, color:c.muted, fontFamily:"'DM Mono',monospace" }}>REAL PLATFORM DATA</span>
              </div>
              <DemoContent tab={demoTab} c={c}/>
            </div>
            <div style={{ textAlign:"center", marginTop:22 }}>
              <a href="/auth?mode=signup" target="myfm_journal" className="lp2-bp">Try it yourself — it's free</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── TIMEFRAME MATRIX ──────────────────────────────────────── */}
      <section className="lp2-s" style={sec(c.alt)}>
        <div style={wrap}>
          <div className="lp2-tc" style={{ display:"flex", gap:60, alignItems:"flex-start", flexWrap:"wrap" }}>
            <div style={{ flex:1, minWidth:280 }}>
              <span style={lbl}>Intelligence Layer</span>
              <h2 style={ttl}>Find Exactly Where <span style={grad}>Your Edge Lives</span></h2>
              <div style={{ width:48, height:3, background:"#2563eb", borderRadius:2, marginBottom:32 }}/>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:c.muted, lineHeight:1.7, marginBottom:22 }}>
                Stop guessing which timeframe performs best. The Timeframe Matrix shows win rates broken down by session and timeframe so you can trade your best conditions every time.
              </p>
              {["Timeframe Matrix — win rate by M1 through D1","Session Performance — London, NY, Asian & overlap","Strategy Audit — grading your entire system"].map((t,i)=>(
                <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:13 }}>
                  <span style={{ color:"#3b82f6", marginTop:2 }}>◆</span>
                  <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:c.text }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ flex:1.3, minWidth:280 }}>
              <div className="lp2-hs">
                <div style={{ background:c.card, border:`1px solid ${c.border}`, borderRadius:16, padding:18, fontFamily:"'DM Mono',monospace", fontSize:11 }}>
                  <div style={{ marginBottom:10, color:c.muted, fontSize:10 }}>WIN RATE HEATMAP (%)</div>
                  <div className="lp2-hg">
                    <div/>
                    {["M1","M5","M15","H1","H4","D1"].map(tf=><div key={tf} style={{ textAlign:"center", color:"#3b82f6", padding:"5px 2px" }}>{tf}</div>)}
                    {(["London","New York","Asian","Overlap"]).map((s,si)=>{
                      const row = [[48,62,71,67,74,58],[52,58,64,72,69,55],[41,45,51,48,52,44],[61,71,78,82,77,65]][si];
                      const gc = (v: number) => v>=75?"rgba(34,197,94,.6)":v>=65?"rgba(34,197,94,.3)":v>=55?"rgba(245,158,11,.3)":"rgba(239,68,68,.25)";
                      return [
                        <div key={`s${si}`} style={{ color:c.muted, display:"flex", alignItems:"center", fontSize:11 }}>{s}</div>,
                        ...row.map((v,ti)=>(
                          <div key={`${si}-${ti}`} style={{ background:gc(v), borderRadius:6, padding:"7px 2px", textAlign:"center", color:c.heading, fontWeight:600, border:`1px solid rgba(37,99,235,.06)`, fontSize:11 }}>{v}%</div>
                        ))
                      ];
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRADER AI ────────────────────────────────────────────── */}
      <section className="lp2-s" id="ai" style={sec(c.page)}>
        <div style={wrap}>
          <div className="lp2-tc" style={{ display:"flex", gap:60, alignItems:"flex-start", flexWrap:"wrap" }}>
            <div style={{ flex:1, minWidth:280 }}>
              <span style={lbl}>Trader AI</span>
              <h2 style={ttl}>Your Personal Trading Coach, <span style={grad}>Powered by AI</span></h2>
              <div style={{ width:48, height:3, background:"#2563eb", borderRadius:2, marginBottom:32 }}/>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:c.muted, lineHeight:1.7, marginBottom:22 }}>
                Not a chatbot. A genuine AI coach that reads your actual trade data and gives specific, actionable feedback.
              </p>
              {["Google Gemini AI integration","Persistent chat history across sessions","Policy suggestions from your patterns","Custom strategy blueprints from your data"].map((t,i)=>(
                <div key={i} style={{ display:"flex", gap:12, marginBottom:11 }}>
                  <span style={{ color:"#16a34a", fontFamily:"'DM Mono',monospace", fontSize:14 }}>✓</span>
                  <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:c.text }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ flex:1.3, minWidth:280 }}>
              <div style={{ background:c.card, border:`1px solid ${c.border}`, borderRadius:20, overflow:"hidden", boxShadow:"0 8px 40px rgba(37,99,235,.06)" }}>
                <div style={{ padding:"13px 16px", borderBottom:`1px solid ${c.border}`, background:c.soft, display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#2563eb,#3b82f6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><span style={{ fontSize:16 }}>🤖</span></div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13, fontWeight:700, color:c.heading }}>Trader AI</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:c.muted }}>Powered by Google Gemini</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:"#16a34a", display:"inline-block", animation:"lp2-blink 2s ease infinite" }}/>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#16a34a" }}>LIVE</span>
                  </div>
                </div>
                <div style={{ padding:"12px 14px", borderBottom:`1px solid ${c.border}`, display:"flex", flexDirection:"column", gap:6, background:c.soft }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:c.muted, marginBottom:2, letterSpacing:1 }}>SELECT A QUESTION</div>
                  {AI_CHATS.map((ch,i)=>(
                    <button key={i} className={`lp2-aib${activeChat===i?" act":""}`} onClick={()=>setActiveChat(i)}>
                      <span style={{ fontSize:13, flexShrink:0 }}>💬</span>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:activeChat===i?c.heading:c.muted }}>"{ch.prompt}"</span>
                    </button>
                  ))}
                </div>
                <div style={{ padding:16 }}>
                  <div className="lp2-aim" style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                    {chat.metrics.map((m,i)=>(
                      <div key={i} style={{ background:c.soft, border:`1px solid ${c.border}`, borderRadius:10, padding:"12px 14px", flex:1, minWidth:0, textAlign:"center" }}>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:c.muted, marginBottom:4 }}>{m.label}</div>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:17, fontWeight:700, color:m.danger?"#dc2626":"#16a34a", marginBottom:2 }}>{m.value}</div>
                        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:10, color:c.muted }}>{m.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderLeft:"3px solid rgba(37,99,235,.3)", paddingLeft:12, marginBottom:13 }}>
                    <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:c.text, lineHeight:1.7, margin:0 }}>{chat.analysis}</p>
                  </div>
                  <div style={{ background:"rgba(22,163,74,.07)", border:"1px solid rgba(22,163,74,.2)", borderRadius:10, padding:"11px 13px", display:"flex", gap:10, alignItems:"flex-start", marginBottom:14 }}>
                    <span style={{ fontSize:15, flexShrink:0, marginTop:1 }}>💡</span>
                    <div>
                      <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, fontWeight:700, color:"#16a34a", marginBottom:3, letterSpacing:.5 }}>RECOMMENDATION</div>
                      <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#15803d", lineHeight:1.55 }}>{chat.recommendation}</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {chat.actions.map((action,i)=>(
                      <button key={i} style={{ background:"transparent", border:`1px solid ${c.border}`, borderRadius:8, padding:"7px 14px", fontSize:12, fontFamily:"'DM Sans',sans-serif", fontWeight:500, color:c.muted, cursor:"pointer", display:"flex", alignItems:"center", gap:6, transition:"all .2s" }}
                        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="#2563eb";(e.currentTarget as HTMLElement).style.color="#2563eb";}}
                        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=c.border;(e.currentTarget as HTMLElement).style.color=c.muted;}}>
                        <span>{i===0?"🔍":"📋"}</span>{action} ↗
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRADESYNC ─────────────────────────────────────────────── */}
      <section className="lp2-s" style={sec(c.alt)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <span style={lbl}>TradeSync</span>
            <h2 style={ttl}>Copy Trades. Sell Signals. <span style={grad}>Scale Your Strategy.</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto" }}>Connect your account and let followers copy you in real time.</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:32, flexWrap:"wrap", justifyContent:"center", marginBottom:44 }}>
            <div style={{ background:c.card, border:"1px solid rgba(59,130,246,.4)", borderRadius:16, padding:"22px 28px", textAlign:"center", minWidth:140 }}>
              <div style={{ fontFamily:"'Sora',sans-serif", fontSize:17, color:c.heading }}>Master</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#16a34a", marginTop:6 }}>+$12,400 P&L</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"center" }}>
              <div style={{ height:2, width:70, background:"linear-gradient(90deg,#2563eb,#3b82f6)", position:"relative" }}>
                <div style={{ position:"absolute", right:-6, top:-4, width:0, height:0, borderTop:"5px solid transparent", borderBottom:"5px solid transparent", borderLeft:"8px solid #3b82f6" }}/>
              </div>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:c.muted }}>REAL-TIME SYNC</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {["Follower A","Follower B","Follower C"].map((f,i)=>(
                <div key={i} style={{ background:c.card, border:`1px solid ${c.border}`, borderRadius:12, padding:"12px 18px", display:"flex", gap:12, alignItems:"center" }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:`hsl(${i*80+200},60%,50%)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"white", fontWeight:700, flexShrink:0 }}>{f[0]}</div>
                  <div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:c.heading }}>{f}</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#16a34a" }}>Copying @ 0.5x lot</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:18 }}>
            {[{ icon:"🔄", title:"Account Mirroring",    desc:"Sync trades from Master to multiple Slave accounts in real time with sub-second execution." },
              { icon:"⚖️", title:"Risk Controls",        desc:"Flexible lot scaling: multiplier, fixed lot, and risk % modes. Full control over exposure." },
              { icon:"📡", title:"Signal Provider Mode", desc:"Share your trades publicly or privately. Let followers copy you and monetise your edge." }].map((f,i)=>(
              <div key={i} className="lp2-ch" style={{ ...card, padding:22 }}>
                <div style={{ fontSize:30, marginBottom:12 }}>{f.icon}</div>
                <h3 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:17, color:c.heading, marginBottom:8 }}>{f.title}</h3>
                <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:c.muted, lineHeight:1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
          <p style={{ textAlign:"center", marginTop:20, fontFamily:"'DM Mono',monospace", fontSize:12, color:c.muted }}>Platforms: MT4 · MT5 · MatchTrader · cTrader (roadmap)</p>
        </div>
      </section>

      {/* ── SIGNAL SCANNER ────────────────────────────────────────── */}
      <section className="lp2-s" style={sec(c.page)}>
        <div style={wrap}>
          <div className="lp2-tc" style={{ display:"flex", gap:60, alignItems:"flex-start", flexWrap:"wrap" }}>
            <div style={{ flex:1, minWidth:280 }}>
              <span style={lbl}>Signal Scanner</span>
              <h2 style={ttl}>Never Miss <span style={grad}>a Setup</span></h2>
              <div style={{ width:48, height:3, background:"#2563eb", borderRadius:2, marginBottom:32 }}/>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:c.muted, lineHeight:1.7, marginBottom:22 }}>
                AI-powered market scanning for Smart Money Concepts, price channels, and institutional candles — with real-time alerts.
              </p>
              {["Automated SMC, price channel & institutional candle scanning","AI validation filters out low-probability setups","Real-time Telegram & web push notifications"].map((t,i)=>(
                <div key={i} style={{ display:"flex", gap:12, marginBottom:13 }}>
                  <span style={{ color:"#3b82f6" }}>◆</span>
                  <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:c.text }}>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ flex:1.3, minWidth:280, display:"flex", flexDirection:"column", gap:12 }}>
              {[{ sym:"EUR/USD", type:"SMC Break of Structure", tf:"H1",  conf:"HIGH",   dir:"▲ BUY",  time:"Just now" },
                { sym:"GOLD",   type:"Institutional Candle",   tf:"H4",  conf:"MEDIUM", dir:"▼ SELL", time:"4m ago" },
                { sym:"GBP/JPY",type:"Price Channel Break",    tf:"M15", conf:"HIGH",   dir:"▲ BUY",  time:"12m ago" }].map((s,i)=>(
                <div key={i} className="lp2-ch" style={{ ...card, padding:"16px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:700, color:c.heading, marginBottom:3 }}>{s.sym}</div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:c.muted }}>{s.type} · {s.tf}</div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ background:s.conf==="HIGH"?"rgba(34,197,94,.15)":"rgba(245,158,11,.15)", color:s.conf==="HIGH"?"#16a34a":"#d97706", padding:"3px 8px", borderRadius:4, fontSize:10, fontFamily:"'DM Mono',monospace" }}>{s.conf}</span>
                    <span style={{ color:s.dir.includes("BUY")?"#16a34a":"#dc2626", fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight:700 }}>{s.dir}</span>
                  </div>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:c.muted }}>{s.time}</span>
                </div>
              ))}
              <div style={{ textAlign:"center", padding:10 }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:c.muted }}>📱 Alerts via Telegram + Web Push</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ECONOMIC CALENDAR PREVIEW ─────────────────────────────── */}
      <section className="lp2-s" style={sec(c.alt)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <span style={lbl}>Economic Calendar</span>
            <h2 style={ttl}>Know What's <span style={grad}>Moving the Market</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto" }}>Real-time global economic events with currency sentiment overlay.</p>
          </div>
          <div style={{ maxWidth:780, margin:"0 auto", background:c.card, border:`1px solid ${c.border}`, borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"14px 18px", borderBottom:`1px solid ${c.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", gap:6 }}>
                {["All","High","Medium","Low"].map((f,i)=>(
                  <button key={i} style={{ padding:"5px 10px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontFamily:"'DM Sans',sans-serif", background:i===1?"#dc2626":"rgba(37,99,235,.06)", color:i===1?"white":c.muted }}>{f}</button>
                ))}
              </div>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:c.muted }}>Jun 03, 2026 — GMT</span>
            </div>
            <div className="lp2-es">
              {[{ time:"08:30", ccy:"GBP", impact:"HIGH",   event:"BOE Interest Rate Decision", actual:"5.25%", forecast:"5.25%", prev:"5.25%" },
                { time:"12:30", ccy:"USD", impact:"HIGH",   event:"Non-Farm Payrolls",          actual:"—",     forecast:"185K",  prev:"175K"  },
                { time:"14:00", ccy:"USD", impact:"MEDIUM", event:"ISM Manufacturing PMI",      actual:"—",     forecast:"49.8",  prev:"49.2"  },
                { time:"15:30", ccy:"EUR", impact:"LOW",    event:"ECB Executive Board Speech", actual:"—",     forecast:"—",     prev:"—"     }].map((e,i)=>(
                <div key={i} className="lp2-er">
                  <span style={{ color:c.muted }}>{e.time}</span>
                  <span style={{ color:"#3b82f6", fontWeight:700 }}>{e.ccy}</span>
                  <span style={{ color:e.impact==="HIGH"?"#dc2626":e.impact==="MEDIUM"?"#d97706":c.muted }}>
                    {e.impact==="HIGH"?"●●●":e.impact==="MEDIUM"?"●●○":"●○○"} {e.impact}
                  </span>
                  <span style={{ color:c.text, fontFamily:"'DM Sans',sans-serif", fontSize:13 }}>{e.event}</span>
                  <span style={{ color:"#16a34a", textAlign:"right" }}>{e.actual}</span>
                  <span style={{ color:c.muted, textAlign:"right" }}>{e.forecast}</span>
                  <span style={{ color:c.muted, textAlign:"right" }}>{e.prev}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign:"center", marginTop:28 }}>
            <a href="/calendar" className="lp2-bp">View Full Calendar</a>
          </div>
        </div>
      </section>

      {/* ── COMMUNITY LEADERBOARD ─────────────────────────────────── */}
      <section className="lp2-s" style={sec(c.page)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <span style={lbl}>Community</span>
            <h2 style={ttl}>See How You <span style={grad}>Stack Up</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto" }}>Public ranking of traders by P&L, Win Rate, or longest win streak.</p>
          </div>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            {[{ rank:1, name:"TraderKing_FX", flag:"🇬🇧", pl:"+$48,320", wr:"72%", streak:9,  avatar:"TK" },
              { rank:2, name:"CryptoChief99", flag:"🇺🇸", pl:"+$31,700", wr:"68%", streak:6,  avatar:"CC" },
              { rank:3, name:"PipHunterZA",   flag:"🇿🇦", pl:"+$28,440", wr:"75%", streak:11, avatar:"PH" },
              { rank:4, name:"GoldTrader_EU", flag:"🇩🇪", pl:"+$21,880", wr:"64%", streak:4,  avatar:"GT" },
              { rank:5, name:"FXWizard_NG",   flag:"🇳🇬", pl:"+$18,930", wr:"71%", streak:7,  avatar:"FW" }].map(t=>(
              <div key={t.rank} className="lp2-ch" style={{ ...card, display:"flex", alignItems:"center", gap:14, padding:"14px 18px", marginBottom:10, flexWrap:"wrap" }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:15, fontWeight:700, color:t.rank<=3?"#d97706":c.muted, minWidth:26 }}>#{t.rank}</span>
                <div style={{ width:38, height:38, borderRadius:"50%", background:`hsl(${t.rank*60+180},55%,45%)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700, color:"white", flexShrink:0 }}>{t.avatar}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:600, color:c.heading, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name} {t.flag}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:c.muted }}>Win streak: {t.streak} 🔥</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:700, color:"#16a34a" }}>{t.pl}</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:c.muted }}>WR {t.wr}</div>
                </div>
              </div>
            ))}
            <div style={{ textAlign:"center", marginTop:28 }}>
              <a href="/auth?mode=signup" target="myfm_journal" className="lp2-bp">Create your profile and get ranked</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── BROKERS ───────────────────────────────────────────────── */}
      <section className="lp2-s" style={sec(c.alt)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:36 }}>
            <h2 style={ttl}>Works With <span style={grad}>Your Broker</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto" }}>Automatic trade import — no manual logging required.</p>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:10 }}>
            {BROKERS.map((b,i)=>(
              <div key={i}
                style={{ background:c.card, border:`1px solid ${c.border}`, borderRadius:10, padding:"10px 18px", fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, color:c.muted, transition:"all .2s", cursor:"default" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(59,130,246,.4)";(e.currentTarget as HTMLElement).style.color=c.heading;}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=c.border;(e.currentTarget as HTMLElement).style.color=c.muted;}}>
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────── */}
      <section className="lp2-s" id="pricing" style={sec(c.page)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <span style={lbl}>Pricing</span>
            <h2 style={ttl}>Simple, <span style={grad}>Transparent Pricing</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto" }}>Free forever tier. Upgrade when you're ready. No credit card required to start.</p>
          </div>
          <div className="lp2-pg" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:18, alignItems:"start" }}>
            {PRICING_PLANS.map((p,i)=>(
              <div key={i} className={p.highlight?"lp2-pf":""} style={{ background:p.highlight?"linear-gradient(145deg,#1e40af,#1d4ed8)":c.card, border:p.highlight?"none":`1px solid ${c.border}`, borderRadius:16, padding:26, position:"relative", transform:p.highlight?"scale(1.03)":"none", boxShadow:p.highlight?"0 0 60px rgba(37,99,235,.2)":"none" }}>
                {p.badge&&<div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#2563eb,#3b82f6)", color:"white", padding:"4px 14px", borderRadius:50, fontSize:11, fontFamily:"'Sora',sans-serif", fontWeight:700, whiteSpace:"nowrap" }}>{p.badge}</div>}
                <h3 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:19, fontWeight:700, color:p.highlight?"#fff":c.heading, marginBottom:4 }}>{p.name}</h3>
                <div style={{ display:"flex", alignItems:"baseline", gap:4, marginBottom:8 }}>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:34, fontWeight:700, color:p.highlight?"#fff":c.heading }}>{p.price}</span>
                  <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:p.highlight?"rgba(255,255,255,.7)":c.muted }}>{p.period}</span>
                </div>
                <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:p.highlight?"rgba(255,255,255,.75)":c.muted, marginBottom:18, lineHeight:1.5 }}>{p.desc}</p>
                <div style={{ marginBottom:22 }}>
                  {p.features.map((f,fi)=>(
                    <div key={fi} style={{ display:"flex", gap:10, marginBottom:9 }}>
                      <span style={{ color:"#16a34a", fontSize:13 }}>✓</span>
                      <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:p.highlight?"rgba(255,255,255,.85)":c.text }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href="/auth?mode=signup" target="myfm_journal" className={p.highlight?"lp2-bp":"lp2-bs"} style={{ display:"block", textAlign:"center", width:"100%", ...(p.highlight ? {} : { color:dm?"#94a3b8":"#334155" }) }}>
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────── */}
      <section className="lp2-s" id="reviews" style={sec(c.soft)}>
        <div style={wrap}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <span style={lbl}>Testimonials</span>
            <h2 style={ttl}>Traders Who <span style={grad}>Changed Their Game</span></h2>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto" }}>Don't take our word for it.</p>
          </div>
          <div className="lp2-tg" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:20 }}>
            {TESTIMONIALS.map((t,i)=>(
              <div key={i} className="lp2-ch" style={{ ...card, padding:26 }}>
                <div style={{ display:"flex", gap:2, marginBottom:14 }}>
                  {Array.from({ length:5 }).map((_,si)=>(
                    <span key={si} style={{ color:"#d97706", fontSize:15 }}>★</span>
                  ))}
                </div>
                <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:c.text, lineHeight:1.7, marginBottom:18 }}>"{t.quote}"</p>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:38, height:38, borderRadius:"50%", background:`hsl(${i*55+200},50%,50%)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Sora',sans-serif", fontSize:14, fontWeight:700, color:"white", flexShrink:0 }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14, fontWeight:600, color:c.heading }}>{t.name} {t.flag}</div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:c.muted }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section className="lp2-s lp2-gbg" style={{ ...sec(dm ? "#0c1219" : "#f8fafc"), position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle,rgba(37,99,235,.08) 0%,transparent 70%)", pointerEvents:"none" }}/>
        <div style={{ ...wrap, textAlign:"center", position:"relative", zIndex:1 }}>
          <span style={lbl}>Get Started</span>
          <h2 style={{ ...ttl, fontSize:"clamp(28px,4vw,52px)" as any }}>Start Building Your Edge <span style={grad}>Today</span></h2>
          <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:17, color:c.muted, lineHeight:1.7, maxWidth:520, margin:"0 auto 36px" }}>Free forever tier. No credit card required. Cancel anytime.</p>
          <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
            <a href="/auth?mode=signup" target="myfm_journal" className="lp2-bp" style={{ fontSize:16, padding:"16px 36px" }}>Create Your Free Account</a>
            <a href="/calendar" className="lp2-bs" style={{ fontSize:15, color:dm?"#94a3b8":"#334155" }}>Explore Calendar</a>
          </div>
        </div>
      </section>

      <HomeFooter darkMode={dm}/>
    </div>
  );
}
