/**
 * WHAT THE PAGE LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His instruction, 2026-09-06: *"fix the skeleton to look better. The current skeleton does not look
 * like the page the user is waiting to load."* He was right — it was three rows of plain grey slabs
 * (six squares, two rectangles, one wide bar) that shared nothing with the dashboard except the
 * approximate number of blocks.
 *
 * THE RULE THESE FOLLOW: every measurement here is COPIED from the real component, not guessed, so
 * the content lands where its placeholder already was and the page does not jump when it arrives.
 * Where a number appears below, the file it came from is named.
 *
 *   card chrome     `--jr-panel` background, 1px `--jr-border`, 8px radius   (Journal.tsx StatCard)
 *   KPI row         6 columns / 3 under 900px / 2 on mobile, gap 4          (Journal.tsx:696)
 *   middle + bottom 7fr 5fr, gap 6                                          (Journal.tsx)
 *   chart panel     `--jr-chart` background, padding 16                     (panel-equity-curve)
 *
 * They keep the shadcn `Skeleton`'s pulse but override its fill — see the note on `Skeleton` below
 * for why, and for how they stay theme-aware without a second palette.
 */
import { Skeleton as ShadSkeleton } from "@/components/ui/skeleton";

/**
 * A PLACEHOLDER YOU CAN ACTUALLY SEE.
 *
 * The shared shadcn primitive fills with `bg-primary/10`, and against the journal's near-black
 * `--jr-panel` that measures under 2% apparent contrast — rendered and screenshotted, the whole
 * skeleton read as an empty page with faint smudges, which is worse than the spinner it replaced.
 * Same shape, same pulse, a fill that is actually legible on both themes.
 *
 * `currentColor` rather than a fixed grey: it inherits the surface's own text colour, so it is light
 * on the dark journal and dark on the light one without a second palette to keep in step.
 */
const Skeleton = ({ className = "", style }: { className?: string; style?: React.CSSProperties }) => (
  <ShadSkeleton className={className}
    style={{ background: "currentColor", opacity: 0.13, color: "var(--jr-ink,#ECEEF2)", ...style }} />
);

/** The card the KPI tiles, the panels and the log all share. */
const CARD: React.CSSProperties = {
  background: "var(--jr-panel,#0d1117)",
  border: "1px solid var(--jr-border,rgba(255,255,255,0.08))",
  borderRadius: 8,
};

/** One KPI tile: a caption above a bigger value, centred — same shape as `StatCard`. */
function KpiCardSkeleton() {
  return (
    <div style={{ ...CARD, padding: 12, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 6, minHeight: 64 }}>
      <Skeleton className="h-2.5 w-16 rounded-sm" />
      <Skeleton className="h-4 w-20 rounded-sm" />
    </div>
  );
}

