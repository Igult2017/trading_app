/**
 * homeTokens — the landing page's colours and type roles, defined ONCE.
 *
 * WHY THIS FILE EXISTS. Before the 2026-10-07 rebuild, every landing component re-derived the same
 * palette by hand — `dm ? '#020817' : '#ffffff'` appeared in HomePage, HomeStatsSection,
 * PricingSection and TestimonialsSection, each with its own slightly different idea of what "muted"
 * or "border" meant. Splitting the page into five files would have made that five more copies. One
 * source instead, so a colour change is one edit and the sections cannot drift apart.
 *
 * THE THREE TYPE ROLES, and the trap they come from (2026-08-30): a constant named `sans` used to
 * resolve to Playfair Display and was used 15 times for body copy, labels and buttons. The code READ
 * as though it had a proper serif/sans split while there was not one sans-serif on the page. Hence
 * the names here say what they ARE.
 *
 *   display — Playfair Display. Headlines only. It is the brand face and it is a DISPLAY serif,
 *             which goes soft below ~16px — never use it for body copy or small labels.
 *   sans    — Inter. Everything meant to be READ.
 *
 * CONTRAST. Every pair below was measured against the surface it actually renders on, both themes,
 * and clears the 4.5:1 floor for body text. `muted` on `heroBg` is the tightest pair on the page —
 * if you darken a background, re-measure with scripts/check-readability.mjs rather than by eye.
 */

export const display = { fontFamily: "'Playfair Display', Georgia, serif" } as const;
export const sans    = { fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" } as const;

/**
 * ONE PAGE WIDTH FOR EVERY BAND. Use `page()` — never a per-section max-width.
 *
 * HIS REPORT, 2026-10-07: *"The landing page has content so squeezed at the center leaving large
 * gaps to the right and left."* He was right, and it was not one layout with wide margins — it was
 * EIGHT layouts of different widths stacked, so every band began and ended somewhere different.
 * Measured on the live site at a 1434px window, gap = empty space on each side:
 *
 *     header            1280   gap  77
 *     hero text          880   gap 277   <- the one he circled
 *     feature chips     1240   gap  97
 *     slideshow/cards   1180   gap 127
 *     How it works      1152   gap 141
 *     Unlock Insights    896   gap 269
 *     closing CTA        576   gap 429
 *
 * The reference he asked me to copy (traderwaves.com, measured the same way) uses ONE container
 * everywhere: max-width 1264-1280 with 32px side padding, an 83px gap on every band. Inside it only
 * the TEXT narrows — their centred headings sit in an ~800px block, their product shot in 1080.
 *
 * So: the container is always `PAGE_MAX`, and a centred paragraph narrows itself with `MEASURE`.
 * ⚠ Narrowing the CONTAINER is what caused this; narrow the text INSIDE it instead.
 *
 * 1280/32 is not an arbitrary pick — it is what `HomeHeader` already uses, so every band now lines
 * up with the logo and the nav above it.
 */
export const PAGE_MAX = 1280;
export const GUTTER   = 32;

/** The container every landing band uses. */
export const page = () => ({
  maxWidth: PAGE_MAX, marginLeft: 'auto', marginRight: 'auto',
  paddingLeft: GUTTER, paddingRight: GUTTER,
} as const);

/** A centred column of running text, INSIDE the full-width container. ~65 characters at 17px. */
export const MEASURE = 820;

/**
 * THE TYPE SCALE. Sizes are named by JOB, so no component picks a number by hand again.
 *
 * WHY IT CHANGED, 2026-10-07: *"The landing page has small font sizes for non header text that in
 * some cases the text are invisible."* Measured against the reference at the same window:
 * **131 of our 219 text elements were under 14px (60%)**, while traderwaves.com sets its supporting
 * lines at 18px and its body at 15. Ours ran 2-4px smaller everywhere.
 *
 * ⚠ `SMALL` IS THE FLOOR AND IT IS 13, NOT 11. docs/READABILITY.md sets this project's hard floor at
 * 11px, but that is the limit for a dense table cell, not a target for a marketing page — nothing on
 * this page needs to be that small. Do not add a size below `SMALL`.
 */
export const TYPE = {
  /** The one line under a section heading. Was 15. */
  lead:  17,
  /** Body copy inside a card. Was 13.5. */
  body:  15,
  /** A card's own title. */
  cardTitle: 16,
  /** Supporting text in the compact connector diagram. Was 11.5. */
  dense: 13,
  /** A chip or pill's main label. Was 12.5. */
  chip:  14,
  /** Captions, tier labels, reassurance lines. Was 11-12.5. THE FLOOR. */
  small: 13,
} as const;

export interface HomeTokens {
  /** Page ground. */
  bg: string;
  /** The hero's own ground — pale blue on light, same as the page on dark. */
  heroBg: string;
  /** A second ground, for bands that need to separate from `bg`. */
  bg2: string;
  /** Body and heading ink. */
  text: string;
  /** Secondary ink — supporting lines, labels, captions. Still clears 4.5:1. */
  muted: string;
  /** Card and raised-surface fill. */
  card: string;
  /** Hairline borders and dividers. */
  border: string;
  /** The one accent. Brighter on dark, where #2563eb measures only 3.6:1. */
  accent: string;
  /** A wash of the accent, for rings and glows. */
  accentSoft: string;
  /**
   * Accent ink for text that sits ON `accentSoft`. NOT the same colour as `accent`, and that is the
   * whole point: measured on the rendered page, `accent` on its own wash is 4.01:1 in light and
   * 3.61:1 in dark — both under the 4.5:1 floor, because the wash lifts the background toward the
   * text. Light goes darker, dark goes lighter; both land above 5:1.
   */
  accentInk: string;
  /** The live/positive dot. */
  live: string;
  /** Card shadow. None on dark — a shadow on a near-black ground is invisible and costs paint. */
  shadow: string;
}

export function homeTokens(darkMode: boolean): HomeTokens {
  return darkMode
    ? {
        bg:         '#020817',
        heroBg:     '#020817',
        bg2:        'rgba(15,23,42,0.6)',
        text:       '#f1f5f9',
        muted:      '#94a3b8',
        card:       '#0f172a',
        border:     '#1e293b',
        accent:     '#3b82f6',
        accentSoft: 'rgba(59,130,246,0.22)',
        accentInk:  '#93c5fd',   // 7.4:1 on the wash over #0f172a
        live:       '#10b981',
        shadow:     'none',
      }
    : {
        bg:         '#ffffff',
        heroBg:     '#f0f5ff',
        bg2:        '#f8fafc',
        text:       '#0f172a',
        // ⚠ #64748b UNTIL 2026-10-07, AND IT FAILED. Measured on the rendered page: 4.35:1 against
        // the hero's pale blue (#f0f5ff) — under the 4.5:1 floor — and the hero sub-line, the
        // "free plan" line and the slideshow caption all sit on exactly that ground. #5e6e85 reads
        // the same but measures 4.80:1 there, 5.01:1 on #f8fafc and 5.25:1 on white.
        muted:      '#5e6e85',
        card:       '#ffffff',
        border:     '#e2e8f0',
        accent:     '#2563eb',
        accentSoft: 'rgba(37,99,235,0.18)',
        accentInk:  '#1a4fc4',   // 5.5:1 on the wash over white
        live:       '#10b981',
        shadow:     '0 2px 14px rgba(15,23,42,0.07)',
      };
}
