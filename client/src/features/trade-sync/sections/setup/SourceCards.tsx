import { Icon } from "../../components/Icon";
import { TelegramIcon } from "../../components/TelegramIcon";
import { SOURCES } from "../../data/dashboard";
import type { CopySetup } from "../../hooks/useCopySetup";

interface SourceCardsProps {
  setup: CopySetup;
}

/** Step 1 — where the trades come from. The per-card platform <select> stops propagation so
 *  changing the platform doesn't also re-select the card underneath it. */
export function SourceCards({ setup }: SourceCardsProps) {
  const { source, setSource, platformBySource, setPlatformBySource } = setup;

  return (
    <section>
      <p className="font-label-xs text-on-surface-variant mb-4 uppercase">Step 1 — Choose a source</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-surface-container-highest overflow-hidden rounded-lg">
        {SOURCES.map((s, i) => (
          <div
            key={s.id}
            className={`ct-source-card p-6 bg-surface ${i < 2 ? "border-r" : ""} border-surface-container-highest flex flex-col justify-between ${
              source === s.id ? "active" : ""
            }`}
            onClick={() => setSource(s.id)}
          >
            <div>
              {s.telegram ? (
                <TelegramIcon className={`w-8 h-8 mb-4 ${source === s.id ? "" : "opacity-50"}`} />
              ) : (
                <Icon
                  name={s.icon ?? ""}
                  className={`mb-4 text-[24px] ${source === s.id ? "text-primary" : "text-on-surface-variant"}`}
                />
              )}
              <h3 className="font-body-lg font-bold text-on-surface mb-1">{s.title}</h3>
              <p className="text-on-surface-variant font-body-md leading-snug mb-4">{s.desc}</p>
            </div>
            <select
              className="mt-auto bg-surface border border-surface-container-highest text-on-surface font-body-md py-1 px-2 rounded w-full text-sm"
              value={platformBySource[s.id]}
              onChange={(e) => setPlatformBySource((prev) => ({ ...prev, [s.id]: e.target.value }))}
              onClick={(e) => e.stopPropagation()}
            >
              {s.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}
