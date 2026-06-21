import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeletons for the journal dashboard. They replace the spinner so a cold
 * first login reads as "the page is here" rather than "loading". Built from the
 * theme-aware shadcn Skeleton (bg-primary/10), so they adapt to dark/light journal
 * themes without hardcoded colors.
 */

/** Landing view — KPI row + equity chart + side panel + recent-trades table. */
export function DashboardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-[7fr_5fr]">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

/**
 * Whole-journal boot skeleton — shown while the entitlement check resolves (the
 * gate that previously blocked the journal with a full-page spinner). It mirrors
 * the journal shell (sidebar + header) and embeds the DashboardSkeleton, so the
 * transition into the real dashboard is one continuous skeleton, not a spinner
 * followed by a second skeleton.
 */
export function JournalBootSkeleton({ bg = "#020817" }: { bg?: string }) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden" style={{ background: bg }}>{/* bg from the journal theme so it never flashes the wrong color */}
      <div className="hidden w-56 flex-col gap-3 border-r border-white/5 p-4 lg:flex">
        <Skeleton className="h-8 w-32 rounded-md" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
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
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
