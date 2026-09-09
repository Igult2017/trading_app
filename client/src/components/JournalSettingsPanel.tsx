import { useState } from 'react';
import { THEMES, FONTS, JOURNAL_PANELS } from '@/hooks/useJournalSettings';
import type { ThemeId, FontId } from '@/hooks/useJournalSettings';
import { useAuth } from '@/context/AuthContext';
import AppearanceSection from './journal-settings/AppearanceSection';
import PanelsSection from './journal-settings/PanelsSection';
import AccountSection from './journal-settings/AccountSection';

interface Props {
  theme: ThemeId;
  font: FontId;
  onThemeChange: (t: ThemeId) => void;
  onFontChange: (f: FontId) => void;
  hiddenPanels: string[];
  onTogglePanel: (id: string) => void;
}

type SectionId = 'appearance' | 'form' | 'account';

/**
 * The journal's settings, rebuilt as a settings PAGE — his instruction, 2026-09-09:
 * *"Rebuild as settings page for journal form"*.
 *
 * WHAT IT WAS. One column, ~530 lines in a single file, five blocks stacked end to end: theme,
 * typography, a preview, the form panels, then the account. Everything was on screen at once and
 * nothing was grouped, so the page had no shape — you scrolled past three unrelated decisions to
 * reach the one you came for, and the live preview sat at the bottom, out of sight of the swatches
 * it was previewing.
 *
 * WHAT IT IS NOW. A section list on the left, one section at a time on the right, and a status line
 * that always says what is currently applied. The preview is sticky inside Appearance, so the
 * control and its result are visible together. The three sections live in their own files
 * (`journal-settings/`), which is also what brings each one inside the 200-line limit — this file
 * was more than two and a half times it.
 *
 * The props are unchanged on purpose: `AdminPanel.tsx` is the only caller and did not have to move.
 */
export default function JournalSettingsPanel({
  theme, font, onThemeChange, onFontChange, hiddenPanels, onTogglePanel,
}: Props) {
  const T = THEMES[theme];
  const { user } = useAuth();
  const [section, setSection] = useState<SectionId>('appearance');

  // ONE face, the selected one — what the journal itself does (`Journal.tsx:1041` forces `F.stack`
  // on everything except four panels that own their typography). Deliberately NOT `bodyStack`:
  // that is the Drawdown panel's companion, and reading it here put this page in Montserrat while
  // the journal around it stayed Playfair.
  const face = FONTS[font].stack;

  const hidden = JOURNAL_PANELS.filter(p => hiddenPanels.includes(p.id)).length;
  const nav: { id: SectionId; label: string; note: string }[] = [
    { id: 'appearance', label: 'Appearance',   note: `${THEMES[theme].label} · ${FONTS[font].label}` },
    { id: 'form',       label: 'Journal form', note: hidden ? `${hidden} panel${hidden === 1 ? '' : 's'} hidden` : 'All panels showing' },
    ...(user ? [{ id: 'account' as SectionId, label: 'Account', note: 'Name and sign out' }] : []),
  ];

  return (
    <div className="jsp-root" style={{
      maxWidth: 1120, margin: '0 auto', padding: '40px 32px 64px',
      color: T.text, fontFamily: face,
    }}>
      <style>{`
        .jsp-nav-btn:hover { background: ${T.surface} !important; }
        @media (max-width: 900px) {
          .jsp-layout { grid-template-columns: 1fr !important; gap: 20px !important; }
          .jsp-nav { position: static !important; display: flex !important; overflow-x: auto !important; gap: 8px !important; }
          .jsp-nav-btn { flex: 0 0 auto !important; }
          .jsp-nav-note { display: none !important; }
        }
        @media (max-width: 640px) {
          .jsp-root { padding: 20px 14px 40px !important; }
          .jsp-title { font-size: 22px !important; }
          .jsp-grid-themes { grid-template-columns: repeat(2, 1fr) !important; }
          .jsp-grid-fonts  { grid-template-columns: repeat(2, 1fr) !important; }
          .jsp-preview-stats { flex-wrap: wrap !important; }
          .jsp-preview-stat { flex: 1 1 40% !important; }
          .jsp-preview-sticky { position: static !important; }
        }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <div style={{ width: 4, height: 30, background: T.accent, borderRadius: 2 }} />
          <h1 className="jsp-title" style={{
            margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '0.01em',
            lineHeight: 1.1, color: T.text,
          }}>Journal Settings</h1>
        </div>
        <p style={{
          margin: '0 0 0 18px', fontSize: 13, color: T.textMuted,
          lineHeight: 1.6, maxWidth: 620,
        }}>
          Personalise your trading environment — every change here applies instantly.
        </p>
      </div>

      <div className="jsp-layout" style={{ display: 'grid', gridTemplateColumns: '212px 1fr', gap: 28, alignItems: 'start' }}>
        {/* Section list. Sticky on desktop, a scrolling row of tabs on narrow screens. */}
        <nav className="jsp-nav" aria-label="Settings sections"
             style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {nav.map(item => {
            const on = section === item.id;
            return (
              <button key={item.id} className="jsp-nav-btn" onClick={() => setSection(item.id)}
                aria-current={on ? 'page' : undefined}
                style={{
                  textAlign: 'left', cursor: 'pointer', borderRadius: 10,
                  padding: '11px 14px', outline: 'none',
                  background: on ? `${T.accent}14` : 'transparent',
                  border: `1px solid ${on ? T.accent : 'transparent'}`,
                  color: on ? T.text : T.textMuted,
                  fontFamily: 'inherit', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 700 : 600, letterSpacing: '0.01em' }}>
                  {item.label}
                </span>
                <span className="jsp-nav-note" style={{ display: 'block', marginTop: 3, fontSize: 11, color: T.textMuted }}>
                  {item.note}
                </span>
              </button>
            );
          })}
        </nav>

        <div style={{ minWidth: 0 }}>
          {section === 'appearance' && (
            <AppearanceSection theme={theme} font={font} T={T} face={face}
              onThemeChange={onThemeChange} onFontChange={onFontChange} />
          )}
          {section === 'form' && (
            <PanelsSection hiddenPanels={hiddenPanels} onTogglePanel={onTogglePanel} T={T} face={face} />
          )}
          {section === 'account' && <AccountSection T={T} face={face} />}
        </div>
      </div>
    </div>
  );
}
