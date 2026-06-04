import { FEATURES } from "./constants";

export default function FeaturesSection() {
  return (
    <section id="features" className="bg-slate-50 py-24 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-6">

        <div className="text-center mb-14">
          <p className="text-[13px] font-semibold text-indigo-600 tracking-widest uppercase mb-3">Platform</p>
          <h2 className="text-[38px] font-bold text-slate-900 tracking-tight leading-[1.15] mb-4">
            Built for traders who measure everything.
          </h2>
          <p className="text-slate-500 text-[17px] max-w-lg mx-auto leading-relaxed">
            Every tool you need to understand your performance, improve your process, and compound your edge.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div key={i} className="group rounded-xl bg-white border border-slate-200 p-6 hover:border-indigo-200 hover:shadow-[0_4px_20px_rgba(99,102,241,0.08)] transition-all duration-200">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-xl mb-5">
                {f.icon}
              </div>
              <h3 className="text-slate-900 font-semibold text-[16px] mb-2">{f.title}</h3>
              <p className="text-slate-500 text-[14px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
