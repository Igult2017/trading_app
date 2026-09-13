"""RANGING, QUIET AND CHOPPY MARKETS — the ones he says we cannot do business in.

HIS THREE DEFINITIONS (2026-09-04), each a separate test in `vix1_tradeable`:

    RANGING  "not printing HHs and HLs for an uptrend and LLs and LHs for a downtrend"
    QUIET    "one that has no momentum candles which I call volume candles... no activities"
    CHOPPY   "it can be trending but prints 1 red volume candle then prints a bullish candle,
              meaning it has no specific group of candles in succession"

HE SENT THREE CHARTS OF SUCH MARKETS AND VIX.1 FIRED **12 SIGNALS** IN THEM — driven through the real
`detect_bias` on real broker bars, all twelve through the normal trend route.

WHAT THIS FILE PINS, AND IT IS DELIBERATELY THE HONEST NUMBER: **3 of the 12 are now refused, not
all 12.** The quiet test catches the three that came out of a market with no momentum candles at all.
The other nine need the chop rule, which is NOT built — his third definition has no test yet.

THE CONTROL MATTERS MORE THAN THE REFUSALS. His one marked TRADEABLE market — EUR/USD 03 Sep 2026,
*"a trending and volatile market"* — must still fire all three of its signals. It comes through the
REVERSAL route with the weakest structure of any window measured (highs -2.1x, lows -21.7x), so a
liveness test applied there would kill the setup this whole change exists to protect.

A BUG THIS FILE WOULD NOT HAVE CAUGHT, recorded because his own suite did. The first version of
`trend_reproven` looked for the wrong turn: in a downtrend the pullback goes UP and is confirmed by a
HIGH, and it was looking for a LOW. That refused his 2026-08-25 bearish sequence outright.
`test_choch_bearish_proof.py` went red and is what found it. Cross-strategy suites earn their keep.
"""
import datetime
import sys

import _harness  # noqa: F401
from _harness import Suite, load                                    # noqa: E402

from strategies import vix1_bias                                    # noqa: E402
from strategies.vix1_tradeable import market_awake, trend_reproven  # noqa: E402
from strategies.vix1_swings import structure_turns                  # noqa: E402
from strategies.vix1_trend import trend_state                       # noqa: E402

s = Suite("RANGING / QUIET / CHOPPY — the markets he cannot trade")

bars = load("EURUSD_H1_live_sep04.csv", "H1")
if not bars:
    print("  SKIP — EURUSD_H1_live_sep04.csv not present on this machine")
    sys.exit(0)


