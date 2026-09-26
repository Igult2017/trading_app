import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import type { CopySetup } from "../../hooks/useCopySetup";
import type { Overview } from "../../hooks/useOverview";

interface OwnAccountsListProps {
  setup: CopySetup;
  links: NonNullable<Overview["selfCopy"]>["links"];
}

/** DERIVED FROM THE HOOK, not imported from `types`. `ownAccounts` carries more than the base
 *  `OwnAccount` (it adds `connected`, `loginId`, `isCtrader`), so importing the narrower type made
 *  every read of a row an error and `toggleOwnAccount` reject what the list had just handed it. */
type Account = CopySetup["ownAccounts"][number];

const SELECT_CLASS =
  "w-full bg-surface border border-surface-container-highest rounded py-2.5 px-3 font-body-md " +
  "text-[12px] focus:ring-1 focus:ring-primary focus:border-primary transition-colors duration-200 " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

/** Self-copy: a FORM that creates ONE copy link, and a list of every link that exists.
 *
 *  HIS RULES, 2026-09-26:
 *    *"The master section cannot allow having more than 1 masters right now which needs a fix...
 *     I have master A copied by slave B and master D copied by slave E... 1 slave can have more
 *     than 1 master... The only thing that should stand is a master copying itself."*
 *    *"The UI should be just like a form that user marks and if he does everything right, he gets
 *     the notification that copying was successful and then account that copies is displayed in
 *     mirror feeds."*
 *
 *  So the panel no longer HOLDS the setup — it builds one link at a time and the saved links are
 *  read back from the server (`overview.selfCopy.links`). That is what lets several masters exist
 *  at once: the page keeps no single "the master" any more.
 *
 *  WHAT IS REFUSED, and where. An account copying ITSELF is not offered (it is filtered out of the
 *  second dropdown) AND is rejected server-side. A link that would close a RING — B→A when A→B
 *  already exists — is rejected server-side only, because the client cannot be trusted with a
 *  safety rule; the reason comes back as a toast in his own words.
 */
export function OwnAccountsList({ setup, links }: OwnAccountsListProps) {
  const { ownAccounts, masterAccountId, selectedOwnAccounts, setMasterAccount, toggleOwnAccount } = setup;

  const byId = (id: string) => ownAccounts.find((a) => a.id === id);
  const fromId = masterAccountId;
  const intoId = selectedOwnAccounts[0] ?? "";
  // An account may be a master AND a slave, so the only one excluded is the account already chosen
  // as the source — because nothing may copy itself.
  const intoChoices = ownAccounts.filter((a) => a.id !== fromId);
  const label = (a: Account) => `${a.name} · ${a.broker} · ${a.balance}`;

  const pickInto = (id: string) => {
    if (intoId) {
      const current = byId(intoId);
      if (current) toggleOwnAccount(current);        // clear the previous pick
    }
    const next = byId(id);
    if (next) toggleOwnAccount(next);
  };

  // GROUPED BY MASTER, so several masters read as several feeds rather than one long list.
  const groups = links.reduce<Record<string, typeof links>>((acc, l) => {
    (acc[l.masterAccountId] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-xs text-on-surface-variant uppercase">Set up copying</span>
        <span className="font-label-xs text-on-surface-variant">
          {links.length === 0
            ? `${ownAccounts.length} linked · nothing copying yet`
            : `${links.length} link${links.length === 1 ? "" : "s"} · ${Object.keys(groups).length} master${Object.keys(groups).length === 1 ? "" : "s"}`}
        </span>
      </div>
      <p className="font-body-md text-on-surface-variant text-[12px] leading-snug">
        Pick an account to copy from and one to copy into, then press Start. Add as many pairs as you
        like — an account can be a master and a mirror at the same time. It just cannot copy itself.
      </p>

      {ownAccounts.length === 0 ? (
        <div className="border border-surface-container-highest rounded-lg p-6 text-center space-y-2">
          <Icon name="link_off" className="text-on-surface-variant text-[20px]" />
          <p className="font-body-md text-[12px] text-on-surface-variant">
            No linked accounts yet — connect one above to set up copying.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="copy-from" className="font-label-xs text-on-surface-variant uppercase block">
                Copy from <span className="normal-case opacity-60">(master)</span>
              </label>
              <select
                id="copy-from"
                className={SELECT_CLASS}
                value={fromId}
                onChange={(e) => {
                  const a = byId(e.target.value);
                  if (a) setMasterAccount(a);
                }}
              >
                <option value="">Choose an account…</option>
                {ownAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{label(a)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="copy-into" className="font-label-xs text-on-surface-variant uppercase block">
                Copy into <span className="normal-case opacity-60">(mirror)</span>
              </label>
              <select
                id="copy-into"
                className={SELECT_CLASS}
                value={intoId}
                disabled={!fromId}
                onChange={(e) => pickInto(e.target.value)}
              >
                <option value="">{fromId ? "Choose an account…" : "Choose a master first…"}</option>
                {intoChoices.map((a) => (
                  <option key={a.id} value={a.id}>{label(a)}</option>
                ))}
              </select>
            </div>
          </div>

          {fromId && intoId && (
            <p className="font-body-md text-[11px] text-on-surface-variant leading-snug">
              Pressing Start will copy{" "}
              <span className="font-bold text-on-surface">{byId(fromId)?.name}</span> into{" "}
              <span className="font-bold text-on-surface">{byId(intoId)?.name}</span> using the
              settings below.
            </p>
          )}

          {/* ── WHAT IS ALREADY COPYING ─────────────────────────────────── */}
          <div className="space-y-1.5">
            <span className="font-label-xs text-on-surface-variant uppercase block">
              Mirror feeds{links.length > 0 && ` (${links.length})`}
            </span>
            {links.length === 0 ? (
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
          </div>
        </div>
      )}
    </div>
  );
}
