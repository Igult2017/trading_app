/**
 * THE JOURNAL'S INK — one token set, resolved per theme, for every colour that is READ.
 *
 * ══ WHY THIS FILE EXISTS ════════════════════════════════════════════════════════════════════════
 *
 * His report, 2026-09-26: the white theme has a text-visibility problem, and the eco-friendly
 * marketplace does the same job well — copy how it does it.
 *
 * **What that project actually does** (`app/globals.css`) is not a trick, it is a discipline:
 *
 *   1. ONE token set, declared in one place, and the LIGHT theme is the base rather than an override.
 *   2. Names that describe the JOB — `muted` is muted TEXT, `border` is a border. A token used for a
 *      job its name does not describe breaks silently at the next theme change.
 *   3. A TINY CLOSED INK PALETTE. Measured across its 2,139 text-colour usages: **four** values, and
 *      67% of all text is the two darkest (`#2B3441` at 12.6:1 and `#6B7280` at 4.8:1 on white).
 *   4. Status colours belong to the PALETTE, not to a shared literal table.
 *
 * Point 4 is the same lesson this codebase already learned in the admin panel on 2026-09-10 — status
 * colours were fixed literals shared by all five palettes, which can only work while every palette is
 * dark, and a bright green that reads well on black measures 2.58:1 on white. That fix's measured
 * light values are reused verbatim below, because docs/READABILITY.md's own rule is to check what the
 * surface next door already uses rather than inventing a value.
 *
 * ══ WHY THE JOURNAL'S LIGHT THEME NEEDED THIS ═══════════════════════════════════════════════════
 *
 * The light theme was a 283-rule sheet in `Journal.tsx` matching hex strings inside inline styles:
 * `.journal-light [style*="color:#60a5fa"] { color:#1d4ed8 }`. **That half of it never matched
 * anything.** React applies inline styles through the CSSOM and the CSSOM serialises colour to
 * `rgb()`. Probed in Chromium, 2026-09-26:
 *
 *     el.style.color = '#0d1117'  ->  getAttribute('style') === "color: rgb(13, 17, 23);"
 *     el.matches('[style*="color:#0d1117"]')   -> FALSE          (and the spaced form too)
 *     el.matches('[style*="rgb(13, 17, 23)"]') -> TRUE
 *
 * `Journal.tsx` has recorded the `color` half of that since 2026-08-08 and named the answer — *"a
 * variable is resolved per theme at the root, so one inline value is correct in both"* — and then
 * introduced exactly two variables. This is the rest of them.
 *
 * ══ HOW IT IS SAFE TO DEPLOY ════════════════════════════════════════════════════════════════════
 *
 * **Every token here is defined ONLY on `.journal-light`, and every call site keeps its old literal as
 * the `var()` fallback:** `color: 'var(--jr-up, #34d399)'`. In the five dark themes the token is
 * undefined, so the fallback applies and the rendering is byte-identical — not "checked and found
 * unchanged", but unchanged BY CONSTRUCTION. That is also why many different dark greens can share one
 * light `--jr-up`: the dark themes keep all their shades, and only the white theme collapses to the
 * small measured palette that point 3 above is about.
 *
 * `journalInk.test.ts` pins that property, and `scripts/contrast-audit.mjs` measures the result.
 */

/**
 * THE LIGHT PALETTE. Every value measured against the theme's own surface `#FFFFFF` and canvas
 * `#FFFEFB`, and against its own 20%-alpha wash where these are used as a badge's ink — the pairing
 * that matters, since a status colour here is usually text on a tinted chip.
 *
 *   token          value      on #FFFFFF   on its 20% wash
 *   ink            #141310      18.58:1          —
 *   ink-dim        #5C5646       7.31:1          —
 *   ink-faint      #6E6754       5.63:1          —
 *   up             #046c4e       6.44:1        5.33:1
 *   down           #b91c1c       6.47:1        4.99:1
 *   warn           #92400e       7.09:1        6.10:1
 *   info           #1e40af       8.72:1        6.92:1
 *   alt            #5b21b6       8.98:1        6.97:1
 *   pink           #9d174d       7.88:1        6.13:1
 *   teal           #086070       7.20:1        6.29:1
 *
 * `ink` and `ink-dim` are the theme's own `text` / `textMuted` and are passed in rather than repeated,
 * so a change to the theme cannot leave this file behind. The rest are the admin panel's signed-off
 * light status inks (green/red/amber/blue/teal) plus two this codebase had no light value for.
 */
