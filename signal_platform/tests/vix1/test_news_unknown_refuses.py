"""VIX.1 — NEWS UNKNOWN MEANS NO NEW TRADE (his order, 2026-11-15).

    "make sure everything is informed by that news api because if we miss the news we risk trading
     news candles which can be disastrous for propfirms."

WHAT WAS WRONG. When the news feed failed, the calendar came back EMPTY, and both news checks
(`is_news_candle`, `in_news_window`) read an empty calendar as "no news here" — so the trade went
through, possibly on the CPI candle. `news_fetcher` now marks the calendar not-ok when none has
arrived for 6 hours or it ends before now, and `analyze` refuses new entries while it is not ok.

DRIVES THE REAL `analyze` (same fixture as test_headsup_untied.py): the bias and the 1M entry are
granted, so the ONLY thing deciding whether an entry comes out is the news.
"""
from _harness import Suite, body, flat_series

import asyncio

from core.types import MTFCandles, NewsContext, Session, TF
from core.strategy_context import StrategyContext
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle
from strategies import vix1 as vix1_mod
from strategies.vix1 import Vix1Strategy
from strategies.vix1_state import Bias

s = Suite("VIX.1 — news unknown refuses new entries")
SYM = "EUR/USD"
h1 = flat_series(300, tf="H1") + [body(1.1000, 1.1070, tf="H1", t=300)]
h4 = flat_series(300, tf="H4")
m1 = flat_series(400, tf="M1")
BIAS = Bias(bullish=True, mc_idx=len(h1) - 1, origin="trend", run_len=1, reason="test leg")
ENTRY = [{"kind": "pullback", "entry": 1.1075, "sl": 1.1055}]


def entries(news):
    vix1_mod.detect_bias = lambda *a, **k: BIAS
    vix1_mod.m1_signals = lambda *a, **k: list(ENTRY)
    vix1_mod.vix1_spacing.check = lambda *a, **k: (True, "")
    vix1_mod.is_news_candle = lambda *a, **k: False
    vix1_mod.in_news_window = lambda *a, **k: False
    st = Vix1Strategy()
    st._debut.note(SYM, h1[-1].time - 10 * 3600)
    ctx = StrategyContext(symbol=SYM, candles=MTFCandles(_data={TF.M1: list(m1), TF.H1: list(h1),
                                                                TF.H4: list(h4)}),
                          indicators=IndicatorBundle(), patterns=PatternBundle(),
                          session=[Session.LONDON], news=news)
    return [x for x in asyncio.run(st.analyze(ctx)).signals if x.stage == "ready"]


s.check("news KNOWN: the entry goes out", len(entries(NewsContext(events=[]))), 1)
s.check("news feed failed (not ok): NO entry",
        len(entries(NewsContext(events=[], ok=False, why="no news calendar has been received"))), 0)
s.check("no news context at all: NO entry", len(entries(None)), 0)

# TEETH — remove the refusal by making every calendar look known; the not-ok case must then trade.
real = NewsContext.__init__


def always_ok(self, *a, **k):
    real(self, *a, **k)
    self.ok = True


NewsContext.__init__ = always_ok
broke = len(entries(NewsContext(events=[], ok=False, why="x"))) == 1
NewsContext.__init__ = real
s.teeth("a failed feed would trade if the refusal were gone", broke)

s.done()
