import { PRICING_PLANS } from "./constants";

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-[#090910] py-28">
      <div className="max-w-5xl mx-auto px-6">

        <div className="text-center mb-16">
          <p className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4">Pricing</p>
          <h2 className="text-4xl font-bold text-[#f0f0f5] tracking-tight mb-4">Start free. Upgrade when ready.</h2>
          <p className="text-[#9898a8] text-[16px]">No credit card required. Cancel anytime.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRICING_PLANS.map((p, i) => (
            <div key={i}
              className={`relative rounded-xl p-6 ${
                p.highlight
                  ? "bg-indigo-600 border border-indigo-500"
                  : "bg-white/[0.03] border border-white/[0.08]"
              }`}>
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white text-indigo-700 px-3 py-0.5 text-[11px] font-bold whitespace-nowrap">
                  {p.badge}
                </div>
              )}
              <p className={`font-semibold text-[16px] mb-3 ${p.highlight ? "text-white" : "text-[#f0f0f5]"}`}>{p.name}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className={`text-[36px] font-bold font-mono ${p.highlight ? "text-white" : "text-[#f0f0f5]"}`}>{p.price}</span>
                <span className={`text-[13px] ${p.highlight ? "text-indigo-200" : "text-[#5a5a6a]"}`}>{p.period}</span>
              </div>
              <p className={`text-[13px] mb-6 leading-relaxed ${p.highlight ? "text-indigo-200" : "text-[#5a5a6a]"}`}>{p.desc}</p>
              <div className="space-y-2 mb-6">
                {p.features.map((f, fi) => (
                  <div key={fi} className="flex items-start gap-2">
                    <span className={`text-sm mt-0.5 ${p.highlight ? "text-indigo-200" : "text-emerald-400"}`}>✓</span>
                    <span className={`text-[13px] leading-snug ${p.highlight ? "text-indigo-100" : "text-[#9898a8]"}`}>{f}</span>
                  </div>
                ))}
              </div>
              <a href="/auth?mode=signup" target="myfm_journal"
                className={`block text-center rounded-lg py-2.5 text-[14px] font-semibold transition-colors ${
                  p.highlight
                    ? "bg-white text-indigo-700 hover:bg-indigo-50"
                    : "border border-white/[0.12] text-[#9898a8] hover:border-indigo-500/40 hover:text-indigo-400"
                }`}>
                {p.cta}
              </a>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
