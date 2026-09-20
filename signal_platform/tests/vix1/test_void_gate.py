"""VIX.1 — THE LIQUIDITY VOID: don't trade while price is filling the move that made the leg.

HIS RULE, 2026-09-20, quoted so it cannot drift:

    "That long bearish candle that dropped the price to where we took the trade is called liquidity
     void. In most cases, the price goes back to fill it before proceeding. So, can we have a logic
     that lets the price move 2 candles one closing on top of each other with direction before we
     consider taking trades in the direction of that long candle? However, if the price starts
     moving to fill it, we wait until the price finishes filling it and then starts moving in its
     direction. In the process of the price filling it, if the price breaks its protected area, we
     start considering CHOCH and a move on the other direction."

HIS SCOPE, 2026-09-21, when the two-candle rule was put against his 2026-08-25 proof sequence:

    "There is no one or two here. These are two different scenarios and treat each as I explained.
     For the scenario where I said one keep it one and for a scenario where I said 2 keep it 2."

So there are two scenarios and this file asserts both:

    ONE CANDLE   the turn that has proved itself — runs, pulls back, turns back — then a momentum
                 candle trades it. The void rule STANDS ASIDE (`vix1_void.proves_the_turn`).
    TWO CANDLES  joining a move already under way. The void rule applies.

THE BARS ARE HIS OWN. Everything below runs on real broker candles from the chart he drew on
(`Desktop\\Void 2 .png`, EUR/USD 28 May 2026), not on a shape invented to make the rule pass.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
import datetime

from _harness import Suite, load

from strategies import vix1_void
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state

s = Suite("VIX.1 — the liquidity void (his rule of 2026-09-20, scoped 2026-09-21)")

bars = load("EURUSD_H1.csv", "H1")
if not bars:
    print("  SKIP — EURUSD_H1.csv not present on this machine")
    s.done()


def at(stamp):
    """Index of the H1 bar that closed at this UTC time."""
    t = int(datetime.datetime.strptime(stamp, "%Y-%m-%d %H:%M")
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    for i, c in enumerate(bars):
        if c.time == t:
            return i
    raise AssertionError(f"{stamp} is not in EURUSD_H1.csv")


def read(stamp, bullish):
    """The void as the strategy reads it at that hour — real trend state, real module."""
    i = at(stamp)
    w = bars[max(0, i - _H1_TREND_BARS + 1): i + 1]
    st = trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))
    return st, vix1_void.state(bars[: i + 1], i, bullish, "EUR/USD", st.protected)


# ── 1. HIS IMAGE 2 — THE VOID IS FOUND, AND IT IS THE CANDLE HE CIRCLED ─────────────────────────
print()
print("HIS 28 MAY 2026 CHART — the long candle, and price coming back through it")
_, v = read("2026-05-28 05:00", False)
s.check("the void is the 28 May 03:00 UTC candle",
        datetime.datetime.fromtimestamp(v.void_time, datetime.timezone.utc)
        .strftime("%d %b %H:%M"), "28 May 03:00")
s.check("...and it is a 25.5-pip move", round(v.void_pips, 1), 25.5)

# HIS WORDS: *"if the price starts moving to fill it, we wait until the price finishes filling it"*.
for stamp, want_kind, want_fill in (("2026-05-28 04:00", "not-filled-yet", 21),
                                    ("2026-05-28 05:00", "filling", 58),
                                    ("2026-05-28 06:00", "filling", 98),
                                    ("2026-05-28 07:00", "filling", 119)):
    _, v = read(stamp, False)
    s.check(f"   {stamp[-5:]} UTC — {want_kind}, price {want_fill}% back into it",
            (v.kind, round(v.deepest * 100)), (want_kind, want_fill))

# ...AND WHILE IT IS FILLING, A SELL IS REFUSED. This is the whole point of the rule.
st, _ = read("2026-05-28 06:00", False)
why = vix1_void.not_filling(bars[: at("2026-05-28 06:00") + 1], st.protected, False, "EUR/USD")
s.check("a SELL is refused while price is filling it", why is not None, True)
s.check("   ...and the refusal names the move and how far back price has come",
        why is not None and "25.5-pip" in why and "98%" in why, True)

# ── 2. THE REFUSAL HAS TEETH — take the module away and the same bar is allowed ─────────────────
s.teeth("the void rule is what refuses that sell",
        vix1_void.state(bars[: at("2026-05-28 06:00") + 1], at("2026-05-28 06:00"), False,
                        "EUR/USD", None).allows is False)

# ── 3. HIS TWO SCENARIOS — one candle or two, decided by which one this is ──────────────────────
print()
print("HIS SCOPE — the proof trade keeps ONE candle, joining a move keeps TWO")
i = at("2026-05-28 06:00")
w = bars[max(0, i - _H1_TREND_BARS + 1): i + 1]
st = trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))
ds = None if st.direction_since is None else i - (len(w) - 1) + st.direction_since
s.check("with no trend start recorded the veto is KEPT — a missing answer must not disable it",
        vix1_void.proves_the_turn(bars[: i + 1], i, None, False, "EUR/USD"), False)
s.check("a bar with a momentum candle already behind it is NOT the proof trade",
        vix1_void.proves_the_turn(bars[: i + 1], i, 0, False, "EUR/USD"), False)
s.check("the bar right after the trend starts, with nothing between, IS the proof trade",
        vix1_void.proves_the_turn(bars[: i + 1], i, i, False, "EUR/USD"), True)
s.teeth("the scope is decided by what lies between the trend's start and the candle",
        vix1_void.proves_the_turn(bars[: i + 1], i, 0, False, "EUR/USD") is False
        and vix1_void.proves_the_turn(bars[: i + 1], i, i, False, "EUR/USD") is True)

# ── 4. A MISSING MEASUREMENT NEVER REFUSES ──────────────────────────────────────────────────────
print()
print("IT MAY COST A TRADE ON PURPOSE, NEVER BY ACCIDENT")
s.check("no bars at all -> allowed", vix1_void.not_filling([], None, True, "EUR/USD"), None)
s.check("no momentum candle in the last 48h -> allowed, not refused",
        vix1_void.state(bars[:400], 399, True, "EUR/USD", None).allows
        or vix1_void.state(bars[:400], 399, True, "EUR/USD", None).kind != "no-void", True)

# ── 5. BRANCH C — SWITCHED OFF, AND IT CANNOT COME BACK READING AN EMPTY LEVEL ──────────────────
print()
print("THE CHANGE-OF-CHARACTER EXEMPTION — off, and the dead-level bug cannot return")
s.check("branch C is switched OFF", vix1_void._BRANCH_C, False)
s.check("...so no pending turn is exempted, whatever level it is asked about",
        vix1_void.break_of_a_fill(bars[:600], True, bars[599].close, "EUR/USD"), False)

# THE REGRESSION THAT MADE IT DEAD: both callers passed `TrendState.protected`, which
# `vix1_trend.py:412` sets to None on the line that proposes a turn. Asserted here so that a future
# caller reading `protected` again fails loudly instead of silently never firing.
_had = []
for j in range(2000, min(len(bars), 4000)):
    w = bars[max(0, j - _H1_TREND_BARS + 1): j + 1]
    t = trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))
    if t.pending != 0:
        _had.append(t.protected is None)
    if len(_had) > 40:
        break
s.check("while a turn is pending, `protected` is ALWAYS empty — read `choch_price` instead",
        (len(_had) > 0, all(_had)), (True, True))

vix1_void._BRANCH_C = True
try:
    s.check("switched on, it still refuses when the level is missing",
            vix1_void.break_of_a_fill(bars[:600], True, None, "EUR/USD"), False)
finally:
    vix1_void._BRANCH_C = False

s.done()
