import { useState } from "react";
import { AI_CHATS } from "./constants";

export default function AiSection() {
  const [active, setActive] = useState(0);
  const chat = AI_CHATS[active];

  return (
    <section id="ai" className="bg-slate-50 py-24 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-start">

          <div className="lg:pt-4">
            <p className="text-[13px] font-semibold text-indigo-600 tracking-widest uppercase mb-4">Trader AI</p>
            <h2 className="text-[38px] font-bold text-slate-900 tracking-tight leading-[1.15] mb-4">
              An AI coach that actually knows your trades.
            </h2>
            <p className="text-slate-500 text-[17px] leading-relaxed mb-8">
              Powered by Google Gemini, Trader AI reads your real trade history and gives you specific, data-backed feedback — not generic advice.
            </p>
            <div className="space-y-3">
              {["Analyses your actual trade data, not generic advice","Identifies the exact patterns costing you money","Generates strategy blueprints from your real edge","Persistent memory across sessions"].map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <span className="text-emerald-600 text-[11px]">✓</span>
                  </div>
                  <span className="text-slate-600 text-[15px]">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat widget */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-[13px] font-bold text-white shrink-0">AI</div>
              <div>
                <p className="text-[14px] font-semibold text-slate-800">Trader AI</p>
                <p className="text-[11px] text-slate-400">Powered by Google Gemini</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-emerald-600 font-medium">Active</span>
              </div>
            </div>

            {/* Prompts */}
            <div className="p-4 border-b border-slate-100 space-y-2 bg-slate-50/50">
              <p className="text-[11px] text-slate-400 mb-2">Ask Trader AI:</p>
              {AI_CHATS.map((ch, i) => (
                <button key={i} onClick={() => setActive(i)}
                  className={`w-full text-left rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all ${
                    active === i
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                  }`}>
                  &ldquo;{ch.prompt}&rdquo;
                </button>
              ))}
            </div>

            {/* Response */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {chat.metrics.map((m, i) => (
                  <div key={i} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
                    <p className="text-[10px] text-slate-400 mb-1">{m.label}</p>
                    <p className={`text-[15px] font-bold font-mono ${m.danger ? "text-red-500" : "text-emerald-600"}`}>{m.value}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{m.sub}</p>
                  </div>
                ))}
              </div>
              <p className="text-[14px] text-slate-600 leading-relaxed border-l-2 border-indigo-200 pl-3">{chat.analysis}</p>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                <p className="text-[11px] text-emerald-700 font-semibold tracking-wider mb-1.5">RECOMMENDATION</p>
                <p className="text-[13px] text-emerald-900 leading-relaxed">{chat.recommendation}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
