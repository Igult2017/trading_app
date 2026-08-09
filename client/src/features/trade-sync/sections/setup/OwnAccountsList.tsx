import { Avatar } from "../../components/Avatar";
import type { CopySetup } from "../../hooks/useCopySetup";

interface OwnAccountsListProps {
  setup: CopySetup;
}

/** Self-copy: one account is the master, any others can be mirror destinations. The master can't
 *  mirror to itself, so its "Add as mirror" button is withheld. Accounts are the user's REAL
 *  linked broker accounts (overview.ownAccounts). */
export function OwnAccountsList({ setup }: OwnAccountsListProps) {
  const { ownAccounts, masterAccountId, selectedOwnAccounts, setMasterAccount, toggleOwnAccount } = setup;
  const masterAccount = ownAccounts.find((a) => a.id === masterAccountId);

  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-label-xs text-on-surface-variant uppercase">Your accounts</span>
        <span className="font-label-xs text-on-surface-variant">
          {masterAccount ? `mirroring to ${selectedOwnAccounts.length}` : "no master set"}
        </span>
      </div>
      <p className="font-body-md text-on-surface-variant text-[12px] leading-snug">
        Declare one account as the master — its trades get copied into whichever other accounts you mark as mirrors.
      </p>
      <div className="border border-surface-container-highest rounded-lg divide-y divide-surface-container-highest overflow-hidden">
        {ownAccounts.length === 0 && (
          <p className="p-4 text-[12px] text-on-surface-variant font-body-md">
            No linked accounts yet — connect one above to set up self-copy.
          </p>
        )}
        {ownAccounts.map((a) => {
          const isMaster = masterAccountId === a.id;
          const isMirrorTarget = selectedOwnAccounts.includes(a.id);
          return (
            <div key={a.id} className="ct-account-row p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={a.name} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-body-md font-bold leading-tight truncate">{a.name}</p>
                    {isMaster && (
                      <span className="px-1.5 py-0.5 rounded bg-primary-container text-on-primary-container text-[8px] font-bold uppercase shrink-0">
                        Master
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-on-surface-variant font-dm-mono truncate">
                    {a.platform} • {a.broker} • {a.balance} balance
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className={`px-3 py-1.5 rounded border font-body-md font-bold text-[11px] ${
                    isMaster
                      ? "bg-primary text-on-primary border-primary"
                      : "bg-transparent text-on-surface border-surface-container-highest"
                  }`}
                  onClick={() => setMasterAccount(a)}
                >
                  {isMaster ? "Master account" : "Set as master"}
                </button>
                {!isMaster && (
                  <button
                    className={`px-3 py-1.5 rounded border font-body-md font-bold text-[11px] ${
                      isMirrorTarget
                        ? "bg-tertiary text-on-tertiary border-tertiary"
                        : "bg-transparent text-on-surface border-surface-container-highest"
                    }`}
                    onClick={() => toggleOwnAccount(a)}
                  >
                    {isMirrorTarget ? "Mirroring" : "Add as mirror"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
