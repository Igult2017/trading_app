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
