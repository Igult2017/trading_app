import { useEffect, useRef, useState } from 'react';
import { THEMES, type ThemeId } from '@/hooks/useJournalSettings';

/**
 * ThemePicker — the pill in the journal header, and the list it has always implied.
 *
 * HIS REPORT, 2026-10-12: *"This themes changing button is not showing other themes can you fix
 * it."* The pill drew a chevron — which everywhere means "this opens a list" — and never had one.
 * Clicking it called `toggleDarkMode`, which despite a "Cycle theme" tooltip only flips between
 * `light` and whichever dark theme you were last on. **Of the six themes the journal ships, that
 * button could reach two.**
 *
 * THE DATA FOR THIS WAS ALREADY THERE. Every entry in `THEMES` declares a `swatches` array of
 * three preview colours, and before today nothing anywhere read it — built for a picker that was
 * never made. The rows below are what it was for.
 *
 * ⚠ IT DRAWS ITSELF IN THE ACTIVE THEME'S OWN COLOURS, from `THEMES[current]`, and that is not
 * decoration. This app has twice shipped a panel with one theme's colours hardcoded into it — the
 * notification card was a near-black slab on the light theme, the admin one the same — and a
 * theme picker that is unreadable on half the themes it offers would be the joke version of that
 * bug. The surface, the border and both ink tiers all come from whichever theme is live.
 *
 * It does NOT define a theme or decide what one means. Picking calls back into `Journal.tsx`,
 * which owns the one function that keeps the theme, `darkMode` and the stored flag in step.
 */

export interface ThemePickerProps {
  current: ThemeId;
  onPick: (id: ThemeId) => void;
  className?: string;
}

/** Every theme, in the order they are declared — dark ones first, Light last. */
const ORDER = Object.keys(THEMES) as ThemeId[];

export default function ThemePicker({ current, onPick, className }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = THEMES[current] ?? THEMES.navy;
  const accent = t.accent;

  // Close on a click anywhere else, and on Escape. Both, because a dropdown that can only be
  // dismissed by clicking the thing that opened it is a trap for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pillStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 10px 4px 6px',
    borderRadius: 20,
    border: `1px solid ${accent}40`,
    background: `${accent}${open ? '22' : '12'}`,
    cursor: 'pointer',
    transition: 'all 0.2s',
    flexShrink: 0,
    fontFamily: 'inherit',
  };

  return (
    <div ref={rootRef} className={className} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Choose a theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={pillStyle}
        onMouseEnter={e => { e.currentTarget.style.background = `${accent}22`; e.currentTarget.style.borderColor = `${accent}80`; }}
        onMouseLeave={e => { e.currentTarget.style.background = `${accent}${open ? '22' : '12'}`; e.currentTarget.style.borderColor = `${accent}40`; }}
      >
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: accent, flexShrink: 0, boxShadow: `0 0 6px ${accent}80` }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, whiteSpace: 'nowrap' }}>
          {t.label}
        </span>
        {/* The chevron now tells the truth — it turns over when the list is open. */}
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden
             style={{ opacity: 0.6, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M2 4 L5 7 L8 4" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Theme"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 9997,
            minWidth: 196, padding: 6,
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: 14,
            boxShadow: '0 20px 48px rgba(0,0,0,0.34)',
            // The header is a flex row of small controls; without this the list inherits its
            // cramped line-height and the rows sit on top of each other.
            lineHeight: 1.4,
          }}
        >
          {ORDER.map(id => {
            const d = THEMES[id];
            const isCurrent = id === current;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={isCurrent}
                onClick={() => { onPick(id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 10px', borderRadius: 9,
                  border: '1px solid transparent',
                  background: isCurrent ? `${d.accent}1a` : 'transparent',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  transition: 'background 0.14s, border-color 0.14s',
                }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = `${d.accent}12`; }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* THE SWATCHES, which is what that unused field was always for: this theme's own
                    background, surface and accent, so the row previews the thing it selects. */}
                <span style={{ display: 'flex', flexShrink: 0 }}>
                  {d.swatches.map((c, i) => (
                    <span key={i} style={{
                      width: 13, height: 13, borderRadius: '50%', background: c,
                      border: `1px solid ${t.border}`,
                      marginLeft: i ? -5 : 0,   // overlapped, so three dots read as one chip
                    }} />
                  ))}
                </span>
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: 12.5, fontWeight: isCurrent ? 800 : 600,
                  letterSpacing: '0.04em',
                  color: isCurrent ? d.accent : t.text,
                  whiteSpace: 'nowrap',
                }}>
                  {d.label}
                </span>
                {/* A tick, not just a colour change — colour alone is not a state a colour-blind
                    user can read, and this list is nothing but colours. */}
                <span style={{ width: 12, flexShrink: 0, color: d.accent, opacity: isCurrent ? 1 : 0 }} aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6.2 L4.8 8.5 L9.5 3.8" stroke="currentColor" strokeWidth="1.8"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
