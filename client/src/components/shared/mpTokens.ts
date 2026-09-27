/**
 * mpTokens.ts — THE ONE PALETTE for the Metrics page and the Drawdown page.
 *
 * WHY THIS FILE EXISTS (2026-09-27). His instruction: "copy the design and colors used in metrics
 * page to be copied and use in the drawdown page." Copying the VALUES into a second file is how two
 * pages drift apart — one gets a contrast fix and the other does not. So both pages now read their
 * colours from here, and a change made once moves both.
 *
 * This is the same shape the light-theme work settled on earlier the same day: one set of token
 * NAMES, redefined per theme, and no component inventing a colour of its own.
 *
 * HOW EACH PAGE CONSUMES IT
 *   MetricsPanel  builds its `D` object of var(--mp-…, <dark>) references plus the light overrides.
 *   Drawdown      (components/drawdown/dpTokens.ts) maps its own token names onto these values.
 *
 * ⚠ EVERY LIGHT VALUE HERE WAS MEASURED against the surface it sits on, not eyeballed. The drawdown's
 * light theme had three real failures in August (dpStyles.ts records --ink3 at 2.56:1, below the
 * minimum), so anything added here is measured before it ships.
 */

/** The dark palette — what both pages show in every theme except `light`. */
export const MP_DARK = {
  /* surfaces */
  bg:   '#0A0C10',   // the page ground
  bg2:  '#111318',   // a raised card (the KPI cards)
  bg3:  '#0E1016',   // a panel body
  bg4:  '#0C0E14',   // a panel's title bar
  /* lines */
  bdOuter: '#1E2330',  // around a card
  bdInner: '#1A1F2E',  // around a panel, and its title-bar underline
  bdRow:   '#12161E',  // between rows
  bdDiv:   '#141820',  // under a small in-panel label
  /* text — t1 reads, t2 sits behind it in the hierarchy */
  text:  '#ECEEF2',
  label: '#A8AEB8',
  muted: '#ECEEF2',
  dim:   '#A8AEB8',
  sub:   '#A8AEB8',
  /* status — each colour with its own chip background and border */
  green:    '#1D9E75', greenBg:  '#0A2016', greenBd:  '#0F3020',
  red:      '#E24B4A', redBg:    '#1E0A0A', redBd:    '#3A1010',
  amber:    '#EF9F27', amberBg:  '#1E1200', amberBd:  '#3A2200',
  blue:     '#378ADD', blueBg:   '#0A1628', blueBd:   '#0F2A4A',
  purple:   '#7F77DD', purpleBg: '#140F28', purpleBd: '#251B4A',
  cyan:     '#4AE8D8', cyanBg:   '#0A2028', cyanBd:   '#0F3038',
  gray:     '#72819B', grayBg:   '#12151C', grayBd:   '#1A1F2E',
  /* the headline KPI cards */
  kpiCap: '#ECEEF2', kpiSub: '#C2CBD6', kpiPos: '#34d399', kpiNeg: '#fb7185',
} as const;

/**
 * The light palette — the same names, different values.
 *
 * Contrast measured on this palette's own surfaces (card #FFFFFF, page #F8FAFC):
 *   text   #1E293B  13.2:1      label/dim/sub #5A697C  5.6:1     muted #475569  7.5:1
 *   green  #047857   5.5:1      red   #C81E1E  5.7:1   amber #B45309  5.0:1
 *
 * TWO OF THESE WERE RAISED on 2026-09-27, measured on the surfaces they ACTUALLY sit on rather than
 * on plain white, which is what hid them:
 *   label  #64748B  4.34:1 on the panel TITLE BAR (#F1F5F9) - FAIL   ->  #5A697C  5.12:1
 *   red    #DC2626  4.25:1 on the red CHIP TINT (#FCEDED)   - FAIL   ->  #C81E1E  5.05:1
 * Both cleared 4.5:1 when measured against white, which is why they had survived. The Metrics page
 * carried both, so this fixes that page too - the reason the palette is shared.
 *   blue   #2563EB   5.2:1      purple #6D28D9 6.9:1   cyan  #0E7490  4.7:1   gray #475569 7.5:1
 * All clear AA (4.5:1). The chip backgrounds are the status colour at 10% with a 30% border, so the
 * chip text is effectively reading on white and the figures above hold.
 */
