/** Support page — the palette and field style, from the design supplied 2026-08-08.
 *
 * Same family as the legal pages (light ground, serif, generous whitespace) but its own greens: the
 * reference sets a mint-grey page, a white card, and a deep green pill button.
 *
 * Dark mode is carried because the public site has one and a light-only page would strand it.
 */
import type { CSSProperties } from 'react';

export const SERIF = "'Playfair Display', Georgia, serif";

export function sTokens(dm: boolean) {
  return {
    bg:      dm ? '#0b1120' : '#f2f7f4',
    card:    dm ? '#111827' : '#ffffff',
    ink:     dm ? '#e8edf9' : '#16232b',   // headings
    body:    dm ? '#c7d0e4' : '#4d5c55',   // 8.4:1 on the mint ground
    // Placeholders and small print. The design's grey measured 4.17:1 on this mint ground — under
    // the 4.5 minimum — so it is one step darker here. Placeholder text is the first thing a user
    // reads in an empty form; it has to be legible.
    dim:     dm ? '#a6b3d1' : '#616f68',   // 4.87:1
    rule:    dm ? 'rgba(255,255,255,0.09)' : '#e6ece8',
    field:   dm ? '#0d1526' : '#ffffff',
    fieldBd: dm ? 'rgba(255,255,255,0.12)' : '#e2e8e4',
    accent:  dm ? '#5fbf95' : '#1f6b4f',   // the button green
    accentHv:dm ? '#6fd0a4' : '#185840',
    onAccent:'#ffffff',
    link:    dm ? '#7aa7ff' : '#2f6f97',
    okBg:    dm ? 'rgba(95,191,149,0.10)' : '#eef7f2',
    errInk:  dm ? '#fca5a5' : '#b91c1c',
  };
}

/** One field style for input, select and textarea, so they cannot drift apart. */
export function fieldStyle(dm: boolean): CSSProperties {
  const t = sTokens(dm);
  return {
    width: '100%',
    background: t.field,
    border: `1px solid ${t.fieldBd}`,
    borderRadius: 10,
    padding: '13px 16px',
    fontFamily: SERIF,
    fontSize: 14.5,
    lineHeight: 1.5,
    color: t.ink,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color .15s, box-shadow .15s',
  };
}

/** The pill button from the reference — deep green, white text, fully rounded. */
export function buttonStyle(dm: boolean, busy: boolean): CSSProperties {
  const t = sTokens(dm);
  return {
    display: 'inline-flex', alignItems: 'center', gap: 9,
    background: busy ? t.accentHv : t.accent,
    color: t.onAccent,
    border: 'none', borderRadius: 999,
    padding: '13px 26px',
    fontFamily: SERIF, fontSize: 14.5, fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.75 : 1,
    transition: 'background .18s, transform .18s',
  };
}
