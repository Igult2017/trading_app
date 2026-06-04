import { motion } from "framer-motion";
import { FEATURES } from "./constants";

export default function FeaturesSection() {
  return (
    <section id="features" className="bg-[#090910] py-28">
      <div className="max-w-6xl mx-auto px-6">

        <div className="mb-16">
          <p className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4">Platform</p>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <h2 className="text-4xl font-bold text-[#f0f0f5] tracking-tight leading-[1.15] max-w-lg">
              Everything a serious trader needs in one place.
            </h2>
            <p className="text-[#9898a8] text-[16px] leading-relaxed max-w-sm lg:text-right">
              Built for traders who know the difference between<br className="hidden lg:block" /> logging trades and actually learning from them.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06] rounded-xl overflow-hidden border border-white/[0.06]">
          {FEATURES.map((f, i) => (
            <motion.div key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group bg-[#090910] hover:bg-[#0f0f1a] p-8 transition-colors duration-200">
              <div className="text-2xl mb-5">{f.icon}</div>
              <h3 className="text-[#f0f0f5] font-semibold text-[17px] mb-2.5">{f.title}</h3>
              <p className="text-[#9898a8] text-[14px] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
