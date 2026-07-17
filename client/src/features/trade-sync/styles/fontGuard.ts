/**
 * Trade Sync — FONT GUARD. Do not delete; without it this UI silently renders in the wrong face.
 *
 * The host app (client/src/index.css, @layer base) force-feeds fonts to BARE ELEMENTS app-wide:
 *
 *   h1, h2, h3                                  -> 'Playfair Display Variable', 700, line-height 1.2
 *   h4, h5, h6                                  -> 'Inter Variable', 600
 *   body                                        -> 'Inter Variable', 400
 *   input, select, textarea, button[role=combobox] -> 'Inter Variable', 400
 *
 * Those are element selectors (specificity 0,0,1). Every rule here is a descendant-of-class
 * selector (0,1,1) and therefore always wins, whatever the app later adds to @layer base. That is
 * the whole mechanism: this UI declares its own face on `.ct-app` and the elements below inherit
 * it, so no global rule can reach in.
 *
 * Two rules that MUST stay exactly as they are:
 *  - The reset sets `font-family` ONLY. It does NOT touch font-weight/line-height, because at
 *    (0,1,1) it would outrank Tailwind's `.font-bold` (0,1,0) and flatten the design's own weights.
 *  - `.material-icons` is re-declared at (0,2,0). Google's own `.material-icons` rule is (0,1,0),
 *    so the reset below would otherwise outrank it and every icon would render as its literal
 *    ligature text ("dashboard", "sync_alt", ...) instead of a glyph.
 *
 * The type-scale classes (.font-body-md, .font-dm-mono, ...) are all (0,2,0) and so sit above the
 * reset by design — they are what actually assigns type here.
 */
export const CT_FONT_GUARD = `
.ct-app h1,.ct-app h2,.ct-app h3,.ct-app h4,.ct-app h5,.ct-app h6,
.ct-app p,.ct-app span,.ct-app div,.ct-app li,.ct-app a,.ct-app label,
.ct-app input,.ct-app select,.ct-app textarea,.ct-app option,.ct-app button{
  font-family:inherit;
}

/* Bare headings only — anything carrying a font-* class keeps the scale it asked for. This strips
   the app's global 700 / 1.2 / heading font-size off an unclassed <h_> inside this UI. */
.ct-app h1:not([class*="font-"]),.ct-app h2:not([class*="font-"]),.ct-app h3:not([class*="font-"]),
.ct-app h4:not([class*="font-"]),.ct-app h5:not([class*="font-"]),.ct-app h6:not([class*="font-"]){
  font-weight:inherit;
  line-height:inherit;
  font-size:inherit;
}

/* Restore the icon font the reset above would otherwise clobber. */
.ct-app .material-icons{
  font-family:'Material Icons';
  font-weight:normal;
  font-style:normal;
  line-height:1;
  letter-spacing:normal;
  text-transform:none;
  white-space:nowrap;
  word-wrap:normal;
  direction:ltr;
  -webkit-font-feature-settings:'liga';
  -webkit-font-smoothing:antialiased;
}
`;
