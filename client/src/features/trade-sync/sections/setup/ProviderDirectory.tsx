import { Icon } from "../../components/Icon";
import { Stars } from "../../components/Stars";
import { Avatar } from "../../components/Avatar";
import type { FollowStatus, Provider } from "../../types";

interface ProviderDirectoryProps {
  providers: Provider[];
  query: string;
  followStatus: Record<string, FollowStatus>;
  onToggleFollow: (provider: Provider) => void;
}

/** The marketplace list. A follow is a REQUEST — "Follow" -> "Requested" -> "Following". */
export function ProviderDirectory({ providers, query, followStatus, onToggleFollow }: ProviderDirectoryProps) {
  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-label-xs text-on-surface-variant uppercase">Available to follow</span>
        <span className="font-label-xs text-on-surface-variant">
          {providers.length} provider{providers.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="border border-surface-container-highest rounded-lg divide-y divide-surface-container-highest overflow-hidden">
        {providers.map((p) => {
          const status = followStatus[p.id];
          return (
            <div key={p.id} className="ct-account-row p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-body-md font-bold leading-tight">{p.name}</p>
                    {p.verified && <Icon name="verified" className="text-tertiary text-[13px]" />}
                  </div>
                  <div className="flex items-center gap-1.5 my-0.5">
                    <Stars rating={p.rating} size="11px" />
                    <span className="font-dm-mono text-[9px] text-on-surface-variant">{p.rating.toFixed(1)}</span>
                  </div>
                  <p className="text-[9px] text-on-surface-variant font-dm-mono">
                    {p.winRate}% win • {p.monthlyReturn} 30D • {p.followers} followers • {p.risk} risk
                  </p>
                </div>
              </div>
              <button
                className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded border font-body-md font-bold text-[12px] ${
                  status === "following"
                    ? "bg-surface-container-highest text-on-surface border-surface-container-highest"
                    : status === "pending"
                    ? "bg-transparent text-primary border-primary"
                    : "bg-primary text-on-primary border-primary"
                }`}
                onClick={() => onToggleFollow(p)}
              >
                {status === "pending" && <Icon name="hourglass_top" className="text-[12px]" />}
                {status === "following" ? "Following" : status === "pending" ? "Requested" : "Follow"}
              </button>
            </div>
          );
        })}
        {providers.length === 0 && (
          <p className="p-4 text-[12px] text-on-surface-variant font-body-md">No providers match "{query}".</p>
        )}
      </div>
    </div>
  );
}
