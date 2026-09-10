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
  green: '#0f9d63', greenL: '#12b873',
  red: '#dc2626', redL: '#ef4444',
  amber: '#b45309', amberL: '#d97706',
  blue: '#2563eb', blueL: '#3b82f6',
};

/** TWO FACES, TWO JOBS — and getting this wrong is what made the panel look cramped and dated.
 *
 *  `HFONT` is the display serif: page titles, card titles, the big numbers. `FONT` is the sans that
 *  everything READ is set in — labels, table cells, inputs, captions. They were pointed at the SAME
 *  face, so Playfair was setting 11px table text and 12px uppercase labels, which is exactly the
 *  first failure named in docs/READABILITY.md: a display serif doing a body's job. */
export const FONT = 'var(--admin-font)';
export const HFONT = 'var(--admin-header-font)';

/** The navigation rail's own face. Brand chrome, deliberately not the picker's font. */
export const RAIL_SERIF = "'Playfair Display Variable', 'Playfair Display', Georgia, serif";

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
  color: C.text, padding: '11px 14px', fontFamily: FONT, fontWeight: 500, fontSize: '14px',
  outline: 'none', boxSizing: 'border-box',
} as const;

export const lbl = {
  display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: C.muted, marginBottom: '8px',
} as const;

export const btn = {
  fontFamily: FONT, fontWeight: 600, cursor: 'pointer', border: 'none',
  borderRadius: R.ctl, letterSpacing: '0.02em',
};
