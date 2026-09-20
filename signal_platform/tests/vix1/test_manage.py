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

from strategies.vix1_manage import ManageState, run

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
# The +1R lock now sits at 1.5R. 1.4R, not 1.49R: `bars_to` adds a 0.00002 wick, which is 0.02R
# here, so 1.49R would tip over the rung on the wick alone and test the opposite of its name.
mid = run(ENTRY, SL0, True, bars_to(1.4))
s.check("1.4R still locks nothing above breakeven", mid.locked_r, 0.0)
s.check("  and the stop is still the entry", round(mid.stop, 5), round(ENTRY, 5))

print()
print("   the locks, at his levels:")
st2 = run(ENTRY, SL0, True, bars_to(2.0))
s.check("peak 2.0R locks +1R", st2.locked_r, 1.0)
s.check("  stop sits one risk above entry", round(st2.stop, 5), round(ENTRY + RISK, 5))
# ABOVE 2.2R THE LADDER TRAILS, KEEPING 0.2R BEHIND — his revision of 2026-09-20: *"At 2.2R move to
# 2R and keep moving 0.2R behind the move until your trailing stop is hit"*. It replaces the 0.1R gap
# from 2.1R of 02 Sep, which was smaller than the spread on every sell he has traded, so the stop was
# refused as through the market and never trailed at all (see monitor/stop_placement.py).
# This advice path reads the SAME table as the code that moves the real stop, so these numbers are
# the amend's numbers.
st21 = run(ENTRY, SL0, True, bars_to(2.1))
s.check("peak 2.1R is below the trail's start — the +1R lock still stands", st21.locked_r, 1.0)
st22 = run(ENTRY, SL0, True, bars_to(2.2))
s.check("peak 2.2R locks +2R — the trail's first step", st22.locked_r, 2.0)
st24 = run(ENTRY, SL0, True, bars_to(2.4))
s.check("peak 2.4R locks +2.2R", st24.locked_r, 2.2)
st3 = run(ENTRY, SL0, True, bars_to(2.5))
s.check("peak 2.5R locks +2.3R", st3.locked_r, 2.3)
st4 = run(ENTRY, SL0, True, bars_to(6.0))
s.check("peak 6R keeps trailing — locks +5.8R", st4.locked_r, 5.8)

print()
print("   the stop RATCHETS — it never moves backwards:")
st5 = run(ENTRY, SL0, True, bars_to(2.5))
after_peak = st5.stop
st5 = run(ENTRY, SL0, True, bars_to(2.1), state=st5)      # price falls back to 2.1R
s.check("a lower peak does not pull the stop back", round(st5.stop, 5), round(after_peak, 5))
s.check("  and the locked R is unchanged", st5.locked_r, 2.3)

print()
print("   the same rules short:")
sh = run(ENTRY, ENTRY + RISK, False, bars_to(2.5, bullish=False))
s.check("short: peak 2.5R locks +2.3R, the same trail as a long", sh.locked_r, 2.3)
s.check("short: the stop sits ABOVE entry-side, below start", sh.stop < ENTRY + RISK, True)

print()
print("   the structure exit — a BODY CLOSE beyond the last swing, wicks never count:")
# a long: swing low then a close beneath it
# THE 1M STRUCTURE EXIT WAS DELETED 2026-09-13 — his instruction, "I has no use now so delete it".
# Its fixtures and four checks went with it. It was half of a rule his 2026-09-03 ladder replaced:
# that ladder ends "until we get knocked out", so the STOP is the only exit and there is nothing
# here to test. Do not rebuild it without a fresh instruction from him.


# ── WHICH RUNGS SPEAK — his rule, and it had leaked once already ─────────────────────────────────
#
# HIS RULE, 2026-09-02: *"Locking Rs should only be announced when we move to breakeven and when we
# are out of the market... We dont need to get all the messages like 1R locked in the DM."*
#
# `monitor/rungs.py` carried it from the day he said it (every locking rung is `quiet=True`) but the
# flag stopped at the table: `vix1_manage` returned a bare number, so `vix1_alerts` had no way to ask
# and DM'd every rung — the exact messages he asked to stop. Fixed 2026-09-13; pinned here so the
# instruction cannot be applied in one place and forgotten in the other a second time.
print()
print("   which rungs SPEAK — breakeven only, per his 2026-09-02 rule:")
_ev = run(ENTRY, SL0, True, bars_to(3.0)).events
s.check("every rung carries the ladder's own quiet flag", all(len(e) == 3 for e in _ev), True)
s.check("BREAKEVEN speaks", [e[2] for e in _ev if e[1] == 0.0], [False])
s.check("every LOCKING rung is silent — including the trail",
        all(e[2] for e in _ev if e[1] > 0.0), True)
s.teeth("there really were locking rungs to silence", len([e for e in _ev if e[1] > 0.0]) > 0)

print()
print("   it is ADVICE — the state carries what to TELL him:")
st6 = run(ENTRY, SL0, True, bars_to(3.0))
s.check("ratchet steps are recorded as events", len(st6.events) > 0, True)
s.check("state exposes the peak reached", st6.peak_r >= 3.0, True)

print()
s.teeth("nothing locks below 1.5R", run(ENTRY, SL0, True, bars_to(1.4)).locked_r == 0.0)
s.teeth("...and 1.5R DOES lock 1R", run(ENTRY, SL0, True, bars_to(1.5)).locked_r == 1.0)
s.teeth("the forward-only ratchet", st5.locked_r == 2.3 and round(st5.stop, 5) == round(after_peak, 5))

s.done()
