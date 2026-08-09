import { Icon } from "../components/Icon";
import { StatRow } from "../components/StatRow";
import { money } from "../lib/format";
import type { Overview } from "../hooks/useOverview";

/** Copied-trade history + risk stats, from the overview aggregate. Rows the backend cannot price
 *  honestly (copy rows carry no profit column) show "—" instead of an invented figure. */
export function HistoryPage({ overview }: { overview: Overview | undefined }) {
  const h = overview?.history;
  const stats = [
    { label: "WIN RATE", value: h?.stats.winRate ?? "—", sub: "closed copies, all time" },
    { label: "PROFIT FACTOR", value: h?.stats.profitFactor ?? "—", sub: "needs priced fills" },
    { label: "MAX DRAWDOWN", value: h?.stats.maxDrawdown ?? "—", sub: "needs priced fills" },
    { label: "TOTAL TRADES", value: h?.stats.totalTrades ?? "—", sub: "closed copies" },
  ];
  const trades = h?.trades ?? [];

  return (
    <section>
      <div className="p-6 border-b border-surface-container-highest bg-surface-container-low flex items-center gap-2">
        <Icon name="history" className="text-on-surface-variant text-[16px]" />
        <h2 className="font-headline-md text-on-surface">History and risk</h2>
      </div>

      <StatRow stats={stats} />

      <div className="p-6">
        <p className="font-label-xs text-on-surface-variant mb-4 uppercase">Recent trades</p>
        <div className="border border-surface-container-highest rounded-lg overflow-hidden">
          <div className="hidden md:grid grid-cols-6 gap-2 px-4 py-2 bg-surface-container-low border-b border-surface-container-highest font-label-xs text-on-surface-variant uppercase">
            <span>Date</span>
            <span>Symbol</span>
            <span>Side</span>
            <span>Lot</span>
            <span>Source</span>
            <span className="text-right">Result</span>
          </div>
          <div className="divide-y divide-surface-container-highest">
            {trades.map((t) => (
              <div key={t.id} className="grid grid-cols-2 md:grid-cols-6 gap-2 px-4 py-3 items-center">
                <span className="font-dm-mono text-[10px] text-on-surface-variant">{t.date}</span>
                <span className="font-body-md font-bold text-on-surface">{t.symbol}</span>
                <span
                  className={`w-fit px-1.5 py-0.5 text-[9px] font-bold rounded border border-surface-bright ${
                    t.side === "BUY" ? "text-tertiary" : "text-error"
                  }`}
                >
                  {t.side}
                </span>
                <span className="font-dm-mono text-[11px] text-on-surface-variant">{t.lot}</span>
                <span className="font-body-md text-on-surface-variant truncate">{t.source}</span>
                <span
                  className={`font-dm-mono text-[12px] font-medium text-right ${
                    t.pnl == null ? "text-on-surface-variant" : t.pnl >= 0 ? "text-tertiary" : "text-error"
                  }`}
                >
                  {t.pnl == null ? "—" : money(t.pnl)}
                </span>
              </div>
            ))}
            {trades.length === 0 && (
              <p className="p-4 text-[12px] text-on-surface-variant font-body-md">
                No copied trades yet — they'll appear here as soon as the engine mirrors one.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
