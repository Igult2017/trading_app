"""
Aggregates fine-grained candles into coarser timeframes.
Used for non-native cTrader periods: H2, H3, H6, H8, M6, etc.
Strategy authors never call this — candle_fetcher uses it transparently.
"""

from core.types import Candle
from shared.mtf_utils import bar_open_at, day_grid_phase, is_closed, seconds, to_minutes


def aggregate(base_candles: list[Candle], target_tf: str) -> list[Candle]:
    """
    Group base_candles into target_tf bars using timestamp-floor bucketing.

    Correct for any (base, target) pair where target_mins % base_mins == 0.
    Output timestamps align to the target bar's open-time boundary —
    matching how TradingView and most brokers stamp their bars.

    BUCKETED ON THE BROKER'S GRID, NOT MIDNIGHT UTC. This used to floor with
    `(t // target_secs) * target_secs`, which puts every boundary at midnight and steps from there.
    The broker's trading day starts at **21:00 UTC** (measured — see `mtf_utils.day_grid_phase`), so
    an H8 bar opens 05:00/13:00/21:00 and an H6 bar 03:00/09:00/15:00/21:00. The old bucketing would
    have split every one of them across two buckets and produced bars with the wrong open, high, low
    and close. It is the same midnight assumption that held an H4 cache copy hours past its close
    (`candle_cache`, fixed 2026-08-21) — that one was live, this one was latent because no non-native
    timeframe is currently declared by any strategy.

    Incomplete buckets (fewer base bars than ratio) are silently dropped —
    this can happen at session open or when the data source returns fewer
    bars than requested.

    Args:
        base_candles: Validated candles at the finer (base) timeframe.
        target_tf:    Target timeframe string, e.g. "H2", "H6", "M10".
    """
    if not base_candles:
        return []

    target_secs = to_minutes(target_tf) * 60
    base_secs   = to_minutes(base_candles[0].timeframe) * 60
    ratio       = target_secs // base_secs if base_secs else 1

    phase = day_grid_phase(target_tf)
    groups: dict[int, list[Candle]] = {}
    for c in sorted(base_candles, key=lambda c: c.time):
        bucket = int((c.time - phase) // target_secs) * target_secs + int(phase)
        groups.setdefault(bucket, []).append(c)

    result: list[Candle] = []
    for bucket_ts in sorted(groups):
        bars = groups[bucket_ts]
        if len(bars) < ratio:
            continue   # incomplete bar — boundary edge or session open
        result.append(Candle(
            time=bucket_ts,
            open=bars[0].open,
            high=max(b.high for b in bars),
            low=min(b.low for b in bars),
            close=bars[-1].close,
            volume=sum(b.volume for b in bars),
            timeframe=target_tf,
        ))

    return result


def forming_bar(base_candles: list[Candle], target_tf: str,
                anchor: float | None = None, now: float | None = None) -> Candle | None:
    """The target_tf bar CURRENTLY FORMING, built from the finer bars we already hold.

    WHY THIS EXISTS. `ProtoOAGetTrendbarsReq` serves CLOSED bars only — measured 2026-08-21, 14 polls
    across 3 minute boundaries never once returned the minute in progress. The platform's data path
    was written believing *"the feed returns the still-forming bar as its newest"*, and on this feed
    it never does. The cost was one feature that could not run at all: VIX.1's T-5 pre-close warning
    looks for a bar mid-formation, found `None` every time, and had fired **zero** times in 30 days.

    ZERO EXTRA BROKER REQUESTS, which is the whole reason this is the chosen fix. The finer bars are
    already fetched every scan (VIX.1 pulls 839 M1 bars), so the hour in progress is already in
    memory — nobody was assembling it. **Proved 24/24 exact**: twelve CLOSED H1 bars per symbol on
    GBP/USD and USD/JPY, rebuilt from M1, matched the broker's own OHLC to the last decimal.

    `anchor` is any real OPEN time on the TARGET timeframe, which is how the grid is read rather than
    assumed (see `mtf_utils.grid_phase`). Callers have one: the newest closed target bar. Without it
    this falls back to the midnight grid, which is right for H1 and wrong for H4 on this broker.

    Returns None when no finer bar has printed inside the current period — a quiet minute, a session
    gap or a weekend. That is "no bar is forming", and inventing one from the last closed bar would
    describe a candle that is already history.

    CLOSED BASE BARS ONLY. A forming base bar's own high, low and close still move, so folding one in
    would make this bar change for two different reasons at once.
    """
    if not base_candles:
        return None
    period = seconds(target_tf)
    open_ts = int(bar_open_at(now, target_tf, anchor))
    part = [c for c in base_candles
            if open_ts <= c.time < open_ts + period and is_closed(c.time, c.timeframe, now)]
    if not part:
        return None
    part.sort(key=lambda c: c.time)
    return Candle(
        time=open_ts,
        open=part[0].open,
        high=max(b.high for b in part),
        low=min(b.low for b in part),
        close=part[-1].close,
        volume=sum(b.volume for b in part),
        timeframe=target_tf,
    )
