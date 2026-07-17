import { money } from "../../lib/format";
import type { CopyAccount } from "../../types";

interface ConnectedAccountsProps {
  accounts: CopyAccount[];
  onToggle: (id: number) => void;
}

/** Live/paused per copied account. The whole row is the toggle. */
export function ConnectedAccounts({ accounts, onToggle }: ConnectedAccountsProps) {
  return (
    <div className="flex-1 flex flex-col max-h-[500px] overflow-y-auto ct-hide-scrollbar border-b border-surface-container-highest">
      <div className="p-6 border-b border-surface-container-highest bg-surface-container-low">
        <h3 className="font-headline-md text-on-surface">Connected accounts</h3>
      </div>
      <div className="divide-y divide-surface-container-highest">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="ct-account-row p-4 flex items-center justify-between"
            onClick={() => onToggle(a.id)}
            title="Toggle live / paused"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-surface-container-highest text-on-surface font-bold rounded">
                {a.name[0]}
              </div>
              <div>
                <p className="font-body-md font-bold leading-tight">{a.name}</p>
                <p className="text-[9px] text-on-surface opacity-70 font-body-md">
                  {a.handle} • <span className="font-dm-mono text-[8px]">{a.tag}</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-dm-mono text-[11px] font-medium ${a.pnl >= 0 ? "text-tertiary" : "text-error"}`}>
                {money(a.pnl)}
              </p>
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
          </div>
        ))}
      </div>
    </div>
  );
}
