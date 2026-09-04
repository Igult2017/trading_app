"""HIS EUR/USD SETUP OF 03 SEP 2026 — refused as CHOP, and it was a downtrend.

THE EVENT, not a lookalike. He sent a chart of a market the platform had stayed silent on and said:

    "That was not a choppy market, it was a trending and volatile market... That market as you can
     see it is making higher highs and higher lows."
    "we can't say a trending volatile market is choppy."

The bars in `EURUSD_H1_sep03_event.csv` were pulled from the broker's own read-only feed on
2026-09-04 and spliced onto the stored history, which stops 2026-08-28. Sanity-checked for splice
artefacts (zero price jumps over 2%) before being trusted.

WHAT THE OLD RULE DID TO IT. `vix1_regime` required BOTH the last two highs AND the last two lows to
move by at least 0.50 x ATR before it would call the market a trend. At Thu 03 Sep 10:00 the lows
had fallen 2.68 x ATR and the highs only 0.26 x ATR — lower highs and lower lows, a downtrend by his
rule — so it fell through to CHOP, and `vix1_choch` refused the reversal that followed.

MEASURED THROUGH THE REAL `detect_bias`, both ways, on these exact bars:

    original vix1_regime.py   0 signals across 02-04 Sep
    direction-only            3 BUY signals on 03 Sep, via the change-of-character route

THE POINT OF THIS FILE is that the assertions run through the REAL `detect_bias` rather than
re-implementing the rule. A test that recomputes the verdict itself can pass while the strategy
refuses, which this codebase has paid for before.
"""
import datetime
import sys

import _harness  # noqa: F401
from _harness import Suite, load                                     # noqa: E402

from shared.candle_math import atr                                   # noqa: E402
from strategies import vix1_bias, vix1_regime                        # noqa: E402
from strategies.vix1_regime import TREND                             # noqa: E402
from strategies.vix1_swings import structure_turns                   # noqa: E402
from strategies.vix1_trend import trend_state                        # noqa: E402

s = Suite("HIS 03 SEP EUR/USD SETUP — a shallow downtrend is not chop")

bars = load("EURUSD_H1_sep03_event.csv", "H1")
if not bars:
    print("  SKIP — EURUSD_H1_sep03_event.csv not present on this machine")
    sys.exit(0)

_H1_SWING_N = 48


def at(when: str):
    """The index of the bar stamped `when` (UTC), so the assertions name an hour, not an offset."""
    t = int(datetime.datetime.strptime(when, "%Y-%m-%d %H:%M")
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    return next(i for i, c in enumerate(bars) if c.time == t)


# ── THE HOUR HE DISPUTED ───────────────────────────────────────────────────
i = at("2026-09-03 10:00")
w = bars[max(0, i + 1 - 1500):i + 1]
turns = structure_turns(w, _H1_SWING_N)
a = atr(w, 14)
highs = [t for t in turns if t.is_high][-2:]
lows = [t for t in turns if not t.is_high][-2:]
dh = (highs[-1].price - highs[-2].price) / a
dl = (lows[-1].price - lows[-2].price) / a

# The shape first, so a later change to the DATA cannot make the verdict assertions pass vacuously.
s.check("the highs stepped DOWN", dh < 0, True)
s.check("the lows stepped DOWN too — lower highs and lower lows, his definition of a downtrend",
        dl < 0, True)
s.check("the highs moved less than the old 0.50x ATR bar (this is why it was refused)",
        abs(dh) < 0.50, True)
s.check("...while the lows moved far more than it", abs(dl) > 2.0, True)
s.check("the structural trend engine called it DOWN", trend_state(w, n=_H1_SWING_N,
        turns=turns).direction, -1)
s.check("and the regime engine now agrees it is a TREND",
        vix1_regime.classify(turns, a).kind, TREND)

# TEETH — the old rule, rebuilt here ONLY as a control, to show the fixture really does discriminate.
# Without this the test above could pass on bars that were never refused in the first place.
old_says_trend = (dh < -0.50 and dl < -0.50)
s.teeth("the OLD 0.50x ATR rule refused this exact market", old_says_trend is False)


# ── END TO END, THROUGH THE REAL detect_bias ───────────────────────────────
start = at("2026-09-02 00:00")
fired = []
for j in range(start, len(bars)):
    b = vix1_bias.detect_bias(bars[:j + 1], [], "EUR/USD")
    if b:
        fired.append((datetime.datetime.utcfromtimestamp(bars[j].time), b.bullish))

s.check("the real detect_bias now produces a bias on these bars", len(fired) > 0, True)
s.check("...and it is a BUY, the change of character he was pointing at",
        all(bull for _, bull in fired), True)
s.check("...on 03 Sep", all(d.strftime("%Y-%m-%d") == "2026-09-03" for d, _ in fired), True)

# The exact count is recorded rather than asserted loosely, so a future change that alters it is
# visible instead of silent. 3 = 11:00, 12:00 and 16:00 UTC.
s.check("three hours of that day carry the bias", len(fired), 3)


# ── THE CONTROL: a market where the sides DISAGREE is still refused ────────
# His second chart was a genuinely choppy/ranging market, and this change must not have opened those.
# No dated chart of it exists, so the control is structural: find an hour in this same real series
# where the highs and lows move in OPPOSITE directions, and assert it is still not a trend.
found = None
for j in range(len(bars) - 1, 1600, -1):
    ww = bars[max(0, j + 1 - 1500):j + 1]
    tt = structure_turns(ww, _H1_SWING_N)
    hh = [t for t in tt if t.is_high][-2:]
    ll = [t for t in tt if not t.is_high][-2:]
    if len(hh) < 2 or len(ll) < 2:
        continue
    aa = atr(ww, 14)
    if aa <= 0:
        continue
    x, y = hh[-1].price - hh[-2].price, ll[-1].price - ll[-2].price
    if x != 0 and y != 0 and (x > 0) != (y > 0):
        found = (j, vix1_regime.classify(tt, aa))
        break

s.check("a real hour exists in this series where the highs and lows disagree", found is not None, True)
if found:
    s.check("...and it is STILL refused — the change did not open everything",
            found[1].tradeable, False)

s.done()
