import { motion } from "framer-motion";
import { TESTIMONIALS } from "./constants";

const COLORS = ["from-blue-600 to-indigo-600", "from-violet-600 to-purple-600", "from-emerald-600 to-teal-600", "from-orange-600 to-amber-600", "from-rose-600 to-pink-600", "from-cyan-600 to-blue-600"];

export default function TestimonialsSection() {
  return (
    <section id="reviews" className="py-24 bg-[#020817]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-xs font-bold tracking-[3px] uppercase text-blue-500 block mb-3">Testimonials</span>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Traders Who{" "}
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Changed Their Game</span>
          </h2>
          <p className="text-slate-400 text-lg">Don&apos;t take our word for it.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              whileHover={{ y: -4 }}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 hover:border-blue-500/20 hover:bg-blue-500/[0.03] transition-all duration-300">

              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, si) => (
                  <span key={si} className="text-amber-400 text-sm">★</span>
                ))}
              </div>

              <p className="text-slate-300 text-[14px] leading-relaxed mb-5">&ldquo;{t.quote}&rdquo;</p>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${COLORS[i]} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{t.name} {t.flag}</div>
                  <div className="text-slate-500 text-xs">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
