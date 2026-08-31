"""VIX.1 — the change-of-character route (`vix1_choch`), the one place a pullback is not asked for.

THE RULE UNDER TEST, in his words (2026-08-15):

    "When the break happens, we only trade if the candle is a momentum candle... However, if the
     break is not a momentum candle or arising from a choppy or a ranging market we don't trade."
    "the momentum candle might not be the one that caused the structure change... when we find a
     momentum candle in that event even if there is no pullback we take a trade."
    "A CHOCH is not a qualification for momentum — we are only trading if or when momentum develops
     in it along the way. So after the breakout has happened for a while we can start using the
     pullback rule."
    "a pullback ends when CHOCH begins. So until a move is considered CHOCH it is still a pullback
     no matter how deep."

THE ACCEPTANCE CASE IS HIS OWN CHART — EUR/USD 28 Jul 2026, the one he marked in images 4 and 5, on
real cTrader bars and through the REAL `detect_bias`. Before this route existed it was refused at
every hour; it must now BUY at 17:00 chart time off the break of 1.13732, and must STOP once the
uptrend confirms, because from that point the pullback rule is his rule again.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
import datetime as dt

from _harness import Suite, body, load

from strategies import vix1_choch
from strategies.vix1 import Vix1Strategy
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS, detect_bias
from strategies.vix1_choch import choch_entry
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state
from core.types import TF

s = Suite("VIX.1 — the change-of-character route")
H1_COUNT = Vix1Strategy.candle_counts[TF.H1]


def at_chart_time(bars, y, m, d, hh):
    """Index of the bar whose CHART time (UTC+3, his screen) is this. -1 if absent."""
    want = dt.datetime(y, m, d, hh) - dt.timedelta(hours=3)
    want = want.replace(tzinfo=dt.timezone.utc).timestamp()
    for i, c in enumerate(bars):
        if c.time == want:
            return i
    return -1


# ── HIS OWN CHART, REAL BARS ─────────────────────────────────────────────────────────────────────
eur = load("EURUSD_H1_to16Aug.csv", "H1")
if not eur:
    print("   (EURUSD_H1_to16Aug.csv absent — his-chart cases skipped)")
else:
    i17 = at_chart_time(eur, 2026, 7, 28, 17)
    s.check("his 28 Jul 17:00 candle is in the data", i17 > 0, True)
    if i17 > 0:
        b = detect_bias(eur[max(0, i17 - H1_COUNT):i17 + 1], [], "EUR/USD")
        s.check("28 Jul 17:00 now produces a bias at all", b is not None, True)
        if b:
            s.check("...it is a BUY", b.bullish, True)
            s.check("...it came from the change-of-character route", b.origin, "choch")
            s.check("...the market it broke out of was TRENDING", b.regime.kind, "trend")
            s.check("...the reason names the level he drew (1.13732)",
                    "1.13732" in b.reason, True)
            s.check("...and says no pullback was waited for",
                    "without waiting for a pullback" in b.reason, True)

        # THE EXEMPTION MUST SWITCH OFF. At 20:00 the uptrend confirms, so his pullback rule is back
        # in force — and it refuses, which is CORRECT: "after the breakout has happened for a while
        # we can start using the pullback rule".
        i20 = at_chart_time(eur, 2026, 7, 28, 20)
        if i20 > 0:
            b20 = detect_bias(eur[max(0, i20 - H1_COUNT):i20 + 1], [], "EUR/USD")
            s.check("28 Jul 20:00 — trend has confirmed, so the route is OFF again",
                    b20 is None or b20.origin != "choch", True)
            w20 = eur[max(0, i20 - H1_COUNT):i20 + 1][-_H1_TREND_BARS:]
            t20 = trend_state(w20, n=_H1_SWING_N, turns=structure_turns(w20, _H1_SWING_N))
            s.check("...because the turn is no longer pending", t20.pending, 0)


# ── SYNTHETIC: AN UPTREND THAT TURNS DOWN, SO BOTH DIRECTIONS ARE COVERED ────────────────────────
def zigzag(legs, start=1.1000, wick=0.2):
    """A staircase of H1 candles. `legs` = [(target, bars), ...]. Wicks are a share of the step."""
    out, p = [], start
    for target, n in legs:
        step = (target - p) / n
        for _ in range(n):
            o, c = p, p + step
            w = abs(step) * wick
            out.append(body(o, c, tf="H1", t=len(out), wick_up=w, wick_dn=w))
            p = c
    return out


# Five rising swings: highs 1.1050 -> 1.1150, lows 1.1025 -> 1.1125. Enough structure to establish an
# uptrend, to give the regime two highs and two lows that PROGRESS, and >60 bars before any break.
UP = [(1.1050, 10), (1.1025, 5), (1.1075, 10), (1.1050, 5), (1.1100, 10),
      (1.1075, 5), (1.1125, 10), (1.1100, 5), (1.1150, 10), (1.1108, 8)]

# THE MIRROR — five FALLING swings, so the turn is UP. Added 2026-08-25 with his one-sided rule:
#
#     "we do this only for CHOCH when trend is changing from uptrend to downtrend but not for
#      downtrend to uptrend."
#
# Every condition below (momentum required · not predating the break · the first pullback closing the
# window · the history and chop guards) still applies — but only to a turn UP, because a turn DOWN
# now stops at the new rule before reaching any of them. So the cases moved to the direction where
# the code path actually runs. THE COVERAGE IS THE SAME; only the fixture's direction changed.
# The bearish case gets its own assertion below, and its own file: `test_choch_bearish_proof.py`.
DOWN = [(1.1100, 10), (1.1125, 5), (1.1075, 10), (1.1100, 5), (1.1050, 10),
        (1.1075, 5), (1.1025, 10), (1.1050, 5), (1.1000, 10), (1.1042, 8)]


def state_of(bars):
    w = bars[-_H1_TREND_BARS:]
    turns = structure_turns(w, _H1_SWING_N)
    return w, trend_state(w, n=_H1_SWING_N, turns=turns), turns


def entry_for(bars, turns=None):
    w, t, tn = state_of(bars)
    return choch_entry(w, bars, t, tn if turns is None else turns, _H1_SWING_N, "EUR/USD")


# 1. THE BREAK IS ITSELF A BIG CANDLE -> trades. (Bodies in the staircase are ~5 pips, so the
#    100-bar median is ~5 and a momentum candle needs ~12.5; this one is 25.)
fires = (zigzag(DOWN, start=1.1150)
         + [body(1.1042, 1.1067, tf="H1", t=200, wick_up=0.00005, wick_dn=0.00005)])
w, t, _tn = state_of(fires)
s.check("the staircase established a downtrend then turned", t.pending, 1)
bias, why = entry_for(fires)
s.check("a big candle breaking the protecting high IS traded", bias is not None, True)
if bias:
    s.check("...as a BUY", bias.bullish, True)
    s.check("...from the change-of-character route", bias.origin, "choch")

# 1b. THE SAME SHAPE THE OTHER WAY UP IS NOW REFUSED — his rule, 2026-08-25. Asserted here so this
#     file cannot go green while the direction has been lost.
bear = zigzag(UP) + [body(1.1108, 1.1083, tf="H1", t=200, wick_up=0.00005, wick_dn=0.00005)]
_, t_bear, _ = state_of(bear)
bias_bear, why_bear = entry_for(bear)
s.check("the mirrored staircase turns DOWN", t_bear.pending, -1)
s.check("...and a turn down gets NO exemption", bias_bear is None, True)
s.check("...it must run, pull back and turn back down first", "must run, pull back" in why_bear, True)
s.teeth("the rule is one-sided — up is granted, down is refused",
        bias is not None and bias_bear is None)

# 2. THE BREAK IS A SMALL CANDLE AND NOTHING BIG FOLLOWS -> refused.
#    His rule: "a CHOCH is not a qualification for momentum".
quiet = (zigzag(DOWN, start=1.1150)
         + [body(1.1042, 1.1052, tf="H1", t=200, wick_up=0.00005, wick_dn=0.00005)])
_, tq, _ = state_of(quiet)
s.check("the small break still counts as a change of character", tq.pending, 1)
bias_q, why_q = entry_for(quiet)
s.check("a change of character with NO momentum is refused", bias_q is None, True)
s.check("...and says so", "no momentum candle that way yet" in why_q, True)

# 3. A BIG CANDLE THAT PREDATES THE BREAK -> refused. It is evidence for the move just reversed.
PRE = DOWN[:-1] + [(1.1010, 3)]
pre = (zigzag(PRE, start=1.1150)
       + [body(1.1010, 1.1035, tf="H1", t=200, wick_up=0.00005, wick_dn=0.00005)]  # big, but early
       + [body(1.1035, 1.1038, tf="H1", t=201, wick_up=0.00005, wick_dn=0.00005)]
       + [body(1.1038, 1.1041, tf="H1", t=202, wick_up=0.00005, wick_dn=0.00005)]
       + [body(1.1041, 1.1052, tf="H1", t=203, wick_up=0.00005, wick_dn=0.00005)])  # small break
_, tp, _ = state_of(pre)
bias_p, why_p = entry_for(pre)
# STILL REFUSED — but since 31 Aug it is refused EARLIER and for a better reason. `momentum_run`
# now requires the newest closed bar to BE the momentum candle, so a big candle three bars back is
# not found at all and the route stops at "no momentum candle that way yet". It used to be found,
# and then rejected by the separate `run[0] < choch_h1` test in `vix1_choch.py`.
#
# THAT TEST IS NOT DEAD AND MUST NOT BE DELETED: it is still reached when the newest bar IS a
# momentum candle but the RUN it belongs to started before the break — a run spanning the break.
# What matters here is the refusal, so that is what is asserted.
s.check("a big candle from BEFORE the break does not qualify", bias_p is None, True)
s.check("...and the reason names the missing CURRENT momentum candle",
        "no momentum candle that way yet" in why_p, True)

# 4. NO PENDING TURN AT ALL -> the route never answers.
plain = zigzag(DOWN[:-1], start=1.1150)
_, tpl, _ = state_of(plain)
bias_n, why_n = entry_for(plain)
s.check("with no change of character pending, the route stands aside", bias_n is None, True)
s.check("...and says why", "no change of character is pending" in why_n, True)

# 5. THE FIRST PULLBACK AFTER THE BREAK CLOSES THE WINDOW (his refinement, 2026-08-15):
#    "the exemption ends when we have the first pullback after CHOCH so that we dont trade in
#     pullbacks again."
#
#    TESTED BY INJECTING THE SWING, and that is deliberate. Measured over 12 months on both pairs
#    this guard never bites on real data — after a turn, the first confirmed swing the counter way is
#    almost always the very one that CONFIRMS the trend, so `pending` clears on the same bar. The
#    guard exists so the rule is stated rather than emergent: change `vix1_trend`'s confirm rule and
#    the two would come apart silently. A fixture cannot show a case the market does not produce, so
#    the guard is exercised directly instead of faking a market to reach it.
_w, _t, _turns = state_of(fires)
_pull = type(_turns[-1])(is_high=True, price=1.1060, index=_t.choch_index + 1,
                         confirmed=_t.choch_index + 2)     # a HIGH = a pullback off an UP-turn
bias_pb, why_pb = entry_for(fires, turns=list(_turns) + [_pull])
s.check("once the first pullback after the break is confirmed, the route stops", bias_pb is None, True)
s.check("...and says the pullback rule is back", "first pullback has already begun" in why_pb, True)
s.check("...while the SAME bars without that swing still trade", entry_for(fires)[0] is not None, True)

# ── THE CHOP / RANGE FILTER, ON REAL BARS ────────────────────────────────────────────────────────
# His answer (a): "if the break is... arising from a choppy or a ranging market we don't trade."
# Measured over 12 months this refuses 153 hours on EUR/USD, so a bounded slice contains some.
if eur:
    end = at_chart_time(eur, 2026, 7, 31, 23)
    reasons = set()
    if end > 0:
        for i in range(max(H1_COUNT, end - 700), end):
            w, t, tn = state_of(eur[max(0, i - H1_COUNT):i + 1])
            if t.pending == 0:
                continue
            _, why_i = choch_entry(w, eur[max(0, i - H1_COUNT):i + 1], t, tn,
                                   _H1_SWING_N, "EUR/USD")
            if "came out of a" in why_i:
                reasons.add(why_i.split("came out of a ")[1].split(" market")[0])
    s.check("real bars show breaks refused for the market they came out of",
            bool(reasons & {"CHOP", "RANGE"}), True)
    print(f"      (kinds seen in that slice: {sorted(reasons) or 'none'})")

# ── TEETH ────────────────────────────────────────────────────────────────────────────────────────
# Each guard must be able to REFUSE something it currently allows, or it is decoration.
_real_min = vix1_choch._MIN_BEFORE
vix1_choch._MIN_BEFORE = 10_000                      # demand impossible history
bias_t, why_t = entry_for(fires)
vix1_choch._MIN_BEFORE = _real_min
s.teeth("the history requirement", bias_t is None and "too little history" in why_t)

# The regime filter: make the market read CHOP and confirm the same trade is then refused.
#
# NOT by patching the constant `TREND` — `classify` builds its verdict from that same constant, so
# patching it moves BOTH sides of the comparison and the guard passes regardless. That version of
# this case failed here, which is the whole reason teeth exist.
_real_classify = vix1_choch.vix1_regime.classify
vix1_choch.vix1_regime.classify = lambda *a, **k: vix1_choch.vix1_regime.Regime(
    vix1_choch.vix1_regime.CHOP, "forced by the test")
bias_r, why_r = entry_for(fires)
vix1_choch.vix1_regime.classify = _real_classify
s.teeth("the chop/range filter", bias_r is None and "came out of a CHOP market" in why_r)

# And the whole route: with it stubbed out, his own chart must go back to producing nothing.
if eur and i17 > 0:
    _real_entry = vix1_choch.choch_entry
    import strategies.vix1_bias as _vb
    _vb.vix1_choch.choch_entry = lambda *a, **k: (None, "stubbed")
    b_off = detect_bias(eur[max(0, i17 - H1_COUNT):i17 + 1], [], "EUR/USD")
    _vb.vix1_choch.choch_entry = _real_entry
    s.teeth("his 28 Jul trade depends on this route", b_off is None)

s.done()
