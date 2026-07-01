"""
VOCANT.1 — 1M entry.

Fires on the 1M FRACTAL BREAK + PULL-BACK, per the playbook's chart samples:
  Downtrend: price breaks BELOW a fractal low, then pulls back UP (retest) -> fire SELL (continuation).
  Uptrend:   price breaks ABOVE a fractal high, then pulls back DOWN (retest) -> fire BUY  (continuation).
The signal fires while price is pulling back AFTER the break, before the continuation resumes — the
entry is a stop just beyond the broken fractal (fills when price continues), and the stop-loss sits
just beyond the pull-back extreme (tight). Reads only raw candles — no other-strategy logic.
"""
from core.types import Candle

_PIP          = 0.00010
_SL_BUFFER    = 2 * _PIP
_ENTRY_BUFFER = 1 * _PIP   # entry sits JUST beyond the broken fractal (a genuine continuation break)
_MAX_STALE    = 20         # M1 bars — the pull-back must be this fresh (fire before continuation runs)
_M1_WINDOW    = 120        # only look at the recent ~2h of M1 (after the volume candle) for the setup
_MIN_RISK     = 5  * _PIP
_MAX_RISK     = 60 * _PIP


def m1_entry(m1: list[Candle], bullish: bool, cluster_end_time: int) -> tuple[float, float] | None:
    """
    Return (entry_level, sl_level) for a VOCANT.1 stop-order entry, or None.

    Finds the most recent 1M fractal (high if uptrend / low if downtrend) that has since been BROKEN
    in the trend direction and then PULLED BACK — that break-then-pull-back is the trigger.
      entry_level = a stop JUST BEYOND the broken fractal (fills as price continues the trend).
      sl_level    = just beyond the M1 pull-back extreme (tight).
    """
    window = [c for c in m1[-_M1_WINDOW:] if c.time >= cluster_end_time]
    n = len(window)
    if n < 12:
        return None

    # Scan fractals from most-recent (with room for a break + pull-back after) back to oldest.
    for i in range(n - 5, 1, -1):
        c = window[i]
        p1, p2, n1, n2 = window[i - 1], window[i - 2], window[i + 1], window[i + 2]
        is_frac = ((c.high > p1.high and c.high > p2.high and c.high > n1.high and c.high > n2.high)
                   if bullish else
                   (c.low < p1.low and c.low < p2.low and c.low < n1.low and c.low < n2.low))
        if not is_frac:
            continue
        f_level = c.high if bullish else c.low

        # 1) BREAK in the trend direction after the fractal (confirmed 2 bars later → scan from i+3).
        brk = next((j for j in range(i + 3, n)
                    if (window[j].high > f_level if bullish else window[j].low < f_level)), None)
        if brk is None or brk + 1 >= n:
            continue

        # 2) PULL-BACK after the break — the counter-trend retrace (this is the fire trigger).
        after = window[brk + 1:]
        if bullish:
            rel = min(range(len(after)), key=lambda k: after[k].low)
            pb_ext = after[rel].low
        else:
            rel = max(range(len(after)), key=lambda k: after[k].high)
            pb_ext = after[rel].high
        pb_idx = brk + 1 + rel

        # 3) Fire only while the pull-back is fresh (before the continuation has already run away).
        if (n - 1 - pb_idx) > _MAX_STALE:
            continue

        # 4) Continuation entry beyond the broken fractal; SL just beyond the pull-back extreme.
        if bullish:
            entry, sl = f_level + _ENTRY_BUFFER, pb_ext - _SL_BUFFER
            if sl >= entry:          # pull-back didn't dip below the entry → no valid risk
                continue
        else:
            entry, sl = f_level - _ENTRY_BUFFER, pb_ext + _SL_BUFFER
            if sl <= entry:          # pull-back didn't bounce above the entry → no valid risk
                continue

        risk = abs(entry - sl)
        if risk < _MIN_RISK or risk > _MAX_RISK:
            continue
        return round(entry, 5), round(sl, 5)

    return None