export const MP_LIGHT = {
  bg:   '#F8FAFC',
  bg2:  '#FFFFFF',
  bg3:  '#F8FAFC',
  bg4:  '#F1F5F9',
  bdOuter: '#CBD5E1',
  bdInner: '#E2E8F0',
  bdRow:   '#F1F5F9',
  bdDiv:   '#E2E8F0',
  text:  '#1E293B',
  label: '#5A697C',
  muted: '#475569',
  dim:   '#5A697C',
  sub:   '#5A697C',
  green:    '#047857', greenBg:  'rgba(29,158,117,0.1)',  greenBd:  'rgba(29,158,117,0.3)',
  red:      '#C81E1E', redBg:    'rgba(226,75,74,0.1)',   redBd:    'rgba(226,75,74,0.3)',
  amber:    '#B45309', amberBg:  'rgba(239,159,39,0.1)',  amberBd:  'rgba(239,159,39,0.3)',
  blue:     '#2563EB', blueBg:   'rgba(55,138,221,0.1)',  blueBd:   'rgba(55,138,221,0.3)',
  purple:   '#6D28D9', purpleBg: 'rgba(127,119,221,0.1)', purpleBd: 'rgba(127,119,221,0.3)',
  cyan:     '#0E7490', cyanBg:   'rgba(74,232,216,0.1)',  cyanBd:   'rgba(74,232,216,0.3)',
  gray:     '#475569', grayBg:   '#F1F5F9',               grayBd:   '#CBD5E1',
  kpiCap: '#1E293B', kpiSub: '#334155', kpiPos: '#047857', kpiNeg: '#DC2626',
} as const;

/** The CSS custom-property name each token is published under, so both pages agree on the spelling. */
export const MP_VAR = {
  bg: '--mp-bg', bg2: '--mp-bg2', bg3: '--mp-bg3', bg4: '--mp-bg4',
  bdOuter: '--mp-bdo', bdInner: '--mp-bdi', bdRow: '--mp-bdr', bdDiv: '--mp-bdd',
  text: '--mp-txt', label: '--mp-lbl', muted: '--mp-mut', dim: '--mp-dim', sub: '--mp-sub',
  green: '--mp-green', greenBg: '--mp-grbg', greenBd: '--mp-grbd',
  red: '--mp-red', redBg: '--mp-rdbg', redBd: '--mp-rdbd',
  amber: '--mp-amber', amberBg: '--mp-ambg', amberBd: '--mp-ambd',
  blue: '--mp-blue', blueBg: '--mp-blbg', blueBd: '--mp-blbd',
  purple: '--mp-purple', purpleBg: '--mp-pubg', purpleBd: '--mp-pubd',
  cyan: '--mp-cyan', cyanBg: '--mp-cybg', cyanBd: '--mp-cybd',
  gray: '--mp-gray', grayBg: '--mp-gybg', grayBd: '--mp-gybd',
  kpiCap: '--mp-kpi-cap', kpiSub: '--mp-kpi-sub', kpiPos: '--mp-kpi-pos', kpiNeg: '--mp-kpi-neg',
} as const;

export type MpToken = keyof typeof MP_DARK;

/** `var(--mp-x, <dark value>)` for one token — the form both pages style with. */
export const mpRef = (k: MpToken): string => `var(${MP_VAR[k]}, ${MP_DARK[k]})`;

/** Every token as a var() reference. The page reads this; the theme decides what it resolves to. */
export const MP_REF = Object.fromEntries(
  (Object.keys(MP_DARK) as MpToken[]).map(k => [k, mpRef(k)]),
) as Record<MpToken, string>;

/**
 * The light theme's values as inline custom properties, to spread onto a page root when the journal
 * is in light mode. Nothing is set in dark mode — the fallbacks in MP_REF already carry those.
 */
export const mpLightVars = (): Record<string, string> =>
  Object.fromEntries((Object.keys(MP_LIGHT) as MpToken[]).map(k => [MP_VAR[k], MP_LIGHT[k]]));

/** The same values as a CSS declaration block body, for a stylesheet rather than an inline style. */
export const mpLightCss = (): string =>
  (Object.keys(MP_LIGHT) as MpToken[]).map(k => `${MP_VAR[k]}:${MP_LIGHT[k]};`).join('');
