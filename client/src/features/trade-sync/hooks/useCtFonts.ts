import { useEffect } from "react";

const FONT_HREFS = [
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap",
  "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap",
  "https://fonts.googleapis.com/icon?family=Material+Icons",
];

/**
 * Loads this UI's own faces (Playfair Display, DM Mono) and the Material Icons ligature font,
 * and removes them again on unmount so nothing is left behind in the host app's <head>.
 */
export function useCtFonts(): void {
  useEffect(() => {
    const created = FONT_HREFS.map((href) => {
      const el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = href;
      document.head.appendChild(el);
      return el;
    });
    return () => created.forEach((el) => el.remove());
  }, []);
}
