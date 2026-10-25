import { dayMark } from '@/lib/dayOutcome';

/**
 * THE DAYS INSIDE ONE MONTH OF THE MONTHLY DRAWDOWN TABLE — the whole month, with W / L / BE on
 * the dates that were traded and nothing on the dates that were not.
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
 * NO MONEY HERE, deliberately — he asked for the outcome letters and nothing else, and the amounts
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

/** The strip itself. `label` is the month name, used only for the hover text on each date. */
export function MonthDays({ cells, label }: { cells: DayCell[]; label: string }) {
  return (
    <div className="mdays">
      {cells.map(({ day, mark }) => (
        <span key={day}
              className={`mday${mark ? ` t ${mark === 'W' ? 'w' : mark === 'L' ? 'l' : 'b'}` : ''}`}
              title={`${label} ${day}${mark ? ` — ${mark === 'W' ? 'win' : mark === 'L' ? 'loss' : 'breakeven'}` : ' — not traded'}`}>
          <span className="n">{day}</span>
          {/* A NON-BREAKING SPACE, NOT AN EMPTY SPAN, on an untraded date: it holds the cell the
              same height as its neighbours without printing a mark he did not ask for. */}
          <span className="m">{mark ?? ' '}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * ⚠ EVERY COLOUR HERE IS THE MONTHLY SECTION'S OWN TOKEN, never a literal. That subtree is pinned
 * to its original palette (`.mtbl-sec`, his 2026-09-27 instruction), and it redeclares --gain,
 * --loss, --warn and their tints for BOTH themes — so reading them keeps this strip inside the
 * table's own colours in light and dark alike. --warn is already the breakeven colour on both
 * screens (his rule, 2026-08-29).
 *
 * SIXTEEN COLUMNS, FIXED, rather than "as many as fit": a fixed count splits a 31-day month into
 * two near-equal rows (16 + 15) at every desktop width, where auto-fitting leaves a ragged tail
 * whose length changes as the window resizes. Eight columns on a narrow screen.
 */
export const MONTH_DAYS_CSS = `
.dp .mdays{display:grid;grid-template-columns:repeat(16,1fr);gap:4px;white-space:normal;}
.dp .mday{display:flex;align-items:baseline;justify-content:center;gap:5px;line-height:1.15;
  padding:6px 2px;border:1px solid var(--line);border-radius:6px;font-variant-numeric:tabular-nums;}
.dp .mday .n{font-size:12px;font-weight:600;color:var(--ink3);}
.dp .mday .m{font-size:12px;font-weight:800;letter-spacing:.03em;}
.dp .mday.t .n{color:var(--ink);}
.dp .mday.w{background:var(--gain-d);} .dp .mday.w .m{color:var(--gain);}
.dp .mday.l{background:var(--loss-d);} .dp .mday.l .m{color:var(--loss);}
.dp .mday.b{background:var(--warn-d);} .dp .mday.b .m{color:var(--warn);}
@media(max-width:920px){.dp .mdays{grid-template-columns:repeat(8,1fr);}}
`;
