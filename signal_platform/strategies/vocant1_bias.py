"""
VOCANT.1 — 1HR bias.

The strategy's OWN trend + volume rules, from the Volume Strategy playbook — NO indicators. The
direction can come from EITHER:
  - an ESTABLISHED trend — HH+HL (up) / LH+LL (down) 1HR structure, or
  - a RANGE BREAKING INTO A TREND — volume candles closing beyond the recent range.
A VOLUME CANDLE is a candle in the trend direction with a bigger body than the previous candle and
short wicks (each wick <= 33% of range; a genuine long/rejection wick = volatility = no-go). The move is
confirmed by a RUN of 1-3 consecutive volume candles (a single strong momentum candle can qualify);
the FIRST candle's close opens the 1M watch. detect_bias() reports (bullish, first_idx, origin, count).

The trend must be the thing CARRYING the volume (p1). So when structure and volume disagree — stale
structure still reading the old trend while fresh volume builds the new one — we do NOT reach back
past that opposing volume for an aligned candle from hours ago. Structure resolves on its own.

Structure itself lives in vocant1_trend; this module owns the volume rules. The 1M does NOT use it:
there the LINE says whether price is with us (vocant1_entry), because swing structure cannot read a
spike-and-return inside a single hour.
"""
import logging

from core.types import Candle
from shared.candle_math import body_size, upper_wick, lower_wick, full_range, is_bullish
from strategies.vocant1_trend import clear_trend        # the structure rule (1HR bias only)

log = logging.getLogger(__name__)

_MAX_WICK_FRAC  = 0.33   # each wick <= 33% of the candle's range — a genuine long/rejection wick is
                         # a no-go, but a normal short-to-medium wick on a strong trend candle is fine
_MIN_RUN        = 1      # min consecutive volume candles to confirm (a single momentum candle counts)
_VOL_LOOKBACK   = 12     # recent 1HR bars scanned for the confirming volume candle (an established
                         # trend's impulse can be several bars old while the fresh 1M entry forms)
_RANGE_LOOKBACK = 8      # bars before the breakout that define the range being broken


def _is_volume_candle(c: Candle, prev: Candle, bullish: bool) -> bool:
    """In the trend direction, a bigger body than the previous candle, and NO / very short wicks
    (both wicks small vs the range) — a long wick on either side disqualifies it."""
    if is_bullish(c) != bullish:
        return False
    if body_size(c) <= body_size(prev):
        return False
    rng = full_range(c)
    if rng <= 0:
        return False
    return upper_wick(c) <= _MAX_WICK_FRAC * rng and lower_wick(c) <= _MAX_WICK_FRAC * rng


def volume_run(h1: list[Candle], bullish: bool) -> tuple[int, int] | None:
    """
    Most recent run of consecutive volume candles (>= _MIN_RUN) in the trend direction.
    Returns (first_idx, run_len) or None — first_idx is the FIRST volume candle of the run. VOCANT.1
    OPERATES FROM THE FIRST volume candle (its close opens the 1M watch), so we drop to the 1M as soon
    as the move starts rather than waiting for the whole run to finish. run_len = candles in the run.
    """
    start = max(1, len(h1) - _VOL_LOOKBACK)
    for i in range(len(h1) - 1, start - 1, -1):
        if not _is_volume_candle(h1[i], h1[i - 1], bullish):
            continue
        # i = most recent volume candle; walk back to the FIRST candle of this contiguous run.
        run   = 1
        first = i
        j     = i - 1
        while j >= 1 and _is_volume_candle(h1[j], h1[j - 1], bullish):
            run  += 1
            first = j
            j    -= 1
        if run >= _MIN_RUN:
            return first, run
    return None


def _volume_veto_reason(h1: list[Candle], bullish: bool) -> str:
    """Why the recent bars produced no volume candle — for diagnostics only."""
    start = max(1, len(h1) - _VOL_LOOKBACK)
    dir_candles = wrong_dir = small_body = long_wick = 0
    for i in range(len(h1) - 1, start - 1, -1):
        c, prev = h1[i], h1[i - 1]
        if is_bullish(c) != bullish:
            wrong_dir += 1
            continue
        dir_candles += 1
        if body_size(c) <= body_size(prev):
            small_body += 1
            continue
        rng = full_range(c)
        if rng > 0 and (upper_wick(c) > _MAX_WICK_FRAC * rng or lower_wick(c) > _MAX_WICK_FRAC * rng):
            long_wick += 1
    if dir_candles == 0:
        return f"no in-direction ({'up' if bullish else 'down'}) H1 candle in last {_VOL_LOOKBACK} bars"
    return (f"{dir_candles} in-direction bars but none qualified as a volume candle "
            f"(smaller-body×{small_body}, long-wick>{int(_MAX_WICK_FRAC*100)}%×{long_wick})")


