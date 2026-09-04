"""RANGING, QUIET AND CHOPPY MARKETS — the ones he says we cannot do business in.

HIS THREE DEFINITIONS (2026-09-04), each a separate test in `vix1_tradeable`:

    RANGING  "not printing HHs and HLs for an uptrend and LLs and LHs for a downtrend"
    QUIET    "one that has no momentum candles which I call volume candles... no activities"
    CHOPPY   "it can be trending but prints 1 red volume candle then prints a bullish candle,
              meaning it has no specific group of candles in succession"

HE SENT THREE CHARTS OF SUCH MARKETS AND VIX.1 FIRED **12 SIGNALS** IN THEM — driven through the real
`detect_bias` on real broker bars, all twelve through the normal trend route.

WHAT THIS FILE PINS, AND IT IS DELIBERATELY THE HONEST NUMBER: **3 of the 12 are now refused, not
all 12.** The quiet test catches the three that came out of a market with no momentum candles at all.
The other nine need the chop rule, which is NOT built — his third definition has no test yet.

THE CONTROL MATTERS MORE THAN THE REFUSALS. His one marked TRADEABLE market — EUR/USD 03 Sep 2026,
*"a trending and volatile market"* — must still fire all three of its signals. It comes through the
REVERSAL route with the weakest structure of any window measured (highs -2.1x, lows -21.7x), so a
liveness test applied there would kill the setup this whole change exists to protect.

A BUG THIS FILE WOULD NOT HAVE CAUGHT, recorded because his own suite did. The first version of
`trend_reproven` looked for the wrong turn: in a downtrend the pullback goes UP and is confirmed by a
HIGH, and it was looking for a LOW. That refused his 2026-08-25 bearish sequence outright.
`test_choch_bearish_proof.py` went red and is what found it. Cross-strategy suites earn their keep.
"""
import datetime
import sys

import _harness  # noqa: F401
from _harness import Suite, load                                    # noqa: E402

from strategies import vix1_bias                                    # noqa: E402
from strategies.vix1_tradeable import market_awake, trend_reproven  # noqa: E402
from strategies.vix1_swings import structure_turns                  # noqa: E402
from strategies.vix1_trend import trend_state                       # noqa: E402

s = Suite("RANGING / QUIET / CHOPPY — the markets he cannot trade")

bars = load("EURUSD_H1_live_sep04.csv", "H1")
if not bars:
    print("  SKIP — EURUSD_H1_live_sep04.csv not present on this machine")
    sys.exit(0)


def at(when):
    t = int(datetime.datetime.strptime(when, "%Y-%m-%d %H:%M")
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    return next(i for i, c in enumerate(bars) if c.time == t)


def fires(when):
    i = at(when)
    return vix1_bias.detect_bias(bars[max(0, i + 1 - 3000):i + 1], [], "EUR/USD") is not None


# ── THE CONTROL FIRST. If this breaks, nothing else matters. ───────────────
print()
print("   his ONE tradeable market must still fire (03 Sep, the reversal that started this):")
for w in ("2026-09-03 11:00", "2026-09-03 12:00", "2026-09-03 16:00"):
    s.check(f"   {w} still trades", fires(w), True)


# ── THE QUIET MARKETS — refused, and this is the whole of today's gain ─────
print()
print("   markets with NO momentum candles at all beforehand — refused:")
for w in ("2026-08-05 06:00",      # img1, zero momentum candles in the previous 24h
          "2026-05-24 22:00",      # img2, the same
          "2026-01-20 03:00"):     # img3, the same
    s.check(f"   {w} refused", fires(w), False)


# ── AND THE NINE THAT STILL GET THROUGH, ASSERTED AS STILL GETTING THROUGH ─
# Recording the gap as a passing test rather than a comment: if a later change closes any of these
# by accident, this file goes red and the change has to be understood instead of absorbed silently.
print()
print("   NOT YET SOLVED — his chop definition has no test, so these still trade:")
for w in ("2026-08-03 18:00", "2026-08-05 11:00", "2026-08-05 14:00", "2026-08-05 17:00",
          "2026-01-12 05:00", "2026-01-12 07:00", "2026-01-15 20:00",
          "2026-01-20 07:00", "2026-01-20 08:00"):
    s.check(f"   {w} STILL trades (known gap)", fires(w), True)


# ── THE TWO RULES, ASKED DIRECTLY ─────────────────────────────────────────
print()
print("   the rules themselves:")

i = at("2026-05-24 22:00")
h1 = bars[max(0, i + 1 - 3000):i + 1]
s.check("a market with no momentum candles in 24h is refused as quiet",
        market_awake(h1, "EUR/USD", 24, 1) is not None, True)
s.check("...and the refusal says so in his words",
        "quiet" in (market_awake(h1, "EUR/USD", 24, 1) or ""), True)
s.check("the same market passes if only ONE momentum candle is needed over a longer look",
        market_awake(h1, "EUR/USD", 48, 1), None)

# Too little history must NOT be read as "quiet" — refusing on absent data is a guess, and this
# codebase has shipped that mistake before (a gate that fired hardest when it knew least).
s.check("too little history is not a refusal", market_awake(bars[:10], "EUR/USD", 24, 1), None)
s.check("a zero lookback is not a refusal either", market_awake(h1, "EUR/USD", 0, 1), None)

# `trend_reproven` must never fire when there is no trend to re-prove — that case belongs to the
# other gates, and answering it here would be a second opinion nobody asked for.
i = at("2026-09-03 12:00")
w = bars[max(0, i + 1 - 1500):i + 1]
turns = structure_turns(w, 48)
st = trend_state(w, n=48, turns=turns)
s.check("no established trend -> the re-proof rule stays silent", st.direction, 0)
s.check("...and returns None rather than refusing", trend_reproven(st, turns), None)
s.check("a missing trend state is not a refusal", trend_reproven(None, turns), None)

s.done()
