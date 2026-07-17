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
 *
 * ── THE LIMIT OF THIS GUARD — read before trusting it ──────────────────────────────────────────
 * Everything above is a SPECIFICITY argument, and specificity loses to `!important` no matter how
 * high it climbs. A host that writes `* { font-family: X !important }` defeats all of it. That is
 * not hypothetical: Journal.tsx does exactly this
 *   .journal-root *:where(...){font-family:<stack>!important;font-weight:900!important;}
 * and it flattened Playfair to Montserrat, forced every weight to 900, and rendered every Material
 * Icon as its literal ligature text ("light_mode", "chevron_left") until `.ct-app` was added to
 * that rule's :not() exemption list.
 *
 * So: MOUNTING THIS UI INSIDE A NEW HOST MEANS CHECKING THE HOST FOR `!important` FONT RULES and
 * exempting `.ct-app` there. font-weight in particular cannot be defended from here — reclaiming
 * it would need `!important` on every type-scale class, which would in turn outrank Tailwind's own
 * `.font-bold` (0,1,0) and flatten the design's weights. The exemption is the only complete fix.
 *
 * The one exception below is `.material-icons`: an icon rendering as the word "dashboard" is the
 * worst-looking failure and the cheapest to defend, so it carries !important at (0,2,0) — enough
 * to beat a `*{...!important}` wildcard (0,1,0) on its own, even in an unexempted host.
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

/* Restore the icon font the reset above would otherwise clobber. !important here is deliberate
   and load-bearing (see the header): at (0,2,0) it survives a host wildcard !important font rule,
   so the icons stay glyphs even in a host that has not exempted .ct-app. */
.ct-app .material-icons{
  font-family:'Material Icons' !important;
  font-weight:normal !important;
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
