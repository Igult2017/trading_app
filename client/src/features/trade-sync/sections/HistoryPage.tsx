import { Icon } from "../components/Icon";
import { StatRow } from "../components/StatRow";
import { RISK_STATS, TRADE_HISTORY } from "../data/history";
import { money } from "../lib/format";

export function HistoryPage() {
  return (
    <section>
      <div className="p-6 border-b border-surface-container-highest bg-surface-container-low flex items-center gap-2">
        <Icon name="history" className="text-on-surface-variant text-[16px]" />
        <h2 className="font-headline-md text-on-surface">History and risk</h2>
      </div>

      <StatRow stats={RISK_STATS} />

      <div className="p-6">
        <p className="font-label-xs text-on-surface opacity-70 mb-4 uppercase">Recent trades</p>
        <div className="border border-surface-container-highest rounded-lg overflow-hidden">
          <div className="hidden md:grid grid-cols-6 gap-2 px-4 py-2 bg-surface-container-low border-b border-surface-container-highest font-label-xs text-on-surface opacity-70 uppercase">
            <span>Date</span>
            <span>Symbol</span>
            <span>Side</span>
            <span>Lot</span>
            <span>Source</span>
            <span className="text-right">Result</span>
          </div>
          <div className="divide-y divide-surface-container-highest">
            {TRADE_HISTORY.map((t) => (
              <div key={t.id} className="grid grid-cols-2 md:grid-cols-6 gap-2 px-4 py-3 items-center">
                <span className="font-dm-mono text-[10px] text-on-surface opacity-70">{t.date}</span>
                <span className="font-body-md font-bold text-on-surface">{t.symbol}</span>
                <span
                  className={`w-fit px-1.5 py-0.5 text-[9px] font-bold rounded border border-surface-bright ${
                    t.side === "BUY" ? "text-tertiary" : "text-error"
                  }`}
                >
                  {t.side}
                </span>
                <span className="font-dm-mono text-[11px] text-on-surface opacity-70">{t.lot}</span>
                <span className="font-body-md text-on-surface opacity-70 truncate">{t.source}</span>
                <span
                  className={`font-dm-mono text-[12px] font-medium text-right ${
                    t.pnl >= 0 ? "text-tertiary" : "text-error"
                  }`}
                >
                  {money(t.pnl)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
