import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import { useDelayedLoading } from '@/lib/useDelayedLoading';
import { DrawdownSkeleton } from '@/components/skeletons/DrawdownSkeleton';
import { ddPanelCss } from '@/components/drawdown/ddStyles2';
import { DdBanner } from '@/components/drawdown/ddBanner';
import { DdKpis } from '@/components/drawdown/ddKpis';
import { DdProfile } from '@/components/drawdown/ddProfile';
import { DdBreakdown, type DirKey, type GroupKey } from '@/components/drawdown/ddBreakdown';
import { DdRiskCards } from '@/components/drawdown/ddRiskCards';
import { DdLossShare } from '@/components/drawdown/ddLossShare';
import { DdStructural, type DiagKey } from '@/components/drawdown/ddStructural';
import { DdStreaks } from '@/components/drawdown/ddStreaks';
import { DdRR } from '@/components/drawdown/ddRR';
import { DdMonthly } from '@/components/drawdown/ddMonthly';
import { EMPTY_DRAWDOWN } from '@/components/drawdown/ddEmpty';

/**
 * DrawdownPanel — rebuilt to his design of 2026-11-03.
 *
 * WHAT CHANGED AND WHAT DID NOT. The presentation is entirely his new mock-up; the data wiring is
 * untouched. Every figure still comes from ONE call to `/api/drawdown/compute`
 * (server/python/drawdown/core.py), which already returned all eleven blocks this page shows — so
 * nothing here is new maths, and the Python was not opened.
 *
 * THE PANEL IS NOW A THIN ORCHESTRATOR. It owns the queries, the four pieces of view state and the
 * empty-state path; each section of the page is its own file under `components/drawdown/`. The old
 * version was 609 lines in one file, well past the 200-line limit, which is why the rebuild split it
 * rather than editing in place.
 *
 * ⚠ FONT ROLES, AND A DELIBERATE DEPARTURE. His 2026-08-29 instruction was *"it should inherit font
 * type from journal"*, and on 14 Sep he reverted a change of mine that italicised titles. This design
 * hardcodes an italic serif for titles, a mono for columnar data and a sans for body, and he
 * introduced it with "I also adopted a better font type" — so the titles and figures now use HIS
 * faces, and the journal font picker still drives the body text through `--disp`. Said out loud
 * because it reverses a correction I was given.
 *
 * ⚠ THE SCOPE CLASS IS STILL `.dp`. Journal.tsx exempts exactly that selector from the rule that
 * forces a font on every descendant of `.journal-root`; renaming it would let the journal clobber
 * every face above.
 */
