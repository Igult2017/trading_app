import React from 'react';
import { MonthDays, monthDayCells } from '@/components/drawdown/monthDays';
import { fmtDd, MONTH_ABBR } from '@/components/drawdown/ddBits';

/**
 * ddMonthly — "Monthly Drawdown Ledger", from his 2026-11-03 mock-up.
 *
 * ⚠ THIS SECTION CARRIED AN EXPLICIT "DO NOT CHANGE" FROM 2026-09-27 — *"dont change how Monthly
 * Drawdown / Dominant Cause per Month is displayed"* — and his new mock-up changes it. It is rebuilt
 * to the new design because he supplied that design and asked for it recreated, and because the
 * change turns out to be small: the SAME seven figures, with the LIVE badge promoted from an inline
 * pill to its own Status column and the headings reworded. No column of data was dropped.
 *
 * ⚠ THE DAY-BY-DAY EXPANDER IS KEPT, and his mock-up has no such thing. He asked for it on
 * 2026-10-25 — *"display all the dates in that month and only label as w or L those that were
 * traded"* — so dropping it to match the mock-up would have deleted a feature he specifically
 * requested. `monthDays.tsx` is reused unchanged.
 *
 * The carry-forward column is ported verbatim from the old panel: red months accumulate the deficit
 * across as many consecutive reds as it takes, a green month pays it down, and only the surplus
 * ABOVE the prior peak counts as that month's return.
 */
export function ddCarryForward(months: any[]): { ret: number | null; cf: number }[] {
  let carry = 0;                       // running deficit (<= 0), starts at the high-water mark
  return months.map((m: any) => {
    const r = m.equityGrowthPct;
    if (r == null) return { ret: null, cf: carry };   // no data this month; deficit unchanged
    const combined = carry + r;
    if (combined >= 0) { carry = 0; return { ret: combined, cf: 0 }; }  // recovered → surplus above peak
    carry = combined;
    return { ret: r, cf: combined };   // still underwater → raw return, carry the deficit
  });
}

/**
 * Always surface the CURRENT calendar month, even before it has trades, so it can be watched as it
 * builds. Ported from the old panel.
 */
export function ddDisplayMonths(monthly: any[], now = new Date()): any[] {
  const curMon = now.toLocaleString('en-US', { month: 'short' });
  const curYr = now.getFullYear();
  const last = monthly[monthly.length - 1];
  const hasCurrent = !!last && last.month === curMon && last.year === curYr;
  return (monthly.length > 0 && !hasCurrent)
    ? [...monthly, { month: curMon, year: curYr, equityGrowthPct: 0, totalTrades: 0, lossCount: 0,
                     maxDdPct: 0, biggestLossPct: 0, recoveryPct: 0, dominantCauseClass: 'neutral', avgRr: 'N/A' }]
    : monthly;
}

export function DdMonthly({
  monthly, openMonth, onToggleMonth, calendarData,
}: {
  monthly: any[]; openMonth: string | null;
  onToggleMonth: (key: string | null) => void; calendarData: any;
}) {
  if (!monthly || monthly.length === 0) return null;

  const now = new Date();
  const curMon = now.toLocaleString('en-US', { month: 'short' });
  const curYr = now.getFullYear();
  const months = ddDisplayMonths(monthly, now);
  const cf = ddCarryForward(months);

  const years: number[] = monthly.map((m: any) => m.year);
  const range = years.length === 0 ? '' : years[0] === years[years.length - 1]
    ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`;

  return (
    <section className="dd-card dd-stack">
      <div className="dd-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 className="dd-title">Monthly Drawdown Ledger{range ? ` · ${range}` : ''}</h3>
          <p className="dd-muted">Dominant cause per month — open a row for its traded days</p>
        </div>
        <span className="dd-mono fs-xs c-emerald fw-semi"
              style={{ background: 'var(--t-emerald-10)', border: '1px solid var(--t-emerald-20)',
                       padding: '4px 12px', borderRadius: 9999 }}>
          Active Period: {curMon.toUpperCase()}/{curYr}
        </span>
      </div>

      <div className="dd-twrap">
        <table>
          <thead>
            <tr>
              <th>Month</th><th>Status</th><th>Return</th><th>Rec. Factor</th>
              <th>Max DD</th><th>Big Loss</th><th>Loss Contribution</th>
              <th className="dd-right">CF (Carried Forward)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m: any, i: number) => {
              const isLive = m.month === curMon && m.year === curYr;
              const ret = cf[i].ret;
              const cfVal = cf[i].cf;
              const cfStr = cfVal < 0 ? `${cfVal.toFixed(2)}%` : '0.00%';
              const retStr = ret == null ? '—' : ret === 0 ? '0.00%' : `${ret > 0 ? '+' : ''}${ret.toFixed(2)}%`;
              const retCls = ret == null ? 'c-dim' : ret > 0 ? 'c-emerald' : ret < 0 ? 'c-rose' : 'c-dim';
              const dot = m.dominantCauseClass === 'bad' ? 'var(--rose)'
                        : m.dominantCauseClass === 'good' ? 'var(--emerald)' : 'var(--amber)';
              const monthIdx = MONTH_ABBR.indexOf(m.month);
              const mKey = `${m.year}-${monthIdx + 1}`;
              const isOpen = openMonth === mKey;
              const cells = isOpen ? monthDayCells(calendarData, m.year, monthIdx) : [];
              const anyTraded = cells.some((c) => c.mark);
              const toggle = () => onToggleMonth(isOpen ? null : mKey);

              return (
                <React.Fragment key={`${m.month}-${m.year}`}>
                  <tr className="dd-rowhover dd-mrow" onClick={toggle} tabIndex={0} role="button"
                      aria-expanded={isOpen}
                      aria-label={`${m.month} ${m.year} — show the days traded`}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                      style={isLive ? { background: 'var(--t-blue-10)' } : undefined}>
                    <td>
                      <span className="dd-mname">
                        <span className="dd-mdot" style={{ background: isLive ? 'var(--blue)' : dot }} aria-hidden />
                        <span className="c-strong fw-bold">{m.month.toUpperCase()}/{m.year}</span>
                        <span aria-hidden className={`dd-mchev ${isOpen ? 'open' : ''}`}>▶</span>
                      </span>
                    </td>
                    <td>{isLive
                      ? <span className="dd-pill dd-pill-emerald">LIVE</span>
                      : <span className="c-faint">Closed</span>}</td>
                    <td className={`fw-bold fs-sm ${retCls}`}>{retStr}</td>
                    <td className="c-ink fw-semi">{Math.round(Number(m.recoveryPct) || 0)}%</td>
                    <td className={Number(m.maxDdPct) === 0 ? 'c-dim' : 'c-rose fw-bold'}>{fmtDd(m.maxDdPct)}</td>
                    <td className={Number(m.biggestLossPct) === 0 ? 'c-dim' : 'c-rose fw-bold'}>{fmtDd(m.biggestLossPct)}</td>
                    <td className="c-soft">{m.lossCount} / {m.totalTrades} trades</td>
                    <td className={`dd-right fw-semi ${cfStr === '0.00%' ? 'c-dim' : 'c-rose'}`}>{cfStr}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} style={{ padding: '10px 2px 14px' }}>
                        {!anyTraded
                          ? <span className="dd-empty">No day-by-day record stored for this month.</span>
                          : <MonthDays cells={cells} label={m.month} />}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
