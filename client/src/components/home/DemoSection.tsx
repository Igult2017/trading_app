import { useState } from "react";

const TABS = ["Journal", "Analytics", "Trade Vault", "Strategy Audit"] as const;

function JournalPanel() {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[["Symbol","EUR/USD"],["Direction","BUY ↑"],["Entry","1.08420"],["Stop Loss","1.08120"],["Take Profit","1.08960"],["Risk","1.0%"]].map(([l,v]) => (
          <div key={l} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[11px] text-[#5a5a6a] mb-1">{l}</p>
            <p className="text-[14px] font-semibold text-[#f0f0f5] font-mono">{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
        <p className="text-[11px] text-[#5a5a6a] tracking-widest mb-2">NOTES</p>
        <p className="text-[14px] text-[#9898a8] leading-relaxed">London session breakout confirmed. Bullish structure on H4. Followed plan — no hesitation on entry.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["Breakout","Trend Follow","London Open","H4 Bias"].map(t => (
          <span key={t} className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-[12px] text-indigo-400">{t}</span>
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
          <div key={l} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-center">
            <p className="text-[11px] text-[#5a5a6a] mb-1">{l}</p>
            <p className={`text-[18px] font-bold font-mono ${g ? "text-emerald-400" : "text-red-400"}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
        <p className="text-[11px] text-[#5a5a6a] tracking-widest">WIN RATE BY SESSION</p>
        {sessions.map(([s,p]) => (
          <div key={s}>
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-[#9898a8]">{s}</span>
              <span className={p > 60 ? "text-emerald-400" : "text-amber-400"}>{p}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full ${p > 60 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${p}%` }} />
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
      {[{pair:"EUR/USD",r:"+2.3R",win:true,tag:"Breakout"},{pair:"GOLD",r:"+1.1R",win:true,tag:"Trend"},{pair:"GBP/USD",r:"-0.8R",win:false,tag:"Reversal"},{pair:"BTC/USD",r:"+3.1R",win:true,tag:"Momentum"}].map((t,i) => (
        <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
          <span className="font-mono text-[14px] font-semibold text-[#f0f0f5]">{t.pair}</span>
          <span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-400">{t.tag}</span>
          <span className={`font-mono font-bold text-[15px] ${t.win ? "text-emerald-400" : "text-red-400"}`}>{t.r}</span>
        </div>
      ))}
    </div>
  );
}

function AuditPanel() {
  return (
    <div>
      <div className="text-center mb-6">
        <p className="text-[11px] text-[#5a5a6a] tracking-widest mb-2">STRATEGY GRADE</p>
        <p className="text-7xl font-black text-emerald-400 leading-none">A−</p>
        <p className="text-[13px] text-[#9898a8] mt-2">Breakout Momentum System</p>
      </div>
      <div className="space-y-3">
        {([["Edge Persistence",84,true],["Risk Entropy",72,false],["Execution Quality",91,true],["Monte Carlo (95%)",68,false]] as [string,number,boolean][]).map(([l,v,g]) => (
          <div key={l}>
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-[#9898a8]">{l}</span>
              <span className={g ? "text-emerald-400" : "text-amber-400"}>{v}/100</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full ${g ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PANELS: Record<string, React.ReactNode> = { Journal: <JournalPanel />, Analytics: <AnalyticsPanel />, "Trade Vault": <VaultPanel />, "Strategy Audit": <AuditPanel /> };

export default function DemoSection() {
  const [tab, setTab] = useState<typeof TABS[number]>("Journal");
  return (
    <section id="demo" className="bg-[#0d0d16] py-28">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4">Live Preview</p>
          <h2 className="text-4xl font-bold text-[#f0f0f5] tracking-tight mb-4">See the real product.</h2>
          <p className="text-[#9898a8] text-[16px] max-w-md mx-auto">No mockups, no marketing screenshots. This is exactly what you get.</p>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/[0.08] mb-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-[13px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t ? "border-indigo-500 text-[#f0f0f5]" : "border-transparent text-[#5a5a6a] hover:text-[#9898a8]"
              }`}>{t}</button>
          ))}
        </div>

        {/* Panel */}
        <div className="rounded-b-xl border border-t-0 border-white/[0.08] bg-[#090910] p-6 min-h-[280px]">
          {PANELS[tab]}
        </div>

        <div className="text-center mt-8">
          <a href="/auth?mode=signup" target="myfm_journal"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[15px] px-6 py-3 transition-colors">
            Try it free — no card required
          </a>
        </div>
      </div>
    </section>
  );
}
