import { BROKERS } from "./constants";

export default function CtaSection() {
  return (
    <>
      {/* Brokers */}
      <section className="bg-[#090910] py-20 border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-[13px] text-[#5a5a6a] mb-8">Works with your existing broker setup</p>
          <div className="flex flex-wrap justify-center gap-3">
            {BROKERS.map(b => (
              <span key={b} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-2 text-[13px] text-[#5a5a6a] hover:text-[#9898a8] hover:border-white/[0.12] transition-colors cursor-default">{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative bg-[#090910] py-32 overflow-hidden">
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(99,102,241,0.1),transparent_70%)]" />
        <div className="relative max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-5xl font-bold text-[#f0f0f5] tracking-tight leading-[1.1] mb-5">
            Ready to trade with clarity?
          </h2>
          <p className="text-[#9898a8] text-[17px] mb-10 leading-relaxed">
            Join 10,000+ traders who stopped guessing and started knowing. Free forever tier — no card required.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a href="/auth?mode=signup" target="myfm_journal"
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[16px] px-8 py-4 transition-colors">
              Start journaling free
            </a>
            <a href="/calendar"
              className="rounded-lg border border-white/[0.12] hover:border-white/[0.2] text-[#9898a8] hover:text-[#f0f0f5] font-semibold text-[16px] px-8 py-4 transition-colors">
              View economic calendar
            </a>
          </div>
          <p className="text-[13px] text-[#5a5a6a] mt-6">No credit card · Free forever tier · Cancel anytime</p>
        </div>
      </section>
    </>
  );
}
