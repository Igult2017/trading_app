"""VIX.1 — the R ratchet and the 1M structure exit (`vix1_manage`).

The user's rule: "We target 2R however, if the price is still moving, we lock 2R and still stay. So in
each movement we shall lock 1R until we see structure change." Implemented as a stop that TRAILS 1R
behind, switched on at 2R:  2R -> lock 1R,  3R -> lock 2R,  4R -> lock 3R ...

This is ADVICE — nothing here moves a broker stop. So the assertions are on the STATE the monitor
reports, which is exactly what the trader is told.
"""
from _harness import Suite, body

from strategies.vix1_manage import ARM_R, TRAIL_R, ManageState, run, structure_broken

s = Suite("VIX.1 — the R ratchet and the structure exit")

ENTRY, SL0 = 1.1000, 1.0990          # risk = 10 pips = 1R
RISK = ENTRY - SL0


def bars_to(r, bullish=True, n=4):
    """1M bars that reach exactly `r` R in favour and stay there."""
    px = ENTRY + r * RISK if bullish else ENTRY - r * RISK
    return [body(px, px, t=i, wick_up=0.00002, wick_dn=0.00002) for i in range(n)]


print("   below ARM_R nothing is locked — the original stop stands:")
st = run(ENTRY, SL0, True, bars_to(1.5))
s.check(f"peak 1.5R (< ARM_R={ARM_R}) locks nothing", st.locked_r, 0.0)
s.check("  and the stop is still the original", round(st.stop, 5), round(SL0, 5))

print()
print("   the ratchet steps in whole R, TRAIL_R behind:")
st2 = run(ENTRY, SL0, True, bars_to(2.0))
s.check(f"peak 2R locks {ARM_R - TRAIL_R}R", st2.locked_r, ARM_R - TRAIL_R)
st3 = run(ENTRY, SL0, True, bars_to(3.0))
s.check("peak 3R locks 2R", st3.locked_r, 2.0)
st4 = run(ENTRY, SL0, True, bars_to(4.2))
s.check("peak 4.2R locks 3R (whole R only)", st4.locked_r, 3.0)

print()
print("   the stop RATCHETS — it never moves backwards:")
st5 = run(ENTRY, SL0, True, bars_to(3.0))
after_peak = st5.stop
st5 = run(ENTRY, SL0, True, bars_to(2.2), state=st5)      # price falls back to 2.2R
s.check("a lower peak does not pull the stop back", round(st5.stop, 5), round(after_peak, 5))
s.check("  and the locked R is unchanged", st5.locked_r, 2.0)

print()
print("   the same rules short:")
sh = run(ENTRY, ENTRY + RISK, False, bars_to(3.0, bullish=False))
s.check("short: peak 3R locks 2R", sh.locked_r, 2.0)
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
s.teeth("the ARM_R floor", run(ENTRY, SL0, True, bars_to(1.9)).locked_r == 0.0)
s.teeth("the forward-only ratchet", st5.locked_r == 2.0 and round(st5.stop, 5) == round(after_peak, 5))
s.teeth("the wicks-never-count rule", structure_broken(wick_only, True) is False)

s.done()
