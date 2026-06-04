import { motion } from "framer-motion";

const METRICS = [
  { label: "Net P&L",       value: "+$4,827", color: "text-emerald-600" },
  { label: "Win Rate",      value: "67.3%",   color: "text-slate-900"   },
  { label: "Profit Factor", value: "2.41",    color: "text-slate-900"   },
];

const TRADES = [
  { pair: "EUR/USD", dir: "BUY",  r: "+2.3R", win: true  },
  { pair: "GOLD",    dir: "SELL", r: "+1.1R", win: true  },
  { pair: "GBP/USD", dir: "BUY",  r: "−0.8R", win: false },
];

function ProductCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-10px_rgba(0,0,0,0.12)] overflow-hidden">
      {/* Window bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-amber-400" />
        <span className="w-3 h-3 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[12px] text-slate-400 font-mono">trade-journal · dashboard</span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        {METRICS.map(({ label, value, color }) => (
          <div key={label} className="px-5 py-4">
            <p className="text-[11px] text-slate-400 mb-1.5">{label}</p>
            <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="px-5 pt-4 pb-3 bg-slate-50/50">
        <p className="text-[11px] text-slate-400 font-mono tracking-widest mb-3">EQUITY CURVE — 30 DAYS</p>
        <svg viewBox="0 0 400 56" className="w-full h-14">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,52 C40,46 70,44 110,34 C150,24 170,28 200,16 C230,4 260,8 290,4 C320,0 360,2 400,0"
            fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
          <path d="M0,52 C40,46 70,44 110,34 C150,24 170,28 200,16 C230,4 260,8 290,4 C320,0 360,2 400,0 L400,56 L0,56 Z"
            fill="url(#chartGrad)" />
        </svg>
      </div>

      {/* Trade rows */}
      <div className="px-5 py-3 space-y-2">
        {TRADES.map((t) => (
          <div key={t.pair} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-4 py-2.5">
            <span className="font-mono font-semibold text-[13px] text-slate-800">{t.pair}</span>
            <span className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-md ${
              t.dir === "BUY"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>{t.dir}</span>
            <span className={`font-mono font-bold text-[13px] ${t.win ? "text-emerald-600" : "text-red-500"}`}>{t.r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section className="bg-white pt-20 pb-24 overflow-hidden">
      {/* Subtle grid background */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:64px_64px] opacity-60" />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-16 items-center">

          {/* Left */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-[13px] text-indigo-700 font-medium">Trusted by 10,000+ traders worldwide</span>
            </div>

            {/* Headline */}
            <h1 className="text-[52px] lg:text-[60px] font-bold text-slate-900 leading-[1.08] tracking-[-0.03em] mb-6">
              The trading journal<br />
              that shows you{" "}
              <span className="text-indigo-600">why you lose.</span>
            </h1>

            {/* Subline */}
            <p className="text-slate-500 text-[18px] leading-[1.65] mb-8 max-w-[480px]">
              Automatically log your trades, track your psychology, and surface the patterns costing you money — in one clean dashboard.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <a href="/auth?mode=signup" target="myfm_journal"
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-[15px] px-7 py-3.5 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
                Start journaling free
              </a>
              <button onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
                className="text-slate-600 hover:text-slate-900 font-medium text-[15px] transition-colors flex items-center gap-1.5">
                See how it works <span>→</span>
              </button>
            </div>

            {/* Social proof */}
            <p className="text-[13px] text-slate-400">No credit card required · Cancel anytime · Free forever tier</p>
          </motion.div>

          {/* Right */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <ProductCard />
          </motion.div>

        </div>
      </div>
    </section>
  );
}
