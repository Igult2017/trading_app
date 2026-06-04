import { useState } from "react";
import { AI_CHATS } from "./constants";

export default function AiSection() {
  const [active, setActive] = useState(0);
  const chat = AI_CHATS[active];

  return (
    <section id="ai" className="bg-[#090910] py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-start">

          {/* Left */}
          <div>
            <p className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4">Trader AI</p>
            <h2 className="text-4xl font-bold text-[#f0f0f5] tracking-tight leading-[1.15] mb-4">
              An AI coach that actually knows your trades.
            </h2>
            <p className="text-[#9898a8] text-[16px] leading-relaxed mb-8">
              Not a generic chatbot. Trader AI reads your real trade data — your sessions, your setups, your losses — and gives you specific, data-backed feedback you can act on.
            </p>
            <div className="space-y-3">
              {["Built on Google Gemini — same model used by professionals", "Persistent memory of your trade history", "Surfaces patterns you don't know you have", "Generates strategy blueprints from your actual edge"].map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span className="text-[#9898a8] text-[15px]">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — chat widget */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0f0f1a] overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0">AI</div>
              <div>
                <p className="text-[14px] font-semibold text-[#f0f0f5]">Trader AI</p>
                <p className="text-[11px] text-[#5a5a6a] font-mono">Powered by Google Gemini</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-emerald-400 font-mono">ACTIVE</span>
              </div>
            </div>

            {/* Prompts */}
            <div className="p-4 border-b border-white/[0.06] space-y-2">
              {AI_CHATS.map((ch, i) => (
                <button key={i} onClick={() => setActive(i)}
                  className={`w-full text-left rounded-lg px-4 py-2.5 text-[13px] transition-colors ${
                    active === i ? "bg-indigo-500/15 text-[#f0f0f5] border border-indigo-500/30" : "text-[#9898a8] hover:bg-white/[0.04] border border-transparent"
                  }`}>
                  &ldquo;{ch.prompt}&rdquo;
                </button>
              ))}
            </div>

            {/* Response */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {chat.metrics.map((m, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 text-center">
                    <p className="text-[10px] text-[#5a5a6a] mb-1">{m.label}</p>
                    <p className={`text-[15px] font-bold font-mono ${m.danger ? "text-red-400" : "text-emerald-400"}`}>{m.value}</p>
                    <p className="text-[10px] text-[#5a5a6a]">{m.sub}</p>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-[#9898a8] leading-relaxed border-l-2 border-indigo-500/30 pl-3">{chat.analysis}</p>
              <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15 p-4">
                <p className="text-[11px] text-emerald-400 font-semibold tracking-wider mb-1.5">RECOMMENDATION</p>
                <p className="text-[13px] text-[#9898a8] leading-relaxed">{chat.recommendation}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
