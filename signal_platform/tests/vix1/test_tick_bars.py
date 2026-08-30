"""CANDLES BUILT FROM TICKS — and the rules that stop a wrong one ever being used.

WHY. The broker publishes a finished bar 10-70s after it closes (`candle_cache.py:45`, measured), and
that lands on the H1 momentum candle and then again on every M1 bar of the entry. Measured
consequence: all four stored VIX.1 signals arrived at or past their own entry, two through it. His
words: *"The delay begins from 1HR momentum candle."*

THE DANGER THESE CHECKS EXIST FOR. A fast WRONG candle is far worse than a slow right one — the
momentum test could pass when it should not, or the line be drawn at the wrong level, and we would
then be trading faster onto wrong numbers. cTrader publishes no guarantee that every tick is
delivered, so correctness cannot be assumed and is never assumed here.

Two rules carry the whole safety case, and both are asserted below:
  1. NEVER A HYBRID CANDLE — a bar is kept only if the stream covered its ENTIRE minute.
  2. NEVER TRUSTED WITHOUT PROOF — a symbol is served only after a run of exact matches, and one
     mismatch withdraws it.
"""
from _harness import Suite
from data.tick_bars import TickBarBuilder
from data.tick_bar_audit import TickBarAudit, MIN_SAMPLE
from core.types import Candle

s = Suite("TICK-BUILT CANDLES — built from bid ticks, trusted only when proved")

M = 60
BASE = 1_788_000_000 // M * M          # a real minute boundary


def bar(t, o, h, l, c, tf="M1"):
    return Candle(time=t, open=o, high=h, low=l, close=c, volume=1, timeframe=tf)


# ── THE BAR IS THE FOUR NUMBERS OF THE MINUTE ───────────────────────────────
b = TickBarBuilder()
b.connected(["GBP/USD"], BASE)                      # coverage starts at the minute boundary
for px, off in ((1.3500, 1), (1.3510, 15), (1.3495, 30), (1.3505, 59)):
    b.on_tick("GBP/USD", px, BASE + off)
b.on_tick("GBP/USD", 1.3506, BASE + M + 1)          # next minute — closes the first

out = b.bars("GBP/USD")
s.check("one finished bar", len(out), 1)
s.check("open is the FIRST price", out[0].open, 1.3500)
s.check("high is the highest", out[0].high, 1.3510)
s.check("low is the lowest", out[0].low, 1.3495)
s.check("close is the LAST price", out[0].close, 1.3505)
s.check("stamped at the minute's start", out[0].time, BASE)
s.check("the minute still forming is NOT returned",
        all(c.time != BASE + M for c in b.bars("GBP/USD")), True)


# ── RULE 1: NEVER A HYBRID CANDLE ───────────────────────────────────────────
# A bar that began before we were listening is missing its early ticks — its open, and possibly its
# high or low, would be wrong. It must be discarded, not served.
b2 = TickBarBuilder()
b2.connected(["GBP/USD"], BASE + 30)                # attached HALFWAY through the minute
b2.on_tick("GBP/USD", 1.3500, BASE + 31)
b2.on_tick("GBP/USD", 1.3520, BASE + 50)
b2.on_tick("GBP/USD", 1.3510, BASE + M + 1)         # rolls into the next minute
s.check("a bar we joined HALFWAY through is discarded", b2.bars("GBP/USD"), [])

# ...and the NEXT full minute is fine.
b2.on_tick("GBP/USD", 1.3515, BASE + M + 30)
b2.on_tick("GBP/USD", 1.3512, BASE + 2 * M + 1)
out2 = b2.bars("GBP/USD")
s.check("the next FULL minute is kept", len(out2), 1)
s.check("...and it is the later one", out2[0].time, BASE + M)

# A DISCONNECT DESTROYS THE BAR IN PROGRESS. A bar with a hole in it is worse than no bar, because
# it looks complete.
b3 = TickBarBuilder()
b3.connected(["GBP/USD"], BASE)
b3.on_tick("GBP/USD", 1.3500, BASE + 5)
b3.disconnected()
b3.connected(["GBP/USD"], BASE + 40)                # back, but mid-minute
b3.on_tick("GBP/USD", 1.3530, BASE + 45)
b3.on_tick("GBP/USD", 1.3520, BASE + M + 1)
s.check("a bar spanning a DISCONNECT is discarded", b3.bars("GBP/USD"), [])


