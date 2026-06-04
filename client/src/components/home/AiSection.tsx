import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AI_CHATS } from "./constants";

export default function AiSection() {
  const [active, setActive] = useState(0);
  const chat = AI_CHATS[active];

  return (
    <section id="ai" className="py-24 bg-[#020817]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-16 items-start">

          {/* Left */}
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold tracking-[3px] uppercase text-blue-500 block mb-3">Trader AI</span>
            <h2 className="text-4xl font-extrabold text-white mb-2 leading-tight">
              Your Personal Trading Coach,{" "}
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Powered by AI</span>
            </h2>
            <div className="w-12 h-[3px] rounded-full bg-blue-600 mt-4 mb-6" />
            <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
              Not a chatbot. A genuine AI coach that reads your actual trade data and gives specific, actionable feedback.
            </p>
            {["Google Gemini AI integration", "Persistent chat history across sessions", "Policy suggestions from your patterns", "Custom strategy blueprints from your data"].map((t, i) => (
              <div key={i} className="flex items-start gap-3 mb-3">
                <span className="text-emerald-400 font-mono text-sm mt-0.5">✓</span>
                <span className="text-slate-300 text-sm">{t}</span>
              </div>
            ))}
          </div>

          {/* Right — AI chat widget */}
          <div className="flex-[1.3] min-w-0 w-full">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0c1524] overflow-hidden shadow-[0_8px_40px_rgba(37,99,235,0.08)]">

              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-base shrink-0">🤖</div>
                <div className="flex-1">
                  <div className="text-white text-[13px] font-bold">Trader AI</div>
                  <div className="text-slate-500 text-[10px] font-mono">Powered by Google Gemini</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 text-[10px] font-mono">LIVE</span>
                </div>
              </div>

              {/* Prompt selector */}
              <div className="p-3 border-b border-white/[0.06] bg-white/[0.015] space-y-2">
                <div className="text-slate-500 text-[9px] font-mono tracking-widest mb-1">SELECT A QUESTION</div>
                {AI_CHATS.map((ch, i) => (
                  <button key={i} onClick={() => setActive(i)}
                    className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12px] transition-all ${
                      active === i ? "border-blue-500/40 bg-blue-500/10 text-white" : "border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-blue-500/20 hover:bg-blue-500/[0.04]"
                    }`}>
                    <span className="text-sm shrink-0">💬</span>
                    <span className="truncate">&ldquo;{ch.prompt}&rdquo;</span>
                  </button>
                ))}
              </div>

              {/* Response */}
              <AnimatePresence mode="wait">
                <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                  className="p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {chat.metrics.map((m, i) => (
                      <div key={i} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 text-center">
                        <div className="text-slate-500 text-[9px] font-mono mb-1">{m.label}</div>
                        <div className={`text-base font-bold font-mono ${m.danger ? "text-red-400" : "text-emerald-400"}`}>{m.value}</div>
                        <div className="text-slate-500 text-[9px]">{m.sub}</div>
                      </div>
                    ))}
                  </div>

                  <div className="border-l-2 border-blue-500/30 pl-3">
                    <p className="text-slate-300 text-[13px] leading-relaxed">{chat.analysis}</p>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                    <span className="text-sm shrink-0 mt-0.5">💡</span>
                    <div>
                      <div className="text-emerald-400 text-[10px] font-bold tracking-wider mb-1">RECOMMENDATION</div>
                      <div className="text-emerald-300/80 text-[12px] leading-relaxed">{chat.recommendation}</div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
