"""NEITHER OF HIS TWO REAL TRADES MAY BE A LOSS.

His instruction, 2026-09-02: *"Fix and test until none of these two trades is a loss."*

THERE IS ONE LADDER. His ruling, the same day: *"There is no fallback, the change was that we use
this new ladder and delete the other one."*

WHAT THE SECOND LADDER COST. Until then the manager kept two tables and chose between them by asking
which strategy opened the position — VIX.1 broke even at 0.4R, everything else at 1.0R. That question
was answered from a dict in memory, so a restart made every open position unattributed and handed it
the 1.0R table.

His EUR/USD trade of 01 Sep peaked at +0.50R: ABOVE 0.4R, BELOW 1.0R. It fell straight through the
gap between the two.

    the one ladder    breakeven fires at 0.4R   ->  exits  +0.00R
    the deleted one   nothing fires below 1.0R  ->  exits  -1.00R
    what happened                                   exited -1.05R

MY FIRST FIX WAS THE WRONG ONE and is recorded here so it is not repeated: I made the attribution
durable, which kept both tables and made the choice between them more reliable. His fix deletes the
second table, so there is no choice left to get wrong and nothing to lose across a restart. The
failure mode is gone rather than guarded.

THE PRICES ARE REAL — minute bars from his Pepperstone demo account, entries/stops/targets from the
broker's own entry orders, and the ladder logic is the REAL `monitor/rungs.py` driven through
`tools/replay_ladder.py`, never a re-implementation of it.
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(_HERE))
sys.path.insert(0, _ROOT)
sys.path.insert(0, os.path.join(_ROOT, "tools"))

from _harness import Suite                                    # noqa: E402
from replay_ladder import Trade, replay                       # noqa: E402
from monitor import rungs as R                                # noqa: E402

s = Suite("LADDER ATTRIBUTION — neither real trade may be a loss")

_BARS = json.load(open(os.path.join(_ROOT, "tools", "replay_bars.json")))


def eurusd():
    """01 Sep 14:03 -> 14:49. LONG. Peaked +0.50R, actually lost -1.05R."""
    return Trade("EUR/USD", "EURUSD", bullish=True, entry=1.16046, stop=1.15986,
                 target=1.16295, bars=_BARS["EURUSD"],
                 opened_ms=1788271402114, closed_ms=1788274166750, signal_entry=1.16048)


def gbpusd():
    """02 Sep 09:54 -> 11:09. SHORT. Peaked +1.78R as the manager measures it, exited ~0R."""
    return Trade("GBP/USD", "GBPUSD", bullish=False, entry=1.34880, stop=1.34939,
                 target=1.34672, bars=_BARS["GBPUSD"],
                 opened_ms=1788342844240, closed_ms=1788347398654,
                 spread=0.00009, signal_entry=1.34886)


# ── ONE LADDER, AND HIS TWO REAL TRADES ────────────────────────────────────
# His ruling, 2026-09-02: *"There is no fallback, the change was that we use this new ladder and
# delete the other one."* The old 1.0R-breakeven table is gone from the module; it is rebuilt here as
# a FIXTURE only, to show what it cost while it existed.
_OLD_LADDER = (R.Rung(1.0, None, "breakeven"), R.Rung(2.0, 1.0, "lock_1r"))

s.check("there is one ladder and it takes no argument", R.ladder.__code__.co_argcount, 0)
s.check("...breaking even at 0.4R for every position", R.ladder()[0].at_r, 0.4)
s.check("the ladder that could be selected instead is gone",
        any(n in dir(R) for n in ("_DEFAULT", "_BY_STRATEGY", "ladder_for", "trail_for")), False)

print()
print("   his two real trades, on the one ladder:")

eur = replay(eurusd())
s.check(f"EUR/USD exits at breakeven, not a loss (peaked {eur['best_r']:+.2f}R)",
        round(eur["exit_r"], 2), 0.0)
s.check("...because the breakeven rung fired",
        any("breakeven" in e[1] for e in eur["events"]), True)

gbp = replay(gbpusd())
s.check(f"GBP/USD is not a loss either (peaked {gbp['best_r']:+.2f}R)", gbp["exit_r"] >= 0.0, True)

s.check("NEITHER TRADE IS A LOSS", [eur["exit_r"] < 0, gbp["exit_r"] < 0], [False, False])


# ── TEETH: WHAT THE DELETED LADDER DID TO THE SAME TRADE ───────────────────
print()
print("   the same trade on the ladder that was deleted:")
old = replay(eurusd(), ladder=_OLD_LADDER, trail=None)
s.check(f"EUR/USD took a full loss ({old['exit_r']:+.2f}R)", round(old["exit_r"], 2), -1.0)
s.check("...because nothing fired at all", old["events"][0][1].startswith("STOPPED"), True)
s.teeth("deleting that ladder is worth a whole R on this trade",
        round(eur["exit_r"] - old["exit_r"], 2) == 1.0)
s.teeth("...and his trade peaked exactly in the gap between the two breakevens",
        R.ladder()[0].at_r < eur["best_r"] < _OLD_LADDER[0].at_r)


# ── WHERE THE WIN IS, AND WHY IT IS NOT THERE YET ──────────────────────────
# He asked for one WIN and one BE. One ladder removes both losses, but it cannot manufacture the win:
# GBP/USD peaked at +1.78R as the manager measures it (R from the FILL, on the ASK, which is what
# `_price_now` returns for a sell) and the first PROFIT-locking rung sits at 2.0R. A rung that is
# never reached cannot protect anything. Stated here rather than hidden, so the day the numbers
# change this is right beside them.
peak = gbp["best_r"]
first_lock = next(rung.at_r for rung in R.ladder() if rung.lock_r is not None)
s.check(f"GBP/USD peaked at {peak:.2f}R", round(peak, 2), 1.78)
s.check(f"...and the first profit lock sits at {first_lock}R", first_lock, 2.0)
s.check("...so it cannot lock a profit — the rung is never reached", peak < first_lock, True)

s.done()
