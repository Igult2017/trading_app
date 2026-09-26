import { useState } from "react";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import type { CopySetup } from "../../hooks/useCopySetup";

interface OwnAccountsListProps {
  setup: CopySetup;
}

/** DERIVED FROM THE HOOK, not imported from `types`. `ownAccounts` carries more than the base
 *  `OwnAccount` (it adds `connected`, `loginId`, `isCtrader`), so importing the narrower type made
 *  every read of a row an error and `toggleOwnAccount` reject what the list had just handed it. */
type Account = CopySetup["ownAccounts"][number];

const SELECT_CLASS =
  "w-full bg-surface border border-surface-container-highest rounded py-2.5 px-3 font-body-md " +
  "text-[12px] focus:ring-1 focus:ring-primary focus:border-primary transition-colors duration-200 " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

/** Self-copy: pick ONE master, then add mirrors one at a time from a dropdown.
 *
 *  WHY IT IS PICKERS AND NOT A LIST OF EVERY ACCOUNT — his instruction, 2026-09-26: *"This section
 *  should be a dropdown that allows users to connect accounts then after that connected accounts
 *  should be displayed in mirror feeds. It should not show connected permanently like this because
 *  if this is the case then how will the user add another account suppose he has 10 accounts?"*
 *
 *  The old version rendered EVERY linked account as its own row with two buttons, always. With ten
 *  accounts that is ten rows and twenty buttons to read past, and the thing you actually want to
 *  know — which accounts are mirroring — is buried among the ones that are not. Now the page shows
 *  only the CHOSEN relationships and grows by one short row per mirror, not one per account owned.
 *
 *  A master cannot mirror to itself, so it is never offered as a mirror destination.
 */
export function OwnAccountsList({ setup }: OwnAccountsListProps) {
  const { ownAccounts, masterAccountId, selectedOwnAccounts, setMasterAccount, toggleOwnAccount } = setup;
  const [pending, setPending] = useState("");

  const masterAccount = ownAccounts.find((a) => a.id === masterAccountId);
  const mirrors = selectedOwnAccounts
    .map((id) => ownAccounts.find((a) => a.id === id))
    .filter((a): a is Account => Boolean(a));
  // Only accounts that are neither the master nor already mirroring can be added.
  const available = ownAccounts.filter(
    (a) => a.id !== masterAccountId && !selectedOwnAccounts.includes(a.id),
  );

  const addPending = () => {
    const account = ownAccounts.find((a) => a.id === pending);
    if (account) {
      toggleOwnAccount(account);
      setPending("");
    }
  };

  const label = (a: Account) => `${a.name} · ${a.broker} · ${a.balance}`;

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-xs text-on-surface-variant uppercase">Your accounts</span>
        <span className="font-label-xs text-on-surface-variant">
          {masterAccount
            ? `mirroring to ${mirrors.length}`
            : `${ownAccounts.length} linked · no master set`}
        </span>
      </div>
      <p className="font-body-md text-on-surface-variant text-[12px] leading-snug">
        Choose one account as the master — its trades get copied into whichever accounts you add as
        mirrors below.
      </p>

      {ownAccounts.length === 0 ? (
        <div className="border border-surface-container-highest rounded-lg p-6 text-center space-y-2">
          <Icon name="link_off" className="text-on-surface-variant text-[20px]" />
          <p className="font-body-md text-[12px] text-on-surface-variant">
            No linked accounts yet — connect one above to set up self-copy.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── 1. THE MASTER ───────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label
              htmlFor="copy-master-account"
              className="font-label-xs text-on-surface-variant uppercase block"
            >
              Master account
            </label>
            <select
              id="copy-master-account"
              className={SELECT_CLASS}
              value={masterAccountId}
              onChange={(e) => {
                const account = ownAccounts.find((a) => a.id === e.target.value);
                if (account) setMasterAccount(account);
              }}
            >
              <option value="">Choose the account to copy FROM…</option>
              {ownAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {label(a)}
                </option>
              ))}
            </select>
          </div>

          {/* ── 2. ADD A MIRROR ─────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label
              htmlFor="copy-add-mirror"
              className="font-label-xs text-on-surface-variant uppercase block"
            >
              Add a mirror
            </label>
            <div className="flex items-center gap-2">
              <select
                id="copy-add-mirror"
                className={SELECT_CLASS}
                value={pending}
                disabled={!masterAccountId || available.length === 0}
                onChange={(e) => setPending(e.target.value)}
              >
                <option value="">
                  {!masterAccountId
                    ? "Choose a master first…"
                    : available.length === 0
                      ? "Every other account is already mirroring"
                      : "Choose an account to copy INTO…"}
                </option>
                {available.map((a) => (
                  <option key={a.id} value={a.id}>
                    {label(a)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-4 py-2.5 rounded border border-primary bg-primary text-on-primary
                           font-body-md font-bold text-[11px] shrink-0 transition-all duration-200
                           hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed
                           disabled:hover:translate-y-0"
                disabled={!pending}
                onClick={addPending}
              >
                Add
              </button>
            </div>
          </div>

          {/* ── 3. WHAT IS ACTUALLY MIRRORING ───────────────────────────── */}
          <div className="space-y-1.5">
            <span className="font-label-xs text-on-surface-variant uppercase block">
              Mirror feeds{mirrors.length > 0 && ` (${mirrors.length})`}
            </span>
            {mirrors.length === 0 ? (
              <p className="border border-dashed border-surface-container-highest rounded-lg p-4
                            font-body-md text-[12px] text-on-surface-variant text-center">
                Nothing is mirroring yet. Pick an account above and press Add.
              </p>
            ) : (
              <ul className="border border-surface-container-highest rounded-lg divide-y
                             divide-surface-container-highest overflow-hidden">
                {mirrors.map((a) => (
                  <li
                    key={a.id}
                    className="ct-account-row p-3 flex items-center justify-between gap-3
                               hover:bg-surface-container-low transition-colors duration-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={a.name} />
                      <div className="min-w-0">
                        <p className="font-body-md font-bold text-[13px] leading-tight truncate">
                          {a.name}
                        </p>
                        <p className="text-[9px] text-on-surface-variant font-dm-mono truncate">
                          {a.platform} • {a.broker} • {a.balance} balance
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-tertiary text-on-tertiary
                                       text-[9px] font-bold uppercase">
                        Mirroring
                      </span>
                      <button
                        type="button"
                        aria-label={`Stop mirroring into ${a.name}`}
                        title={`Stop mirroring into ${a.name}`}
                        className="px-2.5 py-1.5 rounded border border-surface-container-highest
                                   text-on-surface-variant font-body-md font-bold text-[11px]
                                   transition-colors duration-200 hover:text-error hover:border-error"
                        onClick={() => toggleOwnAccount(a)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {masterAccount && (
            <p className="font-body-md text-on-surface-variant text-[11px] leading-snug">
              Copying <span className="font-bold text-on-surface">{masterAccount.name}</span> into{" "}
              {mirrors.length === 0 ? "nothing yet" : `${mirrors.length} account${mirrors.length === 1 ? "" : "s"}`}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
