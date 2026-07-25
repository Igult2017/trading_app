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

// Fonts this UI owns. Playfair Display carries EVERYTHING now, numbers included, so DM Mono is no
// longer requested at all. preconnect first: it opens the TLS connection while the CSS request is
// still in flight, which measurably shortens the fallback-face window.
const FONT_LINKS: Array<[string, string, boolean]> = [
  ["preconnect", "https://fonts.googleapis.com", false],
  ["preconnect", "https://fonts.gstatic.com", true],
  ["stylesheet", "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap", false],
  ["stylesheet", "https://fonts.googleapis.com/icon?family=Material+Icons", false],
];

export function installCtStyles(): void {
  if (typeof document === "undefined") return;          // SSR / non-browser: nothing to do
  if (document.getElementById(STYLE_ID)) return;        // already installed

  for (const [rel, href, crossOrigin] of FONT_LINKS) {
    if (document.head.querySelector('link[href="' + href + '"]')) continue;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    if (crossOrigin) link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CT_STYLES;
  document.head.appendChild(style);
}

// Side effect at import time — before the component that imports this can render.
installCtStyles();
