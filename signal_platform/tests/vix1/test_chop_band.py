"""VIX.1 — THE RANGE / CHOP GATE. Switched ON 2026-09-21, and its answer is final.

His instruction: *"It should be able to detect ranging and choppy market and then inform VIX and
its decision is final so that VIX can no longer take trades in choppy markets. Once a confirmed
ranging or choppy market begins to develop, it should send a message to VIX system and then it
stops taking trades immediately."* And: *"Dont patch, integrate."*

This file pins three kinds of fact:

  * WHAT IT READS — his band idea (price crossing back through the middle) and the wander ratio
    (how long a path price walked against how big the box is), on hand-built candles.
  * THE LATCH — the part that makes it work: it HOLDS through a quiet patch and releases only when
    price closes out of the box. Asserted on his own 14-18 Sep bars, where the earlier per-bar
    reader went silent for five hours in the middle of the range he circled.
  * THAT IT IS WIRED AND FINAL — `vix1_bias` asks it before anything else. The old version of this
    file asserted the opposite (that nothing called it), which was correct then and is why this
    check is kept: switching the gate off again has to be a deliberate act.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
from pathlib import Path

from _harness import Suite, body, load

from strategies import vix1_chop

s = Suite("VIX.1 — the range / chop gate (his band idea, latched)")


def candles(closes):
    """One H1 candle per step, each opening where the one before it closed."""
    return [body(closes[i - 1], closes[i], tf="H1", t=i, wick_up=0.00005, wick_dn=0.00005)
            for i in range(1, len(closes))]


# ── 1. WHAT IT READS ────────────────────────────────────────────────────────────────────────────
print()
print("PRICE BOUNCING BETWEEN TWO LINES")
side = candles([1.1000 + (0.0030 if k % 2 else 0.0) for k in range(30)])
r = vix1_chop.read(side)
s.check("24 candles were read", (r.judged, r.counted), (True, 24))
s.check("price bouncing between two lines crosses the middle 6+ times", r.came_back >= 6, True)
s.check("...and the wander ratio is high — a long path inside a small box",
        vix1_chop.wander(side) > vix1_chop.WANDER_ON, True)

print()
print("A CLEAN ONE-WAY RUN")
run = candles([1.1000 + 0.0005 * k for k in range(30)])
rr = vix1_chop.read(run)
s.check("a clean one-way run does NOT read choppy", rr.choppy, False)
s.check("  ...it crosses the middle once, on its way through", rr.came_back, 1)
s.check("  ...and its wander ratio is low — the box IS the move",
        vix1_chop.wander(run) < vix1_chop.WANDER_ON, True)
s.check("  ...so nothing is refused", vix1_chop.not_tradeable(run), None)
s.teeth("the two readings separate them — same length, opposite answers",
        vix1_chop.not_tradeable(side) is not None and vix1_chop.not_tradeable(run) is None)

print()
print("TOO FEW CANDLES — cannot say, which ALLOWS")
short = side[:10]
s.check("10 candles is too few to judge", vix1_chop.read(short).judged, False)
s.check("  ...the wander ratio declines to guess", vix1_chop.wander(short), None)
s.check("  ...and too few is never a refusal", vix1_chop.not_tradeable(short), None)

# ── 2. THE LATCH, ON HIS OWN BARS ───────────────────────────────────────────────────────────────
import datetime  # noqa: E402

sep = load("EURUSD_H1_sep18.csv", "H1")
if not sep:
    print("  SKIP — EURUSD_H1_sep18.csv not present on this machine")
    s.done()


def at(stamp):
    t = int(datetime.datetime.strptime(stamp, "%Y-%m-%d %H:%M")
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    return next(i for i, c in enumerate(sep) if c.time == t)


def ranging(stamp):
    return vix1_chop.market_state(sep[: at(stamp) + 1]).ranging


print()
print("HIS CIRCLED 14-16 SEP RANGE — the state turns on and STAYS on")
s.check("15 Sep 20:00 — the state latches ON", ranging("2026-09-15 20:00"), True)
# THE POINT OF THE LATCH: at 16 Sep 17:00 the readings had slipped to 56.1 and 5 crossings, both
# UNDER the bar that turned it on. The earlier per-bar reader went quiet here; this holds.
s.check("16 Sep 17:00 — still ON, though both readings have slipped under their own bar",
        ranging("2026-09-16 17:00"), True)
s.check("16 Sep 18:00 — RELEASED on the 67.5-pip drop, the exact hour the range broke",
        ranging("2026-09-16 18:00"), False)
s.check("16 Sep 21:00 — still released, the market is going somewhere",
        ranging("2026-09-16 21:00"), False)
s.teeth("the latch is what holds it — the hour it releases and the hour before differ",
        ranging("2026-09-16 17:00") and not ranging("2026-09-16 18:00"))

print()
print("HIS 18 SEP CARD — the sell at 11:08, decided on the 10:00 candle")
s.check("18 Sep 10:00 — the market is ranging, so that sell is refused",
        ranging("2026-09-18 10:00"), True)
s.check("  ...and the message names the box and the crossings",
        all(w in (vix1_chop.not_tradeable(sep[: at("2026-09-18 10:00") + 1]) or "")
            for w in ("boxed between", "crossing back through the middle")), True)

print()
print("IT CANNOT KNOW A RANGE BEFORE IT IS ONE — stated, not hidden")
# His range began about 14 Sep 15:00. Four hours in, nothing can call it, and this says so rather
# than pretending otherwise. Those trades are refused by the liquidity-void rule instead.
s.check("14 Sep 19:00 — four hours in, NOT yet called (the void rule covers this one)",
        ranging("2026-09-14 19:00"), False)

# ── 3. IT IS WIRED, AND ITS ANSWER IS FINAL ─────────────────────────────────────────────────────
print()
print("WIRED AND FINAL — his instruction")
_strategies = Path(vix1_chop.__file__).parent
_callers = sorted(f.name for f in _strategies.glob("*.py")
                  if f.name != "vix1_chop.py" and "vix1_chop" in f.read_text(encoding="utf-8"))
s.check("the entry and the heads-up both ask it",
        ("vix1_bias.py" in _callers, "vix1_preclose.py" in _callers), (True, True))
# FINAL means nothing downstream can overrule it: `detect_bias` returns on the reason, so a ranging
# market produces no bias whatever the trend, the momentum or any other gate would have said.
from strategies.vix1_bias import detect_bias  # noqa: E402
s.check("in a ranging market `detect_bias` returns nothing at all",
        detect_bias(sep[: at("2026-09-18 10:00") + 1], [], "EUR/USD"), None)
s.check("the old duplicate chop reader is gone — one module owns the question",
        "market_not_choppy" in (_strategies / "vix1_tradeable.py").read_text(encoding="utf-8")
        and "def market_not_choppy" in (_strategies / "vix1_tradeable.py").read_text(encoding="utf-8"),
        False)

s.done()
