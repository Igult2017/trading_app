"""CAN THE SWING DETECTOR SEE A PULLBACK? Measured on real broker bars, not argued.

HIS INSTRUCTION, 2026-09-29: *"Can you test this and see how useless those complicated tools are for
pullbacks please? If it cant see 1 candle pullback, then what is its use. Please test and dont take
my word for it."*

WHAT IS COMPARED, and both sides use the SHIPPED code so neither is a straw man:

  HIS DEFINITION   a pullback is the run of OPPOSITE candles inside a move. One candle counts. Size
                   is irrelevant. Implemented here exactly as `vix1_retracement` implements it —
                   `not trend_way`, so a doji counts as part of the pullback, which is his settled
                   reading.
  THE DETECTOR     `strategies.vix1_swings.turning_points` — the real one VIX.1 runs. A low is
                   confirmed when a candle CLOSES ABOVE THE HIGH of the candle that made it.

THE QUESTION ASKED OF EACH PULLBACK: the detector's job here is to mark where the pullback ENDED —
in an uptrend a pullback down ends at a LOW, in a downtrend a pullback up ends at a HIGH. So for each
pullback found by his rule, did the detector confirm a turning point of the right kind at the right
bar? And if it did, HOW MANY BARS LATE was it, counted from the bar the pullback actually ended?

NOT A BACKTEST. Nothing here is scored, no trade is simulated, no win rate or frequency is produced.
It measures one detector's coverage of one event, which is what he asked for.

Run:  python signal_platform/tools/pullback_vs_swings.py
"""
import csv
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.abspath(os.path.join(_HERE, ".."))
if _PLATFORM not in sys.path:
    sys.path.insert(0, _PLATFORM)
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                   # noqa: E402
from shared.candle_math import is_bullish, is_bearish           # noqa: E402
from strategies.vix1_swings import turning_points               # noqa: E402

DATA = r"C:\Users\FSD\trading_app_data\ctrader"
FILES = [("EUR/USD", "EURUSD_H1.csv"), ("GBP/USD", "GBPUSD_H1.csv"), ("XAU/USD", "XAUUSD_H1.csv"),
         ("USD/JPY", "USDJPY_H1.csv"), ("GBP/JPY", "GBPJPY_H1.csv"), ("AUD/USD", "AUDUSD_H1.csv")]


def load(fn):
    path = os.path.join(DATA, fn)
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            rows.append((int(r["time"]), float(r["open"]), float(r["high"]),
                         float(r["low"]), float(r["close"])))
    rows.sort()
    return [Candle(time=t, open=o, high=h, low=l, close=c, volume=0, timeframe="H1")
            for t, o, h, l, c in rows]


def pullbacks(bars, up):
    """Every pullback by HIS rule, as (start, end) bar indexes, inclusive.

    A pullback is a maximal run of candles that do NOT carry the move on, sitting between two that
    do. Requiring a carrying candle on BOTH sides is what makes it a pullback rather than the end of
    the move — an unbounded run at the tail has not resumed and is not counted either way.
    """
    trend_way = is_bullish if up else is_bearish
    out, i, n = [], 1, len(bars)
    while i < n - 1:
        if trend_way(bars[i - 1]) and not trend_way(bars[i]):
            j = i
            while j < n and not trend_way(bars[j]):
                j += 1
            if j < n:                       # the move resumed, so this really was a pullback
                out.append((i, j - 1))
            i = j + 1
        else:
            i += 1
    return out


def measure(name, bars):
    print(f"\n{'='*78}\n{name} — {len(bars)} H1 bars")
    turns = turning_points(bars)
    for up in (True, False):
        # The turning point that ENDS a pullback: a LOW in an uptrend, a HIGH in a downtrend.
        want_high = not up
        seen = {}
        for t in turns:
            if t.is_high == want_high:
                seen.setdefault(t.index, t.confirmed)

        pbs = pullbacks(bars, up)
        buckets = {1: [0, 0, []], 2: [0, 0, []], 3: [0, 0, []], 4: [0, 0, []]}   # len -> [total, seen, lateness]
        for s, e in pbs:
            key = min(e - s + 1, 4)
            buckets[key][0] += 1
            # The extreme of the pullback is its lowest low (uptrend) / highest high (downtrend).
            ext = min(range(s, e + 1), key=lambda k: bars[k].low) if up else \
                  max(range(s, e + 1), key=lambda k: bars[k].high)
            if ext in seen:
                buckets[key][1] += 1
                buckets[key][2].append(seen[ext] - ext)

        total = sum(b[0] for b in buckets.values())
        hit = sum(b[1] for b in buckets.values())
        print(f"\n  {'UP-move (pullbacks down)' if up else 'DOWN-move (pullbacks up)'}: "
              f"{total} pullbacks by his rule")
        print(f"  {'length':>10} {'pullbacks':>10} {'detector saw':>13} {'missed':>8} {'median bars late':>17}")
        for k in (1, 2, 3, 4):
            tot, s_, late = buckets[k]
            if not tot:
                continue
            lbl = "4+" if k == 4 else str(k)
            pct = f"{100*s_/tot:.0f}%"
            med = f"{sorted(late)[len(late)//2]}" if late else "—"
            print(f"  {lbl:>10} {tot:>10} {s_:>8} ({pct:>4}) {tot-s_:>8} {med:>17}")
        print(f"  {'ALL':>10} {total:>10} {hit:>8} ({100*hit/total if total else 0:.0f}%) {total-hit:>8}")
    return


if __name__ == "__main__":
    for name, fn in FILES:
        bars = load(fn)
        if not bars:
            print(f"\n{name}: no data file ({fn}) — skipped")
            continue
        measure(name, bars)
    print("\nNOTE: 'detector saw' = the real `vix1_swings.turning_points` confirmed a turning point "
          "of the right kind\n      at the exact bar the pullback reached its extreme. "
          "'bars late' = how long after that bar\n      the confirmation arrived.")
