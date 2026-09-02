"""NEITHER OF HIS TWO REAL TRADES MAY BE A LOSS.

His instruction, 2026-09-02: *"Fix and test until none of these two trades is a loss. One is win and
one is a BE."*

THE DEFECT. The manager keeps two ladders and picks by asking which strategy opened the position:

    VIX.1   (attributed)     breakeven at 0.4R
    DEFAULT (cannot tell)    breakeven at 1.0R

That question is answered by `fill_watch._owner`, a dict IN MEMORY, filled in exactly one place: when
a PENDING order is matched to its fill. Restart after an order has already filled and nothing ever
re-matches it, so the link is gone for good and the position silently drops onto the DEFAULT ladder.

Measured on his EUR/USD trade of 01 Sep, which peaked at +0.50R:

    VIX.1 ladder     breakeven fires at 0.4R  ->  exits  +0.00R
    DEFAULT ladder   nothing fires below 1.0R ->  exits  -1.00R
    what actually happened                        exited -1.05R

The trade behaved exactly as an unattributed position. `rehydrate_owners()` restores the link at
boot from `autotrade_orders.position_id`, so it survives a restart.

THE PRICES ARE REAL — minute bars pulled from his Pepperstone demo account, and the entries, stops
and targets are from the broker's own entry orders. The ladder logic is the REAL `monitor/rungs.py`,
driven through `tools/replay_ladder.py`, not a re-implementation of it.
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


# ── THE TWO LADDERS DIFFER, AND THAT IS THE WHOLE DEFECT ───────────────────
vix, default = R.ladder_for("vix1"), R.ladder_for(None)
s.check("VIX.1 moves to breakeven at 0.4R", vix[0].at_r, 0.4)
s.check("an unattributed position waits until 1.0R", default[0].at_r, 1.0)
s.check("...which is the gap a trade peaking at 0.50R falls into",
        vix[0].at_r < 0.50 < default[0].at_r, True)


# ── HIS REQUIREMENT: NEITHER TRADE IS A LOSS ───────────────────────────────
print()
print("   with the strategy known (what the fix guarantees):")

eur = replay(eurusd(), strategy="vix1")
s.check(f"EUR/USD exits at breakeven, not a loss (peaked {eur['best_r']:+.2f}R)",
        round(eur["exit_r"], 2), 0.0)
s.check("...because the breakeven rung fired",
        any("breakeven" in e[1] for e in eur["events"]), True)

gbp = replay(gbpusd(), strategy="vix1")
s.check(f"GBP/USD is not a loss either (peaked {gbp['best_r']:+.2f}R)",
        gbp["exit_r"] >= 0.0, True)

s.check("NEITHER TRADE IS A LOSS", [eur["exit_r"] < 0, gbp["exit_r"] < 0], [False, False])


# ── TEETH: THE DEFECT REALLY DID COST THE FULL R ───────────────────────────
print()
print("   with the strategy LOST to a restart (the defect):")
broken = replay(eurusd(), strategy=None)
s.check(f"EUR/USD takes a full loss ({broken['exit_r']:+.2f}R)", round(broken["exit_r"], 2), -1.0)
s.check("...and nothing fired at all", broken["events"][0][1].startswith("STOPPED"), True)
s.teeth("the fix is worth a whole R on this trade",
        round(eur["exit_r"] - broken["exit_r"], 2) == 1.0)


# ── WHERE THE WIN IS, AND WHY IT IS NOT THERE YET ──────────────────────────
#
# He asked for one WIN and one BE. The fix removes both losses, but it cannot manufacture the win:
# GBP/USD peaked at +1.78R as the manager measures it (R from the FILL, on the ASK, which is what
# `_price_now` returns for a sell) and the first PROFIT-locking rung sits at 2.0R. A rung that never
# triggers cannot protect anything.
#
# This test states that fact rather than hiding it, so the day the ladder changes, this number is
# right here to check against.
peak = gbp["best_r"]
first_lock = next(rung.at_r for rung in vix if rung.lock_r is not None)
s.check(f"GBP/USD peaked at {peak:.2f}R", round(peak, 2), 1.78)
s.check(f"...and the first profit lock sits at {first_lock}R", first_lock, 2.0)
s.check("...so it cannot lock a profit — the rung is never reached", peak < first_lock, True)

s.done()
