import { useState } from "react";
import { Icon } from "../../components/Icon";
import { money } from "../../lib/format";
import type { CopyAccount } from "../../types";

interface ConnectedAccountsProps {
  accounts: CopyAccount[];
  /** Disconnect this account from its master and remove the relationship. Permanent. */
  onDrop: (id: number) => void;
}

/**
 * The accounts currently wired to a master, and the control that unwires one.
 *
 * DROP, NOT PAUSE — his instruction: *"Instead of pause lets use drop. So when i click on 'drop' the
 * account is disconnected from copying trades from master and also it is dropped from connected
 * accounts list."*
 *
 * It used to be a pause: the WHOLE ROW was the button and a click flipped a live/paused flag, so the
 * row never left. Dropping RETIRES the relationship - it stops copying and disappears from this list
 * and from Mirror feeds, both of which are built from the same rows, so one filter on the server
 * removes it from both.
 *
 * ⚠ IT NO LONGER DELETES ANYTHING (fixed 2026-09-29). It did, and that is why he reported it "not
 * dropping": the trades it had copied and the audit lines about them point at the relationship row,
 * so the database refused to delete it and the button returned a server error on every relationship
 * that had actually been used. The records stay; the relationship is marked retired instead. Picking
 * the same pair in the setup form and pressing Start brings it back.
 *
 * ⚠ THE ROW IS NO LONGER CLICKABLE, and that is deliberate. A stray click used to cost a pause,
 * which undid itself. It would now cost the relationship and every setting on it — the sizing, the
 * drawdown cap, the instrument list — with no way back but rebuilding the pair. A destructive action
 * gets its own target.
 *
 * THE CONFIRM IS INLINE rather than a native confirm() — AccountsPage records the house rule
 * ("Confirmation is handled by an in-app modal — no native confirm()"), and trade-sync has no modal
 * component, so the button turns into its own two-step rather than pulling one in.
 */
export function ConnectedAccounts({ accounts, onDrop }: ConnectedAccountsProps) {
  const [confirmId, setConfirmId] = useState<number | null>(null);

  return (
    <div className="flex-1 flex flex-col max-h-[500px] overflow-y-auto ct-hide-scrollbar border-b border-surface-container-highest">
      <div className="p-6 border-b border-surface-container-highest bg-surface-container-low">
        <h3 className="font-headline-md text-on-surface">Connected accounts</h3>
      </div>
      <div className="divide-y divide-surface-container-highest">
        {accounts.length === 0 && (
          <p className="p-4 text-[12px] text-on-surface-variant font-body-md">
            Nothing connected yet — follow a provider, set up self-copy or link a Telegram channel.
          </p>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 flex items-center justify-center bg-surface-container-highest text-on-surface font-bold rounded shrink-0">
                {a.name[0]}
              </div>
              <div className="min-w-0">
                <p className="font-body-md font-bold leading-tight truncate">{a.name}</p>
                <p className="text-[9px] text-on-surface-variant font-body-md truncate">
                  {a.handle} • <span className="font-dm-mono text-[8px]">{a.tag}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p
                  className={`font-dm-mono text-[11px] font-medium ${
                    a.pnl == null ? "text-on-surface-variant" : a.pnl >= 0 ? "text-tertiary" : "text-error"
                  }`}
                >
                  {a.pnl == null ? "—" : money(a.pnl)}
                </p>
                {/* The badge STAYS, and the reason is not the one written here before. It said
                    "Stop-all still pauses every relationship at once" - there is no stop-all endpoint
                    any more, and nothing in routes.ts sets a relationship inactive.
                    The real source is the ENGINE: it auto-pauses a relationship that breaches its
                    drawdown or daily-loss cap (copy_platform/risk_guard.py, "re-enable from the UI").
                    That is a safety event he must be able to see, which is also why dropping uses its
                    own mark instead of reusing this flag - a drop would otherwise hide it. */}
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${a.status === "live" ? "bg-tertiary ct-pulse" : "bg-error"}`}
                  />
                  <span
                    className={`text-[9px] font-bold font-body-md ${
                      a.status === "live" ? "text-tertiary" : "text-error"
                    }`}
                  >
                    {a.status === "live" ? "Live" : "Paused"}
                  </span>
                </div>
              </div>

              {confirmId === a.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-body-md text-on-surface-variant hidden sm:inline">
                    Drop {a.name}?
                  </span>
                  <button
                    type="button"
                    onClick={() => { setConfirmId(null); onDrop(a.id); }}
                    className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-error text-on-error
                               hover:opacity-90 transition-opacity duration-200"
                  >
                    Drop
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="px-2 py-1 rounded text-[9px] font-bold uppercase border
                               border-surface-container-highest text-on-surface-variant
                               hover:text-on-surface transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(a.id)}
                  title={`Disconnect ${a.name} from its master and remove it from this list`}
                  aria-label={`Drop ${a.name}`}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase
                             border border-surface-container-highest text-on-surface-variant
                             hover:text-error hover:border-error transition-colors duration-200"
                >
                  <Icon name="link_off" className="text-[12px]" />
                  Drop
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
