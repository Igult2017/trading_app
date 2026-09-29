"""RANGING, QUIET AND CHOPPY MARKETS — the ones he says we cannot do business in.

HIS THREE DEFINITIONS (2026-09-04), each a separate test in `vix1_tradeable`:

    RANGING  "not printing HHs and HLs for an uptrend and LLs and LHs for a downtrend"
    QUIET    "one that has no momentum candles which I call volume candles... no activities"
    CHOPPY   "it can be trending but prints 1 red volume candle then prints a bullish candle,
              meaning it has no specific group of candles in succession"

HE SENT THREE CHARTS OF SUCH MARKETS AND VIX.1 FIRED **12 SIGNALS** IN THEM — driven through the real
`detect_bias` on real broker bars, all twelve through the normal trend route.

WHAT THIS FILE PINS, AND IT IS DELIBERATELY THE HONEST NUMBER. The quiet test catches the three that
came out of a market with no momentum candles at all. Since then two more rules of his have closed
more of them, each named at the assertion it closes:

  * 2026-09-16, his pullback timing rule — 2026-08-03 18:00;
  * 2026-09-21, his RANGE rule (`vix1_chop`: is price still inside the box the last move drew?) —
    2026-08-05 14:00 and 17:00, verified by driving the real `detect_bias` with the gate muted and
    live.

So the chop definition is no longer "unbuilt" — what is still unbuilt is a test for his THIRD
definition (candles with no succession), and the assertions below say which is which rather than
claiming a total.

THE CONTROL MATTERS MORE THAN THE REFUSALS. His one marked TRADEABLE market — EUR/USD 03 Sep 2026,
*"a trending and volatile market"* — must not be killed by the rules in this file. It comes through
the REVERSAL route with the weakest structure of any window measured (highs -2.1x, lows -21.7x), so a
liveness test applied there would kill the setup this whole change exists to protect. SINCE
2026-09-14 that route's shortcut is switched off for a turn up (his instruction), so the control is
checked with the shortcut ON, and the live default — no trade on those three bars — beside it.

A BUG THIS FILE WOULD NOT HAVE CAUGHT, recorded because his own suite did. The first version of
`trend_reproven` looked for the wrong turn: in a downtrend the pullback goes UP and is confirmed by a
HIGH, and it was looking for a LOW. That refused his 2026-08-25 bearish sequence outright.
`test_choch_bearish_proof.py` went red and is what found it. Cross-strategy suites earn their keep.
"""
import datetime
import sys

import _harness  # noqa: F401
from _harness import Suite, body, load                              # noqa: E402

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
# These three BUYs come through the change-of-character SHORTCUT. His instruction of 2026-09-14
# switched that shortcut off for a turn up ("enable pullback to uptrend the same way we have a pullback
# after first trend run in the downtrend"). So the control this file owns — the quiet and re-proof
# rules must not kill this setup — is checked with the shortcut ON, and the live default beside it.
from strategies import vix1_choch                                   # noqa: E402

print()
print("   his ONE tradeable market must not be killed by THESE rules (03 Sep, the reversal):")
for w in ("2026-09-03 11:00", "2026-09-03 12:00", "2026-09-03 16:00"):
    vix1_choch._EXEMPT_UP_TURNS = True
    try:
        _on = fires(w)
    finally:
        vix1_choch._EXEMPT_UP_TURNS = False
    s.check(f"   {w} still trades with the up-turn shortcut on", _on, True)

