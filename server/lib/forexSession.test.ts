/**
 * forexSession.test.ts — run with:
 *     npx tsx server/lib/forexSession.test.ts
 *
 * WHICH SESSION A TRADE WAS IN, pinned against known instants.
 *
 * His question, 2026-10-26, was whether session recording is accurate. The *reading* rule turned
 * out to be the sound part — one daylight-saving-aware labeller shared by the synced-trade path and
 * the manual one — but nothing asserted it, so nothing would have caught it drifting. These are the
 * checks that were missing.
 *
 * ⚠ THE DATES MATTER AS MUCH AS THE HOURS. Every instant below is given twice, once in January and
 * once in July, because the whole point of this labeller is that the sessions MOVE: London is
 * UTC+0 in winter and UTC+1 in summer, New York UTC-5 then UTC-4, Sydney UTC+11 then UTC+10. A
 * fixed table of UTC hours — which is what the screenshot reader was being handed until this change
 * — cannot be right in both halves of the year.
 */
import { sessionAt } from './forexSession';
import { canonicalSession } from '../../shared/sessions';

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}`
              + (ok ? '' : `, want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

/** The session a trade at this instant is filed under — the same two steps the journaller takes. */
function label(iso: string): string | null {
  const r = sessionAt(new Date(iso));
  return r ? (canonicalSession(r.sessionName) ?? null) : null;
}

console.log('\nWHICH SESSION WAS THIS TRADE IN\n');

// ── WINTER (GMT / EST / AEDT) ───────────────────────────────────────────────────────────
check('09:00 UTC in January is London',        label('2026-01-14T09:00:00Z'), 'London');
check('14:00 UTC in January is the overlap',   label('2026-01-14T14:00:00Z'), 'Overlap');
check('02:00 UTC in January is Tokyo',         label('2026-01-14T02:00:00Z'), 'Tokyo');
check('19:00 UTC in January is New York',      label('2026-01-14T19:00:00Z'), 'New York');
// ⚠ THE HOURS THE OLD SCREENSHOT TABLE GOT WRONG. It called 07:00 London (London opens 08:00 GMT),
// and 16:00 New York when London is open until 17:00 — so it was the overlap.
check('07:00 UTC in January is Tokyo, NOT London', label('2026-01-14T07:00:00Z'), 'Tokyo');
check('16:30 UTC in January is the overlap, NOT New York alone',
      label('2026-01-14T16:30:00Z'), 'Overlap');

// ── SUMMER (BST / EDT / AEST) — the same clock times land differently ────────────────────
check('07:00 UTC in July IS London, because London is UTC+1 then',
      label('2026-07-15T07:00:00Z'), 'London');
check('16:30 UTC in July is New York, because London has already closed',
      label('2026-07-15T16:30:00Z'), 'New York');
check('12:30 UTC in July is the overlap',      label('2026-07-15T12:30:00Z'), 'Overlap');

// ── THE LABELS ARE THE ONES THE REST OF THE APP USES ────────────────────────────────────
// `sessionAt` returns "Overlap"; the synced journaller used to translate that to
// "LONDON/NY OVERLAP" and the form wrote "Overlap", so the same session was counted twice.
for (const iso of ['2026-01-14T09:00:00Z', '2026-01-14T14:00:00Z', '2026-07-15T02:00:00Z']) {
  const raw = sessionAt(new Date(iso))!.sessionName;
  check(`"${raw}" is already a kept spelling — no translation needed`,
        canonicalSession(raw), raw === 'Overlap' ? 'Overlap' : canonicalSession(raw));
  check(`...and folding it changes nothing`, canonicalSession(raw), raw);
}

// ── A TIME THAT BELONGS TO NO SESSION IS NOT GUESSED ────────────────────────────────────
// This is what used to be filed as SYDNEY by the synced path while the manual path left it blank.
check('a broken date is refused rather than labelled', label('not-a-date'), null);

console.log();
if (fail) { console.log(`${fail} of ${pass + fail} FAILED`); process.exit(1); }
console.log(`ALL PASS (${pass} checks)`);
