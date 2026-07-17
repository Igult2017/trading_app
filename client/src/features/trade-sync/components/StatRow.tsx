import type { Stat } from "../types";

interface StatRowProps {
  stats: Stat[];
}

/** The four-up stat band under a page header — value on top, caption beneath. */
export function StatRow({ stats }: StatRowProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border-b border-surface-container-highest">
      {stats.map((s, i) => (
        <div key={i} className={`p-6 ${i < 3 ? "md:border-r" : ""} border-surface-container-highest`}>
          <p className="font-label-xs text-on-surface opacity-70 mb-1 uppercase">{s.label}</p>
          <span className="font-dm-mono text-[16px] font-medium text-on-surface leading-tight">{s.value}</span>
          <p className="font-label-sm text-on-surface opacity-50 mt-1">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}
