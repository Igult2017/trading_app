import { Bone, isLightGround } from '@/components/skeletons/shellBones';
// THE JOURNAL'S OWN PALETTES. Six of them, five dark and one light — and this screen used to paint
// near-black for all six. Importing them costs nothing: the module holds the theme and font tables
// and a hook over `useState`, not a page.
import { THEMES, storedJournalTheme } from '@/hooks/useJournalSettings';
// GEOMETRY ONLY — a plain object, so this does NOT pull the dashboard skeleton's components (or
// shadcn) into the entry bundle. The shape is shared with the second-stage skeleton so the two
// cannot drift apart again; the colours cannot be shared, because this screen renders before
// `.journal-root` and its `--jr-*` variables exist.
import { DASH_GEOMETRY } from '@/components/skeletons/DashboardSkeletons';

/** ⚠ THE RAIL IS FILLED BY MATCHING THE REAL NAV'S RHYTHM, not by adding invented filler.
 *  His report, 2026-10-26, with the empty half of the sidebar ticked: *"That space i have ticked
 *  should be filled in the skeleton."* The bones were 16px tall and 11px apart — 354px of a 676px
 *  column, so the list stopped halfway and the rest was bare ground.
 *
 *  A real nav row is 51px: 16px of padding above and below a line of 15.5px Montserrat
 *  (`Journal.tsx:133`, `:144`), with 4px between rows (`:124`). Thirteen of those is 727px, which
 *  fills the column on his screen and runs past the bottom on a short one — exactly as the real
 *  sidebar does, which scrolls (`Journal.tsx:191`). So the placeholder now ends where the page's
 *  own nav ends, rather than above it. */
const NAV_ROW_H = 51;
/** Each row's label bar — the MEASURED width of that nav label, in the order the sidebar lists
 *  them (`Journal.tsx:71-89`), rendered in the page's own face and size (Montserrat 700, 15.5px,
 *  0.02em tracking) rather than estimated from a characters-times-a-guess sum:
 *
 *    Dashboard 92 · Sessions 72 · Accounts 79 · Journal 63 · Trade Vault 96 · Calendar 75
 *    Drawdown 91 · Analytics 78 · Audit 46 · Trader AI 76 · FX Copier 81 · Assets 55
 *    Leaderboard 107 → 103
 *
 *  103 is all a label gets (185 rail − 24 rail padding − 28 row padding − 16 icon − 14 gap), so
 *  Leaderboard is clamped to it, exactly as the real one is. They vary because thirteen bars of
 *  one length read as a pattern rather than as a list of words. */
const NAV_BAR_WIDTHS = [92, 72, 79, 63, 96, 75, 91, 78, 46, 76, 81, 55, 103];

/** The journal dashboard's shape. Verified against the live page: KPI row top/left/width
 *  106/201/1149, six columns at 4px with an 8px radius, cards 80 tall, panels at top 192 running
 *  302 tall, split columns 666.75 / 476.25 — identical on both. */
