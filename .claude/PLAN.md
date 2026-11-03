# PLAN - Recovery Pattern sample size + the calendar's missing "Actual"

## Phase 1 - Architecture

### Part A - the Recovery Pattern claims a pattern from ONE trade
His live page shows "1.61x baseline risk" under a red "Behavioural Risk Detected" box, and its own
last line says "across 1 underwater trade". The NUMBER is real; the CONCLUSION is not supportable.

Cause: server/python/drawdown/recovery.py:55 returns early only when there are NO underwater trades
or NO baseline trades - one of each is enough. The verdict flips to "revenge risk" at :61 as soon as
the ratio passes 1.15.

Precedent in the same folder: montecarlo.py:61 refuses to project below 5 trades. Recovery is the
odd one out.

Files: server/python/drawdown/recovery.py          (add MIN_UNDERWATER, verdict "insufficient")
       client/src/components/drawdown/ddRiskCards.tsx (handle the 4th verdict; no red box)
       server/python/drawdown/test_recovery_sample.py (NEW)

### Part B - the calendar's Actual
CORRECTION to what I told him: Trading Economics is NOT unbuilt. It is built AND wired -
news_calendar.fetch_released_values() :950, homepageCalendar.refreshReleasedValues() :182,
scheduler.refreshNewsOutcomes() + a 2/5/10/15-min ladder. curl-cffi is ALREADY a dependency
(pyproject.toml:38) doing TLS impersonation past Cloudflare (_te_html :634-686) - the same technique
Scrapling's HTTP fetcher uses. So this is a BUILT feature producing nothing, not a missing one.

Evidence: 2,000 lines of production log show the ForexFactory scrape working (115 events saved) and
NOT ONE "[homepageCalendar] released values:" or "[news_calendar] TE USD: N released" line.
Suggestive, NOT proof - refreshNewsAlerts runs at minute 5 each hour (scheduler.ts:273).

## Phase 2 - Tasks, in order

PART A
1. recovery.py: MIN_UNDERWATER = 4. Below it, return the real figures but verdict="insufficient".
   Named constant with the reasoning beside it, not a magic number.
2. ddRiskCards.tsx: fourth case - ratio in neutral ink, "too few to call this a pattern", NO red box.
   (I made this worse: the old panel used a quiet note; my rebuild gave it a red alert panel.)
3. test_recovery_sample.py: 1/2/3 underwater -> insufficient; 4+ -> real verdict; ratio unchanged.

PART B - in the order he asked
4. DIAGNOSE the existing path first, no new dependency:
   a. run news_calendar.py actuals; see what TE returns for USD/EUR/GBP/JPY
   b. watch production across a :05 pass and read what it logs
   c. if TE is empty from the server but fine locally, that is the exact failure _te_html exists for
      - check the curl_cffi fallback still clears the challenge
   d. check the ladder timings: the code says 2/5/10/15 min is A GUESS, never measured. If TE fills
      slower than 15 min every rung misses and the message is silent even when all else works.
5. TEST Scrapling on MyFXBook, in a THROWAWAY env - nothing added to pyproject until proven.
   HTTP-only Fetcher, no browser. Measure: status, is-it-a-challenge (_is_cloudflare_challenge :53),
   and whether rows WITH actual values parse out.
   NOT its browser mode in the container - C6: a Chrome that failed to exit ran every 15 min until
   the box ran out of memory and took the site down on 07 Sep.
   Expect it may add nothing and say so: curl_cffi already does TLS impersonation here.
6. DECIDE on the evidence. Works -> come back with a proper adoption plan. Doesn't -> fix what step 4
   found and MEASURE the real fill delay to replace the guessed ladder.

## Phase 3 - Execute: one task at a time, in order.

## Phase 4 - Health check
tsc clean; drawdown style checks (15) pass; new Python test passes; existing drawdown tests pass.
Playwright: recovery card in both themes at n=1 (no warning, explanation shown) and n=4+ (warning).
Calendar proof = a released figure appearing against a real past event, not "the code ran".
Scrapling reported as measured numbers, not an impression.

## NOT in scope
Changing the calendar's primary source; adding any dependency before the test justifies it; the
browser-based scraper; the Python drawdown maths beyond the one guard.
