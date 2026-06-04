import { motion } from "framer-motion";

const SIGNALS = [
  { sym: "EUR/USD", type: "SMC Break of Structure", tf: "H1",  conf: "HIGH",   dir: "▲ BUY",  time: "Just now", buy: true },
  { sym: "GOLD",   type: "Institutional Candle",   tf: "H4",  conf: "MEDIUM", dir: "▼ SELL", time: "4m ago",   buy: false },
  { sym: "GBP/JPY",type: "Price Channel Break",    tf: "M15", conf: "HIGH",   dir: "▲ BUY",  time: "12m ago",  buy: true },
];

export default function SignalScannerSection() {
  return (
    <section className="py-24 bg-[#020817]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-16 items-start">

          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold tracking-[3px] uppercase text-blue-500 block mb-3">Signal Scanner</span>
            <h2 className="text-4xl font-extrabold text-white mb-2 leading-tight">
              Never Miss <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">a Setup</span>
            </h2>
            <div className="w-12 h-[3px] rounded-full bg-blue-600 mt-4 mb-6" />
            <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
              AI-powered market scanning for Smart Money Concepts, price channels, and institutional candles — with real-time alerts.
            </p>
            {["Automated SMC, price channel & institutional candle scanning", "AI validation filters out low-probability setups", "Real-time Telegram & web push notifications"].map((t, i) => (
              <div key={i} className="flex items-start gap-3 mb-3">
                <span className="text-blue-400 mt-0.5">◆</span>
                <span className="text-slate-300 text-sm">{t}</span>
              </div>
            ))}
          </div>

          <div className="flex-[1.3] min-w-0 w-full space-y-3">
            {SIGNALS.map((s, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                whileHover={{ x: 4 }}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 hover:border-blue-500/25 transition-all">
                <div className="min-w-0">
                  <div className="text-white font-bold font-mono text-sm mb-0.5">{s.sym}</div>
                  <div className="text-slate-400 text-[11px]">{s.type} · {s.tf}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-md px-2 py-0.5 text-[9px] font-mono font-bold ${
                    s.conf === "HIGH" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}>{s.conf}</span>
                  <span className={`font-bold font-mono text-sm ${s.buy ? "text-emerald-400" : "text-red-400"}`}>{s.dir}</span>
                </div>
                <span className="text-slate-500 font-mono text-[11px] shrink-0">{s.time}</span>
              </motion.div>
            ))}
            <div className="text-center pt-2">
              <span className="text-slate-500 font-mono text-xs">📱 Alerts via Telegram + Web Push</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
