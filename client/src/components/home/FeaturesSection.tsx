import { motion } from "framer-motion";
import { FEATURES } from "./constants";

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-[#020817]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-xs font-display font-bold tracking-[3px] uppercase text-blue-500 block mb-3">Platform Features</span>
          <h2 className="font-display text-4xl font-extrabold text-white mb-4">
            Everything You Need to{" "}
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Build Your Edge</span>
          </h2>
          <p className="font-body text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
            A complete workspace built for serious traders who measure everything.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              whileHover={{ y: -4 }}
              className="group relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 hover:border-blue-500/30 hover:bg-blue-500/[0.04] transition-all duration-300">
              <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.06),transparent_60%)]" />
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-display text-white font-bold text-lg mb-2">{f.title}</h3>
              <p className="font-body text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
