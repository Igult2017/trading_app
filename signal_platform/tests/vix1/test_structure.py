"""VIX.1 — the pullback refusal (`vix1_structure`), trend maturity, and two shipped regressions.

THE RULE UNDER TEST, in the user's words (2026-08-11):

    "The trend has developed — HH and HL (or LL and LH) ... then we see a momentum candle in the same
     direction, we anticipate a trend and we want to ride with it."
    "A momentum candle in a developing HH cannot break structure ... it is not easy for 1 candle to
     break structure in most cases."
    "we don't trade pullbacks, we don't trade ranging markets and we are always in trend."

So: direction comes from the TREND; the faster structure only gets to say NO, and only when it is
trending the OPPOSITE way. Nothing here asks a candle to break anything.

Every case is checked BOTH ways. Offline — synthetic zigzags for the logic, saved CSVs for the
properties. NOT A BACKTEST: no P&L, no win rate, no trades simulated.
"""
from _harness import Suite, body, load

from shared.candle_math import atr
from strategies import vix1_bias, vix1_structure
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_regime import classify
from strategies.vix1_swings import structure_turns
from strategies.vix1_structure import _FAST_N, fast_pattern, leg_state, market_permits
from strategies.vix1_trend import trend_state
from strategies.vix1_watch import check_invalidation

s = Suite("VIX.1 — ride the trend, refuse the pullback")

LEG = _FAST_N * 2 + 2       # a pivot needs _FAST_N bars either side before it is confirmed


def zigzag(points, leg=LEG):
    """H1 candles walking straight between the given prices, so every turn is a real pivot."""
    out, t = [], 0
    for a, b in zip(points, points[1:]):
        for k in range(leg):
            out.append(body(round(a + (b - a) * k / leg, 5),
                            round(a + (b - a) * (k + 1) / leg, 5), tf="H1", t=t)); t += 1
    return out


rising = zigzag([1.1000, 1.1100, 1.1050, 1.1200, 1.1150, 1.1170])     # HH + HL
falling = zigzag([1.1200, 1.1100, 1.1150, 1.1000, 1.1050, 1.1030])    # LL + LH
choppy = zigzag([1.1000, 1.1100, 1.1000, 1.1100, 1.1000, 1.1050])     # equal highs/lows

print("   what the faster structure reads:")
s.check("a rising zigzag reads UP", fast_pattern(rising), "up")
s.check("a falling zigzag reads DOWN", fast_pattern(falling), "down")
s.check("a flat range does NOT read as a trend", fast_pattern(choppy) in ("mixed", "unclear"), True)

# ── the refusal, and it is the ONLY one ──────────────────────────────────────────────────────────
print()
print("   the faster structure may only say NO, and only when it points the other way:")
s.check("uptrend + faster structure UP -> ride it", leg_state(rising, 1).ready, True)
s.check("downtrend + faster structure DOWN -> ride it", leg_state(falling, -1).ready, True)
s.check("uptrend + faster structure DOWN -> REFUSED (a pullback)", leg_state(falling, 1).ready, False)
s.check("downtrend + faster structure UP -> REFUSED (a pullback)", leg_state(rising, -1).ready, False)
s.check("  and the refusal says it is a pullback", "pullback" in leg_state(rising, -1).why, True)

# NOT contradicting is enough — an unclear or mixed reading must NOT block the trend.
# This is the difference from the first version of this gate, which demanded confirmation and so
# permitted trading only 15-18% of the time a trend existed.
s.check("uptrend + a flat/mixed faster reading -> still ride it", leg_state(choppy, 1).ready, True)
s.check("no trend -> nothing may be traded", leg_state(rising, 0).ready, False)

# ── trend maturity: both are tradeable, they just differ ─────────────────────────────────────────
print()
print("   developing vs developed — a label, never a gate:")
for pair in ("EURUSD", "GBPUSD"):
    bars = load(f"{pair}_H1.csv", "H1")
    if not bars:
        continue
    seen = set()
    for end in range(1600, len(bars), 400):
        st = trend_state(bars[:end][-_H1_TREND_BARS:], n=_H1_SWING_N)
        seen.add(st.maturity)
    print(f"      {pair}: labels seen -> {sorted(seen)}")
    s.check(f"{pair}: both maturities really occur", {"developing", "developed"} <= seen, True)

# ── THE 10-AUG SIGNAL, on real bars ──────────────────────────────────────────────────────────────
print()
print("   the signal that caused this rebuild (GBP/USD 10 Aug, sell off the 09:00 candle):")
# REWRITTEN 2026-08-12 (audit finding 5). This asserted trend -1, structure "up", refused — all
# measured on the OLD lookback path, which production stopped using. It passed and guarded NOTHING.
#
# AND THE NEW ANSWER IS BETTER, which is the point worth pinning. The real-time reader has that trend
# as UP, and UP was CORRECT: price rose +85 pips over the following week. The old reader saying DOWN
# was the original defect. So the sell is not merely refused now — it can never be SOUGHT, because
# VIX.1 is pro-trend only and would be hunting for a BUY.
real = load("GBPUSD_H1_to10Aug.csv", "H1")
if real:
    idx = next((i for i, c in enumerate(real) if c.time == 1786363200), len(real) - 10)
    w = real[max(0, idx - _H1_TREND_BARS):idx + 1]
    turns = structure_turns(w, _H1_SWING_N)
    st = trend_state(w, n=_H1_SWING_N, turns=turns)
    leg = leg_state(w, st.direction, turns=turns)
    reg = classify(turns, atr(w, 14))
    print(f"      trend={st.direction:+d} ({st.maturity})  structure={leg.pattern}  "
          f"regime={reg.kind}  leg allows={leg.ready}")
    s.check("the real-time trend reads UP — which is what price actually did (+85 pips)",
            st.direction, 1)
    s.check("so a SELL is never even sought (pro-trend only)", st.direction == -1, False)
    s.check("and the market is not tradeable anyway", reg.kind in ("range", "chop"), True)
    s.check("   ...so the gate refuses it", market_permits(reg) is not None, True)
