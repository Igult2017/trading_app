"""
How stale was the data when a signal was built? The number every lateness argument turns on.

WHY IT EXISTS. He said *"signal arrives late when its past entry"*, and against real broker M1 bars
he was right — all four stored signals were at or past their own entry when they fired, two of them
genuinely through it (EUR/USD 19 Aug by 1.1 pips, XAU/USD 19 Aug by 9.3). A stop order cannot be
placed where price has already been, so two were unplaceable on arrival.

But that answer had to be RECONSTRUCTED afterwards, comparing `createdAt` against re-fetched bars. It
mixed the market's own waiting time with the platform's delay and could not separate them, and four
signals was every one that existed to measure. Nothing recorded it, so "is it still late?" could
only ever be an opinion.

WHAT THIS MEASURES, precisely: seconds between the freshest CLOSED bar closing and the signal being
built, on the FINEST timeframe the strategy holds — the timeframe the entry is read off. That is the
platform's OWN delay. The market's waiting is not in it: a 1M entry legitimately takes minutes to
form, so a small lag beside a late-feeling signal means the strategy was waiting, not that we were
slow. Read it back with `tools/signal_lag.py`.

Split out of `strategy_runner.py` rather than added to it — that file was already 411 lines, twice
the limit, before this existed.
"""
import time

from shared.mtf_utils import closed_only, seconds as tf_seconds


def data_lag(context) -> str:
    """` lag=42s(M1)` for the audit row, or "" when it cannot be measured honestly.

    BEST-EFFORT BY CONTRACT. This goes into an observability row and nothing else; a measurement must
    never be able to cost a signal. Anything unreadable returns "" rather than a guess, and an empty
    string is reported as unstamped by the reader rather than averaged into the result.
    """
    try:
        finest, secs = None, None
        for tf in context.candles.timeframes():
            n = tf_seconds(tf)
            if n and (secs is None or n < secs):
                finest, secs = tf, n
        if not finest:
            return ""
        bars = closed_only(context.candles.get(finest))
        if not bars:
            return ""
        return f" lag={time.time() - (bars[-1].time + secs):.0f}s({finest})"
    except Exception:
        return ""
