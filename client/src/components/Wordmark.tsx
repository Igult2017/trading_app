/**
 * Wordmark — the Trade&Journal brand lockup: the mark, then the name.
 *
 * THE ARTWORK IS UNTOUCHED. He supplied `New logo.png` and chose this treatment himself over the
 * alternative that would have recoloured it (2026-08-30, picking option D): *"it's the only one that
 * honours 'use the logo I provided as it is' while still being legible."* Nothing here re-draws,
 * re-typesets, recolours or knocks a background out of it. The mark is cropped to its circle and its
 * own near-black ground travels with it — that ground IS the tile. The only thing applied to the
 * image is a border radius.
 *
 * WHY THE NAME IS TEXT BESIDE IT RATHER THAN PART OF THE IMAGE. The supplied lockup is SQUARE
 * (1.08:1) with the words stacked under the mark. Measured against the real 68px header: the whole
 * thing renders 54x50, "TRADE & JOURNAL" lands **4.0px tall** and the tagline **1.6px** — a smudge,
 * confirmed by rendering it. The previous logo was 2.31:1 and got away with stacking; this one
 * cannot. Setting the name in live text keeps it legible at any header height, and in the same
 * typeface `Brand` already uses, so the name reads identically in the logo and in running prose.
 *
 * WHY 3.8 KB AND NOT 965 KB. The supplied PNG is 1254x1254 and renders about 44px square — roughly
 * 800 times the pixels the browser can use. Cropped to the mark and re-encoded at 132px (3x the
 * display size, so still sharp on a 3x panel) it is **3.8 KB, 99.6% smaller**. That is a compression
 * change, not a design one, which is why it does not conflict with using the logo as provided.
 *
 * IT IS PRELOADED, and that was half the original problem. An <img> inside a React component cannot
 * be requested until the bundle has been fetched, parsed, executed and rendered — measured, the
 * request began after DOMContentLoaded, which is why the logo used to arrive after the nav.
 * `client/index.html` preloads it during HTML parse. One file now serves light and dark surfaces
 * alike (the mark brings its own ground), so that preload is a plain link rather than the 25 lines
 * of theme-guessing JavaScript the two-variant logo needed.
 *
 * TEN CALL SITES depend on this one component — HomeHeader, HomeFooter, JournalHeader, AuthPage
 * (twice), AuthCallbackPage, TradingLoader, AdminPanel, LegalPage, SupportPage — which is why
 * changing the logo is one edit here and not ten.
 */

/** The lettering beside the mark. Inter, matching `Brand` — that typeface was chosen by rendering
 *  every bold sans already installed against the old logo's own lettering at matched cap height, and
 *  is documented in Brand.tsx. Already imported in index.css, so 700 costs no new font file. */
const BRAND_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

export interface WordmarkProps {
  /** Height of the lockup, in `em` so it tracks the site's own font-size. Width follows the
   *  artwork's aspect ratio. */
  height?: string;
  /**
   * Set the lettering for a dark surface.
   *
   * IT NO LONGER SWAPS THE IMAGE. The old logo was navy on transparent and vanished on dark shells
   * (measured 1.63-1.76:1), so it needed a whole second file with the navy remapped to near-white.
   * The new mark carries its own dark ground and reads on both, so this flag now only decides
   * whether the NAME beside it is dark or light ink.
   *
   * STILL AN EXPLICIT FLAG rather than a CSS `.dark` rule, and the reason has not changed: the
   * landing page carries its theme in React state (`usePublicTheme`) and never sets `html.dark`, so
   * a CSS-only rule would silently miss exactly the page where the vanishing logo was first
   * reported.
   */
  dark?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** The mark's real pixel size — it is square. Given to the browser so it reserves the space BEFORE
 *  the image arrives; without it the nav beside the logo shifted sideways when it landed. */
const NATURAL = 132;

export default function Wordmark({ height = '2.4em', dark = false, style, className }: WordmarkProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5em', flexShrink: 0, ...style }}
    >
      <img
        src="/logo-mark.webp"
        alt="Trade&Journal"
        width={NATURAL}
        height={NATURAL}
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
          height, width: height, display: 'block', flexShrink: 0,
          // The mark's own near-black ground IS the tile. Rounding it is the only thing done to the
          // artwork — no crop of the circle, no recolour, no transparency punched through it.
          borderRadius: '0.22em',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          fontFamily: BRAND_FONT,
          fontWeight: 700,
          fontSize: `calc(${height} * 0.42)`,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          color: dark ? '#F1F5F9' : '#0F172A',
        }}
      >
        Trade&amp;Journal
      </span>
    </span>
  );
}