export const LIGHT_INK = {
  faint: '#6E6754',
  up:    '#046c4e',
  down:  '#b91c1c',
  warn:  '#92400e',
  info:  '#1e40af',
  alt:   '#5b21b6',
  pink:  '#9d174d',
  teal:  '#086070',
} as const;

/**
 * BRAND MARKS ARE A DIFFERENT JOB AND TAKE A DIFFERENT BAR.
 *
 * An exchange's logo colour is a graphic, not body text, so 3:1 is the bar rather than 4.5:1 — but
 * these are not close to either: Binance's `#F3BA2F` measures **1.77:1 on white** and Bybit's
 * `#F7A600` **2.02:1**, which is a logo nobody can see rather than a logo in the wrong shade. Each
 * light value below is the same hue taken down to a readable lightness, so the mark is still
 * recognisably the brand's.
 *
 * Coinbase's `#0052FF` is absent deliberately — it already measures 5.75:1 on white and changing a
 * colour that works is how a fix acquires a regression.
 */
export const LIGHT_BRAND = {
  '#F3BA2F': '#8a6200',   // Binance      1.77:1 -> 5.49:1
  '#F7A600': '#8a5c00',   // Bybit        2.02:1 -> 5.81:1
  '#00CDD1': '#046b6e',   // Bitget       1.97:1 -> 6.30:1
  '#FF6B35': '#9a3412',   // Bitunix      2.84:1 -> 7.31:1
  '#00A0DF': '#0b5a7a',   // DXtrade      2.96:1 -> 7.61:1
  '#F05A22': '#9a3412',   // TradeLocker  3.39:1 -> 7.61:1
} as const;

/**
 * The custom properties to spread onto `.journal-root`.
 *
 * DARK RETURNS NOTHING. Not "the dark values" — nothing at all, so every `var(--jr-x, literal)` falls
 * through to the literal that was always there. Adding dark values here would be the moment this
 * change could alter a theme he is happy with.
 */
export function inkVars(dark: boolean, text: string, textMuted: string): Record<string, string> {
  if (dark) return {};
  return {
    '--jr-ink-faint': LIGHT_INK.faint,
    '--jr-up':        LIGHT_INK.up,
    '--jr-down':      LIGHT_INK.down,
    '--jr-warn':      LIGHT_INK.warn,
    '--jr-info':      LIGHT_INK.info,
    '--jr-alt':       LIGHT_INK.alt,
    '--jr-pink':      LIGHT_INK.pink,
    '--jr-teal':      LIGHT_INK.teal,
    // ON A SATURATED FILL the ink stays white in both themes — a white label on a blue-600 button is
    // correct everywhere. This token exists so a call site can SAY which of the two jobs its white is
    // doing, because `color:'#fff'` alone cannot be told apart from a white that needed remapping.
    '--jr-on-fill':   '#ffffff',
    // The theme's own two, restated as tokens so a panel can reach them from an inline style without
    // importing the theme object.
    '--jr-ink-text':  text,
    '--jr-ink-mute':  textMuted,
    ...Object.fromEntries(Object.entries(LIGHT_BRAND).map(([dk, lt]) => [brandVar(dk), lt])),
  };
}

/** `#F3BA2F` -> `--jr-brand-f3ba2f`, so a mark's token is derivable from the colour it replaces. */
export function brandVar(darkHex: string): string {
  return `--jr-brand-${darkHex.replace('#', '').toLowerCase()}`;
}
