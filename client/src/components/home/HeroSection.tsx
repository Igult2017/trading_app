import { motion } from "framer-motion";

const METRICS = [
  { label: "Net P&L",       value: "+$4,827", color: "text-emerald-400" },
  { label: "Win Rate",      value: "67.3%",   color: "text-indigo-400"  },
  { label: "Profit Factor", value: "2.41",    color: "text-emerald-400" },
];

const TRADES = [
  { pair: "EUR/USD", dir: "BUY",  r: "+2.3R", win: true  },
  { pair: "GOLD",    dir: "SELL", r: "+1.1R", win: true  },
  { pair: "GBP/USD", dir: "BUY",  r: "-0.8R", win: false },
];

function ProductPreview() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0f0f1a] overflow-hidden shadow-[0_0_80px_rgba(99,102,241,0.15)]">
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        <span className="ml-3 text-[11px] text-[#5a5a6a] font-mono">trade-journal — dashboard</span>
      </div>
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-px bg-white/[0.04] border-b border-white/[0.06]">
        {METRICS.map(({ label, value, color }) => (
          <div key={label} className="bg-[#0f0f1a] px-4 py-4">
            <p className="text-[11px] text-[#5a5a6a] mb-1.5">{label}</p>
            <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>
      {/* Equity curve */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] text-[#5a5a6a] font-mono tracking-widest mb-3">EQUITY CURVE — 30 DAYS</p>
        <svg viewBox="0 0 400 60" className="w-full h-14">
          <defs>
            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,55 C30,50 50,48 80,40 C110,32 130,34 160,22 C190,10 210,14 240,8 C270,2 300,5 330,3 C360,1 380,2 400,0"
            fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M0,55 C30,50 50,48 80,40 C110,32 130,34 160,22 C190,10 210,14 240,8 C270,2 300,5 330,3 C360,1 380,2 400,0 L400,60 L0,60 Z"
            fill="url(#eq)" />
        </svg>
      </div>
      {/* Trades */}
      <div className="px-4 pb-4 space-y-1.5">
        {TRADES.map((t) => (
          <div key={t.pair} className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.04] px-3 py-2.5">
            <span className="text-[13px] font-semibold text-[#f0f0f5] font-mono">{t.pair}</span>
            <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${t.dir === "BUY" ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>{t.dir}</span>
            <span className={`text-[13px] font-bold font-mono ${t.win ? "text-emerald-400" : "text-red-400"}`}>{t.r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section className="relative bg-[#090910] pt-24 pb-20 overflow-hidden">
      {/* Single subtle glow — one only */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.1),transparent_65%)]" />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Left — copy */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span className="text-[13px] text-indigo-300 font-medium">Trusted by 10,000+ traders</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl lg:text-[58px] font-bold text-[#f0f0f5] leading-[1.1] tracking-[-0.02em] mb-6">
              Stop trading blind.<br />
              <span className="text-[#9898a8] font-normal">Start trading</span>{" "}
              with proof.
            </h1>

            {/* Sub */}
            <p className="text-[#9898a8] text-lg leading-[1.7] mb-8 max-w-[480px]">
              The trading journal that automatically surfaces your patterns, tracks your psychology, and shows you exactly where your edge breaks down.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <a href="/auth?mode=signup" target="myfm_journal"
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[15px] px-6 py-3 transition-colors">
                Start journaling free
              </a>
              <button onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
                className="text-[#9898a8] hover:text-[#f0f0f5] font-medium text-[15px] transition-colors flex items-center gap-1.5">
                See how it works <span className="text-lg">→</span>
              </button>
            </div>

            {/* Trust */}
            <p className="text-[13px] text-[#5a5a6a]">No credit card required · Cancel anytime</p>
          </motion.div>

          {/* Right — product */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}>
            <ProductPreview />
          </motion.div>

        </div>
      </div>
    </section>
  );
}
