import { useState } from 'react';
import { useLocation } from 'wouter';
import { THEMES, FONTS, JOURNAL_PANELS, ThemeId, FontId } from '@/hooks/useJournalSettings';
import type { ThemeDef, FontDef } from '@/hooks/useJournalSettings';
import { useAuth } from '@/context/AuthContext';

const GEMINI_MODELS = [
  { id: "gemini-1.5-flash",               label: "Gemini 1.5 Flash",         desc: "Fast · stable GA (default)" },
  { id: "gemini-1.5-pro",                 label: "Gemini 1.5 Pro",           desc: "Powerful · stable GA" },
  { id: "gemini-2.0-flash-lite",          label: "Gemini 2.0 Flash Lite",    desc: "Newer · efficient" },
  { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash Preview", desc: "Latest Flash · preview" },
  { id: "gemini-2.5-pro-preview-05-06",   label: "Gemini 2.5 Pro Preview",   desc: "Most capable · preview" },
] as const;

function readScreenshotModel(): string {
  try { return JSON.parse(localStorage.getItem('journal_settings_v2') || '{}').screenshotModel || 'gemini-1.5-flash'; }
  catch { return 'gemini-1.5-flash'; }
}
function writeScreenshotModel(id: string) {
  try {
    const raw = localStorage.getItem('journal_settings_v2');
    const obj = raw ? JSON.parse(raw) : {};
    localStorage.setItem('journal_settings_v2', JSON.stringify({ ...obj, screenshotModel: id }));
  } catch {}
}

interface Props {
  theme: ThemeId;
  font: FontId;
  onThemeChange: (t: ThemeId) => void;
  onFontChange: (f: FontId) => void;
  hiddenPanels: string[];
  onTogglePanel: (id: string) => void;
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

export default function JournalSettingsPanel({ theme, font, onThemeChange, onFontChange, hiddenPanels, onTogglePanel }: Props) {
  const T = THEMES[theme];
  const [themeHov, setThemeHov] = useState<ThemeId | null>(null);
  const [fontHov, setFontHov] = useState<FontId | null>(null);
  const { user, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [screenshotModel, setScreenshotModel] = useState<string>(readScreenshotModel);

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate('/');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="jsp-root" style={{
      maxWidth: 860,
      margin: '0 auto',
      padding: '40px 32px 60px',
      color: T.text,
    }}>
      <style>{`
        @media (max-width: 640px) {
          .jsp-root { padding: 20px 14px 40px !important; }
          .jsp-title-row { gap: 10px !important; }
          .jsp-title-bar { width: 3px !important; height: 22px !important; }
          .jsp-title { font-size: 16px !important; letter-spacing: 0.06em !important; }
          .jsp-subtitle { margin-left: 13px !important; font-size: 10px !important; }
          .jsp-section { margin-bottom: 24px !important; }
          .jsp-grid-themes { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .jsp-grid-fonts  { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .jsp-font-card { padding: 12px 14px 10px !important; }
          .jsp-font-sample { font-size: 22px !important; margin-bottom: 7px !important; }
          .jsp-preview-card { padding: 16px 16px !important; }
          .jsp-preview-title { font-size: 18px !important; }
          .jsp-preview-stats { flex-wrap: wrap !important; gap: 6px !important; }
          .jsp-preview-stat { padding: 6px 10px !important; flex: 1 1 30% !important; min-width: 0 !important; }
          .jsp-logout-card { padding: 14px !important; }
          .jsp-logout-btn { width: 40px !important; height: 40px !important; }
        }
      `}</style>

      {/* Page title */}
      <div className="jsp-section" style={{ marginBottom: 48 }}>
        <div className="jsp-title-row" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div className="jsp-title-bar" style={{ width: 4, height: 28, background: T.accent }} />
          <h1 className="jsp-title" style={{
            margin: 0, fontSize: 22, fontWeight: 900,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: T.text,
          }}>Journal Settings</h1>
        </div>
        <p className="jsp-subtitle" style={{
          margin: '0 0 0 18px', fontSize: 11, color: T.textMuted,
          letterSpacing: '0.06em',
        }}>
          Personalise your trading environment — theme and typography changes apply instantly.
        </p>
      </div>

      {/* ── THEME ─────────────────────────────────────────── */}
      <Section label="Theme" T={T}>
        <div className="jsp-grid-themes" style={{
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
        <div className="jsp-grid-fonts" style={{
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
                className="jsp-font-card"
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
                <div className="jsp-font-sample" style={{
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
        <div className="jsp-preview-card" style={{
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
          <div className="jsp-preview-title" style={{
            fontSize: 24, fontWeight: 800, color: T.text,
            letterSpacing: '0.04em', lineHeight: 1.2, marginBottom: 10,
          }}>Trading Journal</div>
          <div style={{
            fontSize: 12, color: T.textMuted,
            lineHeight: 1.6, letterSpacing: '0.02em', marginBottom: 18,
          }}>
            The quick brown fox jumps over the lazy dog. 0123456789 +$1,234.56 −$987.00
          </div>
          <div className="jsp-preview-stats" style={{ display: 'flex', gap: 8 }}>
            {[['P&L', '+$1,234', T.accent], ['WIN RATE', '67%', '#34d399'], ['TRADES', '42', T.text]].map(([label, val, color]) => (
              <div key={label} className="jsp-preview-stat" style={{
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

      {/* ── JOURNAL FORM PANELS ───────────────────────────── */}
      <Section label="Journal Form Panels" T={T}>
        <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 20, letterSpacing: '0.03em', lineHeight: 1.6 }}>
          Mute panels you don't use. Muted panels are hidden from the journal form. Critical panels (marked&nbsp;
          <span style={{ color: T.accent, fontWeight: 700 }}>required</span>) cannot be hidden.
        </p>
        {[1, 2, 3, 4].map(step => {
          const stepPanels = JOURNAL_PANELS.filter(p => p.step === step);
          const stepLabel = stepPanels[0]?.stepLabel ?? '';
          return (
            <div key={step} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textMuted, marginBottom: 10 }}>
                Step {step} — {stepLabel}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stepPanels.map(panel => {
                  const hidden = hiddenPanels.includes(panel.id);
                  const disabled = !!panel.critical;
                  return (
                    <div
                      key={panel.id}
                      onClick={() => !disabled && onTogglePanel(panel.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: T.surface,
                        border: `1px solid ${hidden ? T.border : T.border}`,
                        borderRadius: 8,
                        cursor: disabled ? 'default' : 'pointer',
                        opacity: disabled ? 0.55 : 1,
                        transition: 'opacity 0.15s',
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: hidden ? T.textMuted : T.text, fontWeight: 600, letterSpacing: '0.02em' }}>
                          {panel.label}
                        </span>
                        {panel.critical && (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.accent, padding: '1px 6px', border: `1px solid ${T.accent}40`, borderRadius: 4 }}>
                            required
                          </span>
                        )}
                      </div>
                      {/* Toggle switch */}
                      <div style={{
                        position: 'relative', width: 36, height: 20, flexShrink: 0,
                        background: (!hidden && !disabled) ? T.accent : T.border,
                        borderRadius: 10, transition: 'background 0.2s',
                      }}>
                        <div style={{
                          position: 'absolute', top: 3, left: hidden || disabled ? 3 : 19,
                          width: 14, height: 14, borderRadius: '50%',
                          background: '#fff', transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Section>

      {/* ── AI MODEL ──────────────────────────────────────── */}
      <Section label="AI Vision Model" T={T}>
        <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 20, letterSpacing: '0.03em', lineHeight: 1.6 }}>
          Choose which Gemini model is used when analysing trade screenshots. Preview models may require a paid API tier.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GEMINI_MODELS.map(m => {
            const active = screenshotModel === m.id;
            return (
              <button
                key={m.id}
                onClick={() => { setScreenshotModel(m.id); writeScreenshotModel(m.id); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: active ? `${T.accent}14` : T.surface,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  borderRadius: 9,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = T.bg; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = T.surface; } }}
              >
                <span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: active ? T.accent : T.text, letterSpacing: '0.02em' }}>{m.label}</span>
                  <span style={{ display: 'block', fontSize: 10, color: T.textMuted, marginTop: 2 }}>{m.desc}</span>
                </span>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: active ? T.accent : 'transparent',
                  border: `2px solid ${active ? T.accent : T.textMuted}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}>
                  {active && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── ACCOUNT — sign out ────────────────────────────── */}
      {user && (
        <Section label="Account" T={T}>
          <div className="jsp-logout-card" style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: T.text,
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
              }}>Sign out</div>
              <div style={{
                fontSize: 11, color: T.textMuted, letterSpacing: '0.02em',
                lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                You will be returned to the homepage. Your session data stays safe.
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="jsp-logout-btn"
              title={signingOut ? 'Signing out…' : 'Logout'}
              aria-label={signingOut ? 'Signing out' : 'Logout'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none', borderRadius: '50%',
                width: 44, height: 44, padding: 0,
                cursor: signingOut ? 'wait' : 'pointer',
                opacity: signingOut ? 0.6 : 1,
                transition: 'opacity 0.15s, transform 0.15s, box-shadow 0.15s',
                fontFamily: 'inherit',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(239,68,68,0.25)',
              }}
              onMouseEnter={e => { if (!signingOut) { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(239,68,68,0.4)'; } }}
              onMouseLeave={e => { if (!signingOut) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(239,68,68,0.25)'; } }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                <line x1="12" y1="2" x2="12" y2="12"/>
              </svg>
            </button>
          </div>
        </Section>
      )}

    </div>
  );
}
