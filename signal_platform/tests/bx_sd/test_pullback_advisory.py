"""THE REACTION IS COUNTED IN CANDLES, AND A PULLBACK WITH NO ZONE IS REPORTED, NOT REFUSED.

HIS TWO RULES, 2026-08-23:

    "Why are we hardcoding this instead of using price action. Let price move 3 candles minimum then
     we start looking for entries for signal 1 because signal 2 depends on break of zones."

    "if it is a zone use the existing entry model. if it is a pullback report it when its started
     ending and advice trader to check and set entry. If we dont have a system that detects a
     pullback accurately you can build one."

WHAT THE FIRST REPLACED. `REACT_MULT = 1.0` asked for a body close a full ZONE-HEIGHT clear of the
zone. Chosen when the answer only printed a word on a card, it became a gate on both signals and had
never been calibrated for that. Against 19 changes of character counted BY HAND from raw EUR/USD 4H
candles, the five it refused had price close clear by 0.39, 0.41, 0.66, 0.69 and 0.80 of a zone
height — real reactions refused by a distance nobody chose for this job.

WHAT THE SECOND REPLACED. `find_signal1` returned None when the pullback landed on no 1H/30M/15M
zone, throwing the setup away — while `pullback_zone`'s own docstring had called that zone "a
preference rather than a condition" since the day it was written.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from core.types import Candle                                          # noqa: E402
from strategies import bx_sd_registry as R                             # noqa: E402
from strategies.bx_sd_pullback import pullback_state, describe         # noqa: E402
from strategies.bx_sd_advisory import build_advisory                   # noqa: E402

failed, count = [], 0


def chk(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke: bool):
    global count
    count += 1
    print(f"   {'PASS' if broke else 'FAIL'}  TEETH — {name}: {broke}")
    if not broke:
        failed.append("TEETH:" + name)


def bar(t, lo, hi, close=None):
    c = close if close is not None else (lo + hi) / 2
    return Candle(time=t, open=(lo + hi) / 2, high=hi, low=lo, close=c, volume=0, timeframe="H4")


def zone(direction, bottom, top, *, marked=100):
    z = R.MarkedZone(direction=direction, top=top, bottom=bottom,
                     proximal=bottom if direction == "supply" else top,
                     distal=top if direction == "supply" else bottom,
                     eq50=(top + bottom) / 2.0, kind="body",
                     ifc_time=marked, origin_time=marked)
    z.marked_at, z.state = marked, "unmitigated"
    return z


# ── THE COUNTER ─────────────────────────────────────────────────────────────
print()
print("THE REACTION IS 3 CONSECUTIVE CLOSED BARS CLEAR OF THE ZONE")
chk("the constant is a candle count, not a distance", R.REACT_BARS, 3)

# A supply zone at 1.1100-1.1120. `tapped_by` for supply is high >= bottom, so a bar is CLEAR only
# when its whole range sits below 1.1100.
sup = zone("supply", 1.1100, 1.1120)
R._advance(sup, bar(1, 1.1105, 1.1125))                 # the tap
chk("the tap mitigates it (body inside -> body, not wick)", sup.state, "body_mitigated")
R._advance(sup, bar(2, 1.1000, 1.1050))
chk("one bar clear is not the reaction", sup.respected_at, None)
R._advance(sup, bar(3, 1.1000, 1.1050))
chk("two bars clear is still not the reaction", sup.respected_at, None)
chk("...and the run is being counted", sup.clear_run, 2)
R._advance(sup, bar(4, 1.1000, 1.1050))
chk("THE THIRD bar clear is the reaction", sup.state, "respected")
chk("...stamped on that bar", sup.respected_at, 4)

print()
print("TOUCHING THE ZONE RESETS THE COUNT — 'moved away AND STAYED away'")
sup2 = zone("supply", 1.1100, 1.1120)
R._advance(sup2, bar(1, 1.1105, 1.1125))                # tap
R._advance(sup2, bar(2, 1.1000, 1.1050))                # clear 1
R._advance(sup2, bar(3, 1.1000, 1.1050))                # clear 2
R._advance(sup2, bar(4, 1.1090, 1.1105))                # BACK ON THE ZONE
chk("the run resets to zero", sup2.clear_run, 0)
R._advance(sup2, bar(5, 1.1000, 1.1050))
R._advance(sup2, bar(6, 1.1000, 1.1050))
chk("two more clear bars still do not stamp it", sup2.respected_at, None)
R._advance(sup2, bar(7, 1.1000, 1.1050))
chk("...it takes three UNBROKEN", sup2.respected_at, 7)
teeth("THE READING THIS PINS: 'three bars clear in any order' would have stamped this at bar 5, "
      "letting price chop in and out of the zone and still qualify",
      sup2.respected_at == 7)

print()
print("IT MUST STILL REFUSE — a rule that cannot say no is not a rule")
never = zone("supply", 1.1100, 1.1120)
for i in range(1, 8):
    R._advance(never, bar(i, 1.1105, 1.1125))           # price never leaves
chk("price that never leaves is never respected", never.respected_at, None)
untapped = zone("supply", 1.1100, 1.1120)
for i in range(1, 8):
    R._advance(untapped, bar(i, 1.1000, 1.1050))        # clear, but never tapped
chk("a zone never tapped is never respected", untapped.respected_at, None)
teeth("...even after 7 clear bars — the tap is still required", untapped.clear_run >= 3
      and untapped.respected_at is None)

# A BROKEN zone is dead and stops transitioning (`_advance` returns on `not z.live`).
brk = zone("supply", 1.1100, 1.1120)
R._advance(brk, bar(1, 1.1105, 1.1125))
R._advance(brk, bar(2, 1.1110, 1.1200, close=1.1190))   # closes ABOVE the top -> broken
chk("a body close beyond the distal breaks it", brk.state, "broken")
for i in range(3, 8):
    R._advance(brk, bar(i, 1.1000, 1.1050))
chk("a broken zone cannot become respected afterwards", brk.respected_at, None)

print()
print("THE OLD MEASURE IS GONE BY NAME — a behaviour test would pass if it came back")
chk("REACT_MULT no longer exists", hasattr(R, "REACT_MULT"), False)
chk("reacted_by no longer exists", hasattr(R.MarkedZone, "reacted_by"), False)


# ── THE PULLBACK DETECTOR ───────────────────────────────────────────────────
def walk(points, per=4):
    """Bars stepping linearly between waypoints, so every turning point becomes a REAL swing."""
    bars, t = [], 0
    for a, b in zip(points, points[1:]):
        for k in range(1, per + 1):
            px = a + (b - a) * k / per
            bars.append(bar(t := t + 1, px - 0.0006, px + 0.0006, close=px))
    return bars


# A SELL: price drops away from the zone (the reaction), retraces up (the pullback), then cracks
# back down — "the pullback has started ending".
_REACTION = [1.1100, 1.1000, 1.1040, 1.0920, 1.0960, 1.0850]   # stepped DOWN
_PULLBACK = [1.0950, 1.0900, 1.0990]                           # stepped UP, from the reaction low
_TURN     = [1.0870]                                           # below the 1.0900 swing, above 1.0850


def leg_then_pullback(turn: bool = False):
    """THREE THINGS MY FIRST FIXTURE GOT WRONG, all of which the code was RIGHT to refuse:

      * BOTH LEGS WERE STRAIGHT LINES. A monotonic move has no pivots at all, so
        `find_swing_points` returned nothing and `map_structure` saw no events — no reaction and no
        pullback, from a picture that looks like both to a human. Real price steps, and the steps ARE
        the structure this reads.
      * THE TURN WENT BELOW THE REACTION'S LOW. That is the move continuing past its own extreme, not
        a pullback ending: the leg simply extends and there is no pullback left to report. `_TURN`
        stops at 1.0870, under the 1.0900 swing it must break but above the 1.0850 reaction low.
      * THE PULLBACK'S DIPS WERE TOO SHALLOW to be swing lows — each "dip" still sat above the three
        bars before it, so nothing was ever a pivot.
    """
    pts = _REACTION + _PULLBACK + (_TURN if turn else [])
    return walk(pts)


print()
print("THE PULLBACK DETECTOR — BX had none; the shared one answers a different question")
still_going = pullback_state(leg_then_pullback(turn=False), "sell", since=0)
chk("a pullback that is still running is SEEN", still_going.running, True)
chk("...and is NOT reported as ending", still_going.ending, False)
teeth("THIS IS THE WHOLE POINT: a detector that says 'ending' while price is still retracing "
      "would send him to the chart at the worst moment",
      still_going.running is True and still_going.ending is False)

ended = pullback_state(leg_then_pullback(turn=True), "sell", since=0)
chk("once structure breaks back our way it IS reported as ending", ended.ending, True)
chk("...and it names the bar the break closed on", ended.turn_at > 0, True)
chk("the retrace is measured", 0.0 < ended.retrace <= 1.0, True)
chk("...and described in words", ended.depth in ("shallow", "about halfway", "deep", "very deep"), True)

print()
print("IT REFUSES WHEN THERE IS NOTHING THERE")
flat = [bar(i, 1.1000, 1.1002) for i in range(1, 40)]
chk("a flat market has no pullback", pullback_state(flat, "sell", since=0).running, False)
chk("too little history reports nothing", pullback_state(flat[:4], "sell", since=0).running, False)
teeth("an empty feed does not crash and does not invent a pullback",
      pullback_state([], "sell", since=0).running is False)

# `since` is the moment the zone was RESPECTED. Everything before it is the approach, not the
# reaction, so a `since` past the end of the data must find nothing rather than the wrong leg.
chk("a `since` after all the data finds nothing",
    pullback_state(leg_then_pullback(turn=True), "sell", since=10_000).running, False)


# ── THE ADVISORY ────────────────────────────────────────────────────────────
print()
print("THE ADVISORY CARRIES NO ENTRY, NO STOP, NO TARGET — that is the point, not an omission")
ext = zone("supply", 1.1100, 1.1120)
adv = build_advisory("EUR/USD", "sell", ended, ext, ["1H"], 5, "bx_sd", "BX-S/D")
chk("no entry",  adv.entry_price, 0.0)
chk("no stop",   adv.stop_loss,   0.0)
chk("no target", adv.take_profit, 0.0)
teeth("the card builder would happily have filled these with zeros unnoticed — this is what "
      "catches an entry being added later",
      (adv.entry_price, adv.stop_loss, adv.take_profit) == (0.0, 0.0, 0.0))

print()
print("IT IS ADVICE, SO IT GOES TO THE DM — the channel carries ENTRY signals only")
chk("flagged as an alert, not a trade", adv.alert_only, True)
chk("not routed to the public channel", adv.to_channel, False)

print()
print("IT TELLS HIM WHAT HAPPENED AND WHAT TO DO")
text = " ".join(adv.technical_reasons)
chk("it says the pullback has started ending", "STARTED ENDING" in text, True)
chk("it tells him to set his own entry", "set your own" in text, True)
chk("it names the 4H zone so he knows where to look", "1.11000" in text and "1.11200" in text, True)
teeth("it never implies BX has an entry", "entry to give you" in text or "set your own" in text)

print()
print("THE WORDS DESCRIBE THE MEASUREMENT, not a generic phrase")
lines = describe(ended, "sell", 5)
chk("three lines", len(lines), 3)
chk("the direction is right for a sell", "back down" in lines[0], True)
chk("the buy case mirrors it", "back up" in describe(ended, "buy", 5)[0], True)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
