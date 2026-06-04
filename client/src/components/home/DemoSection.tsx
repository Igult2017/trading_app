import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["Journal", "Analytics", "Trade Vault", "Strategy Audit"] as const;

function JournalPanel() {
  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="grid grid-cols-2 gap-3">
        {[["Symbol","EUR/USD"],["Direction","BUY"],["Entry","1.08420"],["Stop Loss","1.08120"],["Take Profit","1.08960"],["Risk %","1.0%"]].map(([l,v]) => (
          <div key={l} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <div className="text-slate-500 text-[9px] mb-1">{l}</div>
            <div className="text-slate-200 font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
        <div className="text-slate-500 text-[9px] mb-2 tracking-widest">PSYCHOLOGY & NOTES</div>
        <div className="text-slate-300 text-[11px] leading-relaxed">London session breakout confirmed. Bullish structure on H4. Followed plan — no hesitation on entry. Mental state: confident.</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {["Breakout","Trend Follow","London Session","H4 Bias"].map(t => (
          <span key={t} className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] text-blue-400">{t}</span>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const rows: [string,number,boolean][] = [["London",72,true],["New York",65,true],["Asian",48,false],["NY/LN Overlap",78,true]];
  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="grid grid-cols-2 gap-3">
        {([["P&L","+$4,827",true],["Win Rate","67.3%",true],["Max DD","-8.2%",false],["Profit F.","2.41",true]] as [string,string,boolean][]).map(([l,v,g]) => (
          <div key={l} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
            <div className="text-slate-500 text-[9px] mb-1">{l}</div>
            <div className={`text-base font-bold ${g ? "text-emerald-400" : "text-red-400"}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-3">
        <div className="text-slate-500 text-[9px] tracking-widest">WIN RATE BY SESSION</div>
        {rows.map(([s,p,g]) => (
          <div key={s}>
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">{s}</span>
              <span className={g ? "text-emerald-400" : "text-amber-400"}>{p}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full transition-all ${g ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${p}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeVaultPanel() {
  const trades = [
    { pair:"EUR/USD", date:"Jun 03", r:"+2.3R", win:true,  tag:"Breakout" },
    { pair:"GOLD",    date:"Jun 03", r:"+1.1R", win:true,  tag:"Trend"    },
    { pair:"GBP/USD", date:"Jun 02", r:"-0.8R", win:false, tag:"Reversal" },
    { pair:"BTC/USD", date:"Jun 02", r:"+3.1R", win:true,  tag:"Momentum" },
  ];
  return (
    <div className="space-y-2 font-mono text-xs">
      <div className="flex gap-2 mb-3">
        {["All","Wins","Losses","BE"].map((f,i) => (
          <button key={f} className={`px-3 py-1.5 rounded-lg text-[11px] border transition-all ${i===0 ? "bg-blue-600 text-white border-blue-600" : "border-white/[0.08] text-slate-400 hover:border-blue-500/40"}`}>{f}</button>
        ))}
      </div>
      {trades.map(t => (
        <div key={t.pair} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
          <div>
            <div className="text-slate-200 font-semibold">{t.pair}</div>
            <div className="text-slate-500 text-[9px]">{t.date}</div>
          </div>
          <span className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[9px] text-blue-400">{t.tag}</span>
          <span className={`font-bold text-sm ${t.win ? "text-emerald-400" : "text-red-400"}`}>{t.r}</span>
        </div>
      ))}
    </div>
  );
}

function AuditPanel() {
  const metrics: [string,number,string][] = [["Edge Persistence",84,"emerald"],["Risk Entropy",72,"amber"],["Execution Quality",91,"emerald"],["Monte Carlo (95%)",68,"amber"]];
  return (
    <div className="font-mono text-xs">
      <div className="text-center mb-5">
        <div className="text-slate-500 text-[9px] tracking-widest mb-2">STRATEGY GRADE</div>
        <div className="text-6xl font-black text-emerald-400 leading-none mb-1">A-</div>
        <div className="text-slate-400 text-[11px]">Breakout Momentum System</div>
      </div>
      <div className="space-y-3">
        {metrics.map(([label, val, color]) => (
          <div key={label}>
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">{label}</span>
              <span className={color === "emerald" ? "text-emerald-400" : "text-amber-400"}>{val}/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full ${color === "emerald" ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${val}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PANELS: Record<string, React.ReactNode> = {
  Journal: <JournalPanel />,
  Analytics: <AnalyticsPanel />,
  "Trade Vault": <TradeVaultPanel />,
  "Strategy Audit": <AuditPanel />,
};

export default function DemoSection() {
  return (
    <section id="demo" className="py-24 bg-[#060b14]">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <span className="text-xs font-bold tracking-[3px] uppercase text-blue-500 block mb-3">Live Preview</span>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            See The Platform <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">In Action</span>
          </h2>
          <p className="text-slate-400 text-lg">A genuine look at the product. No marketing fluff.</p>
        </div>

        <Tabs defaultValue="Journal" className="w-full">
          <TabsList className="w-full mb-0 rounded-b-none rounded-t-2xl bg-white/[0.03] border border-white/[0.07] border-b-0 p-1.5 grid grid-cols-4">
            {TABS.map(t => (
              <TabsTrigger key={t} value={t} className="rounded-xl text-xs font-semibold text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">{t}</TabsTrigger>
            ))}
          </TabsList>

          {TABS.map(t => (
            <TabsContent key={t} value={t} className="mt-0">
              <div className="rounded-b-2xl border border-t-0 border-white/[0.07] bg-[#0c1524] p-5 min-h-[300px] relative">
                <div className="absolute top-3 right-4 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-mono text-slate-500">REAL PLATFORM DATA</span>
                </div>
                {PANELS[t]}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="text-center mt-6">
          <a href="/auth?mode=signup" target="myfm_journal"
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition-all">
            Try it yourself — it&apos;s free
          </a>
        </div>
      </div>
    </section>
  );
}
