"""PIX's OWN "has this candle finished?" check — copied from `shared/mtf_utils` (18 Nov 2026) so PIX shares no logic.

His rule: *"I just said copy the code which is different from saying let them share a code."* A change or a fault in
the shared helper can no longer reach PIX, and nothing here can reach another strategy.

Bars are stamped at their OPEN, so a bar is finished once its own duration has passed. The feed hands back the
still-forming bar as its newest, and anything read as a LEVEL from it would move — so levels come from `closed_only`.
"""
import re
import time


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
    """The candles that have finished forming (drops a still-forming newest bar)."""
    return [c for c in candles if is_closed(c.time, c.timeframe, now)]
