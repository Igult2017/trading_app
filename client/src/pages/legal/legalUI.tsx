/** Legal pages — the shared look.
 *
 * The layout language comes from the reference page the user supplied (2026-08-08): light ground,
 * serif headings, definition bullets whose lead-in term is bold, and a bordered "note" callout.
 * The BRAND is ours; only the layout was borrowed.
 *
 * Both themes are carried. The public site has a dark mode, and a light-only design would strand
 * it — the same trap that put pale text on a white page earlier the same day.
 */
import type { ReactNode } from 'react';

export const SERIF = "'Playfair Display', Georgia, serif";
export const SANS  = "'Inter', system-ui, -apple-system, sans-serif";

export interface Themed { dm: boolean }

/** One place for every colour, so a contrast fix lands everywhere at once. */
export function tokens(dm: boolean) {
  return {
    bg:      dm ? '#0b1120' : '#f7f8fa',
    card:    dm ? '#111827' : '#ffffff',
    ink:     dm ? '#e8edf9' : '#111827',   // 16.9:1 dark / 16.1:1 light
    body:    dm ? '#c7d0e4' : '#374151',   // 11.4:1 dark /  9.7:1 light
    dim:     dm ? '#a6b3d1' : '#5b6474',   //  9.5:1 dark /  6.1:1 light
    rule:    dm ? 'rgba(255,255,255,0.09)' : '#e5e7eb',
    accent:  dm ? '#7aa7ff' : '#1d4ed8',
    noteBg:  dm ? 'rgba(122,167,255,0.07)' : '#f1f5fd',
    noteBar: dm ? '#7aa7ff' : '#1d4ed8',
    warnBg:  dm ? 'rgba(248,113,113,0.08)' : '#fef4f4',
    warnBar: dm ? '#f87171' : '#b91c1c',
    warnInk: dm ? '#fca5a5' : '#991b1b',
  };
}

export const H1 = ({ dm, children }: Themed & { children: ReactNode }) => (
  <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 700,
               color: tokens(dm).ink, margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
    {children}
  </h1>
);

export const H2 = ({ dm, children }: Themed & { children: ReactNode }) => (
  <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(1.05rem,1.8vw,1.3rem)', fontWeight: 700,
               color: tokens(dm).ink, margin: '38px 0 12px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
    {children}
  </h2>
);

export const P = ({ dm, children }: Themed & { children: ReactNode }) => (
  <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.75, color: tokens(dm).body, margin: '0 0 14px' }}>
    {children}
  </p>
);

/** Definition bullets: bold lead-in term, then the explanation. The reference page's signature. */
export const DL = ({ dm, items }: Themed & { items: [string, ReactNode][] }) => {
  const t = tokens(dm);
  return (
    <ul style={{ margin: '0 0 16px', paddingLeft: 22 }}>
      {items.map(([term, body], i) => (
        <li key={i} style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.75, color: t.body, margin: '0 0 10px' }}>
          <strong style={{ color: t.ink, fontWeight: 700 }}>{term}</strong>{term ? ' ' : ''}{body}
        </li>
      ))}
    </ul>
  );
};

export const UL = ({ dm, items }: Themed & { items: ReactNode[] }) => {
  const t = tokens(dm);
  return (
    <ul style={{ margin: '0 0 16px', paddingLeft: 22 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.75, color: t.body, margin: '0 0 8px' }}>{it}</li>
      ))}
    </ul>
  );
};

/** The bordered callout from the reference page. `tone="warn"` for the things that carry money risk. */
export const Note = ({ dm, tone = 'note', children }: Themed & { tone?: 'note' | 'warn'; children: ReactNode }) => {
  const t = tokens(dm);
  const warn = tone === 'warn';
  return (
    <div style={{ background: warn ? t.warnBg : t.noteBg,
                  borderLeft: `3px solid ${warn ? t.warnBar : t.noteBar}`,
                  borderRadius: '0 8px 8px 0', padding: '14px 18px', margin: '18px 0 20px' }}>
      <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.7,
                    color: warn ? t.warnInk : t.body }}>
        {children}
      </div>
    </div>
  );
};

/** Small print under a document title. */
export const Stamp = ({ dm, children }: Themed & { children: ReactNode }) => (
  <p style={{ fontFamily: SANS, fontSize: 12, color: tokens(dm).dim, margin: '0 0 26px', letterSpacing: '0.01em' }}>
    {children}
  </p>
);

/** Repeated verbatim across documents — one definition, so it cannot drift. */
export const PENDING_ENTITY =
  'The operating entity is being registered. Its full registered name, legal form, registered ' +
  'office, company number and tax registration number will be published on this page as soon as ' +
  'registration completes. Until then the email addresses below are monitored and are the fastest ' +
  'way to reach us.';
