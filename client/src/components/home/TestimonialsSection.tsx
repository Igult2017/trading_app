import { TESTIMONIALS } from "./constants";

const AVATARS = ["bg-indigo-600","bg-violet-600","bg-emerald-600","bg-orange-600","bg-rose-600","bg-cyan-600"];

export default function TestimonialsSection() {
  return (
    <section id="reviews" className="bg-[#0d0d16] py-28">
      <div className="max-w-6xl mx-auto px-6">

        <div className="text-center mb-16">
          <p className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4">Testimonials</p>
          <h2 className="text-4xl font-bold text-[#f0f0f5] tracking-tight">Traders who found their edge.</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/[0.08] bg-[#090910] p-6">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, si) => <span key={si} className="text-amber-400 text-sm">★</span>)}
              </div>
              <p className="text-[14px] text-[#9898a8] leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${AVATARS[i]} flex items-center justify-center text-white font-bold text-[13px] shrink-0`}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#f0f0f5]">{t.name} {t.flag}</p>
                  <p className="text-[12px] text-[#5a5a6a]">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
