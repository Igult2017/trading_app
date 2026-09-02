"""VIX.1 — the R ratchet and the 1M structure exit (`vix1_manage`).

HIS LADDER, 2026-09-02, superseding the 2026-07-25 trailing reading:

    0.4R -> BREAKEVEN      2.0R -> lock +1R      2.5R -> lock +2R

*"Breakeven at 0.4R, Lock 1R at 2R and lock 2R at 2.5R and get out of trade when price has started
turning against us."* The 2.5R rung had been withdrawn on 2026-08-21 and is now reinstated. The rungs
come from `monitor/rungs.py`, the one table both this advice path and the real stop amend read — they
used to be two ladders with different numbers for the same trade.

This is ADVICE — nothing here moves a broker stop. So the assertions are on the STATE the monitor
reports, which is exactly what the trader is told.
"""
from _harness import Suite, body

from strategies.vix1_manage import ManageState, run, structure_broken

s = Suite("VIX.1 — the R ratchet and the structure exit")

ENTRY, SL0 = 1.1000, 1.0990          # risk = 10 pips = 1R
RISK = ENTRY - SL0


def bars_to(r, bullish=True, n=4):
    """1M bars that reach exactly `r` R in favour and stay there."""
    px = ENTRY + r * RISK if bullish else ENTRY - r * RISK
    return [body(px, px, t=i, wick_up=0.00002, wick_dn=0.00002) for i in range(n)]


print("   below the first rung nothing moves — the original stop stands:")
st = run(ENTRY, SL0, True, bars_to(0.3))
s.check("peak 0.3R locks nothing", st.locked_r, 0.0)
s.check("  and has not reached breakeven", st.be_done, False)
s.check("  and the stop is still the original", round(st.stop, 5), round(SL0, 5))

print()
print("   BREAKEVEN at 0.4R — his new first rung:")
be = run(ENTRY, SL0, True, bars_to(0.5))
s.check("peak 0.5R takes the breakeven rung", be.be_done, True)
s.check("  and the stop moves to the entry", round(be.stop, 5), round(ENTRY, 5))
s.check("  while locking no R — breakeven protects zero", be.locked_r, 0.0)
# ONE breakeven event, not its exact R: `bars_to` adds a 2-pip wick, so the peak is 0.52R, not
# 0.50R. Asserting the fixture's arithmetic instead of the behaviour is how a test breaks on a
# change that is not a defect.
s.check("  announced exactly once", len([e for e in be.events if e[1] == 0.0]), 1)
s.check("  ...and not again on a later poll",
        len([e for e in run(ENTRY, SL0, True, bars_to(1.5), state=be).events if e[1] == 0.0]), 1)
mid = run(ENTRY, SL0, True, bars_to(1.9))
s.check("1.9R still locks nothing above breakeven", mid.locked_r, 0.0)
s.check("  and the stop is still the entry", round(mid.stop, 5), round(ENTRY, 5))

print()
print("   the locks, at his levels:")
st2 = run(ENTRY, SL0, True, bars_to(2.0))
s.check("peak 2.0R locks +1R", st2.locked_r, 1.0)
s.check("  stop sits one risk above entry", round(st2.stop, 5), round(ENTRY + RISK, 5))
# ABOVE 2.0R THE LADDER TRAILS — his revision of 2026-09-02: "when price moves to 2.1R lock 2R and
# when it moves to 2.5R lock 2.4R and when it moves to 2.6R lock 2.5R and go with that math until we
# are stopped out". The old fixed 2.5R -> +2R rung is gone; the trail reaches +2R at 2.1R instead.
# This advice path reads the SAME table as the code that moves the real stop, so these numbers are
# the amend's numbers.
st21 = run(ENTRY, SL0, True, bars_to(2.1))
s.check("peak 2.1R locks +2R — his first worked example", st21.locked_r, 2.0)
st24 = run(ENTRY, SL0, True, bars_to(2.4))
s.check("peak 2.4R locks +2.3R", st24.locked_r, 2.3)
st3 = run(ENTRY, SL0, True, bars_to(2.5))
s.check("peak 2.5R locks +2.4R — his second worked example", st3.locked_r, 2.4)
st4 = run(ENTRY, SL0, True, bars_to(6.0))
s.check("peak 6R keeps trailing — locks +5.9R", st4.locked_r, 5.9)

print()
print("   the stop RATCHETS — it never moves backwards:")
st5 = run(ENTRY, SL0, True, bars_to(2.5))
after_peak = st5.stop
st5 = run(ENTRY, SL0, True, bars_to(2.1), state=st5)      # price falls back to 2.1R
s.check("a lower peak does not pull the stop back", round(st5.stop, 5), round(after_peak, 5))
s.check("  and the locked R is unchanged", st5.locked_r, 2.4)

print()
print("   the same rules short:")
sh = run(ENTRY, ENTRY + RISK, False, bars_to(2.5, bullish=False))
s.check("short: peak 2.5R locks +2.4R, the same trail as a long", sh.locked_r, 2.4)
s.check("short: the stop sits ABOVE entry-side, below start", sh.stop < ENTRY + RISK, True)

print()
print("   the structure exit — a BODY CLOSE beyond the last swing, wicks never count:")
# a long: swing low then a close beneath it
# find_swing_points(n=3) needs 3 bars either side of the pivot, so the low sits at index 4 of a
# long-enough series. A shorter fixture forms no swing at all and the test proves nothing.
_hi = [body(1.1020, 1.1022, t=i, wick_up=0.0001, wick_dn=0.0001) for i in range(4)]
_low = [body(1.1000, 1.1002, t=4, wick_dn=0.0005)]                      # the swing LOW (1.0995)
_up  = [body(1.1015, 1.1020, t=i, wick_up=0.0001, wick_dn=0.0001) for i in range(5, 12)]
swing = _hi + _low + _up
closed_below = swing + [body(1.1010, 1.0990, t=12), body(1.0990, 1.0985, t=13),
                        body(1.0985, 1.0980, t=14)]
s.check("a close beyond the swing low breaks structure (long)",
        structure_broken(closed_below, True), True)
wick_only = swing + [body(1.1015, 1.1020, t=12, wick_dn=0.0040),
                     body(1.1020, 1.1022, t=13), body(1.1022, 1.1024, t=14)]
s.check("a WICK through it does not break structure", structure_broken(wick_only, True), False)
s.check("no swing yet -> not broken", structure_broken([body(1.1, 1.1001, t=0)], True), False)

print()
print("   it is ADVICE — the state carries what to TELL him:")
st6 = run(ENTRY, SL0, True, bars_to(3.0))
s.check("ratchet steps are recorded as events", len(st6.events) > 0, True)
s.check("state exposes the peak reached", st6.peak_r >= 3.0, True)

print()
s.teeth("nothing locks below 2R", run(ENTRY, SL0, True, bars_to(1.9)).locked_r == 0.0)
s.teeth("the forward-only ratchet", st5.locked_r == 2.4 and round(st5.stop, 5) == round(after_peak, 5))
s.teeth("the wicks-never-count rule", structure_broken(wick_only, True) is False)

s.done()
