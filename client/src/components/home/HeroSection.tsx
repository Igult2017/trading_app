import { motion } from "framer-motion";

const STATS = [
  { value: "$0",    label: "Free forever tier" },
  { value: "67.3%", label: "Avg user win rate" },
  { value: "2.4x",  label: "Profit factor tracked" },
];

const TRADES = [
  { pair: "EUR/USD", dir: "BUY",  r: "+2.3R", time: "09:42", win: true },
  { pair: "GOLD",    dir: "SELL", r: "+1.1R", time: "11:15", win: true },
  { pair: "GBP/USD", dir: "BUY",  r: "-0.8R", time: "14:33", win: false },
];

function DashboardPreview() {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#0f172a] p-4 shadow-[0_32px_80px_rgba(37,99,235,0.2)] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-blue-400 to-transparent" />
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] text-slate-500 font-data tracking-widest">PORTFOLIO OVERVIEW</span>
        <span className="text-[10px] text-emerald-400 font-data flex items-center gap-1">
          <span className="animate-pulse">●</span> LIVE
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[["Net P&L", "+$4,827", "text-emerald-400"], ["Win Rate", "67.3%", "text-blue-400"], ["Profit Factor", "2.41", "text-emerald-400"]].map(([l, v, c]) => (
          <div key={l} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
            <div className="text-[9px] text-slate-500 font-body mb-1">{l}</div>
            <div className={`text-sm font-bold font-data ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="bg-blue-950/20 border border-white/[0.05] rounded-xl p-3 mb-3">
        <div className="text-[9px] text-slate-500 mb-2 font-data tracking-widest">EQUITY CURVE (30D)</div>
        <svg viewBox="0 0 300 44" className="w-full h-11">
          <defs>
            <linearGradient id="hg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,40 L30,34 L60,36 L90,24 L120,26 L150,14 L180,10 L210,4 L240,6 L270,2 L300,0" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          <path d="M0,40 L30,34 L60,36 L90,24 L120,26 L150,14 L180,10 L210,4 L240,6 L270,2 L300,0 L300,44 L0,44 Z" fill="url(#hg)" />
        </svg>
      </div>
      <div className="space-y-1.5">
        {TRADES.map((t) => (
          <div key={t.pair} className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-blue-950/20 border border-white/[0.04]">
            <span className="text-[11px] font-semibold text-slate-200 font-data">{t.pair}</span>
            <span className={`text-[9px] font-data ${t.dir === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.dir}</span>
            <span className={`text-[11px] font-bold font-data ${t.win ? "text-emerald-400" : "text-red-400"}`}>{t.r}</span>
            <span className="text-[9px] text-slate-500 font-data">{t.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#020817] pt-20 pb-24">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.12),transparent_70%)]" />
      <div className="pointer-events-none absolute top-1/3 left-[5%] w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.06),transparent_70%)]" />

      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-14">

          <div className="flex-1 min-w-0 z-10">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 mb-6">
              <span className="text-amber-400 text-sm">★★★★★</span>
              <span className="text-sm font-body text-blue-300">Trusted by 10,000+ traders</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
              className="font-display text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight mb-5">
              The Trading Journal<br />
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                That Works As Hard
              </span><br />
              As You Do
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
              className="font-body text-slate-400 text-lg leading-relaxed mb-5 max-w-lg">
              Execution database + performance analytics for Forex, Crypto & Commodities traders.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap gap-4 mb-8">
              {["Log trades", "Capture decisions", "Track psychology", "Build your edge"].map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-xs font-data text-blue-400">
                  <span className="text-emerald-400">◆</span>{item}
                </span>
              ))}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-wrap gap-3 mb-10">
              <a href="/auth?mode=signup" target="myfm_journal"
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 px-8 py-3.5 text-sm font-display font-bold text-white shadow-[0_4px_20px_rgba(37,99,235,0.4)] hover:shadow-[0_8px_32px_rgba(37,99,235,0.5)] transition-all duration-300">
                Start Free — No Credit Card
              </a>
              <button onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-2 rounded-full border border-slate-600 hover:border-blue-500 px-7 py-3.5 text-sm font-display font-semibold text-slate-300 hover:text-blue-400 transition-all duration-300">
                See How It Works ↓
              </button>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.6 }}
              className="flex flex-wrap gap-8">
              {STATS.map(({ value, label }) => (
                <div key={label}>
                  <div className="text-2xl font-bold font-data text-white">{value}</div>
                  <div className="text-xs font-body text-slate-500">{label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
            className="flex-1 min-w-0 w-full max-w-md lg:max-w-[440px]">
            <DashboardPreview />
          </motion.div>

        </div>
      </div>
    </section>
  );
}
