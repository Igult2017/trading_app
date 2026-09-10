import { useState } from 'react';
import { THEMES, FONTS } from '@/hooks/useJournalSettings';
import type { ThemeId, FontId, ThemeDef, FontDef } from '@/hooks/useJournalSettings';
import { Card, SectionHead, GroupLabel, Check, cardShadow, inkOn } from './ui';

/**
 * Theme and typography, with a preview that stays on screen while you change them.
 *
 * The preview is the point of this section. Previously it sat at the BOTTOM of one long scrolling
 * page, so the swatch you clicked and the result you were judging were never visible at once.
 */
export default function AppearanceSection({ theme, font, onThemeChange, onFontChange, T, face }: {
  theme: ThemeId; font: FontId;
  onThemeChange: (t: ThemeId) => void;
  onFontChange: (f: FontId) => void;
  T: ThemeDef; face: string;
}) {
  const [themeHov, setThemeHov] = useState<ThemeId | null>(null);
  const [fontHov, setFontHov]   = useState<FontId | null>(null);

  return (
    <div>
      <SectionHead T={T} font={face} title="Appearance"
        hint="How the journal looks. Both settings apply the moment you choose them — there is nothing to save." />

      {/* TWO COLUMNS, so the width is actually used. The controls take the left and the preview
          holds a sticky right rail beside them — his report was that the page "does not even use
          the space well", and the earlier version stacked all three in one narrow column with the
          preview stranded underneath, which is the worst place for the thing you are judging. */}
      <div className="jsp-appearance" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
      <Card T={T} style={{ marginBottom: 16 }}>
        <GroupLabel T={T}>Theme</GroupLabel>
        <div className="jsp-grid-themes" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12,
        }}>
          {(Object.entries(THEMES) as [ThemeId, ThemeDef][]).map(([id, def]) => {
            const active = theme === id, hov = themeHov === id;
            return (
              <button key={id} onClick={() => onThemeChange(id)} aria-current={active}
                onMouseEnter={() => setThemeHov(id)} onMouseLeave={() => setThemeHov(null)}
                style={{
                  background: 'transparent', padding: 0, cursor: 'pointer', overflow: 'hidden',
                  border: `1px solid ${active ? T.accent : hov ? T.textMuted : T.border}`,
                  boxShadow: active ? `0 0 0 1px ${T.accent}` : cardShadow(T),
                  borderRadius: 10, outline: 'none', position: 'relative',
                  transform: hov && !active ? 'translateY(-2px)' : 'none',
                  transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
                }}>
                <div style={{ height: 64, background: def.bg, position: 'relative', padding: '10px 10px 0' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16,
                                background: def.sidebarBg, borderRight: `1px solid ${def.border}` }} />
                  <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ height: 9, width: '78%', background: def.surface, borderRadius: 2, border: `1px solid ${def.border}` }} />
                    <div style={{ height: 6, width: '52%', background: def.surface, borderRadius: 2, border: `1px solid ${def.border}` }} />
                  </div>
                  <div style={{ position: 'absolute', bottom: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: def.accent }} />
                  {active && (
                    <div style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16,
                                  borderRadius: '50%', background: def.accent, display: 'flex',
                                  alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={9} />
                    </div>
                  )}
                </div>
                <div style={{ background: active ? `${T.accent}14` : T.surface,
                              borderTop: `1px solid ${active ? T.accent : T.border}`,
                              padding: '8px 10px', textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: active ? 700 : 600,
                                 letterSpacing: '0.08em', textTransform: 'uppercase',
                                 color: active ? T.accent : T.text }}>{def.label}</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: T.textMuted }}>
                    {def.dark ? 'Dark' : 'Light'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card T={T} style={{ marginBottom: 16 }}>
        <GroupLabel T={T}>Typography</GroupLabel>
        <div className="jsp-grid-fonts" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(156px, 1fr))', gap: 12,
        }}>
          {(Object.entries(FONTS) as [FontId, FontDef][]).map(([id, def]) => {
            const active = font === id, hov = fontHov === id;
            return (
              <button key={id} onClick={() => onFontChange(id)} aria-current={active}
                onMouseEnter={() => setFontHov(id)} onMouseLeave={() => setFontHov(null)}
                style={{
                  background: active ? `${T.accent}12` : 'transparent',
                  border: `1px solid ${active ? T.accent : hov ? T.textMuted : T.border}`,
                  boxShadow: active ? `0 0 0 1px ${T.accent}` : cardShadow(T),
                  borderRadius: 10, padding: '16px 16px 14px', cursor: 'pointer',
                  textAlign: 'left', outline: 'none',
                  transform: hov && !active ? 'translateY(-2px)' : 'none',
                  transition: 'all 0.15s',
                }}>
                <div style={{ fontSize: 20, fontFamily: def.stack, lineHeight: 1,
                              color: active ? T.accent : T.text, marginBottom: 12 }}>
                  {def.sample}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                              textTransform: 'uppercase', color: active ? T.accent : T.textMuted }}>
                  {def.label}
                </div>
                {/* The ink is set on the CHIP, so the tick (which draws in currentColor) gets it
                    too rather than inheriting whatever the card behind it happens to use. */}
                {active && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10,
                                padding: '3px 9px', background: T.accent, borderRadius: 999,
                                color: inkOn(T.accent) }}>
                    <Check size={8} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>ACTIVE</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      </div>

      {/* Live preview — a sticky rail beside the controls, so the swatch you click and the result
          you are judging are on screen together. It renders in the SELECTED face. */}
      <div className="jsp-preview-sticky" style={{ position: 'sticky', top: 16 }}>
        <Card T={T} style={{ fontFamily: FONTS[font].stack, padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: T.accent, marginBottom: 8 }}>
            Live preview
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: '0.01em',
                        lineHeight: 1.2, marginBottom: 8 }}>Trading Journal</div>
          <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7, marginBottom: 16 }}>
            The quick brown fox jumps over the lazy dog. 0123456789 +$1,234.56 −$987.00
          </div>
          {/* Wrapping, not a fixed row — this sits in a 320px rail and three cells side by side
              would squeeze the numbers to nothing. */}
          <div className="jsp-preview-stats" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([['P&L', '+$1,234', T.accent], ['WIN RATE', '67%', '#34d399'], ['TRADES', '42', T.text]] as const).map(([label, val, color]) => (
              <div key={label} className="jsp-preview-stat" style={{
                background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
                padding: '10px 14px', flex: '1 1 88px', minWidth: 0,
              }}>
                <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: '0.1em',
                              textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: '0.01em' }}>{val}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
}
