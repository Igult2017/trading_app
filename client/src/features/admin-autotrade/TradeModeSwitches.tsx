import { Loader2, MessageSquareText, Power, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { C, FONT } from '@/components/admin-ui/tokens';
import { Panel } from '@/components/admin-ui/AdminUI';
import { nextMode, useTradeMode, type TradeMode } from './useTradeMode';

/**
 * THE TWO SWITCHES — Autotrade and DM confirmation (16 Nov 2026). Only one can be on: turning one on
 * turns the other off, and both off means nothing is placed (every setup is still recorded below).
 */
const ROWS: { which: 'auto' | 'confirm'; title: string; on: string; off: string; Icon: typeof Power }[] = [
  { which: 'auto', title: 'Autotrade', Icon: Power,
    on: 'Placing every qualified signal by itself. Signals outside its pairs, strategies or hours come to your Telegram DM as Confirm cards.',
    off: 'Off. Qualified signals are not placed automatically.' },
  { which: 'confirm', title: 'DM confirmation', Icon: MessageSquareText,
    on: "Each qualified signal is sent to your Telegram DM, including ones outside autotrade's pairs, strategies or hours (marked so). Confirm places it; Reject or no answer places nothing.",
    off: 'Off. No signals are sent to your DM for confirmation.' },
];

function stamp(at: string | null, by: string | null): string {
  if (!at) return '';
  const when = new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `Last changed ${when}${by ? ` by ${by}` : ''}.`;
}

export default function TradeModeSwitches() {
  const { state, loading, error, saving, saveError, setMode, test, sendTestCard } = useTradeMode();
  const mode: TradeMode | null = state?.mode ?? null;

  return (
    <Panel title="Trading switches" hint="Only one can be on at a time. With both off, nothing is placed.">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {ROWS.map(({ which, title, on, off, Icon }, i) => {
          const checked = mode === which;
          const id = `trade-mode-${which}`;
          return (
            <div key={which} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px',
              borderTop: i ? `1px solid ${C.border}` : 'none',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: checked ? C.accentSoft : C.thead, color: checked ? C.indigo : C.muted,
              }}>
                <Icon size={18} aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor={id} style={{ display: 'block', fontFamily: FONT, fontSize: 15, fontWeight: 600, color: C.text, cursor: 'pointer' }}>
                  {title} <span style={{ fontWeight: 500, color: checked ? C.green : C.muted }}>· {checked ? 'ON' : 'OFF'}</span>
                </label>
                <p style={{ margin: '4px 0 0', fontFamily: FONT, fontSize: 14, color: C.muted }}>
                  {loading ? 'Loading…' : checked ? on : off}
                </p>
              </div>
              {saving ? <Loader2 size={16} className="animate-spin" aria-label="Saving" style={{ color: C.muted }} /> : null}
              <Switch
                id={id}
                checked={checked}
                disabled={loading || saving || !!error}
                onCheckedChange={(v) => setMode(nextMode(which, v))}
                aria-label={`${title} ${checked ? 'on' : 'off'}`}
                className="transition-all duration-200"
              />
            </div>
          );
        })}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '16px 24px',
          borderTop: `1px solid ${C.border}`,
        }}>
          <p style={{ flex: '1 1 240px', margin: 0, fontFamily: FONT, fontSize: 14,
                      color: test === 'failed' ? C.red : C.muted }}
             role={test === 'failed' ? 'alert' : undefined} aria-live="polite">
            {test === 'sent' ? 'Test card on its way to your Telegram DM (within a few seconds). Press Confirm or Reject on it — the answer comes back under the card. Nothing is placed.'
              : test === 'failed' ? 'The test card could not be requested. Nothing was sent; try again.'
              : 'Check the Confirm / Reject chain end to end with a test card. It never places a trade.'}
          </p>
          <Button variant="outline" size="sm" onClick={sendTestCard} disabled={test === 'sending'}
                  className="transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90"
                  // The panel's own palette, so the button follows its light / dark themes.
                  style={{ background: C.card, color: C.text, borderColor: C.border2, fontFamily: FONT }}
                  aria-label="Send a test confirmation card to your Telegram DM">
            {test === 'sending' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            {test === 'sending' ? 'Sending…' : 'Send a test card'}
          </Button>
        </div>
        {(error || saveError || state?.updatedAt) ? (
          <p role={error || saveError ? 'alert' : undefined} style={{
            margin: 0, padding: '12px 24px 16px', fontFamily: FONT, fontSize: 13,
            color: error || saveError ? C.red : C.muted, borderTop: `1px solid ${C.border}`,
          }}>
            {error ? `Could not read the switches (${error}). Refresh the page to try again; nothing has changed.`
              : saveError ?? stamp(state?.updatedAt ?? null, state?.updatedBy ?? null)}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
