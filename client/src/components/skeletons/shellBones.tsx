import { useEffect, useState } from 'react';

/**
 * The app-shell placeholder — the wait between "you are signed in" and "the screen is here",
 * shown while the journal or admin BUNDLE is still downloading, before a line of that page's own
 * code exists.
 *
 * ⚠ IT MUST LOOK LIKE THE PAGE IT STANDS IN FOR, and it did not. His report, 2026-10-12: *"Where
 * is this skeleton coming from? It doesnt look like any of the pages."*
 *
 * ⚠ AND HE HAD ASKED ONCE BEFORE. `DashboardSkeletons.tsx` carries the same sentence from
 * 2026-09-06 and was carefully measured in response — but it only covers the SECOND loading
 * moment, once the journal is running and fetching data. This one, the first, was never brought in
 * line. Two placeholders for one page, only one of them accurate.
 *
 * ⚠ EVERY NUMBER BELOW WAS READ OFF THE RENDERED PAGE OR ITS SOURCE, never guessed. Guessing is
 * what produced the version he complained about, and two of the numbers in `DASH_GEOMETRY` were
 * guesses that measured wrong (card height 64 vs 80, panel height 240 vs 302) — both made the
 * placeholder short, so content slid upward the moment it arrived.
 */

// ── Shared loading screen ─────────────────────────────────────────────────────
//
// HIS INSTRUCTION, 2026-09-06: *"i noticed there is a rolling loader when the user reloads the page,
// please remove it because i havent seen that approach in any modern app. Just make the page go
// white when the user reloads."*
//
// What was here: a spinning ring, a progress bar that crept to 90% on a timer — measuring NOTHING,
// it was a `setInterval` that just kept adding — and ten rotating messages ("Crunching your trade
// data…"). A reload is usually a few hundred milliseconds of re-checking the session, so all of that
// appeared and vanished, which is worse than nothing at all.
//
// PAINTED IN THE APP'S OWN BACKGROUND, NOT WHITE. The journal is a dark app; a literal white flash
// on every reload would be the more jarring of the two. Same idea, one colour value if he wants it
// white after all.
// ── UPDATE 2026-09-12 — the blankness was right for a RELOAD and wrong for a LOGIN ──────────
//
// He reported staring at an empty screen after signing in, on both the panel and the journal.
// Two things were stacked up behind that blank rectangle:
//   1. sign-in AWAITED the dashboard data before it would navigate — up to six seconds (see the
//      note in AuthContext.signIn, now fixed);
//   2. the route's JavaScript is only fetched once you arrive, and measured against production
//      that is 1.8-2.2s on a cold cache.
//
// The reasoning above still holds for the case it was written for: on a fast reload a spinner
// appears and vanishes, which is worse than nothing. So the skeleton is DELAYED — nothing at all
// for the first 400ms, so a quick reload stays clean, and only a genuinely slow wait ever shows
// it. Both cases are served rather than one traded for the other.

/** Shows nothing until `after` ms have passed, then renders. Keeps fast waits flicker-free — on a
 *  quick reload a placeholder that appears and vanishes is worse than no placeholder at all. */
export function AfterDelay({ after = 400, children }: { after?: number; children: React.ReactNode }) {
  // ⚠ NO WAIT WHEN SOMETHING WAS ALREADY ON SCREEN. `index.html` paints a placeholder before any
  // JavaScript runs and stamps `__bootShownAt`; `main.tsx` takes it down the instant React mounts.
  // On a COLD load that placeholder has been up for seconds, so sitting out another 400ms here
  // would blank the screen in the middle of the wait — a new gap, in the exact place this whole
  // thing exists to fill. If it was up for more than a blink, carry straight on from it.
  //
  // The 400ms still applies on a WARM reload, which is the case it was written for: React mounts in
  // about 100ms, nothing has really been shown, and the delay is what stops a placeholder flashing
  // in and out.
  const [show, setShow] = useState(() => {
    try {
      const at = (window as unknown as { __bootShownAt?: number }).__bootShownAt;
      return typeof at === 'number' && Date.now() - at > 250;
    } catch { return false; }
  });
  useEffect(() => {
    if (show) return;
    const t = setTimeout(() => setShow(true), after);
    return () => clearTimeout(t);
  }, [after, show]);
  return show ? <>{children}</> : null;
}

/** One placeholder block. No backticks anywhere in the style tag below — a backtick inside a
 *  template-literal <style> is a runtime crash that still builds clean. */
/**
 * Is this palette's page light? Read from the palette's own ground rather than from its NAME, so a
 * new light palette needs no change here.
 *
 * ⚠ IT LIVES HERE BECAUSE BOTH SKELETONS NEED IT. The admin one had its own copy; the journal one
 * had no concept of theme at all and painted every surface near-black, whatever the user had
 * chosen. Two copies of this test would be two chances for them to disagree about what "light"
 * means, on the one screen whose whole job is to look like the page behind it.
 */
export function isLightGround(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.5;
}

export function Bone({ w, h, r = 8, dark = false, mt = 0 }: { w: number | string; h: number; r?: number; dark?: boolean; mt?: number }) {
  return (
    <div className="app-bone" style={{
      width: w, height: h, borderRadius: r, marginTop: mt,
      background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
    }} />
  );
}

// EVERY BREAKPOINT HERE IS COPIED FROM THE PAGE IT STANDS IN FOR, and the two pages do not agree —
// which is the whole reason they get separate rules. If the placeholder reflowed at a different
// width from the page, it would rearrange itself the instant the page arrived: the exact jump a
// placeholder exists to prevent.
//
//   journal  `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`, split at lg, rail hidden under 768
//            (Journal.tsx, `window.innerWidth < 768`)
//   admin    statCols 2 under 1024 then 4; dashMainCols '2fr 1fr' at 1024 and up, else one column;
//            rail becomes a drawer under 640 (AdminPanel.tsx `isMobileDrawer = bp.isMobile`,
//            `isMobile: w < 640`)
//
// ⚠ !important IS REQUIRED ON BOTH RAIL RULES, and leaving it out is a trap this project has
// already fallen into once: the rails carry an INLINE `display:flex`, and an inline style beats a
// class rule. Without it the rule is present, correct, and silently does nothing.
export const BONE_CSS = '@keyframes appBonePulse{0%,100%{opacity:.55}50%{opacity:1}}'
               + '.app-bone{animation:appBonePulse 1.5s ease-in-out infinite}'
               + '.ls-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}'
               + '.ls-split{grid-template-columns:minmax(0,1fr)}'
               + '.ls-astat{grid-template-columns:repeat(2,minmax(0,1fr))}'
               + '.ls-asplit{grid-template-columns:minmax(0,1fr)}'
               + '@media(max-width:639px){.ls-arail{display:none!important}}'
               + '@media(max-width:767px){.ls-rail{display:none!important}}'
               + '@media(min-width:768px){.ls-kpi{grid-template-columns:repeat(3,minmax(0,1fr))}}'
               + '@media(min-width:1024px){'
               +   '.ls-kpi{grid-template-columns:repeat(6,minmax(0,1fr))}'
               +   '.ls-split{grid-template-columns:7fr 5fr}'
               +   '.ls-astat{grid-template-columns:repeat(4,minmax(0,1fr))}'
               +   '.ls-asplit{grid-template-columns:2fr 1fr}'
               + '}';
