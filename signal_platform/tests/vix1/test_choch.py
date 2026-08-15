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


def state_of(bars):
    w = bars[-_H1_TREND_BARS:]
    return w, trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))


def entry_for(bars):
    w, t = state_of(bars)
    return choch_entry(w, bars, t, _H1_SWING_N, "EUR/USD")


# 1. THE BREAK IS ITSELF A BIG CANDLE -> trades. (Bodies in the staircase are ~5 pips, so the
#    100-bar median is ~5 and a momentum candle needs ~12.5; this one is 25.)
fires = zigzag(UP) + [body(1.1108, 1.1083, tf="H1", t=200, wick_up=0.00005, wick_dn=0.00005)]
w, t = state_of(fires)
s.check("the staircase established an uptrend then turned", t.pending, -1)
bias, why = entry_for(fires)
s.check("a big candle breaking the protecting low IS traded", bias is not None, True)
if bias:
    s.check("...as a SELL", bias.bullish, False)
    s.check("...from the change-of-character route", bias.origin, "choch")

# 2. THE BREAK IS A SMALL CANDLE AND NOTHING BIG FOLLOWS -> refused.
#    His rule: "a CHOCH is not a qualification for momentum".
quiet = zigzag(UP) + [body(1.1108, 1.1098, tf="H1", t=200, wick_up=0.00005, wick_dn=0.00005)]
_, tq = state_of(quiet)
s.check("the small break still counts as a change of character", tq.pending, -1)
bias_q, why_q = entry_for(quiet)
s.check("a change of character with NO momentum is refused", bias_q is None, True)
s.check("...and says so", "no momentum candle that way yet" in why_q, True)

# 3. A BIG CANDLE THAT PREDATES THE BREAK -> refused. It is evidence for the move just reversed.
PRE = UP[:-1] + [(1.1140, 3)]
pre = (zigzag(PRE)
       + [body(1.1140, 1.1115, tf="H1", t=200, wick_up=0.00005, wick_dn=0.00005)]  # big, but early
       + [body(1.1115, 1.1112, tf="H1", t=201, wick_up=0.00005, wick_dn=0.00005)]
       + [body(1.1112, 1.1109, tf="H1", t=202, wick_up=0.00005, wick_dn=0.00005)]
       + [body(1.1109, 1.1098, tf="H1", t=203, wick_up=0.00005, wick_dn=0.00005)])  # small break
_, tp = state_of(pre)
bias_p, why_p = entry_for(pre)
if tp.pending == -1 and bias_p is None:
    s.check("a big candle from BEFORE the break does not qualify",
            "predates the break" in why_p, True)
else:
    s.check("a big candle from BEFORE the break does not qualify",
            f"pending={tp.pending} bias={bias_p is not None}", "pending=-1 bias=False")

# 4. NO PENDING TURN AT ALL -> the route never answers.
plain = zigzag(UP[:-1])
_, tpl = state_of(plain)
bias_n, why_n = entry_for(plain)
s.check("with no change of character pending, the route stands aside", bias_n is None, True)
s.check("...and says why", "no change of character is pending" in why_n, True)

# ── THE CHOP / RANGE FILTER, ON REAL BARS ────────────────────────────────────────────────────────
# His answer (a): "if the break is... arising from a choppy or a ranging market we don't trade."
# Measured over 12 months this refuses 153 hours on EUR/USD, so a bounded slice contains some.
if eur:
    end = at_chart_time(eur, 2026, 7, 31, 23)
    reasons = set()
    if end > 0:
        for i in range(max(H1_COUNT, end - 700), end):
            w, t = state_of(eur[max(0, i - H1_COUNT):i + 1])
            if t.pending == 0:
                continue
            _, why_i = choch_entry(w, eur[max(0, i - H1_COUNT):i + 1], t, _H1_SWING_N, "EUR/USD")
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
