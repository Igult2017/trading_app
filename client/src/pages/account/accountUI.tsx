/** Account settings — shared shell pieces.
 *
 * Same design language as the legal and support pages: light/dark ground, serif headings, a single
 * centred column, cards rather than a sidebar.
 */
import type { ReactNode } from 'react';

export const SERIF = "'Playfair Display', Georgia, serif";
export const SANS  = "'Inter', system-ui, -apple-system, sans-serif";

export function aTokens(dm: boolean) {
  return {
    bg:      dm ? '#0b1120' : '#f4f6f4',
    card:    dm ? '#111827' : '#ffffff',
    ink:     dm ? '#e8edf9' : '#16232b',
    body:    dm ? '#c7d0e4' : '#4d5c55',
    dim:     dm ? '#a6b3d1' : '#616f68',
    rule:    dm ? 'rgba(255,255,255,0.09)' : '#e6ece8',
    field:   dm ? '#0d1526' : '#ffffff',
    fieldBd: dm ? 'rgba(255,255,255,0.12)' : '#e2e8e4',
    accent:  dm ? '#5fbf95' : '#1f6b4f',
    accentHv:dm ? '#6fd0a4' : '#185840',
    danger:  dm ? '#fca5a5' : '#b91c1c',
    okBg:    dm ? 'rgba(95,191,149,0.10)' : '#eef7f2',
  };
}

export const Card = ({ dm, title, note, children }:
  { dm: boolean; title: string; note?: string; children: ReactNode }) => {
  const t = aTokens(dm);
  return (
    <section style={{ background: t.card, border: `1px solid ${t.rule}`, borderRadius: 14,
                      padding: 'clamp(20px,3.5vw,28px)', marginBottom: 16 }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(1.05rem,2vw,1.25rem)', fontWeight: 700,
                   color: t.ink, margin: '0 0 4px', letterSpacing: '-0.01em' }}>{title}</h2>
      {note && (
        <p style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.7, color: t.dim, margin: '0 0 18px' }}>{note}</p>
      )}
      {!note && <div style={{ height: 14 }} />}
      {children}
    </section>
  );
};

export const Label = ({ dm, children }: { dm: boolean; children: ReactNode }) => (
  <label style={{ display: 'block', fontFamily: SANS, fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: aTokens(dm).dim, margin: '0 0 7px' }}>{children}</label>
);

export function inputStyle(dm: boolean, disabled = false): React.CSSProperties {
  const t = aTokens(dm);
  return {
    width: '100%', background: disabled ? (dm ? '#0a1120' : '#f6f8f6') : t.field,
    border: `1px solid ${t.fieldBd}`, borderRadius: 10, padding: '12px 15px',
    fontFamily: SERIF, fontSize: 14.5, color: disabled ? t.dim : t.ink,
    outline: 'none', boxSizing: 'border-box',
  };
}

export function btnStyle(dm: boolean, busy = false, kind: 'primary' | 'quiet' = 'primary'): React.CSSProperties {
  const t = aTokens(dm);
  const primary = kind === 'primary';
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: primary ? (busy ? t.accentHv : t.accent) : 'transparent',
    color: primary ? '#fff' : t.body,
    border: primary ? 'none' : `1px solid ${t.fieldBd}`,
    borderRadius: 999, padding: '11px 22px',
    fontFamily: SERIF, fontSize: 14, fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
    transition: 'background .18s',
  };
}

/** Inline result line — one component so every form reports success and failure the same way. */
export const Result = ({ dm, state, msg }: { dm: boolean; state: 'ok' | 'err' | null; msg: string }) => {
  const t = aTokens(dm);
  if (!state) return null;
  return (
    <p role={state === 'err' ? 'alert' : undefined}
       style={{ fontFamily: SERIF, fontSize: 13.5, margin: '12px 0 0',
                color: state === 'err' ? t.danger : t.accent }}>
      {msg}
    </p>
  );
};
