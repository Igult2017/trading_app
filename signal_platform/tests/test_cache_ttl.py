"""THE CANDLE CACHE MUST NOT HIDE A BAR CLOSE, NOR SERVE A STALE FORMING BAR.

WHY THIS EXISTS. `_ttl_for` returned a flat `max(55, duration * 0.80)` — on H1 that is 2,880s,
FORTY-EIGHT MINUTES. Correct for reading bars that have already closed (a finished bar never
changes) and wrong for the two things that do change:

  * the bar still FORMING — a 48-minute-old copy of a 60-minute bar is that bar a third grown
  * whether a new bar has closed AT ALL — a candle closing at 15:00 was seen whenever the copy
    happened to expire, anywhere from seconds to 48 minutes later

The 48-minute refresh cycle drifts against the 60-minute bar cycle, so the same signal was sometimes
instant and sometimes very late. That intermittency is why one fast measurement wrongly cleared it.

The decisive test is `walks a full hour` below: it steps a whole H1 bar minute by minute, follows
the cache as the real fetcher would, and asserts no copy is ever served across the bar close.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

import calendar  # noqa: E402
import time  # noqa: E402

from data.candle_cache import (_FAST_TF_TTL, _FINAL_STRETCH_S, _FINAL_STRETCH_TTL,  # noqa: E402
                               _phase, _to_close, _ttl_for)

failed, count = [], 0


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke_it: bool):
    global count
    count += 1
    print(f"   {'PASS' if broke_it else 'FAIL'}  TEETH — {name}: {broke_it}")
    if not broke_it:
        failed.append(f"TEETH:{name}")


HOUR = 3600
# AN EXACT HOUR BOUNDARY, derived rather than typed. The first draft of this file hard-coded a
# round-looking epoch that was in fact 20 minutes past the hour, and every boundary assertion below
# failed for that reason alone — the code was right and the yardstick was bent.
TOP = (1787232000 // HOUR) * HOUR
assert TOP % HOUR == 0


def at(sec_into_hour):
    return TOP + sec_into_hour


print()
print("CANDLE CACHE — a copy must never span a bar close")

# ── the fast timeframes still refetch every scan ─────────────────────────────
# `at(100)` is 100s into the hour — mid-bar for M1, so the flat 20s ceiling applies there.
check("M1 still refetches every scan", _ttl_for("M1", at(100)), _FAST_TF_TTL)
check("M2 too", _ttl_for("M2", at(100)), _FAST_TF_TTL)

# ── AND RULE 1 APPLIES TO M1 TOO, which it did not until 2026-08-30 ──────────
# A flat 20s on a 60s bar means a copy taken in the bar's last 20 seconds is still served AFTER that
# bar closes — so the newest closed bar is missing from what the strategy reads, about one bar close
# in three. That silently defeated the same day's change to scan the INSTANT a 1M bar closes: the
# scan ran at exactly the right moment and was handed data that did not contain the bar it was
# called for. Timing fixed, freshness not — worse than either alone, because it looks fixed.
_m1_open = TOP                                     # any real minute boundary
for _left in (55, 40, 25, 20, 15, 5, 1):
    _at = _m1_open + (60 - _left)
    check(f"M1 copy with {_left:>2}s left does NOT outlive the close",
          _ttl_for("M1", _at, last_open=_m1_open) <= _left, True)
# ...and it is never made STALER than it was — the safety argument for touching the data path.
for _left in (60, 45, 30, 20, 10, 2):
    _at = _m1_open + (60 - _left)
    check(f"M1 ttl at {_left:>2}s left is never above the old flat value",
          _ttl_for("M1", _at, last_open=_m1_open) <= _FAST_TF_TTL, True)

# ── RULE 1 — never hold a copy across the close ──────────────────────────────
# THE DECISIVE CHECK. Step a whole hour minute by minute, following the cache the way the fetcher
# does: when a copy expires, take a new one at that moment. No copy may still be alive at the close.
t = at(0)
spans, taken = 0, 0
while t < TOP + HOUR:
    ttl = _ttl_for("H1", t)
    taken += 1
    if t + ttl > TOP + HOUR:            # this copy would still be served after the bar closed
        spans += 1
    t += ttl
check("walks a full hour: copies that span the close", spans, 0)
check("...and it took a sane number of copies to do it", taken <= 12, True)
print(f"      ({taken} copies across the hour — was 2 at a flat 48-minute TTL)")

# The old flat value DID span the close — the defect, asserted so it cannot quietly return.
OLD_FLAT = max(55.0, 60 * 60 * 0.80)
check("the old flat TTL was 48 minutes", OLD_FLAT, 2880.0)
check("...and from 15:00 it ran to 15:48, hiding a 15:00 close for 48 min",
      at(0) + OLD_FLAT > TOP + HOUR, False)
# ...and from mid-bar it genuinely spanned the next close:
check("...taken at 15:20 it ran past 16:00", at(20 * 60) + OLD_FLAT > TOP + HOUR, True)
check("the new one taken at 15:20 does NOT", at(20 * 60) + _ttl_for("H1", at(20 * 60)) > TOP + HOUR,
      False)

# ── RULE 2 — the forming bar stays current through the final stretch ─────────
for mins_left in (6, 5, 4, 3, 2, 1):
    t = at(HOUR - mins_left * 60)
    check(f"{mins_left} min to close -> refreshed within a minute",
          _ttl_for("H1", t) <= _FINAL_STRETCH_TTL, True)
check("at 5 minutes out (the warning's window) the copy is at most 55s old",
      _ttl_for("H1", at(HOUR - 300)) <= 55.0, True)
check("a copy taken just before the stretch expires AS it begins, not after",
      at(HOUR - _FINAL_STRETCH_S - 120) + _ttl_for("H1", at(HOUR - _FINAL_STRETCH_S - 120)),
      TOP + HOUR - _FINAL_STRETCH_S)

# ── THE BAR CLOSE IS READ FROM THE FEED, NOT ASSUMED ─────────────────────────
# Found 2026-08-21 while answering "why was this BX signal late". The broker's H4 bars open at
# 01:00 / 05:00 / 09:00 / 13:00 / 17:00 / 21:00 UTC — an hour off the midnight grid the code assumed.
# Rule 1 above therefore did NOT hold on H4, the timeframe BX-S/D's whole zone book is built on.


def utc(h, m=0, day=21):
    return float(calendar.timegm((2026, 8, day, h, m, 0, 0, 0, 0)))


H4 = 4 * 3600
JPY_BAR = utc(5)                      # a real bar: the 05:00 UTC H4 that closed at 09:00
check("the grid is read off a real bar: 1 hour past midnight", _phase("H4", utc(8), JPY_BAR), 3600.0)
check("H1 on this feed IS on the hour, so nothing changes there",
      _phase("H1", utc(8), utc(7)), 0.0)
check("no bar to read -> falls back to the old assumed grid", _phase("H4", utc(8), None), 0.0)
# A units change in the feed must degrade to the old behaviour, not poison every TTL on the platform.
check("a millisecond timestamp is rejected, not used", _phase("H4", utc(8), utc(5) * 1000), 0.0)
check("next close from 08:05 is 09:00, not 12:00", _to_close("H4", utc(8, 5), JPY_BAR), 3300.0)
check("...and from 09:05 it is 13:00", _to_close("H4", utc(9, 5), JPY_BAR), 14100.0)

# THE EXACT TABLE THAT EXPOSED IT — each copy against the REAL close that follows it.
print("      taken   TTL expires   real next close   spans it?")
spans_new, spans_old = [], []
for hh, mm, close_h in ((7, 55, 9), (8, 5, 9), (8, 30, 9), (9, 5, 13), (12, 30, 13)):
    t, close_at = utc(hh, mm), utc(close_h)
    new_exp = t + _ttl_for("H4", t, JPY_BAR)
    old_exp = t + _ttl_for("H4", t)                 # last_open omitted = the old assumed grid
    if new_exp > close_at:
        spans_new.append((hh, mm))
    if old_exp > close_at:
        spans_old.append((hh, mm))
    print(f"      {hh:02d}:{mm:02d}   {time.strftime('%H:%M', time.gmtime(new_exp))}         "
          f"{close_h:02d}:00             {'YES' if new_exp > close_at else 'no'}"
          f"   (was {time.strftime('%H:%M', time.gmtime(old_exp))})")
check("no copy is served across the real H4 close", spans_new, [])

# Walk a whole off-grid H4 bar the way the fetcher does — expire, refetch, repeat.
t, spans, taken = utc(5), 0, 0
while t < utc(9):
    ttl = _ttl_for("H4", t, JPY_BAR)
    taken += 1
    if t + ttl > utc(9):
        spans += 1
    t += ttl
check("walks a full off-grid H4 bar: copies that span the close", spans, 0)
check("...in a sane number of copies", taken <= 12, True)
print(f"      ({taken} copies across the 4 hours)")

# ── the safety property that justifies touching the shared data path ─────────
# The new value is ALWAYS <= the old one, so this can only make candles fresher, never staler.
worse = []
for tf, mins in (("M5", 5), ("M15", 15), ("M30", 30), ("H1", 60), ("H4", 240), ("D1", 1440)):
    old = max(55.0, mins * 60 * 0.80)
    for sec in range(0, mins * 60, max(1, mins * 60 // 200)):
        # both grids — the assumed one and a real off-grid feed
        if max(_ttl_for(tf, TOP + sec), _ttl_for(tf, TOP + sec, JPY_BAR)) > old:
            worse.append((tf, sec))
check("across 6 timeframes and both grids it is NEVER longer than the old TTL", worse, [])

# ── it never returns something useless ───────────────────────────────────────
tiny = [t for tf in ("M5", "M15", "H1", "H4")
        for t in [_ttl_for(tf, TOP + s) for s in range(0, 3600, 37)] if t <= 0]
check("never zero or negative", tiny, [])

# ── TEETH ────────────────────────────────────────────────────────────────────
teeth("the old flat TTL would FAIL rule 1", (at(20 * 60) + OLD_FLAT) > TOP + HOUR)
teeth("the final-stretch rule actually shortens it",
      _ttl_for("H1", at(HOUR - 60)) < _ttl_for("H1", at(60)))
teeth("mid-bar is still cached, not refetched every tick", _ttl_for("H1", at(60)) > 300)
# THE DEFECT ITSELF, asserted so it cannot quietly come back: assuming the grid DID span the close,
# and by hours — a copy taken at 08:05 was served until 11:17, through the real 09:00 close.
teeth("assuming the grid spanned the real H4 close at 3 of the 5 sampled times",
      len(spans_old) == 3)
teeth("...by more than two hours at 08:05",
      utc(8, 5) + _ttl_for("H4", utc(8, 5)) - utc(9) > 2 * 3600)
teeth("reading the grid actually changes the answer",
      _ttl_for("H4", utc(8, 5), JPY_BAR) < _ttl_for("H4", utc(8, 5)))

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
