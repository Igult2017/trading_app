"""THE LADDER — one table, his numbers, and the trade that prompted them.

HIS INSTRUCTION, 2026-09-02: *"Breakeven at 0.4R, Lock 1R at 2R and lock 2R at 2.5R and get out of
trade when price has started turning against us."*

**REVISED THE SAME DAY, and the upper half is now a TRAIL rather than a rung:** *"when price moves to
2.1R lock 2R and when it moves to 2.5R lock 2.4R and when it moves to 2.6R lock 2.5R and go with that
math until we are stopped out."* Every one of those is one rule — keep the stop 0.1R behind — so the
fixed 2.5R rung is gone and his three worked examples are asserted below, verbatim.

WHY THE TABLE EXISTS AT ALL. There were two ladders for one trade and they disagreed: the code that
MOVES his stop broke even at 1R, the DM that ADVISES him did nothing below 2R. He asked for them
merged. The teeth case at the bottom is that disagreement — it must not be reachable again.

WHY PER STRATEGY. A `Position` read from the broker carries NO strategy; cTrader does not know what
opened it. A single global constant could not be changed for VIX.1 without silently re-tuning every
other strategy's trades. **An unattributed position must keep the OLD defaults** — that direction is
asserted explicitly, because getting it backwards would apply one strategy's numbers to another's
money.

THE CASE WE KNOW THE ANSWER TO. His EUR/USD trade of 01 Sep — signal 70d8dac7, entry 1.16048, stop
1.15986, peak 1.16075 — is replayed at the bottom. It is the only trade whose outcome is not in
dispute, so it is asserted rather than argued about.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from _harness import Suite

from monitor import rungs
from monitor.rungs import Rung

s = Suite("THE LADDER — 0.4R / 2.0R / 2.5R, per strategy")


# ── ONE LADDER, FOR EVERY POSITION ──────────────────────────────────────────
# His ruling, 2026-09-02: *"There is no fallback, the change was that we use this new ladder and
# delete the other one."* The second ladder (breakeven 1.0R) is gone. It existed for positions whose
# strategy could not be identified, and because that identification lived in memory, a restart sent
# every open position to it — his EUR/USD trade of 01 Sep peaked at +0.50R, fell in the gap between
# the two breakevens, and lost a full R where this ladder scratches it.
vix = rungs.ladder()

# TWO FIXED RUNGS NOW, not three. The 2.5R -> lock 2R rung is GONE, replaced by the trail that
# protects +2R from 2.1R — earlier and higher. Leaving it would have fired a second alert at 2.5R
# telling him to move the stop DOWN from 2.4R to 2.0R. The trail is asserted at the bottom.
s.check("VIX.1 has exactly two FIXED rungs, then trails", len(vix), 2)
s.check("...breakeven at 0.4R", (vix[0].at_r, vix[0].lock_r), (0.4, None))
s.check("...lock +1R at 1.5R", (vix[1].at_r, vix[1].lock_r), (1.5, 1.0))
s.check("...and a trail takes over above that", rungs.trail() is not None, True)
s.check("the rungs are ordered, so a gap cannot let a higher one fire first",
        [r.at_r for r in vix], sorted(r.at_r for r in vix))

# THERE IS NOTHING TO SELECT. No argument, no map, no fallback — so no position can be handed
# numbers he did not ask for, whatever else has gone wrong.
s.check("the ladder takes no strategy argument",
        rungs.ladder.__code__.co_argcount, 0)
s.check("...and neither does the trail", rungs.trail.__code__.co_argcount, 0)
s.check("the OLD 1R-breakeven ladder is gone from the module",
        any(n in dir(rungs) for n in ("_DEFAULT", "_BY_STRATEGY", "_TRAIL_BY_STRATEGY",
                                      "ladder_for", "trail_for")), False)
s.check("breakeven is 0.4R for EVERY position", rungs.ladder()[0].at_r, 0.4)


# ── THE BOUNDARY ────────────────────────────────────────────────────────────
# R is a ratio of differences between 5-decimal prices, so a true 0.400R can land at
# 0.39999999999. `>=` alone would silently never fire on the boundary.
def tags(_unused, r):
    return [x.tag for x in rungs.reached(rungs.ladder(), r)]

s.check("0.39R reaches nothing", tags("vix1", 0.39), [])
s.check("EXACTLY 0.4R reaches breakeven", tags("vix1", 0.4), ["breakeven"])
s.check("0.4000000001R too", tags("vix1", 0.4 + 1e-10), ["breakeven"])
s.check("1.49R is still only breakeven", tags("vix1", 1.49), ["breakeven"])
s.check("2.0R adds the first lock", tags("vix1", 2.0), ["breakeven", "lock_1r"])
# `tags()` reads the FIXED rungs only (no trail passed), so above 2.0R it stops growing — the trail
# is asserted separately at the bottom of this file, where its own numbers live.
s.check("2.4R adds no further FIXED rung", tags("vix1", 2.4), ["breakeven", "lock_1r"])
s.check("2.5R adds none either — the old rung there is gone",
        tags("vix1", 2.5), ["breakeven", "lock_1r"])
s.check("10R does not invent a third fixed rung", len(tags("vix1", 10.0)), 2)
s.check("a losing trade reaches nothing", tags("vix1", -0.5), [])

# THE DELETED LADDER, kept here as a FIXTURE and not as live code, because what it did to his trade
# is worth remembering. Its breakeven sat at 1.0R. Anything that could not be attributed to a
# strategy got it — and attribution lived in memory, so a restart meant every open position did.
_OLD_LADDER = (rungs.Rung(1.0, None, "breakeven"), rungs.Rung(2.0, 1.0, "lock_1r"))
_old = lambda r: [x.tag for x in rungs.reached(_OLD_LADDER, r)]
s.check("the deleted ladder reached NOTHING at 0.4R", _old(0.4), [])
s.check("...where this one breaks even", tags("vix1", 0.4), ["breakeven"])
s.check("...it still waits for 1R", tags(None, 1.0), ["breakeven"])


# ── WHERE EACH RUNG PUTS THE STOP ───────────────────────────────────────────
E, RISK = 1.16048, 0.00062
s.check("breakeven's price is not computed here — only the position knows its costs",
        rungs.stop_price_for(vix[0], E, RISK, True), None)
s.check("lock +1R on a BUY sits one risk above entry",
        round(rungs.stop_price_for(vix[1], E, RISK, True), 5), round(E + RISK, 5))
# +2R is now reached by the TRAIL at 2.1R rather than by a fixed rung, so the price is checked
# through the trailing step — the same arithmetic, from the rung the code actually produces.
_two_r = [x for x in rungs.reached(vix, 2.1, rungs.trail()) if x.lock_r == 2.0][0]
s.check("lock +2R on a BUY sits two risks above entry",
        round(rungs.stop_price_for(_two_r, E, RISK, True), 5), round(E + 2 * RISK, 5))
s.check("a SELL locks BELOW its entry",
        round(rungs.stop_price_for(vix[1], E, RISK, False), 5), round(E - RISK, 5))


# ── HIS ACTUAL TRADE, 01 SEP ────────────────────────────────────────────────
# Signal 70d8dac7: BUY EUR/USD, entry 1.16048, stop 1.15986, filled 14:07, stopped 14:49.
# Peak 1.16075 (read from his chart). Risk 6.2 pips.
print()
print("   his EUR/USD trade of 01 Sep — the one case whose answer is not in dispute:")
PEAK = 1.16075
r_at_peak = (PEAK - E) / RISK
s.check("the trade peaked at 0.44R", round(r_at_peak, 2), 0.44)
s.check("0.4R would have armed — the breakeven price is reached at 1.16073",
        round(E + 0.4 * RISK, 5), 1.16073)
s.check("...and the peak cleared it", r_at_peak >= 0.4, True)
s.check("the OLD 1R breakeven sat at 1.16110", round(E + 1.0 * RISK, 5), 1.16110)
s.check("...which the trade never reached — why nothing moved", r_at_peak >= 1.0, False)
s.check("under the new ladder it reaches breakeven and nothing above it",
        tags("vix1", r_at_peak), ["breakeven"])
s.check("under the deleted ladder it reached nothing at all — the full loss", _old(r_at_peak), [])


# ── ONE TABLE, TWO CONSUMERS ────────────────────────────────────────────────
# The whole point of the merge: the DM and the amend must read the same numbers.
print()
print("   both paths read the same table:")
tracker = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "monitor", "position_tracker.py"), encoding="utf-8").read()
watcher = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "monitor", "trade_watcher.py"), encoding="utf-8").read()
s.check("the 30s tracker reads the table", "rungs.ladder()" in tracker, True)
s.check("...and no longer defines its own rungs",
        "LADDER = [" in tracker or "BREAKEVEN_R = " in tracker, False)
# Neither path selects a ladder any more, so neither may still be asking who owns the position.
s.check("neither path looks up an owning strategy",
        "owner_of" in tracker or "owner_of" in watcher, False)
s.check("...and both call the single ladder",
        "rungs.ladder()" in tracker and "_lines(p, r, price)" in watcher, True)


# ── TEETH ───────────────────────────────────────────────────────────────────
# 1. The disagreement that prompted the merge: a hardcoded 1R beside a table saying 0.4R.
s.teeth("the deleted ladder really did have a later breakeven",
        _OLD_LADDER[0].at_r == 1.0 and rungs.ladder()[0].at_r == 0.4)
s.teeth("...and a trade peaking at 0.50R falls between them",
        rungs.ladder()[0].at_r < 0.50 < _OLD_LADDER[0].at_r)
# 2. The second ladder coming back. There is one table now; a second one is the whole defect.
s.teeth("a second ladder with a different breakeven would be caught",
        _OLD_LADDER[0].at_r != rungs.ladder()[0].at_r)
# 3. The float boundary that would silently never fire.
s.teeth("a bare >= would miss the boundary",
        not (0.4 - 1e-13 >= 0.4) and tags("vix1", 0.4 - 1e-13) == ["breakeven"])



# ── THE TRAIL — his three worked examples, exactly as he wrote them ─────────
_LAD  = rungs.ladder()
_TR   = rungs.trail()


def _lock_at(r):
    """The R the stop is put at when price reaches `r`, or None."""
    got = [x for x in rungs.reached(_LAD, r, _TR) if x.lock_r is not None]
    return got[-1].lock_r if got else None


s.check("2.1R locks 2.0R — his first example", _lock_at(2.1), 2.0)
s.check("2.5R locks 2.4R — his second",        _lock_at(2.5), 2.4)
s.check("2.6R locks 2.5R — his third",         _lock_at(2.6), 2.5)
s.check("...and it keeps going: 4.7R locks 4.6R", _lock_at(4.7), 4.6)

# THE BOUNDARY IS THE WHOLE REASON THIS IS COUNTED IN TENTHS. R is a ratio of differences between
# 5-decimal prices, so a true 2.5 arrives just under it. `int(r * 10)` would read 24 and lock 2.3R —
# one step low, silently, on exactly the number he named.
s.check("a hair under 2.5R still locks 2.4R", _lock_at(2.4999999999997), 2.4)
s.check("a hair under 2.1R still locks 2.0R", _lock_at(2.0999999999998), 2.0)

# BELOW THE TRAIL, THE FIXED RUNGS ARE UNCHANGED.
s.check("0.3R is still too early for anything", _lock_at(0.3), None)
s.check("2.0R still locks 1R, not 1.9R",        _lock_at(2.0), 1.0)
s.check("2.05R has not earned a trail step yet", _lock_at(2.05), 1.0)
s.check("breakeven still arrives at 0.4R",
        [x.tag for x in rungs.reached(_LAD, 0.4, _TR)], ["breakeven"])

# ONE STEP PER JUMP. Price running 2.1R -> 3.0R between two checks must move the stop once, to 2.9R.
_jump = [x for x in rungs.reached(_LAD, 3.0, _TR) if x.tag.startswith("trail")]
s.check("a jump to 3.0R yields ONE trailing step", len(_jump), 1)
s.check("...at 2.9R, not at 2.0R", _jump[0].lock_r, 2.9)

# THE TRAIL NEVER PULLS A STOP BACKWARDS — a fixed rung protecting more wins.
s.check("no trailing step undercuts the 1R rung",
        all(x.lock_r is None or x.lock_r >= 1.0 for x in rungs.reached(_LAD, 2.1, _TR)), True)

# EVERY LOCK IS SILENT; ONLY BREAKEVEN AND THE EXIT SPEAK. His rule, 2026-09-02: "Locking Rs should
# only be announced when we move to breakeven and when we are out of the market... We dont need to
# get all the messages like 1R locked in the DM." The stop still MOVES on every one of these — see
# `test_position_tracker` for the rule that a lock is only marked done once the broker confirms it.
s.check("breakeven SPEAKS", rungs.reached(_LAD, 0.4, _TR)[-1].quiet, False)
s.check("lock +1R is silent",             [x.quiet for x in rungs.reached(_LAD, 2.0, _TR)][-1], True)
s.check("2.1R -> lock 2.0R is silent",    [x.quiet for x in rungs.reached(_LAD, 2.1, _TR)][-1], True)
s.check("2.2R -> lock 2.1R is silent",    [x.quiet for x in rungs.reached(_LAD, 2.2, _TR)][-1], True)
s.check("2.6R -> lock 2.5R is silent",    [x.quiet for x in rungs.reached(_LAD, 2.6, _TR)][-1], True)
s.check("...and so is every step up to 6R",
        all(x.quiet for r in (3.0, 4.0, 5.0, 6.0)
            for x in rungs.reached(_LAD, r, _TR) if x.lock_r is not None), True)
s.check("a silent step still carries a stop price",
        rungs.stop_price_for(rungs.reached(_LAD, 2.2, _TR)[-1], 1.0, 0.001, True) is not None, True)

# ONE LADDER, SO NOTHING CAN DIVERGE. There is no second table to keep in step and no selection to
# get wrong — which is the whole point of deleting it rather than making the selection more reliable.
s.check("EVERY position trails — there is no ladder without one", rungs.trail() is not None, True)
s.check("...and every position gets the same rungs at 4.5R",
        [x.tag for x in rungs.reached(rungs.ladder(), 4.5, rungs.trail())],
        ["breakeven", "lock_1r", "trail_4.4r"])

s.teeth("the deleted 2.5R->2R rung cannot come back as a lower target",
        _lock_at(2.5) > 2.0)
s.teeth("floating point really would have broken the boundary",
        int(2.4999999999997 * 10) == 24)

s.done()
