"""THE LADDER — one table, his numbers, and the trade that prompted them.

HIS INSTRUCTION, 2026-09-02: *"Breakeven at 0.4R, Lock 1R at 2R and lock 2R at 2.5R and get out of
trade when price has started turning against us."*

**This SUPERSEDES the ladder settled on 2026-08-21 and reinstates the 2.5R rung that was explicitly
withdrawn that day.** Asserted here so the change is visible in a test rather than only in a diff.

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


# ── WHOSE LADDER IS IT? ─────────────────────────────────────────────────────
vix = rungs.ladder_for("vix1")
dflt = rungs.ladder_for(None)

s.check("VIX.1 has exactly three rungs", len(vix), 3)
s.check("...breakeven at 0.4R", (vix[0].at_r, vix[0].lock_r), (0.4, None))
s.check("...lock +1R at 2.0R", (vix[1].at_r, vix[1].lock_r), (2.0, 1.0))
s.check("...lock +2R at 2.5R — the rung withdrawn on 21 Aug, reinstated 2 Sep",
        (vix[2].at_r, vix[2].lock_r), (2.5, 2.0))
s.check("the rungs are ordered, so a gap cannot let a higher one fire first",
        [r.at_r for r in vix], sorted(r.at_r for r in vix))

# The default is the OLD ladder, deliberately unchanged: his new numbers are VIX.1's alone.
s.check("an unknown strategy keeps the old 1R breakeven", dflt[0].at_r, 1.0)
s.check("...and an unattributed position does too", rungs.ladder_for(None)[0].at_r, 1.0)
s.check("...and so does another strategy", rungs.ladder_for("bx_sd")[0].at_r, 1.0)
s.check("a suffixed vix1 id still resolves to VIX.1", rungs.ladder_for("vix1_x")[0].at_r, 0.4)
s.check("case does not matter", rungs.ladder_for("VIX1")[0].at_r, 0.4)


# ── THE BOUNDARY ────────────────────────────────────────────────────────────
# R is a ratio of differences between 5-decimal prices, so a true 0.400R can land at
# 0.39999999999. `>=` alone would silently never fire on the boundary.
def tags(strategy, r):
    return [x.tag for x in rungs.reached(rungs.ladder_for(strategy), r)]

s.check("0.39R reaches nothing", tags("vix1", 0.39), [])
s.check("EXACTLY 0.4R reaches breakeven", tags("vix1", 0.4), ["breakeven"])
s.check("0.4000000001R too", tags("vix1", 0.4 + 1e-10), ["breakeven"])
s.check("1.9R is still only breakeven", tags("vix1", 1.9), ["breakeven"])
s.check("2.0R adds the first lock", tags("vix1", 2.0), ["breakeven", "lock_1r"])
s.check("2.4R adds nothing more", tags("vix1", 2.4), ["breakeven", "lock_1r"])
s.check("2.5R adds the second lock", tags("vix1", 2.5), ["breakeven", "lock_1r", "lock_2r"])
s.check("10R does not invent a fourth rung", len(tags("vix1", 10.0)), 3)
s.check("a losing trade reaches nothing", tags("vix1", -0.5), [])

# The default ladder must NOT break even at 0.4R — that is the leak this design prevents.
s.check("0.4R on an unattributed position reaches NOTHING", tags(None, 0.4), [])
s.check("...it still waits for 1R", tags(None, 1.0), ["breakeven"])


# ── WHERE EACH RUNG PUTS THE STOP ───────────────────────────────────────────
E, RISK = 1.16048, 0.00062
s.check("breakeven's price is not computed here — only the position knows its costs",
        rungs.stop_price_for(vix[0], E, RISK, True), None)
s.check("lock +1R on a BUY sits one risk above entry",
        round(rungs.stop_price_for(vix[1], E, RISK, True), 5), round(E + RISK, 5))
s.check("lock +2R on a BUY sits two risks above entry",
        round(rungs.stop_price_for(vix[2], E, RISK, True), 5), round(E + 2 * RISK, 5))
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
s.check("under the old ladder it reaches nothing at all", tags(None, r_at_peak), [])


# ── ONE TABLE, TWO CONSUMERS ────────────────────────────────────────────────
# The whole point of the merge: the DM and the amend must read the same numbers.
print()
print("   both paths read the same table:")
tracker = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "monitor", "position_tracker.py"), encoding="utf-8").read()
watcher = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "monitor", "trade_watcher.py"), encoding="utf-8").read()
s.check("the 30s tracker reads the table", "rungs.ladder_for(strategy)" in tracker, True)
s.check("...and no longer defines its own rungs",
        "LADDER = [" in tracker or "BREAKEVEN_R = " in tracker, False)
s.check("both paths pass the owning strategy",
        "owner_of(p.position_id)" in tracker and "owner_of(p.position_id)" in watcher, True)


# ── TEETH ───────────────────────────────────────────────────────────────────
# 1. The disagreement that prompted the merge: a hardcoded 1R beside a table saying 0.4R.
s.teeth("two ladders with different breakevens would be caught",
        rungs.ladder_for("vix1")[0].at_r != rungs.ladder_for(None)[0].at_r
        and rungs.ladder_for("vix1")[0].at_r == 0.4)
# 2. Applying VIX.1's numbers to a position we cannot attribute.
s.teeth("giving an unattributed position VIX.1's breakeven would be caught",
        tags(None, 0.4) == [] and tags("vix1", 0.4) == ["breakeven"])
# 3. The float boundary that would silently never fire.
s.teeth("a bare >= would miss the boundary",
        not (0.4 - 1e-13 >= 0.4) and tags("vix1", 0.4 - 1e-13) == ["breakeven"])

s.done()
