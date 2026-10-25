# Monthly Drawdown: open a month to see each traded date as W / L / BE

## Context

His instruction: *"Drawdown by month should have a drop that shows all traded dates and outcome just
like the calendar does but not with money. They should display L for loss in that date and W for win
in that date and BE for breakeven."*

He ticked the month rows in the Monthly Drawdown table (MAY/2023 … DEC/2025). Today each month is a
single line of percentages; there is no way to see WHICH days inside it won or lost. The calendar
already shows exactly that, in colour, with money — he wants the same day-by-day picture here, as
letters, without the amounts.

**Intended outcome:** click a month in Monthly Drawdown and it expands to list every date that was
traded in that month, each marked **W**, **L** or **BE**. No money anywhere in it.

## ARCHITECTURE (Phase 1)

| file | role |
|---|---|
| `client/src/components/DrawdownPanel.tsx:498-534` | the Monthly Drawdown table. **The only file that changes.** |
| `client/src/components/TradingCalendar.tsx` | the calendar he is comparing to — the day shape, the win/loss/breakeven rule and the colours all already live here |
| `server/python/calendar_calculator.py:107-139` | builds the per-day data; **nothing server-side changes** |

**The data already exists and needs no new endpoint.** `/api/calendar/compute` returns
`calendarData`, keyed `"{year}-{month}"` with month as a real 1-12 number, each holding
day-of-month -> `{ pnl, trades, wins, losses, winRate }` for EVERY month, not just the one on screen.
That is the same call the calendar makes, so reusing its React Query key
`['/api/calendar/compute', sessionId]` is a **cache hit** whenever he has opened the calendar.

**The month key is derivable** from what the table already has: the row carries `m.month` as a short
name ("May") and `m.year`, and `MONTH_ABBR` is already defined at `DrawdownPanel.tsx:27`, so
`MONTH_ABBR.indexOf(m.month) + 1` gives the number the calendar keys on.

## TASKS (Phase 2)

1. **Fetch the day data** in `DrawdownPanel` with the SAME query key the calendar uses, `enabled`
   only once a month has been opened, so a user who never expands a row pays nothing.
2. **Make each month row clickable** — a chevron in the Month cell, keyboard reachable, with
   `aria-expanded`. One month open at a time.
3. **The detail row**: a single `<tr>` spanning all seven columns, listing the traded dates of that
   month in order, each as `17 W`, `18 L`, `22 BE`.
   - **W / L / BE is decided by the day's NET profit or loss**, the same rule and the same half-cent
     tolerance the calendar uses (`FLAT_EPS = 0.005`, `toneOf` in `TradingCalendar.tsx:66`) — so a
     day that nets to zero out of a +100 and a -100 reads BE here exactly as it does there.
     Otherwise the two screens would disagree about the same day, which is worse than neither.
   - **Colours reused, not invented**: green `--gain`, red `--loss`, amber `--warn` are already the
     drawdown page's own tokens, and `--warn` is already the breakeven colour on both screens per his
     2026-08-29 instruction.
   - **Days with no trades are simply absent** — he asked for "all traded dates", not a grid.
4. **A month with no day data says so** in one quiet line rather than opening empty.

## WHAT MUST NOT CHANGE

⚠ `DrawdownPanel.tsx:500` carries a standing instruction of his, 2026-09-27: *"dont change how
Monthly Drawdown / Dominant Cause per Month is displayed"* — its columns, rows, text and background
all stay. This change is **additive only**: the seven columns, their values, the dot, the LIVE badge
and the table's styling are untouched. The only new thing on a collapsed table is a chevron.

**No money in the dropdown**, explicitly. Not the day's P&L, not a total — he asked for the outcome
letters and nothing else, and the figures are already one click away in the calendar.

## VERIFICATION

1. **The letters match the calendar, day for day.** Open a month here and the same month in the
   calendar: every date the calendar shows green must be **W** here, red must be **L**, breakeven
   must be **BE**. Same session. A disagreement is the one failure that matters.
2. **A breakeven day is proven**, not assumed — find or construct a day whose trades net to zero and
   confirm it reads BE on both screens.
3. **No money appears** anywhere in the expanded row.
4. **The collapsed table is pixel-unchanged** apart from the chevron: compare a screenshot before
   and after against his 27 Sep instruction.
5. **It costs nothing when unused** — confirm no calendar request is made until a month is opened,
   and that opening one is served from cache when the calendar has already been viewed.
6. **Keyboard and empty states**: a month opens with Enter/Space, and a month with no stored days
   shows the quiet line rather than a blank gap.
7. `npx tsc --noEmit`, build, deploy, then open it on the live journal.
