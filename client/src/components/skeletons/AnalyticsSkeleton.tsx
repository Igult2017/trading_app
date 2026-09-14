/**
 * WHAT THE ANALYTICS PAGE LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His words, 2026-09-14: *"can you fix those remaining pages too"* — /analytics showed the generic
 * PanelSkeleton. This is the page's own layout, built from the same site cards it uses (pages/Analytics.tsx):
 * the title row, five stat cards (one, two or three across), then the two breakdown cards of three rows.
 *
 * THE SITE'S STANDARD PLACEHOLDER BAR, not the journal one: this page is outside the journal, where
 * the journal's ink colour (`--jr-ink`, set on `.journal-root`) does not exist. Each bar sits in a slot
 * the height of the text it stands for, so the cards keep their size when the numbers arrive.
 */
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Slot = ({ h, bar, w }: { h: string; bar: string; w: number | string }) => (
  <div className={`flex items-center ${h}`}><Skeleton className={bar} style={{ width: w }} /></div>
);

export function AnalyticsSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="skeleton-analytics">
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Slot h="h-9" bar="h-7" w={260} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[92, 70, 64, 90, 94].map((w, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Slot h="h-5" bar="h-3.5" w={w} />
              <Skeleton className="h-4 w-4 rounded-sm" />
            </CardHeader>
            <CardContent><Slot h="h-8" bar="h-6" w={96} /></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[210, 190].map((w, i) => (
          <Card key={i}>
            <CardHeader><Slot h="h-6" bar="h-5" w={w} /></CardHeader>
            <CardContent className="space-y-4">
              {[118, 108, 92].map((lw, j) => (
                <div key={j} className="flex justify-between items-center">
                  <Slot h="h-6" bar="h-4" w={lw} />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
