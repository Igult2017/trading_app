"""VIX.1 — THE LIQUIDITY VOID: don't trade into a move while price is still filling it.

HIS RULE, 2026-09-20:

    "That long bearish candle that dropped the price to where we took the trade is called liquidity
     void... can we have a logic that lets the price move 2 candles one closing on top of each other
     with direction before we consider taking trades in the direction of that long candle? However,
     if the price starts moving to fill it, we wait until the price finishes filling it and then
     starts moving in its direction."

WHAT THE TWO CANDLES ARE FOR, his words of 2026-09-21: *"The two candle rule is for liquidity void
setups. By design it is meant to enable VIX to take confirmed directions... Don't confuse it with
the candle rules that existed before."*

⚠ A VOID IS A BAND OF PRICE, NOT A CANDLE, and this file is the guard on that. The first build
measured one candle's body; it then called the very candle being traded a "void" on 23% of his real
fills and could report a fill of 378%. Every assertion below is written so that a return to
candle-measuring fails it.

ALL BARS ARE REAL BROKER CANDLES — his 28 May chart and the 16-18 Sep window his complaint came
from. NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
import datetime

from _harness import Suite, load

from strategies import vix1_void
from strategies.vix1_bias import detect_bias

s = Suite("VIX.1 — the liquidity void as a BAND (his rule of 2026-09-20)")

may = load("EURUSD_H1.csv", "H1")
sep = load("EURUSD_H1_sep18.csv", "H1")
if not may or not sep:
    print("  SKIP — EURUSD_H1.csv / EURUSD_H1_sep18.csv not present on this machine")
    s.done()


def at(bars, stamp):
    t = int(datetime.datetime.strptime(stamp, "%Y-%m-%d %H:%M")
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    for i, c in enumerate(bars):
        if c.time == t:
            return i
    raise AssertionError(f"{stamp} is not in the fixture")


def st(bars, stamp, bullish):
    i = at(bars, stamp)
    return vix1_void.state(bars[: i + 1], i, bullish, "EUR/USD")


# ── 1. HIS 28 MAY CHART — the void is a BAND, and the fill is read against it ───────────────────
print()
print("HIS 28 MAY 2026 CHART — the band, and price coming back through it")
v = vix1_void.find_void(may[: at(may, "2026-05-28 05:00") + 1], at(may, "2026-05-28 05:00"),
                        False, "EUR/USD")
s.check("the void is a BAND, not a candle — it has a top and a bottom",
        v is not None and v.top > v.bottom, True)
s.check("...16.8 pips of untraded price", round(v.pips, 1), 16.8)
s.check("...left by the 28 May 03:00 UTC drop",
        datetime.datetime.fromtimestamp(v.time, datetime.timezone.utc).strftime("%d %b %H:%M"),
        "28 May 03:00")
for stamp, kind, fill in (("2026-05-28 04:00", "not-filled-yet", 0),
                          ("2026-05-28 05:00", "filling", 57),
                          ("2026-05-28 06:00", "filled", 100),
                          ("2026-05-28 12:00", "filled", 100)):
    got = st(may, stamp, False)
    s.check(f"   {stamp[-5:]} UTC — {kind}, {fill}% filled",
            (got.kind, round(got.deepest * 100)), (kind, fill))

# THE INVARIANT THE OLD BUILD BROKE: a fill is a share of the band, so it cannot exceed 100%.
_worst = 0.0
for k in range(at(may, "2026-05-28 04:00"), at(may, "2026-05-29 12:00")):
    _worst = max(_worst, vix1_void.state(may[: k + 1], k, False, "EUR/USD").deepest)
s.check("a fill reading NEVER exceeds 100% (the old build reached 378%)", _worst <= 1.0, True)

# ── 2. HIS 16-18 SEP WINDOW — the complaint that started this ───────────────────────────────────
print()
print("HIS 16-18 SEP 2026 WINDOW — 'looking at it, nothing qualified'")
_after = st(sep, "2026-09-16 20:00", False)
s.check("the 67.5-pip drop of 16 Sep 18:00 leaves a 48-pip void",
        (round(_after.void_pips), _after.kind), (48, "not-filled-yet"))
s.check("while price is coming back into it, a SELL is refused (17 Sep, his own case)",
        st(sep, "2026-09-17 15:00", False).kind, "filling")
s.check("...and the refusal says how far back price has come",
        "33% of the way back" in (vix1_void.not_filling(
            sep[: at(sep, "2026-09-17 15:00") + 1], None, False, "EUR/USD") or ""), True)
s.check("once two momentum candles print its way again, the SELL is allowed (18 Sep)",
        st(sep, "2026-09-18 10:00", False).kind, "resumed")
s.check("...and 'resumed' is the only state that allows",
        (st(sep, "2026-09-18 10:00", False).allows,
         st(sep, "2026-09-17 15:00", False).allows), (True, False))

# TEETH, through the REAL detect_bias: take the module away and the refused sell comes back.
_i = at(sep, "2026-09-17 15:00")
_real = vix1_void.not_filling
try:
    vix1_void.not_filling = lambda *a, **k: None
    _without = detect_bias(sep[: _i + 1], [], "EUR/USD")
finally:
    vix1_void.not_filling = _real
_with = detect_bias(sep[: _i + 1], [], "EUR/USD")
s.teeth("the void rule is what refuses his 17 Sep sell",
        _without is not None and not _without.bullish and _with is None)

# ── 3. A CANDLE CAN NEVER BE ITS OWN VOID ───────────────────────────────────────────────────────
print()
print("THE DEFECT THIS REPLACED — the trigger candle was being called the void")
_drop = at(sep, "2026-09-16 18:00")            # the 67.5-pip candle itself
s.check("on the bar of the big drop there is no void yet — it has not left one behind",
        vix1_void.find_void(sep[: _drop + 1], _drop, False, "EUR/USD") is None, True)
s.check("...so the drop's own sell is NOT refused",
        vix1_void.not_filling(sep[: _drop + 1], None, False, "EUR/USD"), None)

# ── 4. WHERE THE VOID RULE STOPS — his boundary, 2026-09-21 ────────────────────────────────────
# *"The existing rules have nothing to do with the void rules."* *"By design it is meant to ENABLE
# VIX to take CONFIRMED DIRECTIONS."* So the two candles confirm a move when nothing else has; they
# are not a second opinion on a direction his change-of-character sequence already proved. The proof
# sequence itself is asserted in `test_choch_bearish_proof.py`; here we pin that the boundary exists
# and that it does NOT quietly disable the rule on ordinary trades.
print()
print("THE BOUNDARY — the void rule says nothing about a change-of-character trade")
_i2 = at(sep, "2026-09-17 15:00")
s.check("a trade with momentum candles already behind it is NOT a change-of-character trade",
        vix1_void.direction_already_confirmed(sep[: _i2 + 1], _i2, 0, False, "EUR/USD"), False)
s.check("...so his 17 Sep sell is still refused — the boundary did not disable the rule",
        detect_bias(sep[: _i2 + 1], [], "EUR/USD"), None)
s.check("the first momentum candle after a trend starts IS one, and the rule stands aside",
        vix1_void.direction_already_confirmed(sep[: _i2 + 1], _i2, _i2, False, "EUR/USD"), True)
s.check("a trend with no recorded start keeps the veto — we cannot tell, so the common case wins",
        vix1_void.direction_already_confirmed(sep[: _i2 + 1], _i2, None, False, "EUR/USD"), False)

# ── 5. IT MAY COST A TRADE ON PURPOSE, NEVER BY ACCIDENT ────────────────────────────────────────
print()
print("SILENT WHEN THERE IS NO VOID — which is most of the time")
s.check("no bars at all -> allowed", vix1_void.not_filling([], None, True, "EUR/USD"), None)
s.check("an ordinary stretch with no void -> allowed, silently",
        st(sep, "2026-09-16 12:00", False).kind, "no-void")
s.check("a void it cannot read allows rather than refuses",
        vix1_void.VoidState("no-void").allows, True)

# ── 5. BRANCH C STAYS OFF ───────────────────────────────────────────────────────────────────────
print()
print("THE CHANGE-OF-CHARACTER EXEMPTION — still off (OPEN.md B31)")
s.check("branch C is switched OFF", vix1_void._BRANCH_C, False)
s.check("...so no pending turn is exempted, whatever level it is asked about",
        vix1_void.break_of_a_fill(sep[:600], True, sep[599].close, "EUR/USD"), False)

s.done()
