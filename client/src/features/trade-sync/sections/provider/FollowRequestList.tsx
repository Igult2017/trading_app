import { Avatar } from "../../components/Avatar";
import type { FollowRequest } from "../../types";

interface FollowRequestListProps {
  requests: FollowRequest[];
  onAccept: (req: FollowRequest) => void;
  onDecline: (req: FollowRequest) => void;
}

/** People asking to follow YOUR service — you approve or turn them away. */
export function FollowRequestList({ requests, onAccept, onDecline }: FollowRequestListProps) {
  return (
    <div className="space-y-3 border-t border-surface-container-highest pt-8">
      <div className="flex items-center justify-between">
        <span className="font-label-xs text-on-surface opacity-70 uppercase">Follow requests</span>
        {requests.length > 0 && (
          <span className="font-dm-mono text-[10px] text-primary">{requests.length} pending</span>
        )}
      </div>
      <div className="border border-surface-container-highest rounded-lg divide-y divide-surface-container-highest overflow-hidden">
        {requests.map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={r.name} />
              <div className="min-w-0">
                <p className="font-body-md font-bold leading-tight truncate">{r.name}</p>
                <p className="text-[9px] text-on-surface opacity-70 font-dm-mono truncate">
                  {r.handle} • wants to allocate {r.allocation} • {r.time}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="px-3 py-1.5 rounded bg-tertiary text-on-tertiary font-body-md font-bold text-[11px]"
                onClick={() => onAccept(r)}
              >
                Accept
              </button>
              <button
                className="px-3 py-1.5 rounded border border-surface-container-highest text-on-surface font-body-md font-bold text-[11px]"
                onClick={() => onDecline(r)}
              >
                Decline
              </button>
            </div>
          </div>
        ))}
        {requests.length === 0 && (
          <p className="p-4 text-[12px] text-on-surface opacity-50 font-body-md">No pending requests.</p>
        )}
      </div>
    </div>
  );
}
