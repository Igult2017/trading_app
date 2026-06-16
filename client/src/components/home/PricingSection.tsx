import { PRICING_PLANS } from "./constants";
import { openAuthModal } from "@/components/auth/AuthModal";

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-white py-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-[13px] font-semibold text-indigo-600 tracking-widest uppercase mb-3">Pricing</p>
          <h2 className="text-[38px] font-bold text-slate-900 tracking-tight mb-4">Simple pricing. No surprises.</h2>
          <p className="text-slate-500 text-[17px]">Start free. Upgrade only when you&apos;re ready.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {PRICING_PLANS.map((p, i) => (
            <div key={i}
              className={`relative rounded-2xl p-6 ${
                p.highlight
                  ? "bg-indigo-600 shadow-[0_8px_32px_rgba(99,102,241,0.3)]"
                  : "bg-white border border-slate-200 shadow-sm"
              }`}>
              {p.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 text-white px-3 py-1 text-[11px] font-semibold whitespace-nowrap">
                  {p.badge}
                </div>
              )}

              <p className={`font-semibold text-[15px] mb-2 ${p.highlight ? "text-white" : "text-slate-900"}`}>{p.name}</p>
              <div className="flex items-baseline gap-1 mb-4">
                <span className={`text-[34px] font-bold ${p.highlight ? "text-white" : "text-slate-900"}`}>{p.price}</span>
                <span className={`text-[13px] ${p.highlight ? "text-indigo-200" : "text-slate-400"}`}>{p.period}</span>
              </div>

              <div className="space-y-2 mb-6">
                {p.features.map((f, fi) => (
                  <div key={fi} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 text-sm ${p.highlight ? "text-indigo-200" : "text-emerald-500"}`}>✓</span>
                    <span className={`text-[13px] leading-snug ${p.highlight ? "text-indigo-100" : "text-slate-500"}`}>{f}</span>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => openAuthModal("signup")}
                className={`block w-full cursor-pointer text-center rounded-xl py-2.5 text-[14px] font-semibold transition-all ${
                  p.highlight
                    ? "bg-white text-indigo-700 hover:bg-indigo-50 border-0"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-700"
                }`}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
