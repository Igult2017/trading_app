import { Icon } from "../../components/Icon";
import type { FeedRow } from "../../types";

interface MirrorFeedProps {
  feed: FeedRow[];
  mirroring: boolean;
}

/**
 * THE COPIED TRADES — one card per trade (22 Nov 2026).
 *
 * His report: the feed showed "SELL GBPUSD 1.20 lot" eight times. It listed every copy ACTION (the open, each stop move,
 * the close) as if each were a new trade. The server now folds a trade's actions into one row (`server/lib/copyFeed.ts`)
 * and this card says what happened to it: where it went, its size, entry -> close, whether it is still open, how many
 * stop moves were copied, and how fast the copy was.
 */
// ONLY CLASSES THE COPIER DEFINES (`styles/utilities.ts`): it writes its colour classes by hand, so Tailwind's faded
// forms (`bg-tertiary/15`) do not exist here and would render no background at all.
const STATUS: Record<FeedRow["status"], { label: string; tone: string }> = {
  open: { label: "Open", tone: "bg-tertiary-container text-on-tertiary-container" },
  "partly closed": { label: "Partly closed", tone: "bg-tertiary-container text-on-tertiary-container" },
  order: { label: "Pending order", tone: "bg-primary-container text-on-primary-container" },
  closed: { label: "Closed", tone: "bg-surface-container-highest text-on-surface-variant" },
  cancelled: { label: "Cancelled", tone: "bg-surface-container-highest text-on-surface-variant" },
};

function speed(ms: number | null): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `copied in ${ms} ms` : `copied in ${(ms / 1000).toFixed(1)} s`;
}

function TradeCard({ f }: { f: FeedRow }) {
  const st = STATUS[f.status] ?? STATUS.closed;
  const buy = f.side === "BUY";
  const copied = speed(f.ms);
  return (
    <li className="ct-feed-row ct-account-row rounded-xl bg-surface-container-low px-4 py-3 transition-colors duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${buy ? "bg-tertiary-container text-on-tertiary-container" : "bg-error-container text-error"}`}>
              {f.side}
            </span>
            {/* No `font-body-md` here: the copier's type class fixes the size at 12 px and beats `text-[15px]`
                (measured 22 Nov) — the symbol is the line's headline. */}
            <span className="text-[15px] font-bold text-on-surface">{f.symbol}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{st.label}</span>
          </div>
          <p className="truncate text-[12px] text-on-surface-variant font-body-md">
            to <span className="font-medium text-on-surface">{f.account}</span>
            {" · "}<span className="font-dm-mono">{f.lot}</span> lot
          </p>
          <p className="text-[12px] text-on-surface-variant font-body-md">
            <span className="font-dm-mono text-on-surface">{f.entry ?? "—"}</span>
            {f.close && <> <Icon name="arrow_forward" className="mx-0.5 align-middle text-[12px]" />
              <span className="font-dm-mono text-on-surface">{f.close}</span></>}
          </p>
          {(copied || f.stopMoves > 0) && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {copied && <span className="rounded-md bg-surface-container-highest px-2 py-0.5 text-[11px] text-on-surface-variant">{copied}</span>}
              {f.stopMoves > 0 && (
                <span className="rounded-md bg-surface-container-highest px-2 py-0.5 text-[11px] text-on-surface-variant">
                  stop moved ×{f.stopMoves}
                </span>
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-on-surface-variant font-body-md">{f.time}</span>
      </div>
    </li>
  );
}

export function MirrorFeed({ feed, mirroring }: MirrorFeedProps) {
  const open = feed.filter((f) => f.status === "open" || f.status === "partly closed" || f.status === "order").length;
  return (
    <div className="flex-1 flex flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-surface-container-highest bg-surface-container-low p-6">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="podcasts" className="text-on-surface-variant text-[16px]" />
            <h3 className="font-headline-md text-on-surface">Copied trades</h3>
          </div>
          <p className="mt-1 text-[12px] text-on-surface-variant font-body-md">
            {feed.length ? `${open} open · ${feed.length - open} finished` : "Trades appear here as they are copied"}
          </p>
        </div>
        {/* A PILL, not green text: the copier's dark-theme green is a fill colour — as text on the dark header it measured
            2.57:1 (22 Nov), unreadable. Container colour + its own text colour, the pairing the status pills use. */}
        <div aria-live="polite"
             className={`flex items-center gap-2 rounded-full px-3 py-1 ${mirroring ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-container-highest text-on-surface-variant"}`}>
          <span className={`h-2 w-2 rounded-full ${mirroring ? "bg-tertiary ct-ping" : "bg-surface-container-high"}`} />
          <span className="text-[12px] font-medium">{mirroring ? "Copying live" : "Idle"}</span>
        </div>
      </div>
      <div className="overflow-y-auto ct-hide-scrollbar max-h-[460px] lg:max-h-none p-4">
        {feed.length > 0 ? (
          <ul className="space-y-2">{feed.map((f) => <TradeCard key={f.id} f={f} />)}</ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon name="content_copy" className="text-[28px] text-on-surface-variant" />
            <p className="text-[13px] font-medium text-on-surface">No trades copied yet</p>
            <p className="max-w-[240px] text-[12px] text-on-surface-variant">
              When a master you copy opens a trade, it shows here with how fast it was copied.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
