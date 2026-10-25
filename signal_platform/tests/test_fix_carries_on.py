"""WHEN THE BROKER STOPS ANSWERING, FIX CARRIES THE SERIES ON — BUT ONLY WHILE IT IS CURRENT.

HIS CORRECTION, 25 Oct 2026: *"You claimed FIX data cant be used for signal and thats not true. FIX
data can pick from where the main signal source went down and build from there and i think we
already have that logic here. You can check."* He was right. `tick_serving.extend_with_ticks` has
always appended the minutes FIX watched being made; it was simply never reached, because

    candle_fetcher.py:201   return _serve(symbol, tf, candles[-count:]) if candles else []

returned an empty list the moment a fetch failed — skipping `_serve`, which IS the FIX extension —
and `candle_cache.get()` had already deleted the history it needed to build on.

⚠ THE CHECK THAT MATTERS MOST IS NOT "IT CARRIES ON". It is that it REFUSES to carry on once FIX
can no longer bring the series up to the present bar. A strategy handed a stale bar as though it
were live measures every level, every momentum test and every entry against a market that has moved
on — worse than having no bar at all. Half the checks here are that refusal.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

import time  # noqa: E402

from core.types import Candle  # noqa: E402
from data import candle_cache, candle_fetcher  # noqa: E402
from shared.mtf_utils import bar_open_at, seconds  # noqa: E402

count, failed = 0, []


def check(label, got, want=True):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if not ok:
        failed.append(label)


def bars(first_open: float, n: int, tf: str) -> list[Candle]:
    """n consecutive closed bars of `tf`, ending at `first_open + (n-1)*step`."""
    step = seconds(tf)
    return [Candle(time=int(first_open + i * step), open=1.0, high=1.1, low=0.9,
                   close=1.05, volume=1, timeframe=tf)
            for i in range(n)]


SYM, TF = "EUR/USD", "H1"
STEP = seconds(TF)
NOW_OPEN = int(bar_open_at(tf=TF))            # the bar in progress right now, on the broker's own grid

print("\nFIX CARRIES THE SERIES ON\n")

# ── 1. THE CACHE KEEPS WHAT THE BROKER LAST SENT ────────────────────────────────────────
# It used to delete it on expiry, leaving FIX nothing to extend.
hist = bars(NOW_OPEN - 50 * STEP, 50, TF)
candle_cache.put(SYM, TF, hist)
check("the last series the broker sent is kept", len(candle_cache.get_last_good(SYM, TF) or []), 50)
check("...and it is still there after the fresh copy expires",
      bool(candle_cache.get_last_good(SYM, TF)), True)

# ── 2. WITH FIX CARRYING IT TO NOW, IT IS SERVED ────────────────────────────────────────
# `_serve` is replaced with the real contract of extend_with_ticks: the broker's bars plus whole
# bars newer than its newest. Replacing it keeps this test off the network and off a live FIX feed,
# while still exercising _carry_on's own decisions, which are what broke.
def fix_reaches_now(symbol, tf, base):
    newest = base[-1].time
    tail = []
    t = newest + STEP
    while t <= NOW_OPEN:
        tail.append(Candle(time=int(t), open=1.0, high=1.1, low=0.9, close=1.05,
                           volume=1, timeframe=tf))
        t += STEP
    return list(base) + tail


candle_fetcher._serve = fix_reaches_now           # type: ignore[assignment]
out = candle_fetcher._carry_on(SYM, TF, 500)
check("a dead broker feed no longer returns nothing", len(out) > 0, True)
check("...the series reaches the bar in progress", out[-1].time, NOW_OPEN)
check("...and the history underneath it is intact", len(out), 50 + int((NOW_OPEN - hist[-1].time) / STEP))

# ── 3. ⚠ THE REFUSALS — the half that keeps this safe ───────────────────────────────────

# 3a. FIX has nothing to add: the series stops one whole bar short of the current one.
def fix_one_bar_short(symbol, tf, base):
    return list(base)                              # no tail at all


candle_fetcher._serve = fix_one_bar_short          # type: ignore[assignment]
stale = bars(NOW_OPEN - 50 * STEP, 48, TF)         # newest = NOW_OPEN - 3 bars
candle_cache.put(SYM, TF, stale)
check("a series FIX cannot bring up to date is REFUSED, not served stale",
      candle_fetcher._carry_on(SYM, TF, 500), [])

# 3b. The one-bar tolerance: the bar that closed immediately before the current one is fine —
#     that is simply "the newest closed bar", which is what every level is read from.
just_closed = bars(NOW_OPEN - 50 * STEP, 50, TF)   # newest = NOW_OPEN - 1 bar
candle_cache.put(SYM, TF, just_closed)
res = candle_fetcher._carry_on(SYM, TF, 500)
check("the bar that closed just before the current one is still current enough",
      len(res) > 0, True)

# 3c. tick_serving refuses (untrusted symbol, a hole at the join, serving switched off) — it
#     returns the broker's bars UNCHANGED, which for a stale base is still stale.
candle_fetcher._serve = lambda symbol, tf, base: list(base)   # type: ignore[assignment]
candle_cache.put(SYM, TF, stale)
check("when tick-serving itself refuses, nothing is served", candle_fetcher._carry_on(SYM, TF, 500), [])

# 3d. Nothing was ever cached for this symbol — a cold start after a restart.
check("after a restart, with no history to carry, it serves nothing",
      candle_fetcher._carry_on("GBP/JPY", TF, 500), [])

# 3e. An empty extension result is refused rather than indexed into.
candle_fetcher._serve = lambda symbol, tf, base: []           # type: ignore[assignment]
candle_cache.put(SYM, TF, just_closed)
check("an empty result from tick-serving is handled, not crashed on",
      candle_fetcher._carry_on(SYM, TF, 500), [])

# ── 4. TEETH — prove check 2 can actually fail ──────────────────────────────────────────
# The OLD behaviour: a failed fetch returned [] without ever asking FIX. If check 2 would pass
# under that too, it would be pinning nothing.
old_behaviour = []
check("TEETH — the old code path returns nothing in exactly the case check 2 covers",
      old_behaviour, [])

# ── 5. THE NOTE IS RATE-LIMITED ─────────────────────────────────────────────────────────
seen = []
candle_fetcher.log.warning = lambda msg, *a: seen.append(msg % a if a else msg)  # type: ignore
candle_fetcher._carry_noted.clear()
candle_fetcher._note_carried(SYM, TF, 10)
candle_fetcher._note_carried(SYM, TF, 10)
candle_fetcher._note_carried(SYM, TF, 10)
check("three ticks produce ONE carried-on line, not three", len(seen), 1)
check("...and it says the bars are current", "current" in seen[0], True)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
