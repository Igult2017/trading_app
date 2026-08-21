/**
 * Wordmark — the Trade&Journal brand lockup.
 *
 * The user supplied the artwork (`Logo2.png`) and said: *"Just use the logo I provided as it is, no
 * need to modify."* So it ships as an IMAGE, untouched — same mark, lettering, colours and
 * proportions as delivered. Nothing here re-draws or re-typesets it.
 *
 * The only processing applied was lifting the artwork off its mockup: the supplied file was a photo
 * of the logo on textured grey paper, with a drop shadow and a generator watermark in the corner.
 * `client/public/logo.webp` is that file cropped to the artwork with the paper made transparent —
 * the paper was cleared by flood-filling inward from the borders, so the white panel enclosed inside
 * the book shape (which is just as pale as the paper) survived rather than being punched out.
 *
 * WHY IT IS A 19 KB WEBP AND NOT A 403 KB PNG (2026-08-21). He reported the logo arriving after the
 * rest of the header, on the landing page and the dashboard. The file was **403 KB at 846x367** and
 * is displayed at **116x50** — about ten times the pixels and forty times the bytes the browser can
 * use. Rescaled to 369x160 (3x the largest display size, so still sharp on a 3x panel) and re-encoded
 * at q90 it is **18.6 KB, 95% smaller**.
 *
 * THE ARTWORK IS UNTOUCHED — this is a compression change, not a design one, and that distinction is
 * the reason it does not violate *"use the logo I provided as it is"*. Measured rather than assumed:
 * composited over the real header colour and diffed at display size, the worst channel difference is
 * **12/255** and the mean is **0.70/255**, with 0.52% of pixels off by more than 8/255. Rendered at
 * 4x and compared by eye, the bevel, the teal bands and the lettering are indistinguishable.
 *
 * THE SIZE WAS ONLY HALF OF IT. A plain `<img>` inside a component cannot be requested until the JS
 * bundle has been fetched, parsed and executed and React has rendered — measured, the request began
 * AFTER `DOMContentLoaded`. `client/index.html` now preloads it so the fetch starts during HTML parse,
 * in parallel with the bundle, exactly as it already does for the body font.
 *
 * THIS REPLACED A CANDLESTICK WORDMARK shipped earlier the same day. The ten call sites that
 * refactor collected — HomeHeader, HomeFooter, JournalHeader, AuthPage (twice), AuthCallbackPage,
 * TradingLoader, AdminPanel, LegalPage, SupportPage — are why this is one component swap instead of
 * ten edits.
 *
 * NOTE ON SIZE: the supplied lockup is VERTICAL (mark above the words) at roughly 2.3:1. Every site
 * is a single row, and the landing header is 68px tall, so at any height that fits, the lettering
 * lands under ~10px. That is a property of the artwork, not of this component, and fixing it would
 * mean restructuring the logo — which is the thing that was ruled out. `height` is exposed so a
 * caller can give it more room where there is room to give.
 */

export interface WordmarkProps {
  /** Height of the lockup, in `em` so it tracks the site's own font-size. Width follows the
   *  artwork's aspect ratio. */
  height?: string;
  /**
   * Use the REVERSED colourway, for dark surfaces.
   *
   * The supplied artwork is navy on transparent, which measured **1.63–1.76:1** on the app's dark
   * shells — the teal bands survived and the entire wordmark disappeared. `logo-dark.webp` remaps
   * only the navy to near-white (keeping the render's bevel, and turning the panel enclosed in the
   * mark transparent since it is negative space, not paint). The teals are untouched; they already
   * read on dark. Measured after: **10.9–11.8:1**.
   *
   * An explicit flag rather than a CSS `.dark img` swap, because the landing page carries its theme
   * in React state (`usePublicTheme`) and never sets `html.dark` — a CSS-only rule would silently
   * miss exactly the page where this was first reported.
   */
  dark?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** The artwork's real pixel size. Given to the browser so it can reserve the space BEFORE the image
 *  arrives — with `height: 2.4em; width: auto` alone the width is unknowable until it lands, so the
 *  nav beside it shifted sideways when it did. `width: auto` in the style still wins for layout; the
 *  attributes only supply the ratio. */
const NATURAL_W = 369;
const NATURAL_H = 160;

export default function Wordmark({ height = '2.4em', dark = false, style, className }: WordmarkProps) {
  return (
    <img
      src={dark ? '/logo-dark.webp' : '/logo.webp'}
      // The accessible name the ten sites had before, preserved exactly.
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
      className={className}
      style={{ height, width: 'auto', display: 'block', flexShrink: 0, ...style }}
    />
  );
}
