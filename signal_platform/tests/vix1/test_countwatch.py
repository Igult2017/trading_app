"""VIX.1 — A CANDLE THAT IS TRADEABLE EXCEPT FOR THE COUNT IS REPORTED TO HIM.

HIS INSTRUCTION, 2026-10-04: *"for all the setups that require 2 to 3 momentum candles to run for
confirmation, i need notification for 1st and second candles if they are momentum candles and then
signal starts at 3rd candle going forward"* — to the **DM**, and only for *"a candle that qualifies
based on all qualifications including margin and memory and only fails candle count."*

WHAT THIS SUITE PROTECTS, in order of what would hurt most if it broke:

  1. THE ENTRY IS UNCHANGED. `ignore_count` defaults to False and no trading path passes True. A
     switch that relaxes a trading rule is exactly the kind that leaks into the live path later, so it
     is asserted here rather than trusted.
  2. The note fires ONLY when the count is the single thing refusing — never when something else is
     also in the way. Proven against the real 30 Sep GBP/USD bars, where the count was NOT the only
     refusal and the honest answer is silence.
  3. It is a DM, never the channel, and never claims the watch row the real signal needs.
"""
import inspect

from _harness import Suite

from strategies import vix1_bias, vix1_choch, vix1_countwatch

s = Suite("VIX.1 — the count-wait notification")

# ── 1. THE ENTRY CANNOT BE CHANGED BY THIS ────────────────────────────────────────────────────────
print()
print("   the switch is off by default and no trading path turns it on:")
s.check("detect_bias defaults ignore_count to False",
        inspect.signature(vix1_bias.detect_bias).parameters["ignore_count"].default, False)
s.check("choch_entry defaults ignore_count to False",
        inspect.signature(vix1_choch.choch_entry).parameters["ignore_count"].default, False)

# THE ONLY PRODUCTION CALLER THAT MAY PASS True IS THE NOTIFICATION. Read off the source of every
# strategy module, because this is about who CALLS it, which no runtime check can see.
import os                                                             # noqa: E402
_STRAT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "strategies")
_callers = []
for fn in sorted(os.listdir(_STRAT)):
    if not fn.endswith(".py"):
        continue
    src = open(os.path.join(_STRAT, fn), encoding="utf-8").read()
    # Strip comments so the prose explaining the rule is not read as a call.
    code = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
    if "ignore_count=True" in code:
        _callers.append(fn)
s.check("exactly one strategy module passes ignore_count=True", _callers, ["vix1_countwatch.py"])
s.teeth("a second caller would be caught", _callers == ["vix1_countwatch.py"])

# ── 2. THE REAL 30 SEP CASE — the count was NOT the only refusal, so it must stay silent ──────────
print()
print("   the 30 Sep GBP/USD move, on real broker bars:")
from core.types import Candle                                         # noqa: E402

# The hours either side of the break, real Pepperstone H1 (prices are pipettes / 100000).
_RAW = [(1790712000,132286,132340,132247,132307),(1790715600,132233,132280,132227,132239),
        (1790719200,132277,132322,132260,132262),(1790722800,132262,132304,132252,132294),
        (1790726400,132294,132310,132244,132290),(1790730000,132286,132323,132245,132278),
        (1790733600,132278,132348,132255,132336),(1790737200,132336,132346,132254,132258),
        (1790740800,132259,132281,132226,132266),(1790744400,132267,132478,132264,132457),
        (1790748000,132456,132613,132440,132546),(1790751600,132545,132784,132527,132642)]
_BARS = [Candle(time=t, open=o/1e5, high=h/1e5, low=l/1e5, close=c/1e5, volume=1, timeframe="H1")
         for t, o, h, l, c in _RAW]

# THE 19-PIP BREAK CANDLE. It passes every momentum qualification — but its break came out of a CHOP
# market, which is his own rule refusing it (*"if the break is ... arising from a choppy or a ranging
# market we don't trade"*). So the count is NOT the only thing in the way and there is nothing to say.
# ⚠ THIS CASE IS WHY THE SUITE EXISTS. The plan asserted this candle MUST notify; it must not, and a
# build that notified here would be reporting a candle his own rules refuse for a second reason.
_i = [k for k, c in enumerate(_BARS) if c.time == 1790744400][0]
s.check("the 19-pip break candle is NOT reported — chop refuses it too, not just the count",
        vix1_countwatch.check(_BARS[:_i + 1], [], "GBP/USD"), None)
for _t, _lbl in ((1790748000, "the 9.0p candle after it"), (1790751600, "the 9.7p candle after that")):
    _j = [k for k, c in enumerate(_BARS) if c.time == _t][0]
    s.check(f"{_lbl} is not reported — not a momentum candle",
            vix1_countwatch.check(_BARS[:_j + 1], [], "GBP/USD"), None)

# ── 3. THE CHEAP GUARD RUNS FIRST ─────────────────────────────────────────────────────────────────
# A candle that is not a momentum candle must cost nothing: `check` returns before the shadow call.
print()
print("   it stays silent, and cheap, when there is nothing to report:")
s.check("a window too short to judge says nothing", vix1_countwatch.check(_BARS[:1], [], "GBP/USD"), None)
s.check("an empty window says nothing", vix1_countwatch.check([], [], "GBP/USD"), None)

_calls = {"n": 0}
_real = vix1_bias.detect_bias
vix1_bias.detect_bias = lambda *a, **k: (_calls.__setitem__("n", _calls["n"] + 1), _real(*a, **k))[1]
vix1_countwatch.check(_BARS[:_i], [], "GBP/USD")      # the 0.7-pip candle — not momentum
vix1_bias.detect_bias = _real
s.check("a non-momentum candle never reaches the shadow call (the scanner is on 2 CPUs)",
        _calls["n"], 0)

# ── 4. THE CARD IS A DM AND IS NOT A SIGNAL ──────────────────────────────────────────────────────
print()
print("   the card routes to the DM and cannot be mistaken for a trade:")
_note = vix1_countwatch.note("GBP/USD", True, _BARS[_i], vix1_countwatch._WAITING, 0.0001, "VIX.1")
s.check("the `_watch` suffix routes it to the DM, not the channel",
        _note.strategy_id.endswith("_watch"), True)
s.check("it is an alert, not a signal", _note.alert_only, True)
s.check("it never claims the watch row the real signal needs", _note.persist_watch, False)
s.check("no entry price is attached", getattr(_note, "entry_price", None) in (None, 0, 0.0), True)
s.check("it says the signal still comes at the 3rd candle",
        any("3rd candle" in r for r in _note.technical_reasons), True)
s.check("...and that it is not a trade",
        any("has not taken this trade" in r for r in _note.technical_reasons), True)

# ONE NOTE PER CANDLE, PER DIRECTION.
print()
print("   one note per candle:")
_k1 = vix1_countwatch.dedup_key("GBP/USD", True, _BARS[_i])
s.check("the same candle gives the same key", _k1, vix1_countwatch.dedup_key("GBP/USD", True, _BARS[_i]))
s.check("the other direction is a different note",
        _k1 != vix1_countwatch.dedup_key("GBP/USD", False, _BARS[_i]), True)
s.check("the next candle is a different note",
        _k1 != vix1_countwatch.dedup_key("GBP/USD", True, _BARS[_i + 1]), True)
s.check("another symbol is a different note",
        _k1 != vix1_countwatch.dedup_key("EUR/USD", True, _BARS[_i]), True)

s.done()
