import { Icon } from "../../components/Icon";
import { money } from "../../lib/format";
import type { FeedRow } from "../../types";

interface MirrorFeedProps {
  feed: FeedRow[];
  mirroring: boolean;
}

/** Trades as they land on the mirror accounts, newest first. */
export function MirrorFeed({ feed, mirroring }: MirrorFeedProps) {
  return (
    <div className="flex-1 flex flex-col bg-surface">
      <div className="p-6 border-b border-surface-container-highest flex justify-between items-center bg-surface-container-low">
        <div className="flex items-center gap-2">
          <Icon name="podcasts" className="text-on-surface-variant text-[15px]" />
          <h3 className="font-headline-md text-on-surface">Mirror feed</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full bg-tertiary ${mirroring ? "ct-ping" : ""}`} />
          <span className="text-[9px] font-label-xs text-tertiary">{mirroring ? "Streaming" : "Idle"}</span>
        </div>
      </div>
      <div className="overflow-y-auto ct-hide-scrollbar max-h-[400px] lg:max-h-none">
        {feed.map((f) => (
          <div key={f.id} className="ct-feed-row p-4 border-b border-surface-container-highest">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-surface-container-highest border border-surface-bright text-on-surface text-[9px] font-bold rounded">
                    {f.side}
                  </span>
                  <span className="font-body-md font-bold">{f.symbol}</span>
                </div>
                <p className="text-on-surface opacity-70 font-body-md">
                  <span className="font-dm-mono text-[10px]">{f.lot}</span> lot @{" "}
                  <span className="font-dm-mono text-[10px]">{f.price}</span>
                </p>
                <div className="flex items-center gap-1 text-[9px] text-on-surface opacity-50 font-body-md">
                  <Icon name="south" className="text-[10px]" />
                  <span>
                    <span className="font-dm-mono text-[8px]">{f.ms}</span>ms to copy
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`font-dm-mono text-[11px] font-medium ${
                    f.pnl == null ? "text-on-surface opacity-50" : f.pnl >= 0 ? "text-tertiary" : "text-error"
                  }`}
                >
                  {f.pnl == null ? "—" : money(f.pnl)}
                </p>
                <p className="text-[9px] text-on-surface opacity-50 font-body-md">{f.time}</p>
              </div>
            </div>
          </div>
        ))}
        {feed.length === 0 && (
          <p className="p-4 text-[10px] text-on-surface opacity-50 font-body-md">No trades copied yet.</p>
        )}
      </div>
    </div>
  );
}