# ── ORDERING AND DUPLICATES ─────────────────────────────────────────────────
b4 = TickBarBuilder()
b4.connected(["EUR/USD"], BASE)
b4.on_tick("EUR/USD", 1.1000, BASE + 10)
b4.on_tick("EUR/USD", 1.1010, BASE + M + 5)         # closes minute 1
b4.on_tick("EUR/USD", 1.0900, BASE + 20)            # a LATE tick from the closed minute
done = b4.bars("EUR/USD")
s.check("a late tick does not reopen a finished bar", len(done), 1)
s.check("...and does not corrupt its low", done[0].low, 1.1000)

b4.on_tick("EUR/USD", 1.1020, BASE + 2 * M + 5)
times = [c.time for c in b4.bars("EUR/USD")]
s.check("timestamps are unique", len(times), len(set(times)))
s.check("...and ascending", times, sorted(times))


# ── RULE 2: NEVER TRUSTED WITHOUT PROOF ─────────────────────────────────────
a = TickBarAudit()
s.check("an unknown symbol is NOT trusted", a.trusted("GBP/USD"), False)

for i in range(MIN_SAMPLE - 1):
    a.compare("GBP/USD", bar(BASE + i * M, 1.1, 1.2, 1.0, 1.15), bar(BASE + i * M, 1.1, 1.2, 1.0, 1.15))
s.check(f"below the {MIN_SAMPLE}-bar sample it is still NOT trusted", a.trusted("GBP/USD"), False)
a.compare("GBP/USD", bar(BASE + 99 * M, 1.1, 1.2, 1.0, 1.15), bar(BASE + 99 * M, 1.1, 1.2, 1.0, 1.15))
s.check("...and trusted once the sample is met with a clean run", a.trusted("GBP/USD"), True)

# ONE WRONG BAR WITHDRAWS TRUST. There is no such thing as a candle that is mostly right.
a.compare("GBP/USD", bar(BASE + 100 * M, 1.1, 1.2001, 1.0, 1.15),
                     bar(BASE + 100 * M, 1.1, 1.2000, 1.0, 1.15))
s.check("a SINGLE mismatch withdraws trust", a.trusted("GBP/USD"), False)
s.check("...and the mismatch is recorded for reading back",
        "GBP/USD" in (a.report()["GBP/USD"]["last_mismatch"] or ""), True)

# EXACTNESS, not closeness — a tenth of a pip on a 3-pip stop is a third of the risk.
a2 = TickBarAudit()
s.check("a close-but-not-equal high is a MISMATCH",
        a2.compare("X", bar(BASE, 1.1, 1.20001, 1.0, 1.15), bar(BASE, 1.1, 1.20000, 1.0, 1.15)),
        False)
s.check("...the open too", a2.compare("X", bar(BASE, 1.10001, 1.2, 1.0, 1.15),
                                            bar(BASE, 1.10000, 1.2, 1.0, 1.15)), False)
s.check("...the low too", a2.compare("X", bar(BASE, 1.1, 1.2, 1.00001, 1.15),
                                           bar(BASE, 1.1, 1.2, 1.00000, 1.15)), False)
s.check("...and the close", a2.compare("X", bar(BASE, 1.1, 1.2, 1.0, 1.15001),
                                            bar(BASE, 1.1, 1.2, 1.0, 1.15000)), False)

# AN UNANSWERABLE COMPARISON IS NOT A PASS. Scoring "no counterpart" as a match is how a bad feed
# earns trust it never demonstrated.
a3 = TickBarAudit()
s.check("no counterpart -> None, not True", a3.compare("Y", bar(BASE, 1, 1, 1, 1), None), None)
s.check("mismatched minutes -> None", a3.compare("Y", bar(BASE, 1, 1, 1, 1),
                                                       bar(BASE + M, 1, 1, 1, 1)), None)
s.check("...and none of that counted toward trust", a3.report().get("Y"), None)


# ── PHASE 1 SERVES NOTHING ──────────────────────────────────────────────────
# The whole point of the first rollout: it can only observe. If this ever fails, tick-built candles
# are reaching a strategy before they were proved.
import ast, os
_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_fetch = open(os.path.join(_root, "data", "candle_fetcher.py"), encoding="utf-8").read()
_tree = ast.parse(_fetch)
_calls = {(n.func.attr if isinstance(n.func, ast.Attribute) else getattr(n.func, "id", ""))
          for n in ast.walk(_tree) if isinstance(n, ast.Call)}
s.check("candle_fetcher compares tick bars", "compare" in _calls, True)
s.check("...but never SERVES them yet", "bars" in _calls and "trusted" in _calls, False)

s.done()
