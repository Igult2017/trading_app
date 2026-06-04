const SIGNALS = [
  { sym: "EUR/USD", type: "SMC Break of Structure", tf: "H1",  conf: "HIGH",   buy: true,  time: "Just now" },
  { sym: "GOLD",   type: "Institutional Candle",   tf: "H4",  conf: "MEDIUM", buy: false, time: "4m ago"   },
  { sym: "GBP/JPY",type: "Price Channel Break",    tf: "M15", conf: "HIGH",   buy: true,  time: "12m ago"  },
];

export default function SignalScannerSection() {
  return (
    <section className="bg-[#0d0d16] py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          <div>
            <p className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4">Signal Scanner</p>
            <h2 className="text-4xl font-bold text-[#f0f0f5] tracking-tight leading-[1.15] mb-4">
              Never miss a setup again.
            </h2>
            <p className="text-[#9898a8] text-[16px] leading-relaxed mb-8">
              AI-powered scanning across Smart Money Concepts, institutional candles, and price channels — with alerts sent directly to your phone.
            </p>
            <div className="space-y-3">
              {["Automated multi-timeframe scanning", "AI validation removes low-probability setups", "Telegram + web push notifications"].map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <span className="text-[#9898a8] text-[15px]">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {SIGNALS.map((s, i) => (
              <div key={i} className="rounded-xl border border-white/[0.08] bg-[#0f0f1a] px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono font-bold text-[15px] text-[#f0f0f5] mb-0.5">{s.sym}</p>
                  <p className="text-[12px] text-[#5a5a6a]">{s.type} · {s.tf}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                    s.conf === "HIGH"
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                      : "border-amber-500/25 bg-amber-500/10 text-amber-400"
                  }`}>{s.conf}</span>
                  <span className={`font-mono font-bold text-[14px] ${s.buy ? "text-emerald-400" : "text-red-400"}`}>
                    {s.buy ? "▲ BUY" : "▼ SELL"}
                  </span>
                </div>
                <span className="text-[12px] text-[#5a5a6a] font-mono shrink-0 hidden sm:block">{s.time}</span>
              </div>
            ))}
            <p className="text-center text-[12px] text-[#5a5a6a] pt-2">Alerts delivered via Telegram and web push</p>
          </div>

        </div>
      </div>
    </section>
  );
}
