import { Avatar } from "../../components/Avatar";
import { AccountPicker } from "./AccountPicker";
import { MirrorFeedList } from "./MirrorFeedList";
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

  // COUNTS WHAT IS ACTUALLY COPYING, not what is merely configured. A paused feed no longer appears
  // in the list below (see MirrorFeedList), so a header that still counted it would contradict what
  // he can see — "3 links" above an empty list.
  const live        = links.filter((l) => l.isActive);
  const liveMasters = new Set(live.map((l) => l.masterAccountId)).size;
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


  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-xs text-on-surface-variant uppercase">Set up copying</span>
        <span className="font-label-xs text-on-surface-variant">
          {live.length === 0
            ? `${ownAccounts.length} linked · nothing copying yet`
            : `${live.length} link${live.length === 1 ? "" : "s"} · ${liveMasters} master${liveMasters === 1 ? "" : "s"}`}
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
          <AccountPicker
            accounts={ownAccounts}
            links={links}
            masterId={fromId}
            targetId={intoId}
            onPickMaster={setMasterAccount}
            onPickTarget={pickInto}
          />

          {fromId && intoId && (
            <p className="font-body-md text-[11px] text-on-surface-variant leading-snug">
              Pressing Start will copy{" "}
              <span className="font-bold text-on-surface">{byId(fromId)?.name}</span> into{" "}
              <span className="font-bold text-on-surface">{byId(intoId)?.name}</span> using the
              settings below.
            </p>
          )}

          {fromId && <MirrorFeedList links={links.filter((l) => l.masterAccountId === fromId)}
                                     ownAccounts={ownAccounts} />}
        </div>
      )}
    </div>
  );
}
