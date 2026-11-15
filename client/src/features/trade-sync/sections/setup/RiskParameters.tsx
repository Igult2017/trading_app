import { Icon } from "../../components/Icon";
import type { CopySetup } from "../../hooks/useCopySetup";

interface RiskParametersProps {
  setup: CopySetup;
}

/** Keeps a typed risk % at or under his 3% ceiling (15 Nov 2026) while still allowing a blank field. */
const capAt3 = (v: string) => (v !== "" && parseFloat(v) > 3 ? "3" : v);

/** How big each copied trade is, how much one copy may lose, and when the engine cuts itself off. */
export function RiskParameters({ setup }: RiskParametersProps) {
  const { sizingMode, setSizingMode, sizingValue, setSizingValue, drawdown, setDrawdown,
          maxRisk, setMaxRisk } = setup;
  const riskMode = sizingMode === "Risk %";

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-surface-container-highest pt-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="ads_click" className="text-on-surface-variant text-[15px]" />
          <span className="font-label-xs text-on-surface-variant uppercase">Allocation sizing</span>
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
            inputMode="decimal"
            aria-label={riskMode ? "Risk per trade in percent" : "Sizing value"}
            value={sizingValue}
            onChange={(e) => setSizingValue(riskMode ? capAt3(e.target.value) : e.target.value)}
          />
        </div>

        {/* EVERY copy carries a stop that holds its loss to this % — whatever the sizing mode. In
            "Risk %" mode the sizing number above IS that %, so the separate field only shows for the
            other modes. 1% default, 3% maximum (his rule, 15 Nov 2026). */}
        {!riskMode && (
          <div className="flex items-center justify-between gap-4">
            <p className="font-body-md text-on-surface-variant">Max risk per trade:</p>
            <div className="flex items-center bg-surface border border-surface-container-highest rounded overflow-hidden">
              <input
                className="bg-transparent border-none text-right font-dm-mono py-2 px-3 w-16 focus:ring-0"
                type="text"
                inputMode="decimal"
                aria-label="Maximum risk per trade in percent"
                value={maxRisk}
                onChange={(e) => setMaxRisk(capAt3(e.target.value))}
              />
              <span className="px-3 text-on-surface-variant border-l border-surface-container-highest bg-surface-container font-dm-mono">
                %
              </span>
            </div>
          </div>
        )}
        <p className="font-body-md text-on-surface-variant text-[12px] leading-relaxed">
          Every copied trade gets a stop loss so it can lose at most {riskMode ? "this" : "that"} % of
          your account — 1% if you set nothing, 3% at most.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="security" className="text-on-surface-variant text-[15px]" />
          <span className="font-label-xs text-on-surface-variant uppercase">Equity stop limit</span>
        </div>
        <div className="flex items-center gap-4">
          <p className="font-body-md text-on-surface-variant">Disconnect at drawdown:</p>
          <div className="flex items-center bg-surface border border-surface-container-highest rounded overflow-hidden">
            <input
              className="bg-transparent border-none text-right font-dm-mono py-2 px-3 w-16 focus:ring-0"
              type="text"
              value={drawdown}
              onChange={(e) => setDrawdown(e.target.value)}
            />
            <span className="px-3 text-on-surface-variant border-l border-surface-container-highest bg-surface-container font-dm-mono">
              %
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