def at(when):
    t = int(datetime.datetime.strptime(when, "%Y-%m-%d %H:%M")
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    return next(i for i, c in enumerate(bars) if c.time == t)


def fires(when):
    i = at(when)
    return vix1_bias.detect_bias(bars[max(0, i + 1 - 3000):i + 1], [], "EUR/USD") is not None


# ── THE CONTROL FIRST. If this breaks, nothing else matters. ───────────────
print()
print("   his ONE tradeable market must still fire (03 Sep, the reversal that started this):")
for w in ("2026-09-03 11:00", "2026-09-03 12:00", "2026-09-03 16:00"):
    s.check(f"   {w} still trades", fires(w), True)


# ── HIS RULE: A QUIET MARKET MUST PROVE ITSELF ────────────────────────────
#
# The market went quiet. A momentum candle alone is NOT a trade — it must then RUN (3+ candles the
# trend's way, his number) and then PULL BACK (1+, his pullback rule) before one is trusted.
#
# WHAT THE FIRST VERSION DID, deployed 2026-09-04 and wrong within hours: it COUNTED momentum candles
# and refused when there were none. It blocked the 09:00 candle and let 14:00, 17:00 and 20:00
# straight through — and the only momentum candle in the window at 14:00 was **the 09:00 one it had
# just refused**. Evidence it rejected was used to satisfy it.
print()
print("   markets that went quiet and have not proved themselves — refused:")
for w in ("2026-08-05 06:00",      # img1: 35 quiet bars behind it
          "2026-08-05 11:00",      # ...and the next one, which the old rule waved through
          "2026-05-24 22:00",      # img2
          "2026-01-12 05:00", "2026-01-12 07:00", "2026-01-15 20:00",
          "2026-01-20 03:00", "2026-01-20 07:00", "2026-01-20 08:00"):
    s.check(f"   {w} refused", fires(w), False)

# ── STILL NOT SOLVED: THE CHOPPY CASE ─────────────────────────────────────
# By 17:00 that market genuinely HAD run and pulled back, so the quiet rule has no claim on it. These
# three are his CHOPPY definition, the ongoing project (docs/OPEN.md D42). Asserted as PASSING so a
# later change cannot close them by accident without this file going red and being explained.
print()
# ONE OF THE THREE CLOSED ON 2026-09-08, and this file going red is what forced it to be explained —
# which is exactly the job it was given. Recorded rather than silently flipped.
#
# 2026-08-03 18:00 is now REFUSED, and by his own trend rule rather than by anything about chop. The
# trend there is UP while the last two highs FALL (1.15385 -> 1.15347) and the last two lows fall too
# (1.15264 -> 1.15165). The deleted gate called that "a trend, tradeable" — because both sides moved
# together and it never compared them to the direction being traded, so a DOWN shape satisfied an UP
# trade. That is the 17.1% defect, landing on one of his own untradeable markets. `in_shape` asks
# the question against the trend's own direction, so it cannot happen again.
#
# THE OTHER TWO STILL TRADE, and still should by his rule: measured at those moments the market
# really is making higher highs AND higher lows (14:00 highs 1.15350 -> 1.15568, lows 1.15222 ->
# 1.15262). They remain the CHOPPY case — D42, unbuilt — and stay asserted as passing so a later
# change cannot close them by accident either.
print("   the choppy case — one closed by the trend-shape rule, two still open (D42):")
s.check("   2026-08-03 18:00 is now REFUSED — its shape pointed the other way", fires("2026-08-03 18:00"), False)
for w in ("2026-08-05 14:00", "2026-08-05 17:00"):
    s.check(f"   {w} STILL trades (known gap)", fires(w), True)


# ── THE RULE ASKED DIRECTLY ───────────────────────────────────────────────
print()
print("   the rule itself:")

from strategies.vix1_state import market_state                       # noqa: E402


def state_at(when):
    i = at(when)
    h1 = bars[max(0, i + 1 - 3000):i + 1]
    w = h1[-1500:]
    turns = structure_turns(w, 48)
    st = trend_state(w, n=48, turns=turns)
    ret, _, _ = market_state(w, st, "EUR/USD")
    return h1, st, ret, turns


# A market quiet for 35 bars whose pullback is only 2 must NOT be excused as "just a pullback".
# The first version asked only `retracement.active` — true almost always — and waved this through.
h1, st, ret, turns = state_at("2026-08-05 06:00")
why = market_awake(h1, st, ret, "EUR/USD", 24)
s.check("a market that went quiet and has not proved itself is refused", why is not None, True)
s.check("...and the refusal names what is missing, in his words",
        ("run" in (why or "")) or ("pulled back" in (why or "")), True)
s.teeth("...and its pullback really was far shorter than the silence", ret.bars < 24)

# NOT ENOUGH HISTORY IS NOT "QUIET". Refusing on absent data is a guess, and 24 hours back from a
# Monday morning is mostly a CLOSED market. This platform has shipped that mistake before.
s.check("too little history is not a refusal", market_awake(bars[:10], st, ret, "EUR/USD", 24), None)
s.check("a zero lookback is not a refusal either", market_awake(h1, st, ret, "EUR/USD", 0), None)
s.check("no trend means this rule stays silent — other gates own that case",
        market_awake(h1, None, ret, "EUR/USD", 24), None)

# `trend_reproven` must never fire when there is no trend to re-prove.
h1b, stb, retb, turnsb = state_at("2026-09-03 12:00")
s.check("no established trend -> the re-proof rule stays silent", stb.direction, 0)
s.check("...and returns None rather than refusing", trend_reproven(stb, turnsb, retb), None)
s.check("a missing trend state is not a refusal", trend_reproven(None, turnsb, retb), None)
s.check("a missing measurement is not a refusal either", trend_reproven(stb, turnsb, None), None)

# ── THE 2026-09-13 FIX: THE PULLBACK HAS ONE OWNER ────────────────────────
#
# HIS RULE, in his words: *"we start taking trades when the pullback [ends] and if the first candle
# after the pullback is a momentum candle, we take trade there."*
#
# `trend_reproven` used to answer "has it pulled back?" itself, by looking for a CONFIRMED turn
# against the trend. A turn is only confirmed once price closes back through the candle that made
# it — and that candle IS the momentum candle. So the proof arrived one bar too late, every time,
# and a momentum candle that ENDED a pullback could never be traded. It now asks
# `vix1_retracement`, which owns the question and already had the right answer.
#
# THE CASE IS HIS OWN: EUR/USD 11 Sep 2026 15:00 UTC, a 10.6-pip sell after a three-candle bounce.
print()
print("   the pullback question has ONE owner (his 11 Sep EUR/USD sell):")


class _Ret:
    """Only the field the rule reads."""
    def __init__(self, active):
        self.active = active


class _FakeTrend:
    """A downtrend that has run — enough for the rule to reach its pullback question."""
    direction = -1
    bos_index = 10
    direction_since = 5


s.check("a measured pullback is accepted with NO confirmed turn — the candle need not prove itself",
        trend_reproven(_FakeTrend(), [], _Ret(True)), None)
s.check("neither source sees one -> still refused, in his words",
        "pulled back" in (trend_reproven(_FakeTrend(), [], _Ret(False)) or ""), True)

# THE REAL BAR, THROUGH THE REAL PATH. The synthetic checks above pin the rule; this pins the
# actual candle he sent, so a later change cannot quietly re-break it.
_eur = load("EURUSD_H1_sep12.csv", "H1")
_t = int(datetime.datetime(2026, 9, 11, 15, tzinfo=datetime.timezone.utc).timestamp())
_i = next((k for k, c in enumerate(_eur) if c.time == _t), None)
if _i is not None:
    _h1 = _eur[max(0, _i + 1 - 3000):_i + 1]
    _w = _h1[-1500:]
    _turns = structure_turns(_w, 48)
    _st = trend_state(_w, n=48, turns=_turns)
    _ret, _, _ = market_state(_w, _st, "EUR/USD")
    _ran = _st.bos_index if _st.bos_index is not None else _st.direction_since
    _confirmed = [t for t in _turns if _ran is not None and t.index > _ran and t.is_high]
    s.check("   11 Sep 15:00 UTC — the trend really was DOWN", _st.direction, -1)
    s.check("   ...and NO confirmed turn had landed yet — this is the trap", len(_confirmed), 0)
    s.teeth("   ...but the retracement module did see the bounce", _ret.active and _ret.bars >= 1)
    s.check("   ...so the re-proof rule no longer refuses it",
            trend_reproven(_st, _turns, _ret), None)
else:
    print("   SKIP — EURUSD_H1_sep12.csv (broker bars incl. 11 Sep) not present on this machine")

s.done()
