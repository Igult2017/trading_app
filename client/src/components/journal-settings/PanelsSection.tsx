import { JOURNAL_PANELS } from '@/hooks/useJournalSettings';
import type { ThemeDef } from '@/hooks/useJournalSettings';
import { Card, SectionHead, Toggle } from './ui';

/**
 * Which panels appear in the journal form, grouped by the step they belong to.
 *
 * WHAT CHANGED BEYOND THE LOOK. The rows now say how many panels in each step are switched off, and
 * the header says it for the whole form — so "what have I hidden?" is answerable at a glance instead
 * of by scrolling four groups and counting. The switch is a real `<button role="switch">` carrying
 * its state; it used to be a `<div>` with an onClick, which no keyboard could reach.
 *
 * A panel marked `critical` cannot be hidden. That is enforced here AND said out loud on the row,
 * rather than the control simply doing nothing when clicked.
 */
export default function PanelsSection({ hiddenPanels, onTogglePanel, T, face }: {
  hiddenPanels: string[];
  onTogglePanel: (id: string) => void;
  T: ThemeDef; face: string;
}) {
  const steps = [...new Set(JOURNAL_PANELS.map(p => p.step))].sort((a, b) => a - b);
  const hiddenCount = JOURNAL_PANELS.filter(p => hiddenPanels.includes(p.id)).length;
  const total = JOURNAL_PANELS.length;

  return (
    <div>
      <SectionHead T={T} font={face} title="Journal form"
        hint="Turn off the panels you do not use and they disappear from the journal form. Panels marked required hold the trade itself, so they stay." />

      {/* One line that answers "what have I hidden?" without scrolling. */}
      <Card T={T} style={{
        marginBottom: 16, padding: '14px 20px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, color: T.text, letterSpacing: '0.01em' }}>
          <strong style={{ fontWeight: 700 }}>{total - hiddenCount}</strong>
          <span style={{ color: T.textMuted }}> of {total} panels showing</span>
        </span>
        {hiddenCount > 0 && (
          <button type="button"
            onClick={() => JOURNAL_PANELS.filter(p => hiddenPanels.includes(p.id)).forEach(p => onTogglePanel(p.id))}
            style={{
              background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8,
              padding: '7px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: T.textMuted, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.textMuted; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}
          >Show all {hiddenCount} hidden</button>
        )}
      </Card>

      {steps.map(step => {
        const panels = JOURNAL_PANELS.filter(p => p.step === step);
        const stepLabel = panels[0]?.stepLabel ?? '';
        const off = panels.filter(p => hiddenPanels.includes(p.id)).length;
        return (
          <Card T={T} key={step} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '14px 20px', borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: T.textMuted,
              }}>Step {step}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: '0.01em' }}>
                {stepLabel}
              </span>
              {off > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textMuted }}>
                  {off} hidden
                </span>
              )}
            </div>

            <div>
              {panels.map((panel, i) => {
                const hidden = hiddenPanels.includes(panel.id);
                const locked = !!panel.critical;
                return (
                  <div key={panel.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '12px 20px',
                    borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                    opacity: locked ? 0.72 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, letterSpacing: '0.01em',
                        color: hidden ? T.textMuted : T.text,
                      }}>{panel.label}</span>
                      {locked && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: T.accent,
                          padding: '2px 8px', border: `1px solid ${T.accent}40`, borderRadius: 999,
                        }}>required</span>
                      )}
                    </div>
                    <Toggle
                      T={T}
                      on={locked ? true : !hidden}
                      disabled={locked}
                      label={`${panel.label} — ${locked ? 'always shown' : hidden ? 'hidden' : 'showing'}`}
                      onChange={() => { if (!locked) onTogglePanel(panel.id); }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