# WHAT THE DEFAULT DOES NOW, and it changed on 2026-09-29 for the 16:00 bar only.
#
# This used to assert all three stay silent by default — "the turn up has not proved itself yet".
# Two still do. The 16:00 one trades, and the cause is his instruction of that day: *"Pullback is
# just the opposite candle in our move."* `trend_reproven` used to ask a CONFIRMED SWING whether the
# market had pulled back, and the swing detector misses 93% of one-candle pullbacks (measured, six
# instruments, `tools/pullback_vs_swings.py`). Counting candles instead, the pullback behind that
# bar is plainly there, so the re-proof rule stops refusing it.
#
# ⚠ THIS IS NOT THE GATE GOING AWAY. It moves: what may trade and when is now the TIMING rule
# (`vix1_retracement.entry_timing`), which is where he put it — 1-3 candle pullback trades its first
# momentum candle, a longer one waits three, no pullback at all waits three from the break.
for w, want in (("2026-09-03 11:00", False), ("2026-09-03 12:00", False), ("2026-09-03 16:00", True)):
    s.check(f"   {w} by default: {'TRADES' if want else 'silent'}", fires(w), want)


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
# ALL THREE OF HIS CHOPPY MARKETS TRADE AGAIN — 2026-09-13, and this file going red is what forced
# it to be written down, which is exactly the job it was given.
#
# WHAT HAPPENED. 2026-08-03 18:00 was refused from 2026-09-08 by the trend SHAPE test. He removed
# that test on 2026-09-13 as an invented third state: *"a pullback ends when CHOCH begins... There is
# no third state"* (his settled rule, docs/strategies/vix1.md), and *"that second swing is not mine
# and i dont know where you got it."*
#
# SO IT WAS NEVER CLOSED BY A CHOP RULE. It was closed by a rule he had not asked for, and it is back
# to what it always was: **D42, the chop definition, still unbuilt**. Asserted as PASSING so a later
# change cannot close it by accident either — the same guard the other two have always had.
#
# HIS CHOP DEFINITION, still the thing that would close all three: *"it can be trending but prints 1
# red volume candle then prints a bullish candle, meaning it has no specific group of candles in
# succession"*, plus *"a mixture of big bodies, small bodies, long wicks and no wicks"*.
print("   the choppy case — all three still open (D42, chop rule unbuilt):")
# 2026-09-16: HIS PULLBACK RULE CLOSED ONE OF THE THREE. *"after the pullback, we take trade from the
# 3rd candle and above... unless the pullback was made of 1-3 candles."* 2026-08-03 18:00 is the first
# candle after a pullback longer than three, so it is now refused — by an entry-timing rule, not by a
# chop rule. The other two remain open gaps (D42) and are still asserted as trading, so nothing closes
# silently.
s.check("   2026-08-03 18:00 no longer trades — his 16 Sep pullback rule refuses it",
        fires("2026-08-03 18:00"), False)
# ⚠ 2026-09-21 — A ROUND TRIP, AND THEN THE GAPS ACTUALLY CLOSED. For one day the void rule was
# credited with closing 2026-08-05 14:00; it closed it for the WRONG REASON (that build called a
# single momentum candle a "void" and refused almost everything), and once a void was properly a
# BAND of price these traded again.
#
# THEY ARE CLOSED NOW, BY HIS RANGE RULE OF THE SAME DAY — *"until the price gets out of the two
# lines... it is ranging"*. Verified by driving the real `detect_bias` twice: with the gate muted
# both trade, with it live both are refused and the reason names the box (1.14549-1.15584). Two of
# the three markets he marked untradeable are therefore shut, and by a rule that is his, not mine.
for w in ("2026-08-05 14:00", "2026-08-05 17:00"):
    s.check(f"   {w} no longer trades — his range rule: price never left the box",
            fires(w), False)



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
s.check("...and returns None rather than refusing", trend_reproven(stb, h1b, h1b[-1].time), None)
s.check("a missing trend state is not a refusal", trend_reproven(None, h1b, h1b[-1].time), None)
s.check("no candles is not a refusal either", trend_reproven(stb, None, h1b[-1].time), None)

# ── THE 2026-09-13 FIX: THE PULLBACK HAS ONE OWNER ────────────────────────
#
# HIS RULE, in his words: *"we start taking trades when the pullback [ends] and if the first candle
# after the pullback is a momentum candle, we take trade there."*
#
# `trend_reproven` used to answer "has it pulled back?" from a CONFIRMED TURN, and fell back to
# `measure().active`. Both are gone. HIS INSTRUCTION, 2026-09-29: *"Forget about those complicated
# ineffective tools you are using to measure pullback. Pullback is just the opposite candle in our
# move."* Measured before changing it (`tools/pullback_vs_swings.py`, six instruments, real broker
# H1): the swing detector confirms only 7% of ONE-CANDLE pullbacks and 17% of all of them.
#
# ONE READER NOW, AND IT COVERS BOTH DISTANCES. `measure` steps over only ONE resuming candle, so it
# could not see the pullback in his 2026-08-25 proof, which ends six bars before the momentum candle
# — that is why a second reader existed at all. `since_pullback` walks back over EVERY resuming
# candle first, so the adjacent case and the distant one are the same question again.
print()
print("   the pullback question has ONE owner, and it counts candles:")


def _move(rises, falls_then=0, start=1.1000, step=0.0010, t0=0):
    """`rises` candles up, then `falls_then` against — built with the harness's own candle."""
    out, price, t = [], start, t0
    for _ in range(rises):
        out.append(body(price, price + step, tf="H1", t=t)); price += step; t += 1
    for _ in range(falls_then):
        out.append(body(price, price - step, tf="H1", t=t)); price -= step; t += 1
    return out