def _run_breaks_range(h1: list[Candle], first_idx: int, run_len: int, bullish: bool) -> bool:
    """True if the volume RUN closes beyond the range set by the bars BEFORE it started — a genuine
    break out of a range, not a wiggle inside it. Checks the run's furthest close (any candle in the
    run), so a breakout that completes on the 2nd/3rd candle still counts (not just the first)."""
    prior = h1[max(0, first_idx - 1 - _RANGE_LOOKBACK): first_idx - 1]
    if len(prior) < 3:
        return False
    run = h1[first_idx: first_idx + run_len]
    if bullish:
        return max(c.close for c in run) > max(c.high for c in prior)
    return min(c.close for c in run) < min(c.low for c in prior)


def detect_bias(h1: list[Candle], symbol: str = "") -> tuple[bool, int, str, int] | None:
    """
    VOCANT.1's 1HR bias. Returns (bullish, vc_idx, origin, vol_count) or None.
      origin 'trend' — established HH+HL / LH+LL structure, confirmed by 1-3 volume candles.
      origin 'range' — a ranging market breaking into a trend: volume candles closed beyond the range.
    Logs the exact reason at INFO when it returns None, so a miss is diagnosable.
    """
    trend = clear_trend(h1)
    if trend != 0:
        bullish = trend > 0
        vr  = volume_run(h1, bullish)
        opp = volume_run(h1, not bullish)
        # p1: "the 1HR must be in a clear trend AND that move must also carry volume". So the trend
        # has to be the thing carrying it. If the freshest volume runs AGAINST the structure, the
        # structure is the stale one and the volume is the truth — we must NOT reach back past that
        # to an aligned candle from hours ago and trade ITS direction. No fresh volume with the
        # trend = no trade; structure catches up on its own and we take it then.
        last     = (vr[0] + vr[1] - 1) if vr else -1
        opp_last = (opp[0] + opp[1] - 1) if opp else -1
        if vr is not None and last > opp_last:
            return (bullish, vr[0], "trend", vr[1])
        if vr is not None:
            log.info(f"[vocant1] {symbol} 1HR bias=NONE: {'up' if bullish else 'down'} structure, but the "
                     f"freshest volume runs AGAINST it (opposing candle at {opp_last} vs {last}) — the "
                     f"trend is not carrying the volume; waiting for structure to resolve")
            return None
        log.info(f"[vocant1] {symbol} 1HR bias=NONE: clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} "
                 f"trend, but {_volume_veto_reason(h1, bullish)}")
        return None

    # No established trend — accept a RANGE breaking into a trend (volume-led, playbook-valid).
    # Take the FRESHEST qualifying run, never "whichever we test first". In a range BOTH directions
    # routinely qualify inside the lookback (measured on 60d of H1: 26 such bars on EUR/USD, 18 on
    # GBP/USD), and returning the bullish one traded a STALE move against the live one in ~68% of them
    # — e.g. a bullish run ending 7 bars before the live bearish run still signalled BUY. That is the
    # same wrong-direction bug already fixed in the trend branch above: freshest volume wins.
    best: tuple[int, bool, tuple[int, int]] | None = None
    for bullish in (True, False):
        vr = volume_run(h1, bullish)
        if vr is not None and _run_breaks_range(h1, vr[0], vr[1], bullish):
            last = vr[0] + vr[1] - 1                     # index of the run's LAST candle = its freshness
            if best is None or last > best[0]:
                best = (last, bullish, vr)
    if best is not None:
        _, bullish, vr = best
        return (bullish, vr[0], "range", vr[1])
    log.info(f"[vocant1] {symbol} 1HR bias=NONE: no clear HH+HL/LH+LL trend and no volume-led range "
             f"breakout (up: {_volume_veto_reason(h1, True)})")
    return None
