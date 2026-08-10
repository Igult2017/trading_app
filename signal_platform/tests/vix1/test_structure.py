"""VIX.1 — the leg gate (`vix1_structure.leg_state`) and the trend's freeze regression.

THE RULE UNDER TEST, in the user's words (2026-08-11):

    "We can only take a trade after the first HH and HL (or LL and LH). Then when a momentum candle
     comes that forms the next HH (or LL), we take the trade — it is proof the trend is continuing.
     ... we don't trade pullbacks, we don't trade ranging markets and we are always in trend."

Every case is checked BOTH ways: the gate opens when the leg has proved itself and REFUSES when it
has not. A gate only ever tested with passing input cannot catch a regression that deletes it.

Offline — synthetic zigzags for the logic, the saved CSVs for the properties.
NOT A BACKTEST: no P&L, no win rate, no trades simulated.
"""
from _harness import Suite, body, load

from strategies.vix1_bias import _H1_SWING_N
from strategies.vix1_structure import _FAST_N, leg_state
from strategies.vix1_trend import trend_state

s = Suite("VIX.1 — the leg gate: no pullbacks, no ranges, always in trend")

LEG = _FAST_N * 2 + 2      # bars per leg: a pivot needs _FAST_N bars either side to be confirmed


def zigzag(points, leg=LEG):
    """Build H1 candles walking straight between the given prices, so each turn is a real pivot."""
    out, t = [], 0
    for a, b in zip(points, points[1:]):
        for k in range(leg):
            o = a + (b - a) * k / leg
            c = a + (b - a) * (k + 1) / leg
            out.append(body(round(o, 5), round(c, 5), tf="H1", t=t)); t += 1
    return out


# ── an UPTREND: high -> low -> HIGHER high -> HIGHER low -> now ──────────────────────────────────
print("   UPTREND — the gate opens only after HH then HL:")
up_ready = zigzag([1.1000, 1.1100, 1.1050, 1.1200, 1.1150, 1.1170])   # ends AFTER the higher low
r = leg_state(up_ready, 1)
s.check("HH then HL, momentum after the HL -> ALLOWED", r.ready, True)
s.check("  and it says which level it is following", r.pivot is not None, True)

# A FULL leg, then price makes a new high and is on its way DOWN from it. The pair (HH+HL) exists,
# so only the "after the HL" part can refuse this — which is the exact case he does not want traded:
# a momentum candle appearing INSIDE the pullback rather than after it.
up_mid = zigzag([1.1000, 1.1100, 1.1050, 1.1200, 1.1150, 1.1300, 1.1250])
r2 = leg_state(up_mid, 1)
s.check("inside the pullback (price falling off a new high) -> REFUSED", r2.ready, False)
s.check("  and it names the pullback as the reason", "pullback" in r2.why, True)

# and with too little history it refuses for a DIFFERENT, stated reason
r3 = leg_state(zigzag([1.1000, 1.1100, 1.1050]), 1)
s.check("too little structure -> REFUSED, and says so", "not enough" in r3.why, True)

# no higher high at all — a range, not a trend
rng = zigzag([1.1000, 1.1100, 1.1000, 1.1100, 1.1000, 1.1050])
s.check("a RANGE (no higher high) -> REFUSED", leg_state(rng, 1).ready, False)

# ── a DOWNTREND: the mirror ──────────────────────────────────────────────────────────────────────
print()
print("   DOWNTREND — the gate opens only after LL then LH:")
dn_ready = zigzag([1.1200, 1.1100, 1.1150, 1.1000, 1.1050, 1.1030])
s.check("LL then LH, momentum after the LH -> ALLOWED", leg_state(dn_ready, -1).ready, True)
dn_mid = zigzag([1.1200, 1.1100, 1.1150, 1.1000])
s.check("inside the pullback (no lower high yet) -> REFUSED", leg_state(dn_mid, -1).ready, False)

# ── direction is NEVER inferred here ─────────────────────────────────────────────────────────────
print()
s.check("no trend -> nothing may be traded", leg_state(up_ready, 0).ready, False)
s.check("  the SAME candles judged the other way are refused",
        leg_state(up_ready, -1).ready, False)

# ── THE 10-AUG SIGNAL, on real bars ──────────────────────────────────────────────────────────────
print()
print("   the signal that caused this change (GBP/USD 10 Aug, sell off the 09:00 candle):")
real = load("GBPUSD_H1_to10Aug.csv", "H1")
if real:
    # the 09:00 UTC bar is 9 bars before the last (18:00) in this file
    upto = [i for i, c in enumerate(real) if c.time == 1786352400 + 3 * 3600]
    idx = upto[0] if upto else len(real) - 10
    w = real[max(0, idx - 1500):idx + 1]
    st = trend_state(w, n=_H1_SWING_N)
    leg = leg_state(w, st.direction)
    print(f"      trend={st.direction:+d}  leg allows={leg.ready}  ({leg.why[:56]})")
    s.check("the 10-Aug sell is REFUSED by the leg gate", leg.ready, False)
else:
    print("      SKIP — no local data")

# ── the freeze regression ────────────────────────────────────────────────────────────────────────
# The old trend could set its protecting level to None and then NEVER turn again: GBP/USD spent 62%
# of bars frozen, once for 873 bars (~7 weeks), which is why it sold a rally for a whole day.
print()
print("   a trend must ALWAYS be able to turn:")
for pair in ("EURUSD", "GBPUSD"):
    bars = load(f"{pair}_H1.csv", "H1")
    if not bars:
        continue
    frozen = 0
    for end in range(1600, len(bars), 240):
        st = trend_state(bars[:end][-1500:], n=_H1_SWING_N)
        if st.direction != 0 and st.protected is None:
            frozen += 1
    s.check(f"{pair}: never in a trend with no level that could end it", frozen, 0)

# ── teeth ────────────────────────────────────────────────────────────────────────────────────────
print()
s.teeth("the leg gate", leg_state(up_mid, 1).ready is False)
s.teeth("the pullback rule", "pullback" in leg_state(up_mid, 1).why)
s.teeth("the direction guard", leg_state(up_ready, 0).ready is False)

s.done()
