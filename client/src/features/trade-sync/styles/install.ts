import { CT_STYLES } from "./index";

/**
 * Trade Sync — install the stylesheet and the fonts into <head> AT MODULE LOAD, before any
 * Trade Sync DOM is created.
 *
 * WHY THIS EXISTS (fixes the "huge text flashes, then snaps to normal on reload" bug):
 * the stylesheet used to be a JSX child (.ct-app > style) and the fonts were injected from a
 * useEffect. useEffect runs AFTER the browser's first paint, so frame 1 had no type scale at all:
 * every .font-headline-md h2 painted at the browser default 1.5em (24px) instead of 16px, and body
 * text at 16px instead of 12px, before the real CSS landed and everything snapped down. Putting
 * both in <head> at import time means the cascade is complete before the first Trade Sync pixel.
 *
 * Idempotent by element id, so the landing page and the app can both import it, and safe to import
 * from a module that may be evaluated more than once. Deliberately NOT removed on unmount: the CSS
 * is scoped to .ct-app so it cannot affect the host, and keeping it avoids re-flashing every time
 * the panel is opened.
 */
const STYLE_ID = "ct-trade-sync-styles";

/* NO FONT REQUESTS HERE ANY MORE (2026-08-22) — and removing them IS the fix for the flash.
 *
 * HIS REPORT: *"slow rendering of text after i have logged in which makes text look bigger and ugly
 * for a minute before getting in shape."*
 *
 * This module used to inject two Google Fonts stylesheets plus two preconnects:
 *     css2?family=Playfair+Display:wght@400;500;600;700&display=swap
 *     icon?family=Material+Icons
 *
 * `display=swap` IS THE FLASH, by definition — it instructs the browser to paint in the fallback
 * immediately and swap when the real face arrives. The fallback is Georgia/serif, whose metrics are
 * wider than Playfair's, so text lands looking wrong and then snaps. Measured cold: 344 ms for the
 * Playfair stylesheet plus 55 ms for the font file, and 629 ms for the Material Icons stylesheet.
 * On a slow connection that is seconds.
 *
 * AND BOTH FACES ARE NOW IN THE BUNDLE. `client/src/index.css` self-hosts Playfair Display at
 * exactly the four weights this UI asks for, and Material Icons was added there in this same change.
 * So the UI was waiting on the network for fonts it already had — the same redundant round-trip as
 * the 403 KB logo and the landing page's own @import, both removed earlier.
 *
 * THE COMMENT ABOVE DESCRIBES AN EARLIER FIX FOR THE SAME SYMPTOM. That one moved the STYLESHEET out
 * of a useEffect so the type scale existed at first paint. It was correct and it is still correct —
 * but the FONTS were left on the remote path, so the symptom survived through a second route. If
 * this ever regresses, check for a third.
 *
 * DO NOT re-add a Google Fonts link here. If a new face is needed, bundle it in index.css.
 */

export function installCtStyles(): void {
  if (typeof document === "undefined") return;          // SSR / non-browser: nothing to do
  if (document.getElementById(STYLE_ID)) return;        // already installed

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CT_STYLES;
  document.head.appendChild(style);
}

// Side effect at import time — before the component that imports this can render.
installCtStyles();
