# PLAN - Drawdown ledger: match his mock-up exactly (follow-up to the approved rebuild)

## Phase 1 - Architecture
He pointed at the Monthly Drawdown Ledger and asked whether it was included. It is
(client/src/components/drawdown/ddMonthly.tsx) but two details drifted from his mock-up:

| | his mock-up | what I shipped |
|---|---|---|
| subtitle | Historical drawdown performance by calendar month | Dominant cause per month - open a row for its traded days |
| month cell | amber triangle BEFORE the month, no dot | coloured dot before, triangle after |

His instruction for this whole piece of work was "dont redesign it, you only recreate in react", so
his copy and his cell layout win.

Files: client/src/components/drawdown/ddMonthly.tsx (subtitle + month cell)
       client/src/components/drawdown/ddStyles2.ts (.dd-mchev restyled; .dd-mdot removed if orphaned)

## Phase 2 - Tasks
1. Subtitle back to his exact words.
2. Month cell to his shape: triangle first, then MONTH/YEAR. Drop the separate dot.
   KEEP the dominant-cause information by TINTING that triangle (bad=red, good=green, else amber)
   rather than deleting a signal the old panel carried. Flag it; flat amber on request.
3. Delete the now-unused .dd-mdot rule (dead code rule).
4. Re-run: tsc, ddStyles.test.ts, Playwright screenshot of the ledger in both themes.

## Phase 3 - Execute: in order, one at a time.

## Phase 4 - Health check
tsc clean; ddStyles.test.ts 15/15; screenshot compared against his image.

## NOT in scope
Any other section; the data; the Python; the server.
