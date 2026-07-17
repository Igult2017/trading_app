import { Icon } from "../../components/Icon";
import type { CopySetup } from "../../hooks/useCopySetup";

interface RiskParametersProps {
  setup: CopySetup;
}

/** How big each copied trade is, and when the engine cuts itself off. */
export function RiskParameters({ setup }: RiskParametersProps) {
  const { sizingMode, setSizingMode, sizingValue, setSizingValue, drawdown, setDrawdown } = setup;

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-surface-container-highest pt-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="ads_click" className="text-on-surface-variant text-[15px]" />
          <span className="font-label-xs text-on-surface opacity-70 uppercase">Allocation sizing</span>
        </div>
        <div className="flex gap-2">
          <select
            className="bg-surface border border-surface-container-highest rounded font-body-md py-2 px-3 flex-1"
            value={sizingMode}
            onChange={(e) => setSizingMode(e.target.value)}
          >
            <option>Risk %</option>
            <option>Lot Size</option>
            <option>Fixed Amount</option>
          </select>
          <input
            className="bg-surface border border-surface-container-highest rounded text-right font-dm-mono py-2 px-3 w-24"
            type="text"
            value={sizingValue}
            onChange={(e) => setSizingValue(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="security" className="text-on-surface-variant text-[15px]" />
          <span className="font-label-xs text-on-surface opacity-70 uppercase">Equity stop limit</span>
        </div>
        <div className="flex items-center gap-4">
          <p className="font-body-md text-on-surface opacity-70">Disconnect at drawdown:</p>
          <div className="flex items-center bg-surface border border-surface-container-highest rounded overflow-hidden">
            <input
              className="bg-transparent border-none text-right font-dm-mono py-2 px-3 w-16 focus:ring-0"
              type="text"
              value={drawdown}
              onChange={(e) => setDrawdown(e.target.value)}
            />
            <span className="px-3 text-on-surface opacity-70 border-l border-surface-container-highest bg-surface-container font-dm-mono">
              %
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
