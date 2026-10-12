import { Bone } from '@/components/skeletons/shellBones';
// GEOMETRY ONLY — a plain object, so this does NOT pull the dashboard skeleton's components (or
// shadcn) into the entry bundle. The shape is shared with the second-stage skeleton so the two
// cannot drift apart again; the colours cannot be shared, because this screen renders before
// `.journal-root` and its `--jr-*` variables exist.
import { DASH_GEOMETRY } from '@/components/skeletons/DashboardSkeletons';

/** The journal dashboard's shape. Verified against the live page: KPI row top/left/width
 *  106/201/1149, six columns at 4px with an 8px radius, cards 80 tall, panels at top 192 running
 *  302 tall, split columns 666.75 / 476.25 — identical on both. */
export default function JournalShell() {
  const G = DASH_GEOMETRY;
  const card: React.CSSProperties = {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: G.radiusPx,
  };
  return (
    <>
      {/* THE HEADER, measured: a 32px price band over a 60px nav, so the rail and the content
          start at y=92 exactly as they do on the real page. Without it everything below sat 92px
          too high and the whole screen jumped down the moment the journal arrived. */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ height: 32, background: '#080c10', borderBottom: '1px solid #0f1923' }} />
        <div style={{ height: 60, background: '#0a0f16', borderBottom: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
          <Bone w={152} h={30} dark />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w={26} h={26} r={999} dark />)}
            <Bone w={104} h={28} r={999} dark />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', width: '100%', flex: 1, minHeight: 0 }}>
        {/* THIRTEEN items, one flat list — counted on the page, not estimated. */}
        <div className="ls-rail" style={{ width: 185, flexShrink: 0, background: '#0a0f16',
                      padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {Array.from({ length: 13 }).map((_, i) => <Bone key={i} w="100%" h={16} dark />)}
        </div>
        <div style={{ flex: 1, padding: '14px 16px 32px', minWidth: 0, display: 'flex',
                      flexDirection: 'column', gap: G.splitGapPx, overflow: 'hidden' }}>
          {/* SIX KPI TILES, each a caption above a value — the shape of `KpiCardSkeleton`. */}
          <div className="ls-kpi" style={{ display: 'grid', gap: G.kpiGapPx }}>
            {Array.from({ length: G.kpiCols.lg }).map((_, i) => (
              <div key={i} style={{ ...card, padding: 12, minHeight: G.kpiMinHeight, display: 'flex',
                                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Bone w={64} h={10} r={3} dark />
                <Bone w={80} h={16} r={3} dark />
              </div>
            ))}
          </div>
          {/* THE EQUITY CURVE BESIDE THE PERFORMANCE MIX, at the real 7fr/5fr. */}
          <div className="ls-split" style={{ display: 'grid', gap: G.splitGapPx }}>
            <div style={{ ...card, background: '#080d18', padding: G.panelPadPx, minHeight: G.panelMinHeight,
                          display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bone w={32} h={32} r={9} dark /><Bone w={112} h={12} r={3} dark />
                </div>
                <Bone w={48} h={12} r={3} dark />
              </div>
              {/* BARS, NOT A SLAB. A flat rectangle where a chart is about to appear reads as a
                  broken image — the same reasoning DashboardSkeletons.tsx records. */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 150 }}>
                {G.curveBars.map((h, i) => (
                  <div key={i} className="app-bone" style={{
                    flex: 1, height: h + '%', borderRadius: 3, background: 'rgba(255,255,255,0.07)' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w={32} h={8} r={3} dark />)}
              </div>
            </div>
            <div style={{ ...card, padding: G.panelPadPx, minHeight: G.panelMinHeight,
                          display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Bone w={32} h={32} r={9} dark /><Bone w={112} h={12} r={3} dark />
              </div>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Bone w={96} h={10} r={3} dark /><Bone w={32} h={10} r={3} dark />
                  </div>
                  <Bone w="100%" h={4} r={999} dark />
                </div>
              ))}
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bone w={64} h={10} r={3} dark />
                  <div style={{ flex: 1 }}><Bone w="100%" h={4} r={999} dark /></div>
                  <Bone w={16} h={10} r={3} dark />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