/** A panel with the real title bar, so the heading does not appear out of nowhere. */
function PanelShell({ children, chart = false, minHeight = 240 }:
    { children: React.ReactNode; chart?: boolean; minHeight?: number }) {
  return (
    <div style={{ ...CARD, ...(chart ? { background: "var(--jr-chart,#080d18)" } : {}),
                  padding: 16, minHeight, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-3 w-28 rounded-sm" />
        </div>
        <Skeleton className="h-3 w-12 rounded-sm" />
      </div>
      {children}
    </div>
  );
}

/** Landing view — the KPI row, the equity + performance pair, then the log + calendar pair. */
export function DashboardSkeleton() {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {/* KPI row — six across, matching Journal.tsx:696 including its breakpoints. */}
      <div className="grid grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>

      {/* Equity curve (7fr) beside the performance mix (5fr). */}
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-[7fr_5fr]">
        <PanelShell chart>
          {/* A CURVE, NOT A BLOCK — a flat slab where a chart is about to appear reads as a broken
              image. Bars of falling height occupy the same area and say "a chart is coming". */}
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 6, minHeight: 150 }}>
            {[62, 74, 55, 83, 47, 70, 38, 60, 52, 44, 66, 34].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-2 w-8 rounded-sm" />)}
          </div>
        </PanelShell>

        <PanelShell>
          {/* Two ratio bars, then the pair-volume rows. */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Skeleton className="h-2.5 w-24 rounded-sm" />
                <Skeleton className="h-2.5 w-8 rounded-sm" />
              </div>
              <Skeleton className="h-1 w-full rounded-full" />
            </div>
          ))}
          <Skeleton className="mt-1 h-2.5 w-32 rounded-sm" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Skeleton className="h-2.5 w-16 rounded-sm" />
              <Skeleton className="h-1 flex-1 rounded-full" />
              <Skeleton className="h-2.5 w-4 rounded-sm" />
            </div>
          ))}
        </PanelShell>
      </div>

      {/* Recent trade log (7fr) beside the activity calendar (5fr). */}
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-[7fr_5fr]">
        <div style={{ ...CARD, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--jr-border,rgba(255,255,255,0.08))",
                        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Skeleton className="h-3 w-32 rounded-sm" />
            <Skeleton className="h-3.5 w-3.5 rounded-sm" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: "10px 16px", display: "flex", alignItems: "center",
                                  gap: 12, borderTop: i ? "1px solid var(--jr-border,rgba(255,255,255,0.04))" : "none" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <Skeleton className="h-3 w-20 rounded-sm" />
                <Skeleton className="h-2 w-28 rounded-sm" />
              </div>
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-3 w-14 rounded-sm" />
            </div>
          ))}
        </div>

        <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Skeleton className="h-3 w-3 rounded-sm" />
            <Skeleton className="h-3 w-28 rounded-sm" />
            <Skeleton className="h-3 w-3 rounded-sm" />
          </div>
          {/* Seven columns, five weeks — the shape of a month.
              THE CELLS ARE DELIBERATELY FAINTER THAN THE TEXT BLOCKS. At the same weight, 35 solid
              squares became the loudest thing on the page and pulled the eye away from everything
              else — the opposite of what the real calendar does, where the days are a quiet grid
              behind the numbers. Screenshotted, adjusted, screenshotted again. */}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={`h${i}`} className="mx-auto h-2 w-2.5 rounded-sm" />
            ))}
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="w-full rounded" style={{ height: 26, opacity: 0.07 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Whole-journal boot skeleton — shown while the entitlement check resolves. It mirrors the journal
 * shell (sidebar + header) and embeds the DashboardSkeleton, so the transition into the real
 * dashboard is one continuous skeleton rather than a spinner followed by a second skeleton.
 */
export function JournalBootSkeleton({ bg = "#020817" }: { bg?: string }) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden" style={{ background: bg }}>
      <div className="hidden w-56 flex-col gap-3 border-r border-white/5 p-4 lg:flex">
        <Skeleton className="h-8 w-32 rounded-md" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded-sm" />
            <Skeleton className="h-3 flex-1 rounded-sm" />
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <DashboardSkeleton />
      </div>
    </div>
  );
}

/** Generic analytics-panel skeleton — header + stat row + a large data block. */
export function PanelSkeleton() {
  return (
    <div className="flex min-h-[460px] w-full flex-col gap-3 p-2">
      <Skeleton className="h-6 w-48 rounded-md" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...CARD, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton className="h-2.5 w-16 rounded-sm" />
            <Skeleton className="h-4 w-20 rounded-sm" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}

/**
 * A table that is still loading — the header rule and a few rows, so the columns are already in
 * place. Replaces the spinning ring that used to sit in the middle of an empty card.
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex w-full flex-col" data-testid="skeleton-table">
      <div style={{ display: "flex", gap: 12, padding: "10px 14px",
                    borderBottom: "1px solid var(--jr-border,rgba(255,255,255,0.08))" }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 rounded-sm" style={{ flex: i === 0 ? 2 : 1 }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 12, padding: "12px 14px", alignItems: "center",
                              borderTop: r ? "1px solid var(--jr-border,rgba(255,255,255,0.04))" : "none" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 rounded-sm" style={{ flex: c === 0 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
