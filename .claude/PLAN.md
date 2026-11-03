# PLAN - Calendar Actual: fix the title matcher (Part B of the approved plan)

## Phase 1 - Architecture
B1 is ANSWERED: the hourly pass DOES run. Production, 12:12 UTC:
  [calendarDb] released values: 3 filled, 3 no same-day event, 7 refused (no confident match)
So the machinery works; the matching does not. My earlier claim that the pass was not running was
wrong reasoning from a log window that predated boot - corrected.

Two causes, only one a bug:
 * "3 no same-day event" - those releases are dated 2026-11-02 and the calendar purges old rows
   (Low/Medium after 24h, High after 48h). Nothing to attach to. EXPECTED, not a fault.
 * "7 refused" - THE BUG. releasedMatch.similarity divides shared words by the SHORTER title, so a
   short title scores a perfect 1.0 against every longer title containing its words:
     TE "S&P Global Manufacturing PMI Final" -> {manufacturing, pmi}
        vs FF "Final Manufacturing PMI" {manufacturing, pmi}      = 1.0
        vs FF "ISM Manufacturing PMI"   {ism, manufacturing, pmi} = 1.0
   A tie, so pickMatch refuses BOTH. The second is plainly worse - it has a word left over the
   release never mentions.

Files: server/services/releasedMatch.ts  (add coverage(); use it ONLY to break a tie)
       server/services/__tests__/releasedMatch.check.ts (add the real 2026-11-03 cases)

## Phase 2 - Tasks
1. coverage() = shared / LONGER title. Consulted only when similarity ties, so the MIN_SCORE
   threshold behaviour is untouched.
2. pickMatch sorts by (score, then coverage) and refuses only when the runner-up ties on BOTH.
3. Add the real production pairs to the existing check file. MUST NOT BREAK the case that matters
   most: two released series claiming ONE stored row store NEITHER (that guard lives in
   resolveClaims, not pickMatch, so it is unaffected - verify it still passes).
4. Deploy, then confirm in the log that "filled" rises and "refused" falls.
5. THEN check the rate-limit numbers from the earlier deploy against the recorded baseline
   (116 BLOCKED_PAYLOAD_TYPE and 161 quote-compare in 35 min = 3.31 and 4.60 per minute).

## Phase 3 - Execute: in order.

## Phase 4 - Health check
tsc clean; releasedMatch.check.ts passes INCLUDING its existing ambiguity guards; production log
shows more filled and fewer refused; a real Actual visible on the live calendar.

## NOT in scope
The purge window (the "no same-day event" rows are correct behaviour); the calendar's primary source.
