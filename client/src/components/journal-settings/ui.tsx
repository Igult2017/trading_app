import type { ThemeDef } from '@/hooks/useJournalSettings';

/**
 * The shared pieces of the journal settings screen.
 *
 * EVERY SIZE HERE OBEYS TWO NUMBERS from docs/READABILITY.md: 11px is the floor, and .12em is the
 * ceiling for letter-spacing on small text. The screen this replaced broke both repeatedly — an
 * 8px "ACTIVE" pill, 9px card labels, a 10px section head at .22em — and a page title set at 12px,
 * smaller than the body text beneath it.
 *
 * Colours come from the chosen theme (`ThemeDef`) and never from literals, because one of the six
 * themes is LIGHT. A hardcoded white-on-dark value looks fine in five of them and disappears in the
 * sixth, which is the failure this file exists to make impossible.
 */

/** Depth instead of a hard outline. Faint enough to read on the light theme too. */
export const cardShadow = (T: ThemeDef) =>
  T.dark ? '0 1px 2px rgba(0,0,0,0.35)' : '0 1px 2px rgba(16,24,40,0.06)';

/** A raised surface. Everything on this screen sits in one of these. */
export function Card({ T, children, style }: {
  T: ThemeDef; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      boxShadow: cardShadow(T),
      padding: 24,
      ...style,
    }}>{children}</div>
  );
}

/** The heading at the top of a section, with the sentence that explains what it changes. */
export function SectionHead({ T, title, hint, font }: {
  T: ThemeDef; title: string; hint: string; font: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{
        margin: 0, fontSize: 19, fontWeight: 700, color: T.text,
        letterSpacing: '0.01em', lineHeight: 1.25, fontFamily: font,
      }}>{title}</h2>
      <p style={{
        margin: '6px 0 0', fontSize: 13, color: T.textMuted,
        lineHeight: 1.6, letterSpacing: '0.01em', maxWidth: 560,
      }}>{hint}</p>
    </div>
  );
}

/** A small uppercase label above a group of controls. */
export function GroupLabel({ T, children }: { T: ThemeDef; children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: T.textMuted, marginBottom: 12,
    }}>{children}</div>
  );
}

/**
 * The on/off switch.
 *
 * It is a real `<button>` carrying `aria-pressed`, not a styled `<div>`. The one it replaces was a
 * div with an onClick, so it could not be reached by keyboard and announced nothing — and the rows
 * it sits in are the only way to hide a panel from the journal form.
 */
export function Toggle({ T, on, disabled, label, onChange }: {
  T: ThemeDef; on: boolean; disabled?: boolean; label: string; onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{
        position: 'relative', width: 40, height: 22, flexShrink: 0, padding: 0,
        background: on ? T.accent : T.border,
        border: 'none', borderRadius: 11,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

/** The tick used on a selected theme or font. */
export function Check({ size = 10, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke={color} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** THE READABLE INK FOR TEXT SITTING ON A COLOURED CHIP.
 *
 *  White on the accent is right for a dark accent and wrong for a light one — the "ACTIVE" pill
 *  measured **2.14:1** on the light theme's accent, which is unreadable. Six themes share these
 *  components, so the foreground has to be decided from the colour it lands on rather than assumed.
 *
 *  It MEASURES both candidates and takes the better one, rather than guessing a brightness cutoff.
 *  A cutoff is what got this wrong the first time: at a threshold of 0.45, the sky-blue accent
 *  `#38bdf8` (luminance 0.437) fell on the "use white" side by four thousandths and stayed at
 *  2.14:1, when near-black on the same chip measures 8.7:1. Comparing the two ratios has no such
 *  edge to fall off. */
export function inkOn(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#fff';                       // gradients, rgba(), var() — leave them as they were
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  const DARK = 0.00539;                        // #0b1220, the ink used elsewhere for text on light
  const against = (other: number) => {
    const [hi, lo] = lum > other ? [lum, other] : [other, lum];
    return (hi + 0.05) / (lo + 0.05);
  };
  return against(DARK) >= against(1) ? '#0b1220' : '#fff';
}
