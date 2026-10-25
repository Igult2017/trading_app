import { Bone, isLightGround } from '@/components/skeletons/shellBones';
// THE ADMIN'S OWN PALETTES, from the constants-only module beside the admin tokens. Importing
// anything from `AdminPanel.tsx` here would drag that lazy-loaded 3,400-line page into the entry
// bundle and destroy the very code-split this placeholder exists to cover.
import { ADMIN_THEMES, ADMIN_THEME_DEFAULT, storedAdminTheme } from '@/components/admin-ui/adminThemes';

/**
 * The admin panel's shape, measured off the live Overview tab and its source.
 *
 * ⚠ THIS SCREEN USED TO BE WHITE, AND THE PANEL IS USUALLY NOT. The admin ground is a stored theme
 * (`admin_theme_v2`, one of five palettes), and the placeholder painted a flat `#f5f7fa` page with
 * white cards regardless — so anyone on Dark, Midnight, Slate or Forest got a white flash and then
 * a dark panel. It now reads the same stored key the panel reads and paints that palette, so the
 * placeholder and the page agree whichever theme is chosen.
 *
 * ⚠ IT ALSO DREW NO TOP BAR AT ALL. The real panel has a 60px header above the content, so
 * everything sat 60px too high and slid down the moment the bundle landed.
 *
 * ⚠ AND THE PLAN WAS WRONG ABOUT THE RAIL. The plan had it as *"six titled groups (Core, Users,
 * Support, Growth & Content, Platform, System)"*; the live rail is a FLAT LIST OF TEN items at a
 * 61px pitch (44 tall, 17 gap), under a 66px logo block, over a user footer. Measured, not
 * recalled — those group headings do not exist on the page.
 */

export default function AdminShellSkeleton() {
  const t = ADMIN_THEMES[storedAdminTheme()] ?? ADMIN_THEMES[ADMIN_THEME_DEFAULT];
  const dark = !isLightGround(t.bg);
  // ⚠ THE RAIL IS JUDGED SEPARATELY, and one flag for both is wrong. The Light palette is "a dark
  // navigation rail against a pale page" by design, so a single page-ground flag painted dark ink
  // on a near-black rail and the whole column came out EMPTY — caught in a screenshot, not in the
  // numbers, which were all correct. Each bone is judged against the surface actually behind it.
  const railDark = !isLightGround(t.rail);
  // Cards: radius 14 and a 1px border in the palette's own line colour — both measured.
  const card: React.CSSProperties = { background: t.card, border: '1px solid ' + t.border, borderRadius: 14 };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', minHeight: 0 }}>
      {/* THE RAIL — 224 wide, the palette's rail colour, hidden under 640 where the real one
          becomes a slide-in drawer. A logo block, ten flat items, then the user footer. */}
      <div className="ls-arail" style={{ width: 224, flexShrink: 0, background: t.rail,
                    display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 12px' }}><Bone w={152} h={36} dark={railDark} /></div>
        <div style={{ padding: '4px 10px 14px', display: 'flex', flexDirection: 'column', gap: 17 }}>
          {Array.from({ length: 10 }).map((_, i) => <Bone key={i} w="100%" h={44} r={10} dark={railDark} />)}
        </div>
        <div style={{ marginTop: 'auto', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bone w={30} h={30} r={999} dark={railDark} />
            <div style={{ flex: 1 }}>
              <Bone w="70%" h={11} r={3} dark={railDark} />
              <Bone w="90%" h={9} r={3} mt={5} dark={railDark} />
            </div>
          </div>
          <Bone w="100%" h={39} r={10} dark={railDark} />
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: t.bg }}>
        {/* THE 60px TOP BAR the old placeholder left out entirely: the panel's card colour, a 1px
            line under it, and the two right-hand controls (Messages, Alerts) it actually holds. */}
        <div style={{ height: 60, flexShrink: 0, background: t.card, borderBottom: '1px solid ' + t.border,
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 24px', gap: 6 }}>
          <Bone w={106} h={39} r={10} dark={dark} />
          <div style={{ width: 1, height: 24, background: t.border }} />
          <Bone w={87} h={39} r={10} dark={dark} />
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: '28px 28px 0', display: 'flex',
                      flexDirection: 'column', gap: 18, overflow: 'hidden' }}>
          {/* THE PAGE HEADING — a 44px rounded tile beside a title and one line of subtitle.
              ⚠ THE BONES SIT INSIDE THE REAL LINE BOXES rather than replacing them. Drawing the
              ink alone (26 and 13) made this row 45 tall where the page's is 61, which lifted the
              stat cards and both panels 15px — measured, and exactly the kind of drift this whole
              placeholder exists to avoid. The title's 28px line box is 34 tall, the 13px
              subtitle's is 21, and they are 6 apart; 5 more below lands the grid on 172. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 5, flexShrink: 0 }}>
            <Bone w={44} h={44} r={12} dark={dark} />
            <div>
              <div style={{ height: 34, display: 'flex', alignItems: 'center' }}>
                <Bone w={190} h={26} r={5} dark={dark} />
              </div>
              <div style={{ height: 21, marginTop: 6, display: 'flex', alignItems: 'center' }}>
                <Bone w={280} h={13} r={3} dark={dark} />
              </div>
            </div>
          </div>

          {/* FOUR STAT CARDS at 18px — two columns under 1024, exactly as `statCols` does it.
              Each is an icon tile with a trend pill, a big value, then its caption. */}
          <div className="ls-astat" style={{ display: 'grid', gap: 18, flexShrink: 0 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ ...card, padding: '20px 20px 18px', minHeight: 156 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Bone w={38} h={38} r={11} dark={dark} />
                  <Bone w={52} h={20} r={999} dark={dark} />
                </div>
                <Bone w={110} h={28} r={5} mt={16} dark={dark} />
                <Bone w={96} h={12} r={3} mt={8} dark={dark} />
              </div>
            ))}
          </div>

          {/* GROWTH ANALYTICS BESIDE RECENT ACTIVITY, at the real 2fr/1fr and a 6px gap. */}
          <div className="ls-asplit" style={{ display: 'grid', gap: 6, flex: 1, minHeight: 300 }}>
            <div style={{ ...card, padding: '22px 24px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Bone w={150} h={14} r={3} dark={dark} />
                <Bone w={190} h={12} r={3} mt={7} dark={dark} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
                {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w="100%" h={42} r={6} dark={dark} />)}
              </div>
              {/* BARS, NOT A SLAB — a flat rectangle where a chart is about to appear reads as a
                  broken image. The signups chart is a monthly bar series. */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 120 }}>
                {[34, 52, 41, 63, 48, 71, 58, 80, 66, 88, 74, 95].map((h, i) => (
                  <div key={i} className="app-bone" style={{ flex: 1, height: h + '%', borderRadius: 3,
                        background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)' }} />
                ))}
              </div>
            </div>
            <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column' }}>
              <Bone w={128} h={14} r={3} dark={dark} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                {[180, 150, 196, 164, 174].map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ marginTop: 3, flexShrink: 0 }}><Bone w={7} h={7} r={999} dark={dark} /></div>
                    <div>
                      <Bone w={w} h={13} r={3} dark={dark} />
                      <Bone w={76} h={10} r={3} mt={4} dark={dark} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
