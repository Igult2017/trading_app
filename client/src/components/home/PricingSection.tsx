import { motion } from "framer-motion";
import { PRICING_PLANS } from "./constants";

export default function PricingSection() {
  return (
    <section id="pricing" className="py-24 bg-[#060b14]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-xs font-bold tracking-[3px] uppercase text-blue-500 block mb-3">Pricing</span>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Simple,{" "}
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Transparent Pricing</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-lg mx-auto">Free forever tier. Upgrade when you're ready. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {PRICING_PLANS.map((p, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`relative rounded-2xl p-6 ${
                p.highlight
                  ? "bg-gradient-to-b from-blue-800 to-blue-900 border border-blue-500/40 shadow-[0_0_60px_rgba(37,99,235,0.25)] scale-[1.03]"
                  : "bg-white/[0.03] border border-white/[0.07]"
              }`}>
              {p.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-1 text-[11px] font-bold text-white whitespace-nowrap shadow-lg">
                  {p.badge}
                </div>
              )}

              <h3 className={`text-lg font-bold mb-1 ${p.highlight ? "text-white" : "text-slate-200"}`}>{p.name}</h3>
              <div className="flex items-baseline gap-1 mb-5">
                <span className={`text-4xl font-black font-mono ${p.highlight ? "text-white" : "text-white"}`}>{p.price}</span>
                <span className={`text-sm ${p.highlight ? "text-blue-200/70" : "text-slate-500"}`}>{p.period}</span>
              </div>

              <div className="space-y-2.5 mb-6">
                {p.features.map((f, fi) => (
                  <div key={fi} className="flex items-start gap-2.5">
                    <span className="text-emerald-400 text-sm mt-0.5 shrink-0">✓</span>
                    <span className={`text-[13px] ${p.highlight ? "text-blue-100/80" : "text-slate-400"}`}>{f}</span>
                  </div>
                ))}
              </div>

              <a href="/auth?mode=signup" target="myfm_journal"
                className={`block text-center rounded-full py-3 text-sm font-bold transition-all ${
                  p.highlight
                    ? "bg-white text-blue-700 hover:bg-blue-50"
                    : "border border-white/[0.12] text-slate-300 hover:border-blue-500/50 hover:text-blue-400"
                }`}>
                {p.cta}
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
