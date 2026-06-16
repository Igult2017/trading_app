import { BROKERS } from "./constants";
import { openAuthModal } from "@/components/auth/AuthModal";

export default function CtaSection() {
  return (
    <>
      {/* Brokers */}
      <section className="bg-slate-50 py-16 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-[13px] text-slate-400 mb-8">Works with your existing broker</p>
          <div className="flex flex-wrap justify-center gap-3">
            {BROKERS.map(b => (
              <span key={b} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] text-slate-500 shadow-sm">{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-slate-900 py-28">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-[13px] font-semibold text-indigo-400 tracking-widest uppercase mb-4">Get Started</p>
          <h2 className="text-[44px] font-bold text-white tracking-tight leading-[1.1] mb-5">
            Ready to trade with clarity?
          </h2>
          <p className="text-slate-400 text-[17px] mb-10 leading-relaxed">
            Join 10,000+ traders who stopped guessing and started knowing. Free forever tier — no card required.
          </p>
          <div className="flex flex-wrap gap-4 justify-center mb-6">
            <button type="button" onClick={() => openAuthModal("signup")}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[16px] px-8 py-4 transition-colors cursor-pointer border-0">
              Start journaling free
            </button>
            <a href="/calendar"
              className="rounded-xl border border-white/20 hover:border-white/40 text-white/80 hover:text-white font-semibold text-[16px] px-8 py-4 transition-colors">
              View economic calendar
            </a>
          </div>
          <p className="text-[13px] text-slate-500">No credit card · Free forever tier · Cancel anytime</p>
        </div>
      </section>
    </>
  );
}
