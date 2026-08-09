import type { Overview } from "../hooks/useOverview";

/** The dashboard's headline band — real figures from the overview aggregate. */
export function KpiRow({ overview }: { overview: Overview | undefined }) {
  const k = overview?.kpis;
  const money = (v: number) => `$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const kpis = [
    { label: "TOTAL EQUITY", value: k ? money(k.totalEquity) : "—" },
    {
      label: "TODAY'S PROFIT AND LOSS",
      value: k ? `${k.todayPnl < 0 ? "-" : "+"}${money(k.todayPnl)}` : "—",
      positive: (k?.todayPnl ?? 0) >= 0,
    },
    { label: "ACTIVE COPIES", value: k ? String(k.activeCopies) : "—", sub: k ? `${k.masters} master${k.masters === 1 ? "" : "s"}` : "" },
    { label: "TRADES TODAY", value: k ? String(k.tradesToday) : "—" },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 border-b border-surface-container-highest">
      {kpis.map((kpi, i) => (
        <div key={i} className={`p-6 ${i < 3 ? "md:border-r" : ""} border-surface-container-highest`}>
          <p className="font-label-xs text-on-surface-variant mb-1 uppercase">{kpi.label}</p>
          <div className="flex items-baseline gap-2">
            <span
              className={`font-dm-mono text-[16px] font-medium leading-tight ${
                "positive" in kpi ? (kpi.positive ? "text-tertiary" : "text-error") : "text-on-surface"
              }`}
            >
              {kpi.value}
            </span>
            {kpi.sub && (
              <span className="font-label-sm text-on-surface-variant">
                <span className="font-dm-mono text-[10px]">{kpi.sub}</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
