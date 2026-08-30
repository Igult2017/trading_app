"""SIZING — the two directions must invert, and an unknown symbol must refuse, not guess.

TWO DEFECTS LIVE HERE, both of the same kind: a number that looked plausible and was silently wrong.

  1. The wire volume conversions drifted 100,000x in OPPOSITE directions — the write side
     `int(lots * 100)` too small, the read side `volume / 100` too large. The errors partly
     cancelled, which is exactly why neither was noticed for the platform's whole life, and why
     fixing one alone would have been MORE dangerous than fixing neither. They are asserted here as
     a round trip so they can only ever move together.

  2. `pip_value` returned $10/pip/lot for every symbol it did not recognise. For indices the true
     figure is about $0.10, so a risk-sized copy came out 100x too small, hit the 0.01-lot floor,
     and placed a token position that looked like a success. It now returns 0.0 meaning REFUSE.

     0.0 is also the divisor in `calc_lots`, so the refusal has to be caught by the guard clause
     rather than reaching the division. That is asserted below, because getting it wrong turns a
     skipped trade into a crashed dispatch task.
"""
from _harness import Suite, FakeFollower

from lot_calc import calc_lots, pip_value, pip_size, volume_for, lots_from_volume, MAX_LOTS

s = Suite("LOT CALC — round trips, and refusing to guess")

# A real cTrader forex contract spec: lotSize and volume are both in cents.
FX = {"known": True, "lot_size": 10_000_000, "step": 100_000, "min_volume": 100_000,
      "max_volume": 1_000_000_000}


# ── 1. THE ROUND TRIP (the 100,000x pair) ───────────────────────────────────
for lots in (0.01, 0.1, 0.5, 1.0, 2.5, 10.0):
    vol, refusal = volume_for(FX, lots)
    s.check(f"{lots} lots -> volume -> lots survives the trip", lots_from_volume(FX, vol), lots)
    s.check(f"{lots} lots is accepted by the broker's bounds", refusal, None)

s.check("1 standard lot is 10,000,000 on the wire, not 100", volume_for(FX, 1.0)[0], 10_000_000)

# The refusals. A spec we could not fetch must stop the trade, never fall back to a constant.
s.check("no contract spec -> refuses rather than guessing", volume_for({}, 1.0)[0], 0)
s.check("...and says why", "refusing to guess" in (volume_for({}, 1.0)[1] or ""), True)
s.check("below the broker's minimum -> refused", volume_for(FX, 0.000001)[0], 0)
s.check("above the broker's maximum -> refused", volume_for(FX, 500.0)[0], 0)
s.check("no spec on the read side -> 0.0 lots, which calc_lots treats as SKIP",
        lots_from_volume({}, 10_000_000), 0.0)

# TEETH: the old write-side expression must fail the broker's own bounds.
s.teeth("the 100,000x-too-small write", int(1.0 * 100) < FX["min_volume"])


# ── 2. PIP VALUE — exact, approximate, or refuse ────────────────────────────
s.check("EURUSD is exact at $10/pip/lot", pip_value("EURUSD"), 10.0)
s.check("gold is $10/pip/lot too — 100oz at a 0.1 pip (NOT a mislabel)", pip_value("XAUUSD"), 10.0)
s.check("gold's pip is 0.1, which is what makes that $10 correct", pip_size("XAUUSD"), 0.1)
s.check("JPY pairs stay approximate", pip_value("USDJPY"), 7.0)
s.check("US30 REFUSES rather than claiming $10 (was 100x too high)", pip_value("US30"), 0.0)
s.check("NAS100 refuses too", pip_value("NAS100"), 0.0)
s.check("a cross with no USD leg refuses", pip_value("EURGBP"), 0.0)
s.check("an empty symbol refuses", pip_value(""), 0.0)


# ── 3. RISK MODE MUST SKIP, NOT DIVIDE BY ZERO ──────────────────────────────
risk = FakeFollower(lot_mode="risk", risk_percent=1.0)
# 1% of $10,000 = $100 at risk; a 20-pip stop at $10/pip/lot costs $200 per lot -> 0.5 lots.
s.check("risk mode sizes normally on a symbol we can value",
        calc_lots(risk, 1.0, sl_pips=20, follower_equity=10_000, pip_value=pip_value("EURUSD")),
        0.5)
# The one that would crash: pip_value=0.0 reaching `risk_amount / (sl_pips * pip_value)`.
s.check("risk mode on an unvaluable symbol returns 0 (SKIP) and does not raise",
        calc_lots(risk, 1.0, sl_pips=20, follower_equity=10_000, pip_value=pip_value("US30")),
        0.0)
s.check("no stop-loss -> skip", calc_lots(risk, 1.0, sl_pips=None, follower_equity=10_000), 0.0)
s.check("no equity yet -> skip", calc_lots(risk, 1.0, sl_pips=20, follower_equity=None), 0.0)

# Mult and fixed need no pip value at all, so an index still copies through them.
mult = FakeFollower(lot_mode="mult", lot_multiplier=2.0)
s.check("mult mode is unaffected by the pip-value refusal", calc_lots(mult, 0.5), 1.0)
fixed = FakeFollower(lot_mode="fixed", fixed_lot=0.25)
s.check("fixed mode is unaffected too", calc_lots(fixed, 0.0), 0.25)
s.check("mult with no master volume and no fallback -> skip",
        calc_lots(FakeFollower(lot_mode="mult"), 0.0), 0.0)
s.check("the backstop clamp still holds", calc_lots(mult, 10_000.0), MAX_LOTS)

s.done()