else:
    print("      SKIP — no local data")

# ── regression: a PENDING setup must still be invalidated when the trend flips ───────────────────
# SHIPPED AND CAUGHT IN REVIEW 2026-08-11. vix1_watch asked `detect_bias`, which since the pullback
# refusal returns None whenever a NEW trade is not permitted — so a setup whose trend had genuinely
# flipped stopped being invalidated, because the flip itself suppressed the answer.
print()
print("   a pending setup is judged on the TREND, not on whether a new trade is allowed:")
eur = load("EURUSD_H1.csv", "H1")
if eur:
    w = eur[-_H1_TREND_BARS:]
    # THE TREND MUST BE READ THE WAY `check_invalidation` READS IT — audit bug 1, and this test found
    # it the moment the fix landed. It used to compute `d` with no turning points, i.e. the old 48-bar
    # lookback, then build a setup "facing the wrong way" against THAT. Production now judges a
    # resting order on the real-time reader, and the two disagreed on 56% of GBP/USD and 60% of
    # EUR/USD momentum candles — so the fixture was labelling setups wrong-way that the code
    # (correctly) saw as right-way. A test that computes its own expectation a different way from the
    # code under test proves nothing.
    d = trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N)).direction
    if d != 0:
        wrong = {"bullish": d != 1, "entry": w[-1].close, "sl": w[-1].close * 0.99,
                 "locked_at": w[-1].time + 3600}
        right = {**wrong, "bullish": d == 1}
        s.check("a setup facing the WRONG way is invalidated",
                check_invalidation(wrong, w, w, [], wrong["locked_at"] + 60),
                "1HR trend flipped against the setup")
        s.check("a setup facing the RIGHT way is left alone",
                check_invalidation(right, w, w, [], right["locked_at"] + 60), None)

# ── the freeze regression ────────────────────────────────────────────────────────────────────────
print()
print("   a trend must ALWAYS be able to turn:")
for pair in ("EURUSD", "GBPUSD"):
    bars = load(f"{pair}_H1.csv", "H1")
    if not bars:
        continue
    frozen = sum(1 for end in range(1600, len(bars), 240)
                 if (lambda st: st.direction != 0 and st.protected is None)(
                     trend_state(bars[:end][-_H1_TREND_BARS:], n=_H1_SWING_N)))
    s.check(f"{pair}: never in a trend with no level that could end it", frozen, 0)

# ── the 4HR fallback is MUTED, and must stay muted until deliberately switched ───────────────────
# Kept, not deleted, on his instruction: "Dont remove it. Just mute it so that we can turn it on when
# we ever need it in future." It is off because the two-stage turn gave `t1 == 0` a second meaning
# ("a reversal is pending"), which would have let it trade mid-reversal — measured, 5 times in the
# last 600 GBP/USD bars alone.
print()
s.check("the 4HR fallback ships MUTED", vix1_bias._ALLOW_H4, False)

# ── IS THE MARKET WORTH TRADING AT ALL — range and depth ────────────────────────────────────────
# His settled design: "The retracement should work with reversal or CHOCH detector and range detector
# hand in hand." The reversal half is already enforced by vix1_trend (a pending CHoCH = no direction);
# these two are the other half.
#
# NOTE WHAT IS *NOT* TESTED HERE, deliberately: nothing asks the momentum candle whether the
# retracement has ended. He settled that — "Momentum candle is a proof of the continuation of the
# trend" — and a test that re-introduced the question would re-introduce the rule.
print()
print("   the market gate — only a TREND is tradeable (his rule, 2026-08-12):")
from strategies.vix1_regime import CHOP, RANGE, TREND, UNCERTAIN, Regime   # noqa: E402

s.check("a trend is allowed", market_permits(Regime(TREND, "progressing")), None)
s.check("a RANGE is refused", market_permits(Regime(RANGE, "bounded")) is not None, True)
s.check("   ...and the card can say which", "RANGE" in market_permits(Regime(RANGE, "b")), True)
s.check("CHOP is refused", market_permits(Regime(CHOP, "scattered")) is not None, True)
s.check("   ...and is named separately from a range",
        "CHOP" in market_permits(Regime(CHOP, "scattered")), True)
s.check("UNCERTAIN is refused - never trade on 'cannot tell'",
        market_permits(Regime(UNCERTAIN, "not enough swings")) is not None, True)
s.check("no regime at all -> allowed, so a missing reading can never silently mute the strategy",
        market_permits(None), None)

# THE THRESHOLDS THAT WERE REMOVED MUST STAY REMOVED. Depth went on his argument (a retracement deep
# enough to matter breaks the protected low and the CHoCH detector has it); the efficiency cut went
# because the distribution has no natural break. Re-adding either silently fails here.
s.check("no depth threshold exists", hasattr(vix1_structure, "_MAX_DEPTH_ATR"), False)
s.check("no efficiency threshold exists", hasattr(vix1_structure, "_RANGE_EFFICIENCY"), False)

# ── teeth ────────────────────────────────────────────────────────────────────────────────────────
print()
s.teeth("the pullback refusal", leg_state(rising, -1).ready is False)
s.teeth("the no-trend guard", leg_state(rising, 0).ready is False)
s.teeth("the permissive rule", leg_state(choppy, 1).ready is True)
s.teeth("the market gate refuses a range", market_permits(Regime(RANGE, "b")) is not None)
s.teeth("...and allows a trend", market_permits(Regime(TREND, "p")) is None)

s.done()