export default function DrawdownPanel({
  sessionId, dispFont, bodyFont,
}: {
  sessionId?: string | null;
  dispFont?: string;
  bodyFont?: string;
}) {
  // `--disp` feeds the SANS role in ddStyles; `--mono` is kept for the reused month-grid CSS.
  const dpStyle = dispFont
    ? ({ ['--disp' as any]: dispFont, ['--mono' as any]: bodyFont ?? dispFont } as React.CSSProperties)
    : undefined;

  // ⚠ NO PERIOD SELECTOR ANY MORE. His instruction, 2026-11-09, pointing at a screenshot of the
  // header: *"The first image is the whole part i need you to remove."* That strip held the ACCOUNT
  // and PERIOD pickers, so both went with it — the account still comes from the journal
  // (`sessionId`), and the range is simply everything.
  //
  // `ddPeriods.ts` was DELETED rather than left in place: with only "all time" ever asked for, every
  // branch of its range logic became unreachable, and a disabled path that still reads like live
  // code is how the next session concludes the feature exists. Git holds it if the picker returns.
  // The request is now byte-for-byte what it was before the selector was ever added.
  const [dir, setDir] = useState<DirKey>('ALL');
  const [group, setGroup] = useState<GroupKey>('STRATEGY');
  const [diag, setDiag] = useState<DiagKey>('CONTEXT');
  const [openMonth, setOpenMonth] = useState<string | null>(null);


  const { data: result, isLoading, isError, error } = useQuery<any>({
    // The period is part of the key, so switching it refetches rather than showing the last range's
    // numbers under the new label.
    queryKey: ['/api/drawdown/compute', sessionId],
    enabled: !!sessionId,
    // Always pull fresh on open: treat cached data as stale and refetch every mount, so a redeploy
    // (or any recompute fix) shows up on the next visit with NO manual cache-bust. The server still
    // caches the heavy Python compute, so these refetches stay cheap.
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
    queryFn: async () => {
      const r = await authFetch(`/api/drawdown/compute?sessionId=${sessionId}`);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      const json = await r.json();
      if (!json.success) throw new Error(json.error || 'Drawdown computation failed');
      return json;
    },
  });

  // ── THE DAY-BY-DAY OUTCOMES BEHIND EACH MONTH ───────────────────────────────────
  // The SAME call the calendar makes, on purpose — same URL, same query key — so React Query serves
  // it from cache when the calendar has already been opened, and the two screens can never disagree
  // about the same day. Fetched only once a month has actually been expanded.
  const { data: calResult } = useQuery<any>({
    queryKey: ['/api/calendar/compute', sessionId],
    enabled: !!sessionId && openMonth !== null,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    queryFn: async () => {
      const r = await authFetch(`/api/calendar/compute?sessionId=${sessionId}`);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      return r.json();
    },
  });

  const showLoader = useDelayedLoading(!!sessionId && isLoading);
  if (showLoader) return <DrawdownSkeleton style={dpStyle} />;

  // NO ICON HERE EITHER — his 2026-11-09 instruction was *"All the icons in that page"*, and the
  // empty state is part of the page. `tone` went with it: it only ever coloured that icon.
  const centered = (title: string, subtitle: string) => (
    <div className="dp" style={dpStyle}><style>{ddPanelCss()}</style>
      <div style={{ minHeight: 420, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <p style={{ fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase',
                    fontWeight: 600, color: 'var(--ink-dim)' }}>{title}</p>
        <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{subtitle}</p>
      </div>
    </div>
  );

  if (!sessionId)
    return centered('No session selected',
                    'Select or create a session to view drawdown analysis');
  if (isError)
    return centered('Failed to load drawdown data',
                    (error as Error)?.message || 'Check server logs or try refreshing');

  // When the session has no logged trades the API returns no analysis. Rather than one blank screen,
  // render the full page STRUCTURE with a zeroed placeholder so every section shows, each with its
  // own "nothing yet" row.
  const hasData = !!(result && result.topStats && result.intelligence);
  const d: any = hasData ? result : EMPTY_DRAWDOWN;
  const intel = d.intelligence ?? {};
  const cur = intel.current ?? {};
  const series: number[] = intel.series ?? [];
  const tradeCount = (d.streaks?.timeline ?? []).length;

  return (
    <div className="dp" style={dpStyle}>
      <style>{ddPanelCss()}</style>
      <div className="dd-stack">

        <DdBanner cur={cur} uw={intel.underwater ?? {}} />

        <DdKpis ts={d.topStats ?? {}} series={series} />

        <DdProfile intel={intel} topStats={d.topStats ?? {}} tradeCount={tradeCount} />

        <DdBreakdown intel={intel} dir={dir} group={group} onDir={setDir} onGroup={setGroup} />

        <DdRiskCards risk={d.riskModel} mc={d.monteCarlo} recovery={d.recovery} />

        <DdLossShare lossShare={d.lossShare} />

        <DdStructural structural={d.structural} sessions={d.sessions ?? []}
                      diag={diag} onDiag={setDiag} />

        <section className="dd-grid dd-g2">
          <DdStreaks sk={d.streaks} />
          <DdRR buckets={d.rrBuckets ?? []} />
        </section>

        <DdMonthly monthly={d.monthly ?? []} openMonth={openMonth}
                   onToggleMonth={setOpenMonth} calendarData={calResult?.calendarData} />

      </div>
    </div>
  );
}
