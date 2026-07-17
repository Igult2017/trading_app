import { Avatar } from "../../components/Avatar";
import type { Follower } from "../../types";

interface ActiveFollowerListProps {
  followers: Follower[];
}

export function ActiveFollowerList({ followers }: ActiveFollowerListProps) {
  return (
    <div className="space-y-3 border-t border-surface-container-highest pt-8">
      <span className="font-label-xs text-on-surface opacity-70 uppercase">
        Active followers ({followers.length})
      </span>
      <div className="border border-surface-container-highest rounded-lg divide-y divide-surface-container-highest overflow-hidden">
        {followers.map((f) => (
          <div key={f.id} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={f.name} />
              <div>
                <p className="font-body-md font-bold leading-tight">{f.name}</p>
                <p className="text-[9px] text-on-surface opacity-70 font-dm-mono">
                  {f.handle} • {f.allocation} allocated • joined {f.joined}
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-tertiary">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary ct-pulse" />
              Active
            </span>
          </div>
        ))}
        {followers.length === 0 && (
          <p className="p-4 text-[12px] text-on-surface opacity-50 font-body-md">No active followers yet.</p>
        )}
      </div>
    </div>
  );
}
