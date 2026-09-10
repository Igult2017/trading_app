/**
 * The admin panel's design tokens, in one place.
 *
 * They used to live half-way down `AdminPanel.tsx`, which is why every screen invented its own
 * spacing and every card its own shadow. Anything shared by more than one admin surface belongs
 * here so it can only be defined once.
 *
 * Colours are CSS variables, not literals: `applyAdminTheme` writes `--admin-<key>` for every key
 * in the palette, so one of the five palettes (one light, four dark) can take over without a single
 * component knowing which is active.
 */

export const C = {
  bg: 'var(--admin-bg)', sidebar: 'var(--admin-sidebar)', card: 'var(--admin-card)',
  border: 'var(--admin-border)', border2: 'var(--admin-border2)', dim: 'var(--admin-dim)',
  text: 'var(--admin-text)', muted: 'var(--admin-muted)',
  rail: 'var(--admin-rail)', railInk: 'var(--admin-railInk)', railDim: 'var(--admin-railDim)',
  thead: 'var(--admin-thead)', accentSoft: 'var(--admin-accentSoft)',
  indigo: 'var(--admin-accent)', indigoL: 'var(--admin-accentL)',
  // STATUS COLOURS ARE PART OF THE PALETTE, not fixed literals. They used to be written here once
  // and shared by all five palettes, which only worked while every palette was dark: a bright green
  // that reads well on a near-black card measures 2.58:1 on a white one. Each palette now names its
  // own, measured against its own card.
  green: 'var(--admin-green)', greenL: 'var(--admin-greenL)',
  red: 'var(--admin-red)', redL: 'var(--admin-redL)',
  amber: 'var(--admin-amber)', amberL: 'var(--admin-amberL)',
  blue: 'var(--admin-blue)', blueL: 'var(--admin-blueL)',
};

/** ONE FACE, TWO ROLES. Both resolve to whatever the Appearance picker is set to — Playfair by
 *  default. `HFONT` is there so a heading can later be given a different face without touching a
 *  hundred call sites, but today it is the same family; the difference between a heading and a
 *  table cell is SIZE and WEIGHT, not family.
 *
 *  There used to be a second, sans family behind `FONT` for anything that is read. He rejected that
 *  twice. What keeps a display serif legible at body sizes is the floor in `panelText()` below. */
export const FONT = 'var(--admin-font)';
export const HFONT = 'var(--admin-header-font)';

/** The navigation rail's own face. Brand chrome, deliberately not the picker's font. */
export const RAIL_SERIF = "'Playfair Display Variable', 'Playfair Display', Georgia, serif";

/** THE PANEL'S FACE DOING A BODY'S JOB — allowed, but only because it arrives with its own floor.
 *
 *  Playfair Display is a HIGH-CONTRAST face: the thin strokes of an "e", an "a" or the crossbar of
 *  a "t" are hairlines by design. At 12-13px and weight 400 those hairlines come out thinner than
 *  one device pixel, and the browser renders them as nothing at all. That is exactly what "the
 *  strokes disappear" looks like on screen — it is not a colour problem and no colour change fixes
 *  it (docs/READABILITY.md, cause 1).
 *
 *  The family below is the VARIABLE one. `index.css` declares `font-weight: 400 900` for BOTH
 *  names against the same `woff2-variations` file, so asking for a heavier weight makes the thin
 *  strokes physically THICKER — it does not swap in a second, different font file.
 *
 *  ⚠ THE WEIGHT HALF OF THIS NO LONGER APPLIES, 2026-09-10. The body face is Inter now, copied
 *  from DORIXÉ, and Inter has no hairlines to lose — forcing everything to 600 just made the panel
 *  look heavy. `panelText()` keeps the 13px SIZE floor and passes the weight straight through,
 *  defaulting to 400 the way DORIXÉ's body text does. The table below is still the reason a
 *  DISPLAY face must never be set below 16px; that rule stands.
 *
 *  MEASURED, not assumed. The "o" was drawn with this exact font file in Chromium at a plain
 *  non-retina scale, and its thinnest stroke read back off the canvas — 100% means solid ink, 0%
 *  means the stroke rendered as nothing. Averaged over five sub-pixel positions, because an arc
 *  that lands exactly on a pixel row prints dark and the same arc half a pixel lower prints pale:
 *
 *      size    w400   w500   w600   w700
 *      12px     36%    42%    49%    54%
 *      13px     49%    52%    58%    63%     <-- USE
 *      13.5px   37%    45%    47%    54%
 *      14px     35%    40%    46%    50%
 *      14.5px   37%    38%    46%    51%
 *      15px     51%    55%    58%    63%     <-- USE
 *      16px     33%    38%    44%    53%
 *
 *  Two things fall out of it, and the second one is not obvious:
 *
 *  1. Weight works. Going 400 -> 700 adds 15-18 points at EVERY size — the variable axis really
 *     is thickening the hairline, which is why raising the weight is the fix and swapping to a
 *     different family is not.
 *  2. **Size does not behave monotonically.** 13px and 15px land cleanly; 13.5, 14, 14.5 and 16
 *     all come out 10+ points paler than 13px does, at the same weight. That is the rasteriser
 *     fitting this face's arcs to whole pixels at particular pixel-per-em values — bigger is not
 *     reliably better. So the admin's serif body text uses **13px or 15px and nothing between**.
 *     A 14px choice looks like a safe middle and measures worse than either neighbour.
 *
 *  (One renderer, Chromium on Windows — which is what the panel is read in. A different rasteriser
 *  would shift the exact percentages; the weight trend holds regardless.) */
export const panelText = (size = 15, weight = 400) => ({
  fontFamily: FONT,
  fontSize: `${Math.max(13, size)}px`,
  fontWeight: weight,
});

/** An 8px rhythm, so spacing is chosen from a scale instead of per-screen guesswork. */
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const R = { card: '14px', ctl: '10px', tile: '11px', pill: '999px' } as const;

/** A card surface: one hairline and a shadow you can barely see. */
export const cs = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: R.card,
  boxShadow: 'var(--admin-shadow)',
};

export const inp = {
  width: '100%', background: C.card, border: `1px solid ${C.border2}`, borderRadius: R.ctl,
  color: C.text, padding: '11px 14px', fontFamily: FONT, fontWeight: 400, fontSize: '15px',
  outline: 'none', boxSizing: 'border-box',
} as const;

/** A field label. 13px, not 12: 12px is below the size ladder in `panelText` and this is uppercase
 *  and letter-spaced on top, which is the third cause of blurred text in docs/READABILITY.md. The
 *  tracking came down from .1em for the same reason. */
export const lbl = {
  display: 'block', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: C.muted, marginBottom: '8px',
} as const;

export const btn = {
  fontFamily: FONT, fontWeight: 600, cursor: 'pointer', border: 'none',
  borderRadius: R.ctl, letterSpacing: '0.02em',
};
