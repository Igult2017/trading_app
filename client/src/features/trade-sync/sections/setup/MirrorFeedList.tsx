import { useState } from "react";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import type { CopySetup } from "../../hooks/useCopySetup";
import type { Overview } from "../../hooks/useOverview";

/**
 * MirrorFeedList — the read-only "what is already copying" list.
 *
 * Split out of OwnAccountsList on 2026-09-28: that file was already 209 lines before the paused
 * filter went in and 268 after, past the 200-line limit, and it was doing two jobs — the SET-UP
 * FORM (pick a master, pick a mirror, press Start) and this READ-OUT of what the form has produced.
 * They change for different reasons, so they are now separate files.
 */
interface MirrorFeedListProps {
  links:       NonNullable<Overview["selfCopy"]>["links"];
  ownAccounts: CopySetup["ownAccounts"];
}

export function MirrorFeedList({ links, ownAccounts }: MirrorFeedListProps) {
  const byId = (id: string) => ownAccounts.find((a) => a.id === id);

  // ── A PAUSED FEED LEAVES THE LIST ────────────────────────────────────────────────────────────
  // His instruction: "when i pause copying that account that copies from master should
  // disappear/dropped from mirror feeds". It used to stay and swap its badge to a grey "Paused",
  // so stopping everything left a list that still read as though copying were set up and running.
  //
  // FILTERED HERE, IN THE VIEW, AND NOT ON THE SERVER — deliberately. `selfCopy.links` must go on
  // returning the paused rows: copySetup.test.ts asserts it, because the panel restores its saved
  // setup from them and "filtering to active ones would blank the panel the moment he stopped,
  // leaving nothing to restart from".
  //
  // HIDING THEM CANNOT STRAND HIM, which is the thing worth checking before removing a row someone
  // might need. Resuming never used this list: he picks the same pair in the form and presses
  // Start, and the server flips isActive back to true (routes.ts — "Re-pressing Start is also how
  // mirroring is resumed after a stop"). The row is a readout, not the control.
  const [showPaused, setShowPaused] = useState(false);
  const live   = links.filter((l) => l.isActive);
  const paused = links.filter((l) => !l.isActive);

  // Grouped by master, so several masters read as several feeds rather than one long list. Built
  // from `live` only, so a master whose mirrors are ALL paused drops out too rather than leaving an
  // empty card behind.
  const groups = live.reduce<Record<string, typeof links>>((acc, l) => {
    (acc[l.masterAccountId] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="space-y-1.5">
      <span className="font-label-xs text-on-surface-variant uppercase block">
        Mirror feeds{live.length > 0 && ` (${live.length})`}
      </span>
      {live.length === 0 ? (
        <p className="border border-dashed border-surface-container-highest rounded-lg p-4
                      font-body-md text-[12px] text-on-surface-variant text-center">
          Nothing is copying yet. Choose a pair above and press Start.
        </p>
      ) : (
        <div className="space-y-3">
          {Object.entries(groups).map(([masterId, rows]) => (
            <div
              key={masterId}
              className="border border-surface-container-highest rounded-lg overflow-hidden"
            >
              <div className="px-3 py-2 bg-surface-container-low flex items-center gap-2">
                <Avatar name={byId(masterId)?.name ?? "?"} />
                <div className="min-w-0">
                  <p className="font-body-md font-bold text-[12px] leading-tight truncate">
                    {byId(masterId)?.name ?? "an account no longer linked"}
                  </p>
                  <p className="text-[9px] text-on-surface-variant font-dm-mono">
                    master · feeding {rows.length} account{rows.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-surface-container-highest">
                {rows.map((l) => (
                  <li
                    key={l.followerId}
                    className="ct-account-row p-3 flex items-center justify-between gap-3
                               hover:bg-surface-container-low transition-colors duration-200"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name="subdirectory_arrow_right"
                            className="text-on-surface-variant text-[14px] shrink-0" />
                      <div className="min-w-0">
                        <p className="font-body-md font-bold text-[12px] leading-tight truncate">
                          {byId(l.followerAccountId)?.name ?? "an account no longer linked"}
                        </p>
                        <p className="text-[9px] text-on-surface-variant font-dm-mono truncate">
                          {l.lotMode === "risk" && l.riskPercent ? `risk ${l.riskPercent}%`
                            : l.lotMode === "fixed" && l.fixedLot ? `${l.fixedLot} lots`
                            : l.lotMultiplier ? `${l.lotMultiplier}x the master` : l.lotMode ?? ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${
                        l.isActive
                          ? "bg-tertiary text-on-tertiary"
                          : "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
                      {l.isActive ? "Copying" : "Paused"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* ── PAUSED, OUT OF THE WAY BUT NOT INVISIBLE ──────────────────────────────────────
          The rows themselves are gone, which is what he asked for. This one muted line stays
          because a paused feed is still CONFIGURED: its sizing, drawdown cap and instrument
          list are stored, and they come back the moment Start is pressed on that pair again.
          With no line at all there is nothing on screen to say that will happen. Collapsed by
          default, so the list reads exactly as he wanted. */}
      {paused.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowPaused((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-body-md text-on-surface-variant
                       hover:text-on-surface transition-colors duration-200"
            aria-expanded={showPaused}
          >
            <Icon name={showPaused ? "expand_less" : "expand_more"} className="text-[13px]" />
            {paused.length} paused
          </button>
          {showPaused && (
            <ul className="mt-1.5 border border-dashed border-surface-container-highest rounded-lg
                           divide-y divide-surface-container-highest">
              {paused.map((l) => (
                <li key={l.followerId} className="px-3 py-2 flex items-center justify-between gap-3">
                  <p className="font-body-md text-[11px] text-on-surface-variant truncate">
                    {byId(l.masterAccountId)?.name ?? "an account no longer linked"}
                    {" → "}
                    {byId(l.followerAccountId)?.name ?? "an account no longer linked"}
                  </p>
                  <span className="text-[9px] font-bold uppercase text-on-surface-variant shrink-0">
                    Paused
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
