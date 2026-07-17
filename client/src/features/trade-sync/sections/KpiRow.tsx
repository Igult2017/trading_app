import { KPIS } from "../data/dashboard";

/** The dashboard's headline band. Distinct from StatRow: value, delta and sub sit on one baseline. */
export function KpiRow() {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 border-b border-surface-container-highest">
      {KPIS.map((k, i) => (
        <div key={i} className={`p-6 ${i < 3 ? "md:border-r" : ""} border-surface-container-highest`}>
          <p className="font-label-xs text-on-surface opacity-70 mb-1 uppercase">{k.label}</p>
          <div className="flex items-baseline gap-2">
            <span className="font-dm-mono text-[16px] font-medium text-on-surface leading-tight">{k.value}</span>
            {k.delta && (
              <span className={`font-dm-mono text-[10px] ${k.positive ? "text-tertiary" : "text-error"}`}>
                {k.delta}
              </span>
            )}
            {k.sub && (
              <span className="font-label-sm text-on-surface opacity-70">
                <span className="font-dm-mono text-[10px]">{k.sub}</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
