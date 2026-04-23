import { useState } from 'react';
import { THEMES, FONTS, ThemeId, FontId } from '@/hooks/useJournalSettings';
import type { ThemeDef, FontDef } from '@/hooks/useJournalSettings';

interface Props {
  theme: ThemeId;
  font: FontId;
  onThemeChange: (t: ThemeId) => void;
  onFontChange: (f: FontId) => void;
}

const Section = ({ label, children, T }: { label: string; children: React.ReactNode; T: ThemeDef }) => (
  <div style={{ marginBottom: 36 }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
    }}>
      <div style={{ width: 3, height: 16, background: T.accent, flexShrink: 0 }} />
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: T.textMuted,
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
    {children}
  </div>
);

export default function JournalSettingsPanel({ theme, font, onThemeChange, onFontChange }: Props) {
  const T = THEMES[theme];
  const [themeHov, setThemeHov] = useState<ThemeId | null>(null);
  const [fontHov, setFontHov] = useState<FontId | null>(null);

  return (
    <div style={{
      maxWidth: 860,
      margin: '0 auto',
      padding: '40px 32px 60px',
      color: T.text,
    }}>

      {/* Page title */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ width: 4, height: 28, background: T.accent }} />
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 900,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: T.text,
          }}>Journal Settings</h1>
        </div>
        <p style={{
          margin: '0 0 0 18px', fontSize: 11, color: T.textMuted,
          letterSpacing: '0.06em',
        }}>
          Personalise your trading environment — theme and typography changes apply instantly.
        </p>
      </div>

      {/* ── THEME ─────────────────────────────────────────── */}
      <Section label="Theme" T={T}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 12,
        }}>
          {(Object.entries(THEMES) as [ThemeId, ThemeDef][]).map(([id, def]) => {
            const active = theme === id;
            const hov = themeHov === id;
            return (
              <button
                key={id}
                onClick={() => onThemeChange(id)}
                onMouseEnter={() => setThemeHov(id)}
                onMouseLeave={() => setThemeHov(null)}
                style={{
                  background: 'transparent',
                  border: `2px solid ${active ? T.accent : hov ? T.textMuted : T.border}`,
                  borderRadius: 10,
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.15s',
                  transform: hov && !active ? 'translateY(-2px)' : 'none',
                  overflow: 'hidden',
                  outline: 'none',
                  position: 'relative',
                }}
              >
                {/* Swatch preview */}
                <div style={{
                  height: 72,
                  background: def.bg,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 10px 0',
                  gap: 5,
                  position: 'relative',
                }}>
                  {/* Fake sidebar strip */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 18,
                    background: def.sidebarBg,
                    borderRight: `1px solid ${def.border}`,
                  }} />
                  {/* Fake cards */}
                  <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ height: 10, width: '80%', background: def.surface, borderRadius: 2, border: `1px solid ${def.border}` }} />
                    <div style={{ height: 7, width: '55%', background: def.surface, borderRadius: 2, border: `1px solid ${def.border}` }} />
                  </div>
                  {/* Accent dot */}
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    width: 8, height: 8, borderRadius: '50%',
                    background: def.accent,
                  }} />
                  {/* Active check */}
                  {active && (
                    <div style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 16, height: 16, borderRadius: '50%',
                      background: def.accent,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
                {/* Label */}
                <div style={{
                  background: active ? `${T.accent}18` : hov ? T.surface : T.surface,
                  borderTop: `1px solid ${active ? T.accent : T.border}`,
                  padding: '7px 10px',
                  textAlign: 'left',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: active ? 800 : 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: active ? T.accent : T.text,
                    display: 'block',
                  }}>{def.label}</span>
                  <span style={{
                    fontSize: 8, letterSpacing: '0.06em',
                    color: T.textMuted, display: 'block', marginTop: 1,
                  }}>{def.dark ? 'Dark' : 'Light'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── FONT ──────────────────────────────────────────── */}
      <Section label="Typography" T={T}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap: 12,
        }}>
          {(Object.entries(FONTS) as [FontId, FontDef][]).map(([id, def]) => {
            const active = font === id;
            const hov = fontHov === id;
            return (
              <button
                key={id}
                onClick={() => onFontChange(id)}
                onMouseEnter={() => setFontHov(id)}
                onMouseLeave={() => setFontHov(null)}
                style={{
                  background: active ? `${T.accent}14` : hov ? T.surface : 'transparent',
                  border: `2px solid ${active ? T.accent : hov ? T.textMuted : T.border}`,
                  borderRadius: 10,
                  padding: '16px 18px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  transform: hov && !active ? 'translateY(-2px)' : 'none',
                  outline: 'none',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  fontSize: 28,
                  fontFamily: def.stack,
                  color: active ? T.accent : T.text,
                  lineHeight: 1,
                  marginBottom: 10,
                  fontWeight: 400,
                }}>
                  {def.sample}
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: active ? T.accent : T.textMuted,
                  marginBottom: 3,
                }}>{def.label}</div>
                {active && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    marginTop: 4, padding: '2px 8px',
                    background: T.accent, borderRadius: 20,
                  }}>
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ fontSize: 8, color: '#fff', fontWeight: 700, letterSpacing: '0.08em' }}>ACTIVE</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── PREVIEW ───────────────────────────────────────── */}
      <Section label="Preview" T={T}>
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: '24px 28px',
          fontFamily: FONTS[font].stack,
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: T.accent, marginBottom: 6,
          }}>Live Preview</div>
          <div style={{
            fontSize: 24, fontWeight: 800, color: T.text,
            letterSpacing: '0.04em', lineHeight: 1.2, marginBottom: 10,
          }}>Trading Journal</div>
          <div style={{
            fontSize: 12, color: T.textMuted,
            lineHeight: 1.6, letterSpacing: '0.02em', marginBottom: 18,
          }}>
            The quick brown fox jumps over the lazy dog. 0123456789 +$1,234.56 −$987.00
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['P&L', '+$1,234', T.accent], ['WIN RATE', '67%', '#34d399'], ['TRADES', '42', T.text]].map(([label, val, color]) => (
              <div key={label} style={{
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                padding: '8px 14px',
              }}>
                <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: '0.02em' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

    </div>
  );
}
