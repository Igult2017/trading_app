"""PIX's OWN "has this candle finished?" check — copied from `shared/mtf_utils` (18 Nov 2026) so PIX shares no logic.

His rule: *"I just said copy the code which is different from saying let them share a code."* A change or a fault in
the shared helper can no longer reach PIX, and nothing here can reach another strategy.

Bars are stamped at their OPEN, so a bar is finished once its own duration has passed. The feed hands back the
still-forming bar as its newest, and anything read as a LEVEL from it would move — so levels come from `closed_only`.

SPEED (19 Nov 2026): this ran a text-pattern match on the timeframe name for EVERY candle, every call — 70% of a PIX
decision's time when profiled on real gold. A timeframe's length is now worked out once (`lru_cache`), and since a
series is in time order only its NEWEST candles can still be forming, so the check walks back from the end and stops
at the first finished one. Same answer for any time-ordered series (proved in tests/pix/test_regime.py).
"""
import re
import time
from functools import lru_cache


@lru_cache(maxsize=64)
def bar_seconds(tf: str) -> int:
    """Duration of one bar: M<n>, H<n>, D1, W1, MN."""
    tf = tf.strip().upper()
    m = re.fullmatch(r"M(\d+)", tf)
    if m:
        return int(m.group(1)) * 60
    m = re.fullmatch(r"H(\d+)", tf)
    if m:
        return int(m.group(1)) * 3600
    if tf in ("D", "D1"):
        return 86_400
    if tf in ("W", "W1"):
        return 604_800
    if tf in ("MN", "MON"):
        return 2_592_000
    raise ValueError(f"Unrecognised timeframe '{tf}'")


def is_closed(bar_time: int, tf: str, now: float | None = None) -> bool:
    return bar_time + bar_seconds(tf) <= (now if now is not None else time.time())


def closed_only(candles: list, now: float | None = None) -> list:
    """The candles that have finished forming (drops a still-forming newest bar). Candles are in time order."""
    now = time.time() if now is None else now
    i = len(candles)
    while i > 0 and not is_closed(candles[i - 1].time, candles[i - 1].timeframe, now):
        i -= 1
    return candles[:i]                     # always a copy, as before — a caller may change it freely