class _FakeTrend:
    """An uptrend that has run — enough for the rule to reach its pullback question."""
    direction = 1
    bos_index = 0
    direction_since = 0


# ADJACENT: the pullback sits right behind the newest candle.
_adj = _move(2) + _move(1, 0, start=1.1020, t0=2)[:0] + [body(1.1020, 1.1010, tf="H1", t=2),
                                                         body(1.1010, 1.1020, tf="H1", t=3)]
s.check("a pullback right behind the candle is seen — no confirmed turn needed",
        trend_reproven(_FakeTrend(), _adj, _adj[0].time), None)

# DISTANT: the pullback ended six candles ago — the case that used to need the turn-scan.
_far = ([body(1.1000, 1.1010, tf="H1", t=0), body(1.1010, 1.1000, tf="H1", t=1)]
        + _move(6, 0, start=1.1000, t0=2))
s.check("...and so is one that ended SIX candles ago (his 2026-08-25 shape)",
        trend_reproven(_FakeTrend(), _far, _far[0].time), None)

# NOTHING AGAINST THE MOVE AT ALL -> still refused, in his words.
_none = _move(6)
s.check("a move with nothing against it -> still refused, in his words",
        "pulled back" in (trend_reproven(_FakeTrend(), _none, _none[0].time) or ""), True)
s.check("a run time that is not in the window is not a refusal",
        trend_reproven(_FakeTrend(), _none, 999999999), None)

# THE REAL BAR, THROUGH THE REAL PATH. The synthetic checks above pin the rule; this pins the
# actual candle he sent, so a later change cannot quietly re-break it.
_eur = load("EURUSD_H1_sep12.csv", "H1")
_t = int(datetime.datetime(2026, 9, 11, 15, tzinfo=datetime.timezone.utc).timestamp())
_i = next((k for k, c in enumerate(_eur) if c.time == _t), None)
if _i is not None:
    import strategies.vix1_trend as _vt                              # noqa: E402

    def _read(armed):
        """The same reading, with his 2026-09-16 rule on or off."""
        _keep = _vt._ARM_BROKEN_LEVEL
        _vt._ARM_BROKEN_LEVEL = armed
        try:
            _h1 = _eur[max(0, _i + 1 - 3000):_i + 1]
            _w = _h1[-1500:]
            _turns = structure_turns(_w, 48)
            _st = trend_state(_w, n=48, turns=_turns)
            _ret, _, _ = market_state(_w, _st, "EUR/USD")
            _ran = _st.bos_index if _st.bos_index is not None else _st.direction_since
            _confirmed = [t for t in _turns if _ran is not None and t.index > _ran and t.is_high]
            # The run as a BAR TIME — what `trend_reproven` takes since 2026-09-29, so nothing has
            # to translate an index between windows.
            _rt = _w[_ran].time if _ran is not None and 0 <= _ran < len(_w) else None
            return _st, _turns, _ret, len(_confirmed), _w, _rt
        finally:
            _vt._ARM_BROKEN_LEVEL = _keep

    # THE 13 SEP FIX, PROVED EXACTLY AS IT WAS — with the 16 Sep rule switched off, because that is the
    # code this case was written against. Nothing here is weakened.
    _st, _turns, _ret, _confirmed, _w13, _rt13 = _read(False)
    s.check("   11 Sep 15:00 UTC — the trend really was DOWN", _st.direction, -1)
    s.check("   ...and NO confirmed turn had landed yet — this is the trap", _confirmed, 0)
    s.teeth("   ...but the retracement module did see the bounce", _ret.active and _ret.bars >= 1)
    s.check("   ...so the re-proof rule no longer refuses it",
            trend_reproven(_st, _w13, _rt13), None)

    # AND WHAT HIS 16 SEP RULE DOES TO THE SAME HOUR — recorded, not hidden (docs/OPEN.md B26).
    # That downtrend was born when a close broke 1.16216; on 10 Sep 17:00 price closed back above it
    # (1.16289), so by his rule the trend was over. This sell therefore does NOT fire any more: the
    # market reads "changing" here, where before the rule it read DOWN with a 3-bar pullback.
    _st_now, _, _ret_now, _, _, _ = _read(True)
    s.check("   ...but his 16 Sep rule had already ended that downtrend",
            (_st_now.direction, _st_now.pending), (0, 1))
    s.check("   ...so this sell no longer fires (before the rule: DOWN, pullback active)",
            _ret_now.active, False)
else:
    print("   SKIP — EURUSD_H1_sep12.csv (broker bars incl. 11 Sep) not present on this machine")

s.done()
