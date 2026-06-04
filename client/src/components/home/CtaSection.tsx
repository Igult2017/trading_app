import { BROKERS } from "./constants";

export default function CtaSection() {
  return (
    <>
      {/* Brokers */}
      <section className="py-20 bg-[#060b14]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-white mb-3">
              Works With <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Your Broker</span>
            </h2>
            <p className="text-slate-400">Automatic trade import — no manual logging required.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {BROKERS.map(b => (
              <div key={b} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-sm text-slate-400 hover:border-blue-500/30 hover:text-slate-200 transition-all cursor-default">
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-28 bg-[#020817] overflow-hidden">
        {/* Radial glow */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.12),transparent_70%)]" />

        {/* Grid overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <span className="text-xs font-bold tracking-[3px] uppercase text-blue-500 block mb-4">Get Started</span>
          <h2 className="text-5xl font-extrabold text-white mb-5 leading-tight">
            Start Building Your Edge{" "}
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Today</span>
          </h2>
          <p className="text-slate-400 text-lg mb-10 leading-relaxed">
            Free forever tier. No credit card required. Cancel anytime.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a href="/auth?mode=signup" target="myfm_journal"
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 px-10 py-4 text-base font-bold text-white shadow-[0_4px_24px_rgba(37,99,235,0.45)] hover:shadow-[0_8px_40px_rgba(37,99,235,0.6)] transition-all duration-300">
              Create Your Free Account
            </a>
            <a href="/calendar"
              className="inline-flex items-center gap-2 rounded-full border border-slate-600 hover:border-blue-500/60 px-8 py-4 text-base font-semibold text-slate-300 hover:text-blue-400 transition-all duration-300">
              Explore Calendar
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
