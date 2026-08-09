import { Icon } from "./Icon";
import type { AccountStatus } from "../types";

interface AddAccountCardProps {
  platform: string;
  onPlatformChange: (platform: string) => void;
  status: AccountStatus;
  accountId: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

/**
 * Link a broker account. Used twice over — once for the account you copy trades FROM (follower
 * side) and once for the account you broadcast FROM (provider studio) — so it owns no state of
 * its own; both instances are driven entirely by props.
 */
export function AddAccountCard({
  platform,
  onPlatformChange,
  status,
  accountId,
  onConnect,
  onDisconnect,
}: AddAccountCardProps) {
  return (
    <div className="border border-surface-container-highest rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-3">
        <label className="font-label-xs text-on-surface-variant uppercase shrink-0">Platform</label>
        <select
          className="bg-surface border border-surface-container-highest rounded py-1.5 px-3 font-body-md text-[12px]"
          value={platform}
          onChange={(e) => onPlatformChange(e.target.value)}
          disabled={status !== "disconnected"}
        >
          <option>cTrader</option>
          <option>MT4</option>
          <option>MT5</option>
        </select>
      </div>

      {status === "connected" ? (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary ct-pulse" />
            <p className="font-body-md text-on-surface text-[12px]">
              Connected to <span className="font-dm-mono">{platform}</span> — account{" "}
              <span className="font-dm-mono">{accountId}</span>
            </p>
          </div>
          <button
            className="px-4 py-1.5 rounded border border-surface-container-highest text-on-surface font-body-md font-bold text-[11px]"
            onClick={onDisconnect}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="font-body-md text-on-surface-variant text-[12px] max-w-sm">
            {platform} requires linking your account before trades can be mirrored or broadcast.
          </p>
          <button
            className="px-5 py-2 rounded bg-primary text-on-primary font-body-md font-bold text-[12px] flex items-center gap-2 disabled:opacity-60"
            onClick={onConnect}
            disabled={status === "connecting"}
          >
            <Icon name="add" className="text-[13px]" />
            {status === "connecting" ? "Connecting…" : "Add account"}
          </button>
        </div>
      )}
    </div>
  );
}
