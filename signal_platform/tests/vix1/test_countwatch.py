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

⚠ WHAT THIS SUITE DOES **NOT** COVER, measured by sabotage on 2026-10-04 rather than assumed.
VIX.1 counts candles on TWO routes and the switch is wired into both. The positive case below is a
change-of-character setup, so breaking `vix1_choch.py`'s switch turns 7 checks red — that route is
covered. Breaking the TREND route's switch (`vix1_bias.py`, the `None if ignore_count else` in the
veto list) leaves this file **entirely green**, because nothing here reaches that route with the
count as its only refusal. So a break there would be silent: the notification would simply stop
firing for trend-route setups and nothing would say so. Closing it needs a real window where the
trend route is refused by the count alone, and finding one means searching history, which is his call
(`docs/OPEN.md` B33).
"""
import datetime as dt
import inspect

from _harness import Suite, load

from core.types import TF
from shared.candle_math import body_size
from strategies import vix1_bias, vix1_choch, vix1_countwatch
from strategies.vix1 import Vix1Strategy
from strategies.vix1_bias import detect_bias
from strategies import vix1_preclose
from notifications import dispatcher
from config.settings import settings

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

# ── 2b. IT ACTUALLY FIRES — HIS OWN 28 JUL EUR/USD CHART, REAL BARS, PRODUCTION DEFAULTS ─────────
# ⚠ THIS IS THE MOST IMPORTANT SECTION IN THE FILE, and it was missing from the first build. Every
# other check here asserts SILENCE, and a suite that only proves silence would stay green if the
# notification were broken shut — he would hear nothing and have no way to know why.
#
# THE CASE. 28 Jul 2026 EUR/USD, the chart HE marked (images 4 and 5), already the acceptance case of
# the change-of-character route. Price closed through 1.13732 and a momentum candle followed it out of
# a TRENDING market, so every gate passes — and at production defaults the entry refuses it anyway,
# in the route's own words:
#     17:00  "...the move broke out 1 candle ago and has not pulled back yet — with no pullback the
#             trade comes from the 3rd candle after the break"
#     18:00  "...the move broke out 2 candles ago ..."
# Candle 1 and candle 2 of a wait, each a qualifying momentum candle, and nothing else objecting.
# That is exactly what he asked to be told about, so both must produce a note.
print()
print("   his 28 Jul EUR/USD chart — candle 1 and candle 2 of a breakout wait:")
_eur = load("EURUSD_H1_to16Aug.csv", "H1")
if not _eur:
    print("   (EURUSD_H1_to16Aug.csv absent — the positive cases cannot run)")
    s.check("the file the positive cases need is present", False, True)
else:
    _H1N = Vix1Strategy.candle_counts[TF.H1]

    def _at(hour):
        """Index of the 28 Jul 2026 bar at this CHART hour (UTC+3, his screen)."""
        want = (dt.datetime(2026, 7, 28, hour) - dt.timedelta(hours=3)) \
            .replace(tzinfo=dt.timezone.utc).timestamp()
        return next((i for i, c in enumerate(_eur) if c.time == want), -1)

    def _win(hour):
        i = _at(hour)
        return _eur[max(0, i - _H1N):i + 1] if i > 0 else []

    s.check("his 28 Jul 17:00 candle is in the data", _at(17) > 0, True)

    # THE SWITCH IS WHAT MAKES THE DIFFERENCE, proven on the real function before anything is read
    # off the note: the entry says no, and the same entry with only the count muted says yes.
    _w17 = _win(17)
    s.check("the real entry refuses 17:00", detect_bias(_w17, [], "EUR/USD"), None)
    s.check("...and with ONLY the count muted it would trade",
            detect_bias(_w17, [], "EUR/USD", ignore_count=True) is not None, True)

    _n17 = vix1_countwatch.check(_w17, [], "EUR/USD")
    s.check("CANDLE 1 (17:00) IS REPORTED", _n17 is not None, True)
    s.check("...as a BUY, the way the candle closed", _n17 is not None and _n17[1], True)
    s.check("...and it is the 13.6-pip grade-A candle, not some other bar",
            _n17 is not None and round(body_size(_n17[0]) / 0.0001, 1), 13.6)

    _n18 = vix1_countwatch.check(_win(18), [], "EUR/USD")
    s.check("CANDLE 2 (18:00) IS ALSO REPORTED — his 'first and second candles'",
            _n18 is not None, True)
    s.check("...and it is a different note from candle 1's",
            _n17 is not None and _n18 is not None
            and vix1_countwatch.dedup_key("EUR/USD", True, _n17[0])
            != vix1_countwatch.dedup_key("EUR/USD", True, _n18[0]), True)

    # THE HOUR BEFORE THE BREAK SAYS NOTHING — 6.4 pips, grade B, refused by his own size test. This
    # is the check that stops the feature becoming chatter during every ordinary hour.
    s.check("16:00 is silent — 6.4 pips does not qualify as a momentum candle",
            vix1_countwatch.check(_win(16), [], "EUR/USD"), None)

    # ⚠ AND THE 3rd CANDLE PRODUCES NEITHER A SIGNAL NOR A NOTE HERE, which is correct and is NOT
    # what the plan for this work predicted. The count is satisfied at 19:00, so the note correctly
    # stops; but the 19:00 bar closed DOWN, so there is no momentum candle that way and the entry
    # refuses for a different reason — *"a break on its own is not a trade"*. The count being
    # satisfied is permission to trade a momentum candle, not a trade.
    _w19 = _win(19)
    s.check("19:00 — the count is satisfied, so the note stops",
            vix1_countwatch.check(_w19, [], "EUR/USD"), None)
    s.check("...and there is still no signal, because that candle closed DOWN",
            detect_bias(_w19, [], "EUR/USD"), None)

    # TEETH — the positive case must be able to fail. If `ignore_count` ever stops muting the count,
    # the shadow call returns None, and this whole section would go quiet while still passing every
    # silence check above. This is the assertion that catches "broken shut".
    s.teeth("the note fires on a real candle 1 and a real candle 2",
            vix1_countwatch.check(_w17, [], "EUR/USD") is not None
            and _n18 is not None
            and detect_bias(_w17, [], "EUR/USD") is None)

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
# ...AND THE NAME UNDER THAT SUFFIX MUST BE ONE THE SETTINGS KNOW. The dispatcher strips `_watch` and
# looks the rest up in `dm_only_exempt`, `channel_all` and `min_confidence_overrides`, all of which
# name `vix1`. This card first shipped as `vix1_count_watch`, which is looked up as `vix1_count` — a
# name none of them knows — so it would have silently stopped following VIX.1 at the next settings
# change. Asserted against the REAL settings, not a copy of them.
_base = _note.strategy_id[:-len("_watch")]
s.check("the name the settings actually see is `vix1`", _base, "vix1")
s.check("...and it is the same id the other VIX.1 DM cards use",
        _note.strategy_id, vix1_preclose.preclose_signal(
            "GBP/USD", True, _BARS[_i], 60, 0.0001, "VIX.1").strategy_id)
s.check("...which `dm_only_exempt` recognises", _base in {
    x.strip() for x in settings.dm_only_exempt.split(",") if x.strip()}, True)
s.check("...and `channel_all` does NOT, so it can never reach the public channel",
        dispatcher._channel_all(_note.strategy_id), False)
s.check("...and it does not ask to go to the channel either", bool(_note.to_channel), False)
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
