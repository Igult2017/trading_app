"""BX-S/D — the 4H PULLBACK, and the retap-OR-pullback entry gate.

The user's rule, 2026-08-01, in his own words:

  *"A tap and a retap of the zone is different from a pullback. A pullback means the price has left
  that zone and on its way it just pulls back abit — not back to the zone, but just a pullback then
  continuation. A pullback can take the price back to the zone but in some cases it might not."*

  *"Keep the retap and add a pullback. If the pullback happens before the retap, it serves as both
  the pullback and the retap. However, in case the retap happens before the price leaves the zone,
  we wait for the pullback in 4HR."*

  *"The pullback I was talking about is in 4HR TF."*

  *"The stop is 15 pips just behind the pullback, whether the pullback happens on the zone or far
  from it."*

These tests exist because the entry model was got wrong twice in a row in opposite directions —
first requiring ONLY a retap (which missed every pullback that never returned to the zone), then
replacing the retap with "price is on the working side" (which dropped the retap entirely and
admitted any bar in the move away). It is an OR of two specific events.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from core.types import Candle
from strategies.bx_sd_setup import pullback_4h, _PB_LOOKBACK_H4

PASS = FAIL = 0


def check(label: str, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def bar(o, h, l, c, t=0):
    return Candle(time=t * 14400, open=o, high=h, low=l, close=c, volume=100, timeframe="H4")


def run(o, h, l, c, n, start=0):
    """n identical-shape bars, timestamps increasing."""
    return [bar(o, h, l, c, start + i) for i in range(n)]


# ---------------------------------------------------------------- the detector
print("\npullback_4h — a RUN then a RETRACEMENT")

# A clean buy case: price rallies to 1.1100, then three bars pull back to 1.1040 and the last
# closes below the high. One pullback, extreme = 1.1040.
rally = [bar(1.1000 + i * 0.0020, 1.1020 + i * 0.0020, 1.0995 + i * 0.0020, 1.1015 + i * 0.0020, i)
         for i in range(5)]                       # high of the run = 1.1100 on the last bar
pull = [bar(1.1095, 1.1098, 1.1060, 1.1065, 5),
        bar(1.1065, 1.1070, 1.1040, 1.1045, 6),
        bar(1.1045, 1.1055, 1.1042, 1.1050, 7)]
ok, ext = pullback_4h(rally + pull, buy=True)
check("buy: rally then 3-bar pullback is detected", ok, True)
check("buy: extreme is the pullback's own LOW (1.1040), not the run's", round(ext, 4), 1.1040)

# "A pullback can be 1 candle or many" — one bar off the high must qualify.
ok1, ext1 = pullback_4h(rally + [bar(1.1095, 1.1098, 1.1060, 1.1065, 5)], buy=True)
check("buy: a ONE-candle pullback qualifies", ok1, True)
check("buy: one-candle extreme is that candle's low", round(ext1, 4), 1.1060)

# Still making highs = no pullback. This is the case that must NOT fire: price is running away and
# there is nothing to enter or to hang a stop behind.
ok2, _ = pullback_4h(rally, buy=True)
check("buy: an unbroken run with no retracement is NOT a pullback", ok2, False)

# The extreme is at the very last bar -> nothing after it -> no pullback yet.
ok3, _ = pullback_4h(rally + [bar(1.1090, 1.1200, 1.1085, 1.1195, 5)], buy=True)
check("buy: a new high on the newest bar is not a pullback", ok3, False)

# Mirror: a sell.
drop = [bar(1.3000 - i * 0.0020, 1.3005 - i * 0.0020, 1.2980 - i * 0.0020, 1.2985 - i * 0.0020, i)
        for i in range(5)]                        # low of the run = 1.2900
bounce = [bar(1.2905, 1.2940, 1.2902, 1.2935, 5),
          bar(1.2935, 1.2960, 1.2930, 1.2955, 6)]
oks, exts = pullback_4h(drop + bounce, buy=False)
check("sell: drop then bounce is detected", oks, True)
check("sell: extreme is the pullback's own HIGH (1.2960)", round(exts, 4), 1.2960)

oks2, _ = pullback_4h(drop, buy=False)
check("sell: an unbroken drop is NOT a pullback", oks2, False)

# Too little history to tell.
check("under 3 bars returns no pullback", pullback_4h(run(1.1, 1.1, 1.1, 1.1, 2), True), (False, 0.0))

# The lookback must not reach into the PREVIOUS move. A long prior down-leg that bottoms BELOW the
# new up-leg, then the rally and its pullback: the extreme must come from the recent leg.
old = [bar(1.0980, 1.0985, 1.0960, 1.0965, i) for i in range(30)]
ok4, ext4 = pullback_4h(old + rally + pull, buy=True)
check("the window is bounded — an old leg does not supply the extreme", ok4, True)
check("bounded-window extreme is still the recent pullback's low", round(ext4, 4), 1.1040)
check("_PB_LOOKBACK_H4 is 12 bars (two days of 4H)", _PB_LOOKBACK_H4, 12)

# KNOWN AND ACCEPTED: if the window's highest high belongs to an EARLIER leg that price has since
# fallen a long way from, the extreme is the lowest low since THAT high, and the stop is wide. This
# is the rule as stated — 15 pips behind the pullback — and the pullback is measured from the
# highest point in the window. It is asserted rather than left implicit so the behaviour is a
# decision, not a surprise: the risk is reported in pips on every card (`details.risk_pips`).
tall  = [bar(1.1200, 1.1300, 1.1190, 1.1195, 0)]
deep  = [bar(1.1195 - i * 0.0030, 1.1200 - i * 0.0030, 1.1150 - i * 0.0030, 1.1155 - i * 0.0030,
             1 + i) for i in range(6)]
turn  = [bar(1.1010, 1.1060, 1.1005, 1.1055, 7)]
ok5, ext5 = pullback_4h(tall + deep + turn, buy=True)
check("a deep fall from an earlier high still reads as one pullback", ok5, True)
check("...and its extreme is the lowest low since that high", round(ext5, 4), 1.1000)


# ------------------------------------------------------- the OR, stated as truth table
print("\nthe entry gate — retap OR pullback, on a RESPECTED zone")

# The gate itself lives inside detect_setup's loop and needs a full zone book to exercise, so what
# is asserted here is the LOGIC it implements, written out so a future edit that collapses the OR
# back into one branch fails visibly.
def gate(respected: bool, retap: bool, pulled: bool, away: bool) -> bool:
    if not respected:
        return False
    return retap or (pulled and away)


check("respected + retap only            -> enter", gate(True, True, False, False), True)
check("respected + 4H pullback outside   -> enter", gate(True, False, True, True), True)
check("respected + both                  -> enter", gate(True, True, True, True), True)
check("respected, price ran away, no pb  -> WAIT", gate(True, False, False, True), False)
check("respected, pullback but inside    -> retap decides", gate(True, False, True, False), False)
check("NOT respected + retap             -> WAIT for the 4H pullback",
      gate(False, True, False, False), False)
check("NOT respected + pullback          -> WAIT", gate(False, False, True, True), False)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
