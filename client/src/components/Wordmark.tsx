/**
 * Wordmark — the Trade&Journal brand lockup. ONE image: the mark and the name together.
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
 * ⚠ THE NAME IS 17% OF THE LOCKUP'S HEIGHT — measured off the artwork (72px of 430). That arithmetic
 * decides whether this works at all, and it is why an earlier SQUARE lockup was rejected: at 1.08:1
 * its name rendered 4.0px in the real header, a smudge. This one is 2.03:1. Measured in the browser:
 * at 3.4em it came out 71.4px in a 68px header row and spilled over; at 3.0em it is 63px with 2.5px
 * clearance and the name renders 10.5px.
 *
 * PRELOADED, and that was half the original problem. An <img> inside a React component cannot be
 * requested until the bundle has been fetched, parsed, executed and rendered — measured, the request
 * began after DOMContentLoaded, which is why the logo used to arrive after the nav. `index.html`
 * preloads BOTH variants: together they are ~50 KB, which is cheaper than guessing the theme in a
 * blocking script and far cheaper than guessing it wrong.
 *
 * SIX CALL SITES depend on this one component — HomeHeader, HomeFooter, JournalHeader, TradingLoader,
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
const NATURAL_W = 365;
const NATURAL_H = 180;

// MEASURED, NOT CHOSEN — see the header note. 3.0em is 63px in the 68px header row.
export default function Wordmark({ height = '3.0em', dark = false, style, className }: WordmarkProps) {
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