export default function JournalShell() {
  const G = DASH_GEOMETRY;
  // ⚠ THE COLOURS FOLLOW HIS THEME NOW. Every surface here was a measured constant — taken off the
  // live page while it was on ONE theme — so the placeholder painted that theme for everybody. On
  // Midnight the rail was visibly the wrong blue; on Light the whole screen went near-black
  // between a white first paint and a white page. His report, 25 Oct 2026: *"When i reload the
  // journal when im logged in as i wait for it to load a page the skeleton looks bad."* Logged in
  // is the condition because that is when a theme exists at all.
  //
  // `index.html` already reads this same saved setting to paint the right ground on the very first
  // frame; this is the same answer, two frames later, instead of a contradiction of it.
  const T = THEMES[storedJournalTheme()] ?? THEMES.navy;
  const light = isLightGround(T.bg);
  // Bones and hairlines are judged against the surface BEHIND them, not against one global guess —
  // the mistake that once left the admin rail completely empty.
  const line = light ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)';
  const card: React.CSSProperties = {
    background: T.surface,
    border: '1px solid ' + line,
    borderRadius: G.radiusPx,
  };
  return (
    <>
      {/* THE HEADER, measured: a 32px price band over a 60px nav, so the rail and the content
          start at y=92 exactly as they do on the real page. Without it everything below sat 92px
          too high and the whole screen jumped down the moment the journal arrived. */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ height: 32, background: T.sidebarBg, borderBottom: '1px solid ' + line }} />
        <div style={{ height: 60, background: T.sidebarBg, borderBottom: '1px solid ' + line,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
          <Bone w={152} h={30} dark={!light} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w={26} h={26} r={999} dark={!light} />)}
            <Bone w={104} h={28} r={999} dark={!light} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', width: '100%', flex: 1, minHeight: 0 }}>
        {/* THIRTEEN items, one flat list — counted on the page, not estimated. */}
        {/* ⚠ THE EDGE LINE IS WHAT MAKES THE RAIL READ TO THE BOTTOM. Measured: the rail already
            reached the full height (bottom 768 of a 768 viewport, gap 0) — but on Midnight its
            background is rgb(4,6,16) against a page of rgb(6,7,15), a difference of two, so below
            the last nav item there was nothing to see and the column appeared to stop. His report:
            *"Its sidebar doesnt [reach the bottom]."*
            The real page draws a hairline on that edge and the placeholder did not. These are the
            page's own values, copied rather than chosen (Journal.tsx:163, :176). */}
        {/* ⚠ `overflow: hidden`, NOT a scrollbar. Thirteen real rows are taller than a short
            viewport, so the last one is cut by the bottom edge — which is what the real rail looks
            like before you scroll it, and it is what makes the column read as full rather than as
            a list that gave up. */}
        <div className="ls-rail" style={{ width: 185, flexShrink: 0, background: T.sidebarBg,
                      borderRight: '1px solid ' + (light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.04)'),
                      padding: '16px 12px 8px', display: 'flex', flexDirection: 'column',
                      overflow: 'hidden' }}>
          {NAV_BAR_WIDTHS.map((w, i) => (
            <div key={i} style={{ height: NAV_ROW_H, boxSizing: 'border-box', flexShrink: 0,
                                  marginBottom: 4, padding: '0 14px', display: 'flex',
                                  alignItems: 'center', gap: 14 }}>
              <Bone w={16} h={16} r={4} dark={!light} />
              <Bone w={w} h={11} r={3} dark={!light} />
            </div>
          ))}
        </div>
        {/* THE GUTTER IS EQUAL ON ALL FOUR SIDES. It was 32 at the bottom against 16 at the
            sides, which reads as a gap rather than a margin once the panels reach down to it. */}
        <div style={{ flex: 1, padding: '14px 16px 16px', minWidth: 0, display: 'flex',
                      flexDirection: 'column', gap: G.splitGapPx, overflow: 'hidden' }}>
          {/* SIX KPI TILES, each a caption above a value — the shape of `KpiCardSkeleton`. */}
          <div className="ls-kpi" style={{ display: 'grid', gap: G.kpiGapPx }}>
            {Array.from({ length: G.kpiCols.lg }).map((_, i) => (
              <div key={i} style={{ ...card, padding: 12, minHeight: G.kpiMinHeight, display: 'flex',
                                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Bone w={64} h={10} r={3} dark={!light} />
                <Bone w={80} h={16} r={3} dark={!light} />
              </div>
            ))}
          </div>
          {/* THE EQUITY CURVE BESIDE THE PERFORMANCE MIX, at the real 7fr/5fr. */}
          {/* ⚠ IT STRETCHES TO THE BOTTOM. Without `flex: 1` this row took its own minimum height
              and stopped there, leaving a band of bare ground under the panels — his words,
              2026-10-26: *"the skeleton does not reach the bottom so it looks hanging so i wanted
              it to be full page top to bottom and side to side."* The floor stays as a floor so a
              short viewport still gets a sensibly sized panel instead of a squashed one. */}
          <div className="ls-split" style={{ display: 'grid', gap: G.splitGapPx, flex: 1, minHeight: G.panelMinHeight }}>
            <div style={{ ...card, background: T.bg, padding: G.panelPadPx, minHeight: G.panelMinHeight,
                          display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bone w={32} h={32} r={9} dark={!light} /><Bone w={112} h={12} r={3} dark={!light} />
                </div>
                <Bone w={48} h={12} r={3} dark={!light} />
              </div>
              {/* BARS, NOT A SLAB. A flat rectangle where a chart is about to appear reads as a
                  broken image — the same reasoning DashboardSkeletons.tsx records. */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 150 }}>
                {G.curveBars.map((h, i) => (
                  <div key={i} className="app-bone" style={{
                    flex: 1, height: h + '%', borderRadius: 3,
                    background: light ? 'rgba(15,23,42,0.07)' : 'rgba(255,255,255,0.07)' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w={32} h={8} r={3} dark={!light} />)}
              </div>
            </div>
            <div style={{ ...card, padding: G.panelPadPx, minHeight: G.panelMinHeight,
                          display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Bone w={32} h={32} r={9} dark={!light} /><Bone w={112} h={12} r={3} dark={!light} />
              </div>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Bone w={96} h={10} r={3} dark={!light} /><Bone w={32} h={10} r={3} dark={!light} />
                  </div>
                  <Bone w="100%" h={4} r={999} dark={!light} />
                </div>
              ))}
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bone w={64} h={10} r={3} dark={!light} />
                  <div style={{ flex: 1 }}><Bone w="100%" h={4} r={999} dark={!light} /></div>
                  <Bone w={16} h={10} r={3} dark={!light} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
