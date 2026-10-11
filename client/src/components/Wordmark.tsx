/**
 * Wordmark — the DailyTradeBook brand lockup. ONE image: the mark and the name together.
 *
 * CURRENT ARTWORK: `DTB.jpg`, supplied 2026-10-12 — a fountain-pen nib drawn as one continuous
 * line, followed by "DailyTradeBook" in a serif, on one line.
 *
 * ⚠ IT ARRIVED AS A JPEG ON A WHITE GROUND, which is a different kind of file from the last one
 * and needed the ground lifting off before it could sit on a dark header. `build_logo.py` does
 * that now (`from_opaque`): the ink's own darkness becomes the transparency, so the soft pixels
 * along every curve survive as partial alpha and the letterforms keep their shape. The supplied
 * file also carried a pale blue strip across its bottom — measured at 0.07 coverage, under the
 * script's floor, so it drops out rather than shipping as a faint rectangle under the logo.
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
 * ⚠ THE SHAPE CHANGES EVERY TIME THE ARTWORK DOES, AND IT MATTERS MORE THAN THE COLOURS. Every
 * call site sizes this by HEIGHT and lets the width follow, so a new aspect silently resizes the
 * logo everywhere at once. The history, because it has caught this twice:
 *
 *     2026-08  mark STACKED above the name   2.03:1   name only 17% of the height
 *     2026-09  side by side                  5.86:1   nearly 3x wider at the same height
 *     2026-10  side by side, nib + serif     4.22:1   about 72% of September's width
 *
 * October is the safe direction — narrower cannot overrun the navigation the way September's
 * nearly did — but it does render SMALLER, so the heights below were re-checked on the real
 * header rather than carried over on the assumption that narrower is harmless.
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
   *  artwork's 4.22:1 aspect — never set a width, or the name gets squashed. */
  height?: string;
  /** True on a dark surface — picks the near-white wordmark. See the note above on why this is a
   *  prop rather than a CSS rule. */
  dark?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** The artwork's real pixel size. Given to the browser so it reserves the space BEFORE the image
 *  arrives; without it the nav beside the logo shifted sideways when it landed. */
const NATURAL_W = 676;
const NATURAL_H = 160;

// MEASURED, NOT CHOSEN. At 4.22:1, 1.5em draws roughly 24 x 101px — comfortably inside the ~200px
// a header has before it reaches the navigation, with room the September artwork did not have.
// 1.85em, up from 1.5em with the October artwork. NOT a taste call: the new lockup is 4.22:1
// against September's 5.86:1, so at the same height it draws 133px wide where the old one drew
// 187px — measured on the landing header — and the name ended up reading smaller than the 16px
// nav links beside it. The brand should not be the quietest thing in its own header. 1.85em puts
// it at ~164px, which still leaves ~200px of clear space before the navigation starts.
export default function Wordmark({ height = '1.85em', dark = false, style, className }: WordmarkProps) {
  return (
    <img
      className={className}
      src={dark ? '/logo-lockup-dark.webp?v=ab3f57a8' : '/logo-lockup.webp?v=ab3f57a8'}
      alt="DailyTradeBook"
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
