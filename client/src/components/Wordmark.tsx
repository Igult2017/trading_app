/**
 * Wordmark — the Trade&Journal brand lockup. ONE image: the mark and the name together.
 *
 * CURRENT ARTWORK: `Trade&Journal.png`, supplied 2026-09-12 — the C-and-rising-arrow mark followed
 * by TRADE&JOURNAL on one line, a single flat ink on a transparent ground.
 *
 * THE NAME IS NOT SET AS TEXT BESIDE IT. His instruction, 2026-08-31: *"Change the logo to this so we
 * don't need to write the app name again as 'Trade&Journal' because this logo comes with the name
 * bigger and visible."* The supplied artwork carries the wordmark under the mark, so setting it a
 * second time in live text duplicated it.
 *
 * TWO FILES, ONE FOR EACH THEME — his follow-up the same day: *"make the logo have the same theme as
 * the app's theme whenever theme is changed and also change colour to contrast and be visible."*
 *
 *   logo-lockup.webp        the artwork's own dark-grey wordmark, for light shells
 *   logo-lockup-dark.webp   the SAME letterforms in near-white, for dark shells
 *
 * Both have their paper ground removed, so the mark sits on whatever the surface is instead of
 * riding around on a pale tile. Built by `scripts/build_logo.py` from the one supplied file — run it
 * again if the artwork changes; doing it by hand is how the two variants drift out of register.
 *
 * THE ARTWORK IS NOT REDRAWN. Cropped, background removed, wordmark recoloured for the dark variant,
 * resized. No re-typesetting — the letterforms are the supplied ones, cut from the supplied pixels.
 * Recolouring for dark is the exception he has already granted once, when the previous logo measured
 * 1.63-1.76:1 on dark shells and was effectively invisible; this is the same exception for the same
 * reason, and he asked for it directly.
 *
 * ⚠ `dark` IS AN EXPLICIT PROP, NOT A CSS `.dark` RULE, and that is deliberate and load-bearing: the
 * landing page carries its theme in React state (`usePublicTheme`) and NEVER sets `html.dark`, so a
 * CSS-only rule would silently miss exactly the page where the invisible logo was first reported.
 *
 * ⚠ THE SHAPE CHANGED ON 2026-09-12 AND THAT MATTERS MORE THAN THE COLOURS. The old lockup STACKED
 * the mark above the name at 2.03:1, and the name was only 17% of its height — which is why it
 * needed a big height (3.0em / 63px) just to make the name legible. The new artwork sets the mark
 * and the name SIDE BY SIDE at 5.86:1.
 *
 * Two consequences, and both bit:
 *   1. At the same HEIGHT it is now nearly three times WIDER. 3.0em would have been 63 x 369px —
 *      it would have run straight through the navigation. Every height here came down.
 *   2. The name is no longer a 17% sliver; on one line it is roughly 55% of the lockup's height.
 *      So it reads at a MUCH smaller overall size than the old one could, which is what makes the
 *      smaller heights below possible rather than a compromise.
 *
 * PRELOADED, and that was half the original problem. An <img> inside a React component cannot be
 * requested until the bundle has been fetched, parsed, executed and rendered — measured, the request
 * began after DOMContentLoaded, which is why the logo used to arrive after the nav. `index.html`
 * preloads BOTH variants: together they are ~50 KB, which is cheaper than guessing the theme in a
 * blocking script and far cheaper than guessing it wrong.
 *
 * FIVE CALL SITES depend on this one component — HomeHeader, HomeFooter, JournalHeader,
 * AdminPanel and AuthCallbackPage — which is why changing the logo is one edit here and not six.
 */

export interface WordmarkProps {
  /** Height of the lockup, in `em` so it tracks the surface's own font-size. Width follows the
   *  artwork's 2.03:1 aspect. The name is 17% of this, so below ~2.6em it stops being readable. */
  height?: string;
  /** True on a dark surface — picks the near-white wordmark. See the note above on why this is a
   *  prop rather than a CSS rule. */
  dark?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** The artwork's real pixel size. Given to the browser so it reserves the space BEFORE the image
 *  arrives; without it the nav beside the logo shifted sideways when it landed. */
const NATURAL_W = 937;
const NATURAL_H = 160;

// MEASURED, NOT CHOSEN. At 5.86:1 the binding constraint is WIDTH, not height: the old 3.0em would
// have drawn a 369px-wide logo into a header that has ~200px before it reaches the navigation.
export default function Wordmark({ height = '1.5em', dark = false, style, className }: WordmarkProps) {
  return (
    <img
      className={className}
      src={dark ? '/logo-lockup-dark.webp' : '/logo-lockup.webp'}
      alt="Trade&Journal"
      width={NATURAL_W}
      height={NATURAL_H}
      // It is the brand mark in the header — never lazy, and worth jumping the queue for. `async`
      // decoding would let the browser paint the header without it and add it a frame later, which
      // is the exact stutter this is meant to remove.
      loading="eager"
      // LOWERCASE. React 18 does not recognise the camelCase `fetchPriority` and warns, leaving the
      // attribute off the element entirely; it passes unknown lowercase attributes straight through.
      // (React 19 added the camelCase form — change this only when the app is on 19.)
      {...{ fetchpriority: 'high' }}
      decoding="sync"
      style={{
        height,
        width: 'auto',              // the artwork's aspect decides the width; never squash the name
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
