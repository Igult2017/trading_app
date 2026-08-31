/**
 * Wordmark — the Trade&Journal brand lockup. ONE image: the mark and the name together.
 *
 * THE NAME IS NO LONGER TEXT BESIDE THE MARK. His instruction, 2026-08-31: *"Change the logo to this
 * so we don't need to write the app name again as 'Trade&Journal' because this logo comes with the
 * name bigger and visible."* The supplied artwork (`Logo improved.jpg`) carries the wordmark under
 * the mark, so setting it a second time in live text duplicated it.
 *
 * THE ARTWORK IS UNTOUCHED. Nothing here re-draws, re-typesets, recolours or knocks a background out
 * of it. It is cropped to its own content, resized, and re-encoded — a compression change, not a
 * design one. The paper ground it was supplied on travels with it and IS the tile, which is the same
 * treatment the previous mark got and the reason one file serves light and dark surfaces alike.
 *
 * WHY IT KEEPS ITS GROUND RATHER THAN BEING KNOCKED OUT. The wordmark is dark grey. On the six dark
 * call sites — TradingLoader, AdminPanel, AuthCallbackPage and the three that follow the theme — a
 * transparent version would put dark grey letters on a near-black shell, which is the exact failure
 * the PREVIOUS logo had: measured at 1.63-1.76:1 and effectively invisible. Keeping the light ground
 * means the name is always dark-on-light and always legible, whatever it sits on.
 *
 * WHY 10 KB AND NOT 600 KB. The supplied JPEG is 1250x848 and 599 KB, of which the artwork occupies
 * 819x378 in the middle — the rest is empty paper. Cropped to the content and re-encoded at 180px
 * tall (3x the display height, so still sharp on a 3x panel) it is **10.3 KB, 98% smaller**.
 *
 * ⚠ THE NAME IS 17% OF THE LOCKUP'S HEIGHT — measured off the artwork (72px of 430). That is the
 * arithmetic that decides whether this works, and it is why the previous SQUARE lockup was rejected:
 * at 1.08:1 its name rendered 4.0px tall in the real header, a smudge. This one is 2.03:1, close to
 * the 2.31:1 logo that did work stacked. `height` is therefore set from the SURFACE, not left at one
 * default: a header has ~68px to give, a splash screen has as much as it likes, and the name has to
 * stay readable in both.
 *
 * IT IS PRELOADED, and that was half the original problem. An <img> inside a React component cannot
 * be requested until the bundle has been fetched, parsed, executed and rendered — measured, the
 * request began after DOMContentLoaded, which is why the logo used to arrive after the nav.
 * `client/index.html` preloads it during HTML parse.
 *
 * SIX CALL SITES depend on this one component — HomeHeader, HomeFooter, JournalHeader, TradingLoader,
 * AdminPanel and AuthCallbackPage — which is why changing the logo is one edit here and not six.
 */

export interface WordmarkProps {
  /** Height of the lockup, in `em` so it tracks the surface's own font-size. Width follows the
   *  artwork's 2.03:1 aspect. The name is 17% of this, so going below ~3.4em makes it hard to read. */
  height?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** The artwork's real pixel size. Given to the browser so it reserves the space BEFORE the image
 *  arrives; without it the nav beside the logo shifted sideways when it landed. */
const NATURAL_W = 365;
const NATURAL_H = 180;

// MEASURED, NOT CHOSEN. The header row this sits in is 68px (Playwright, 2026-08-31). At 3.4em the
// lockup rendered 71.4px and spilled 1.7px above and below the bar; at 3.0em it is 63px and clears
// it with room each side. The name is 17% of that — about 10.5px, which is the number that matters
// and the reason this is not left to a guess.
export default function Wordmark({ height = '3.0em', style, className }: WordmarkProps) {
  return (
    <img
      className={className}
      src="/logo-lockup.webp"
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
        // Rounding the tile is the only thing applied to the artwork — no crop of the mark, no
        // recolour, no transparency punched through it.
        borderRadius: '0.14em',
        ...style,
      }}
    />
  );
}
