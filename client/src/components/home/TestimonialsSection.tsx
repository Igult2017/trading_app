import { TESTIMONIALS } from "./constants";

const AVATAR_COLORS = ["bg-indigo-500","bg-violet-500","bg-emerald-600","bg-orange-500","bg-rose-500","bg-blue-600"];

export default function TestimonialsSection() {
  return (
    <section id="reviews" className="bg-slate-50 py-24 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-6">

        <div className="text-center mb-14">
          <p className="text-[13px] font-semibold text-indigo-600 tracking-widest uppercase mb-3">Testimonials</p>
          <h2 className="text-[38px] font-bold text-slate-900 tracking-tight mb-2">Traders who found their edge.</h2>
          <p className="text-slate-500 text-[17px]">Don&apos;t take our word for it.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, si) => <span key={si} className="text-amber-400">★</span>)}
              </div>
              <p className="text-[14px] text-slate-600 leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[i]} flex items-center justify-center text-white font-bold text-[13px] shrink-0`}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-slate-800">{t.name} {t.flag}</p>
                  <p className="text-[12px] text-slate-400">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
