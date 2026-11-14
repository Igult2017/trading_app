import { dayMark } from '@/lib/dayOutcome';

/**
 * THE DAYS INSIDE ONE MONTH OF THE MONTHLY DRAWDOWN TABLE — the whole month, with the traded dates
 * COLOURED by how the day ended (green win, red loss, the breakeven colour for BE) and the rest plain.
 *
 * ⚠ NO LETTERS SINCE 2026-11-15. It used to print W / L / BE beside each traded date (his 2026-10-25
 * ask). He circled "7 L" and asked: *"why dont we just make that date red and make win date green
 * but no writing of L or W or BE there."* The number itself carries the colour now; the word survives
 * only as each date's spoken label and hover text, so the outcome is not told by colour alone.
 *
 * ⚠ THE WHOLE MONTH, NOT ONLY THE TRADED DATES. The first version listed just the traded days as
 * chips, and he rejected it on sight (2026-10-25): *"Instead of creating it halfway like this lets
 * display all the dates in that month and only label as w or L those that were traded. This one
 * displays halfway and does not look good ... There is unused space and that design i propose will
 * use that space."* Nine chips left two thirds of the row empty. The full month fills it, and it
 * also answers a question the short list could not — which days he SAT OUT.
 *
 * ⚠ THE OUTCOME IS THE DAY'S NET, ON THE CALENDAR'S OWN TOLERANCE. `dayMark` is the single shared
 * rule (`lib/dayOutcome`), the same one TradingCalendar colours its days with, so a day that nets
 * to zero out of a +100 and a -100 reads BE on both screens. Two screens disagreeing about the
 * same date would be worse than showing neither.
 *
 * NO MONEY HERE, deliberately — he asked for the outcome and nothing else, and the amounts
 * are already one click away in the calendar.
 */
export type DayCell = { day: number; mark: 'W' | 'L' | 'BE' | null };

/** Every date in the month, marked where `/api/calendar/compute` recorded trades on it.
 *  `calendarData` is keyed "{year}-{month}" with month as a real 1-12 number and NO leading zero
 *  (`calendar_calculator.py` builds it as `f"{year}-{month}"`), then day-of-month as a string. */
export function monthDayCells(calendarData: any, year: number, monthIdx: number): DayCell[] {
  const days = calendarData?.[`${year}-${monthIdx + 1}`] ?? {};
  // Day 0 of the NEXT month is the LAST day of THIS one — 28, 29, 30 or 31, leap years included,
  // with no table of month lengths to get wrong.
  const total = new Date(year, monthIdx + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => {
    const rec = days[String(i + 1)];
    const traded = !!rec && Number(rec.trades ?? 0) > 0;
    return { day: i + 1, mark: traded ? dayMark(Number(rec.pnl ?? 0)) : null };
  });
}

const say = (m: DayCell['mark']) =>
  m === 'W' ? 'win' : m === 'L' ? 'loss' : m === 'BE' ? 'breakeven' : 'not traded';

/** The strip itself. `label` is the month name, used for each date's hover text and spoken label. */
export function MonthDays({ cells, label }: { cells: DayCell[]; label: string }) {
  return (
    <div className="mdays">
      {cells.map(({ day, mark }) => (
        <span key={day}
              className={`mday${mark ? ` t ${mark === 'W' ? 'w' : mark === 'L' ? 'l' : 'b'}` : ''}`}
              role="img" aria-label={`${label} ${day}, ${say(mark)}`} title={`${label} ${day} — ${say(mark)}`}>
          <span className="n">{day}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * ⚠ EVERY COLOUR HERE IS A PAGE TOKEN, never a literal. --gain, --loss, --warn and their tints are
 * the short names set in ddTokens.ts (ALIASES) for BOTH themes, so the strip follows light and dark.
 * (This comment used to point at a `.mtbl-sec` palette; that scope went in the 2026-11-03 redesign.)
 * --warn is the breakeven colour (his rule, 2026-08-29); on this page it resolves to the indigo
 * accent, because he banned yellow here.
 *
 * SIXTEEN COLUMNS, FIXED, rather than "as many as fit": a fixed count splits a 31-day month into
 * two near-equal rows (16 + 15) at every desktop width, where auto-fitting leaves a ragged tail
 * whose length changes as the window resizes. Eight columns on a narrow screen.
 */
export const MONTH_DAYS_CSS = `
.dp .mdays{display:grid;grid-template-columns:repeat(16,1fr);gap:4px;white-space:normal;}
.dp .mday{display:flex;align-items:baseline;justify-content:center;gap:5px;line-height:1.15;
  padding:6px 2px;border:1px solid var(--line);border-radius:3px;font-variant-numeric:tabular-nums;}
.dp .mday .n{font-size:12.5px;font-weight:600;color:var(--ink3);}
.dp .mday.t .n{font-weight:700;}
.dp .mday.w{background:var(--gain-d);} .dp .mday.w .n{color:var(--gain);}
.dp .mday.l{background:var(--loss-d);} .dp .mday.l .n{color:var(--loss);}
.dp .mday.b{background:var(--warn-d);} .dp .mday.b .n{color:var(--warn);}
@media(max-width:920px){.dp .mdays{grid-template-columns:repeat(8,1fr);}}
`;
