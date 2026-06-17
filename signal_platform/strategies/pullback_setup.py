"""
EURUSD Pullback: volume cluster detection and pullback validation.
Fractal detection lives in pullback_fractal.py.
4H zone check lives in pullback_obstruction.py.
"""
import logging
from core.types import Candle
from shared.candle_math import body_size, body_ratio, full_range, is_bullish, is_bearish, is_doji

log = logging.getLogger(__name__)
_PIP = 0.00010


def cluster_strength(candles: list[Candle], start: int, end: int) -> float:
    """Total body movement of a cluster — used to pick the STRONGER of two
    opposing clusters instead of merely the most recent one."""
    return sum(body_size(candles[k]) for k in range(start, end + 1))


def recent_candles_summary(candles: list[Candle], n: int = 6) -> str:
    """Compact direction + body-ratio summary of the last n candles (diagnostics)."""
    parts = [f"{'BULL' if is_bullish(c) else 'BEAR'} br={body_ratio(c):.2f}" for c in candles[-n:]]
    return "[" + ", ".join(parts) + "]"


def find_volume_cluster(
    candles: list[Candle],
    bullish: bool,
    lookback: int = 60,
) -> tuple[int, int] | None:
    """
    Find the most recent H1 volume "cluster": 1+ consecutive directional candles —
    a single strong volume candle now counts, as well as a multi-candle impulse.

    Conditions (all required):
    - 1+ consecutive candles all moving in trade direction (no maximum)
    - Each candle: body_ratio >= 0.55 (long body, small wicks)
    - Cluster avg body > preceding candle body (growing vs pre-cluster activity)
    - Cluster avg tick volume >= preceding candle volume (real participation)

    lookback scans the last ~60 H1 candles so impulses up to ~2.5 trading days
    old can still be found (not just the last 20 hours).

    Returns (start_idx, end_idx) of the cluster or None.
    """
    end   = len(candles) - 1
    start = max(2, end - lookback)

    for i in range(end, start - 1, -1):
        c = candles[i]
        if is_bullish(c) != bullish or body_ratio(c) < 0.55:
            continue

        length = 1
        j = i - 1
        while j >= 1:
            cj = candles[j]
            if is_bullish(cj) == bullish and body_ratio(cj) >= 0.55:
                length += 1
                j -= 1
            else:
                break

        # A single strong "volume candle" now qualifies as the impulse (was: 2+).
        # The growing-body + volume checks below keep it to genuine impulses, and
        # any resulting pullback is still reported (QUALIFIED or NOT QUALIFIED).
        cluster_start = i - length + 1
        if cluster_start < 1:
            continue
        prev     = candles[cluster_start - 1]
        avg_body = sum(body_size(candles[k]) for k in range(cluster_start, i + 1)) / length
        avg_vol  = sum(candles[k].volume    for k in range(cluster_start, i + 1)) / length
        # Real participation: cluster bodies AND tick volume must exceed the
        # candle right before the cluster (lenient — cTrader tick volume).
        if avg_body > body_size(prev) and avg_vol >= prev.volume:
            return (cluster_start, i)

    return None


def measure_pullback(
    candles: list[Candle],
    vol_idx: int,
    bullish: bool,
    cluster_start: int | None = None,
) -> dict | None:
    """
    Measure the H1 pullback immediately after the volume cluster end.

    Returns None ONLY when there is no pullback at all (price kept moving with the
    cluster). Whenever ≥1 counter-trend candle exists it returns a dict describing
    the pullback so the scanner can report it — qualified or not:
        {pb_high, pb_low, count, pb_end_time, reasons}
    `reasons` is empty when the pullback passes all rules; otherwise it lists the
    rule(s) it fails (depth, length, structure).

    Rules for a *qualified* pullback:
    - 1 to 6 candles against direction
    - depth 10–80% of the full cluster range (from cluster_start to vol_idx)
    - no candle CLOSES beyond the cluster boundary (wicks are allowed)
    """
    # Collect the pullback. Tolerate dojis/pauses + a single with-trend rebound mid-pullback;
    # stop only when the trend clearly resumes (2 consecutive with-trend candles).
    pb_candles: list[Candle] = []
    resume = 0
    for c in candles[vol_idx + 1:]:
        against = is_bearish(c) if bullish else is_bullish(c)
        if against or is_doji(c):
            pb_candles.append(c)
            resume = 0
        elif pb_candles:          # a with-trend candle, but the pullback is underway
            resume += 1
            if resume >= 2:
                break             # trend resumed → pullback over
            pb_candles.append(c)  # tolerate one isolated rebound/pause bar
        else:
            break                 # trend continued immediately — no pullback at all

    if not pb_candles:
        return None  # no pullback yet — nothing to report

    pb_high = max(c.high for c in pb_candles)
    pb_low  = min(c.low  for c in pb_candles)
    depth   = pb_high - pb_low

    start = cluster_start if cluster_start is not None else vol_idx
    cluster_slice = candles[start:vol_idx + 1]
    cluster_high  = max(c.high for c in cluster_slice)
    cluster_low   = min(c.low  for c in cluster_slice)
    vol_range     = cluster_high - cluster_low

    reasons: list[str] = []
    if len(pb_candles) > 6:
        reasons.append(f"pullback too long ({len(pb_candles)} candles, max 6)")
    if vol_range > 0:
        pct = depth / vol_range * 100
        if pct < 10 or pct > 80:
            reasons.append(f"depth {pct:.0f}% of cluster (need 10-80%)")
    for c in pb_candles:
        if bullish and c.close < cluster_low:
            reasons.append("closed below cluster low (structure break)"); break
        if not bullish and c.close > cluster_high:
            reasons.append("closed above cluster high (structure break)"); break

    return {
        "pb_high": pb_high, "pb_low": pb_low, "count": len(pb_candles),
        "pb_end_time": pb_candles[-1].time + 3600, "reasons": reasons,
    }


