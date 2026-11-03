import React from 'react';
import { Activity, Calendar } from 'lucide-react';
import { periodOptions, type PeriodKey } from '@/components/drawdown/ddPeriods';

/**
 * ddHeader — the panel header, from the top of his 2026-11-03 mock-up.
 *
 * THREE DEPARTURES FROM THE MOCK-UP, all of them "fit it into the journal" rather than taste:
 *
 *  1. NOT STICKY, AND NOT A NAV BAR. The mock-up makes this a fixed page header; this is a panel
 *     inside Journal, which already draws the sticky chrome. Two stacked sticky bars would eat the
 *     viewport on a laptop.
 *  2. NO PRODUCT NAME. The mock-up's header reads "QuantJournal Pro Analytics". This app is
 *     DailyTradeBook, and inventing a second brand inside it is not a styling decision I should make
 *     silently — so the brand mark stays and the words go.
 *  3. THE ACCOUNT SELECTOR IS THE JOURNAL'S SESSION LIST, not a new concept. A trading session
 *     already owns the starting balance every drawdown percentage is measured against, and
 *     `sessionId` was already this panel's only input — so the dropdown he drew maps onto something
 *     real with no new model behind it.
 */
/** Shaped to `trading_sessions` so the journal's own list can be passed through with no mapping. */
export interface SessionOption { id: string; sessionName: string; startingBalance?: string | null }

function money(v?: string | null): string {
  const n = parseFloat(String(v ?? ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return ` (${n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })})`;
}

export function DdHeader({
  sessions, sessionId, onSessionChange, period, onPeriodChange, tradeCount,
}: {
  sessions: SessionOption[];
  sessionId?: string | null;
  onSessionChange?: (id: string) => void;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  tradeCount: number;
}) {
  const opts = periodOptions();
  return (
    <div className="dd-head">
      <div className="dd-brand">
        <div className="dd-brand-logo" aria-hidden>
          <Activity width={20} height={20} />
        </div>
        <div>
          <h2 className="dd-title" style={{ fontSize: 20 }}>Drawdown &amp; Risk Diagnostics</h2>
          <p className="dd-muted" style={{ marginTop: 2 }}>
            {tradeCount} trade{tradeCount === 1 ? '' : 's'} analysed from your journal
          </p>
        </div>
      </div>

      <div className="dd-controls">
        {/* ONE CONTROL, NOT TWO SOURCES OF TRUTH. Changing this calls the journal's own session
            handler, so the sidebar, the other panels and this dropdown can never disagree about
            which account is open. When the parent passes no handler the control is read-only
            rather than a dead input that silently does nothing. */}
        <div className="dd-ctl" style={{ padding: 4 }}>
          <label className="dd-mono fs-10 c-faint" htmlFor="dd-acct" style={{ padding: '0 4px' }}>ACCOUNT</label>
          <select id="dd-acct" value={sessionId ?? ''} disabled={!onSessionChange || sessions.length === 0}
                  onChange={(e) => onSessionChange?.(e.target.value)}>
            {sessions.length === 0 && <option value="">No sessions yet</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.sessionName}{money(s.startingBalance)}</option>
            ))}
          </select>
        </div>

        <div className="dd-ctl">
          <Calendar width={14} height={14} style={{ color: 'var(--amber)', flexShrink: 0 }} aria-hidden />
          <label className="dd-mono fs-10 c-faint" htmlFor="dd-period">PERIOD</label>
          <select id="dd-period" value={period}
                  onChange={(e) => onPeriodChange(e.target.value as PeriodKey)}>
            {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
