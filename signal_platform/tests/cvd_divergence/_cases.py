"""The hand-built hours shared by test_cvd.py and test_watch.py (23 Nov 2026) — answers worked out by hand there."""
from core.types import Candle

T0 = 1_795_000_000 // 3600 * 3600


def bar(i, h, l, c, v=100.0):
    return Candle(time=T0 + i * 3600, open=c, high=h, low=l, close=c, volume=v, timeframe="H1")


def worked(n=70):
    out = []
    for i in range(n):
        if i == 45:
            out.append(bar(i, 2.0, 0.9, 2.0))          # swing A: high 2.0, all buying
        elif i == 60:
            out.append(bar(i, 3.0, 0.9, 0.9))          # swing B: high 3.0, all selling
        elif 30 <= i <= 44:
            out.append(bar(i, 1.0, 0.9, 1.0))          # buying, highs 1.0
        elif 50 <= i <= 59:
            out.append(bar(i, 1.0, 0.9, 0.9))          # selling, highs 1.0
        else:
            out.append(bar(i, 1.0, 0.9, 0.95))         # nothing
    return out


def mirror(cs):
    return [Candle(time=c.time, open=-c.open, high=-c.low, low=-c.high, close=-c.close, volume=c.volume,
                   timeframe=c.timeframe) for c in cs]
