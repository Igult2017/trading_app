import { useState } from "react";
import { openAuthModal } from "@/components/auth/AuthModal";

const TABS = ["Journal", "Analytics", "Trade Vault", "Strategy Audit"] as const;

function JournalPanel() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[["Symbol","EUR/USD"],["Direction","BUY"],["Entry","1.08420"],["Stop Loss","1.08120"],["Take Profit","1.08960"],["Risk %","1.0%"]].map(([l,v]) => (
          <div key={l} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-[11px] text-slate-400 mb-1">{l}</p>
            <p className="text-[14px] font-semibold text-slate-800 font-mono">{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
        <p className="text-[11px] text-slate-400 tracking-widest mb-2">NOTES</p>
        <p className="text-[14px] text-slate-600 leading-relaxed">London session breakout confirmed. Bullish structure on H4. Followed plan — no hesitation on entry. Mental state: confident.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["Breakout","Trend Follow","London Open","H4 Bias"].map(t => (
          <span key={t} className="rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-[12px] text-indigo-700">{t}</span>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const sessions: [string, number][] = [["London",72],["New York",65],["Asian",48],["NY/LN Overlap",78]];
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="grid grid-cols-2 gap-3">
        {([["P&L","+$4,827",true],["Win Rate","67.3%",true],["Max DD","-8.2%",false],["Profit F.","2.41",true]] as [string,string,boolean][]).map(([l,v,g]) => (
          <div key={l} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
            <p className="text-[11px] text-slate-400 mb-1">{l}</p>
            <p className={`text-[17px] font-bold font-mono ${g ? "text-emerald-600" : "text-red-500"}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
        <p className="text-[11px] text-slate-400 tracking-widest">WIN RATE BY SESSION</p>
        {sessions.map(([s,p]) => (
          <div key={s}>
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-slate-600">{s}</span>
              <span className={p > 60 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>{p}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200">
              <div className={`h-full rounded-full ${p > 60 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${p}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VaultPanel() {
  return (
    <div className="space-y-2">
      {[{pair:"EUR/USD",r:"+2.3R",win:true,tag:"Breakout"},{pair:"GOLD",r:"+1.1R",win:true,tag:"Trend"},{pair:"GBP/USD",r:"−0.8R",win:false,tag:"Reversal"},{pair:"BTC/USD",r:"+3.1R",win:true,tag:"Momentum"}].map((t,i) => (
        <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <span className="font-mono font-semibold text-[14px] text-slate-800">{t.pair}</span>
          <span className="rounded-md bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[11px] text-indigo-600 font-medium">{t.tag}</span>
          <span className={`font-mono font-bold text-[14px] ${t.win ? "text-emerald-600" : "text-red-500"}`}>{t.r}</span>
        </div>
      ))}
    </div>
  );
}

function AuditPanel() {
  return (
    <div>
      <div className="text-center mb-6">
        <p className="text-[11px] text-slate-400 tracking-widest mb-2">STRATEGY GRADE</p>
        <p className="text-7xl font-black text-emerald-600 leading-none">A−</p>
        <p className="text-[13px] text-slate-500 mt-2">Breakout Momentum System</p>
      </div>
      <div className="space-y-3">
        {([["Edge Persistence",84,true],["Risk Entropy",72,false],["Execution Quality",91,true],["Monte Carlo (95%)",68,false]] as [string,number,boolean][]).map(([l,v,g]) => (
          <div key={l}>
            <div className="flex justify-between text-[13px] mb-1">
              <span className="text-slate-600">{l}</span>
              <span className={`font-semibold ${g ? "text-emerald-600" : "text-amber-600"}`}>{v}/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200">
              <div className={`h-full rounded-full ${g ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PANELS: Record<string, React.ReactNode> = {
  Journal: <JournalPanel />, Analytics: <AnalyticsPanel />,
  "Trade Vault": <VaultPanel />, "Strategy Audit": <AuditPanel />,
};

export default function DemoSection() {
  const [tab, setTab] = useState<typeof TABS[number]>("Journal");
  return (
    <section id="demo" className="bg-white py-24">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-[13px] font-semibold text-indigo-600 tracking-widest uppercase mb-3">Live Preview</p>
          <h2 className="text-[38px] font-bold text-slate-900 tracking-tight mb-4">The real product, unfiltered.</h2>
          <p className="text-slate-500 text-[17px]">No mockups. No empty states. This is exactly what 10,000 traders use every day.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-6 py-3.5 text-[13px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? "border-indigo-600 text-indigo-600 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>{t}</button>
            ))}
          </div>
          <div className="bg-white p-6 min-h-[280px]">
            {PANELS[tab]}
          </div>
        </div>

        <div className="text-center mt-8">
          <button type="button" onClick={() => openAuthModal("signup")}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[15px] px-7 py-3.5 transition-colors inline-block cursor-pointer border-0">
            Try it free — no card required
          </button>
        </div>
      </div>
    </section>
  );
}
