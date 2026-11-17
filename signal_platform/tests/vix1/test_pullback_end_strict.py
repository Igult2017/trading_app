"""test_pullback_end_strict.py — run with:
    cd signal_platform && python tests/vix1/test_pullback_end_strict.py

His rule, 17 Nov 2026: *"In a pullback scenario, if we are to take trade on the first candle that ends the
pullback, it must qualify using the first qualification of a momentum candle not memory and not margin of
error."* Pinned on REAL GBP/USD H1 broker candles (`GBPUSD_H1_nov17_chaos.csv`), each found by the strategy's own
functions. Times are UTC+3, as on his charts.
"""
import datetime
from pathlib import Path

from _harness import Suite, load

from strategies import vix1_pullback_end as pe                       # noqa: E402
from strategies.vix1_momentum import qualifies_for_trade, size_yardstick  # noqa: E402

s = Suite("VIX.1 — the first candle ending a pullback: his original 2.5x rule only")
SYM = "GBP/USD"
BARS = load("GBPUSD_H1_nov17_chaos.csv", "H1")


def upto(local: str) -> list:
    t = int((datetime.datetime.strptime(local, "%Y-%m-%d %H:%M") - datetime.timedelta(hours=3))
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    return BARS[:next(i for i, c in enumerate(BARS) if c.time == t) + 1]


# (time, buy?, ends a pullback?, how it qualified, refused?)
CASES = [
    ("2026-09-29 06:00", False, True,  "margin", True),    # ends a pullback, 2.3x only  -> refused
    ("2026-10-14 10:00", False, True,  "margin", True),
    ("2026-09-17 03:00", False, True,  "memory", True),    # ends a pullback, memory only -> refused
    ("2026-09-29 17:00", False, True,  "memory", True),
    ("2026-11-12 17:00", False, True,  "strict", False),   # ends a pullback, real 2.5x  -> trades
    ("2026-10-08 08:00", False, False, "margin", False),   # margin, but NOT ending a pullback -> untouched
    ("2026-10-02 05:00", True,  False, "memory", False),   # memory, but NOT ending a pullback -> untouched
]

if not BARS:
    print("   SKIP — GBPUSD_H1_nov17_chaos.csv not present")
else:
    for when, bull, ends, how, refused in CASES:
        w = upto(when); i = len(w) - 1
        print(f"\n{when} {'BUY' if bull else 'SELL'} — {how}, {'ends' if ends else 'does not end'} a pullback:")
        s.check("the strategy calls it tradeable today", qualifies_for_trade(w, i, bull, SYM), True)
        s.check("ends a pullback", pe.ends_a_pullback(w, bull), ends)
        s.check("how it qualified", "memory" if size_yardstick(w, i, bull, SYM) != i
                else ("strict" if pe.is_momentum_candle(w, i, bull, SYM) else "margin"), how)
        s.check("refused by his rule" if refused else "NOT refused", pe.refusal(w, bull, SYM) is not None, refused)

print("\nwired on BOTH trading routes, and the CALLS are matched (a `def` cannot satisfy these):")
src = (Path(__file__).resolve().parents[2] / "strategies/vix1_bias.py").read_text(encoding="utf-8")
s.teeth("the change-of-character route asks it", "strict = vix1_pullback_end.refusal(h1, bias.bullish, symbol)" in src)
s.teeth("the main route asks it in its refusal list", "vix1_pullback_end.refusal(h1, bullish, symbol)," in src)

s.done()
