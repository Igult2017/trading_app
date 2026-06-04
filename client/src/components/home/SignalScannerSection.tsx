const SIGNALS = [
  { sym: "EUR/USD", type: "SMC Break of Structure", tf: "H1",  conf: "HIGH",   buy: true,  time: "Just now" },
  { sym: "GOLD",   type: "Institutional Candle",   tf: "H4",  conf: "MEDIUM", buy: false, time: "4 min ago" },
  { sym: "GBP/JPY",type: "Price Channel Break",    tf: "M15", conf: "HIGH",   buy: true,  time: "12 min ago" },
];

export default function SignalScannerSection() {
  return (
    <section className="bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          <div>
            <p className="text-[13px] font-semibold text-indigo-600 tracking-widest uppercase mb-4">Signal Scanner</p>
            <h2 className="text-[38px] font-bold text-slate-900 tracking-tight leading-[1.15] mb-4">
              Never miss a setup again.
            </h2>
            <p className="text-slate-500 text-[17px] leading-relaxed mb-8">
              AI-powered scanning across Smart Money Concepts, institutional candles, and price channels. Alerts arrive on your phone before you even look at the chart.
            </p>
            <div className="space-y-3">
              {["Multi-timeframe automated scanning","AI validates setups before alerting you","Telegram + web push notifications"].map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
                    <span className="text-indigo-600 text-[11px]">✓</span>
                  </div>
                  <span className="text-slate-600 text-[15px]">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {SIGNALS.map((s, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between gap-4 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
                <div className="min-w-0">
                  <p className="font-mono font-bold text-[15px] text-slate-900 mb-0.5">{s.sym}</p>
                  <p className="text-[12px] text-slate-400">{s.type} · {s.tf}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[11px] font-medium px-2.5 py-1 rounded-md ${
                    s.conf === "HIGH"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>{s.conf}</span>
                  <span className={`font-mono font-bold text-[14px] ${s.buy ? "text-emerald-600" : "text-red-500"}`}>
                    {s.buy ? "▲ BUY" : "▼ SELL"}
                  </span>
                </div>
                <span className="text-[12px] text-slate-400 hidden sm:block">{s.time}</span>
              </div>
            ))}
            <p className="text-center text-[13px] text-slate-400 pt-1">Delivered via Telegram and web push</p>
          </div>

        </div>
      </div>
    </section>
  );
}
