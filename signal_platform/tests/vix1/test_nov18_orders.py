"""His three orders of 18 Nov 2026, pinned on that day's REAL broker candles (GBPUSD/GBPJPY_H1_nov18.csv, the hour
08:00 UTC = 11:00 EAT, the newest CLOSED candle when he reported it).

1. *"it is blocking change of character and break of structure signals. Remove it there."* — the chaotic-move check
   refused the GBP/JPY 11:00 EAT break-of-structure SELL. It must now trade.
2. *"remove the rule, the momentum candle must be bigger than the previous candle … A momentum candle is decided by
   the size which is calculated"* — the GBP/USD 11:00 EAT candle (18.4 pips) failed only because the one before it was
   20.7 pips. It must now be a momentum candle.
3. *"Ten minutes before and after news means we dont trade any candle 10 before news and we trade any candle 10 after
   news unless that candle is the liquidity void defined in VIX"* — the news-candle skip is gone; the window is 10 / 10.
"""
import datetime as dt
from pathlib import Path

from _harness import Suite, load

from core.types import Candle, NewsContext, NewsEvent, NewsImpact
from news.news_candle import NEWS_AFTER_MIN, NEWS_BEFORE_MIN, in_news_window
from shared.candle_math import body_size
from strategies.vix1_bias import detect_bias
from strategies.vix1_momentum import _held_its_move, is_momentum_candle, qualifies_for_trade

s = Suite("VIX.1 — his three orders of 18 Nov 2026, on that day's real candles")
UTC = dt.timezone.utc
T0800 = int(dt.datetime(2026, 11, 18, 8, tzinfo=UTC).timestamp())


def upto_0800(name):
    bars = load(name, "H1")
    if not bars:
        return None
    k = next(i for i, c in enumerate(bars) if c.time == T0800)
    return bars[max(0, k + 1 - 3000):k + 1]


print("1. the chaotic-move check no longer blocks a trade — GBP/JPY 18 Nov 11:00 EAT SELL:")
gj = upto_0800("GBPJPY_H1_nov18.csv")
if gj is None:
    print("   SKIP — GBPJPY_H1_nov18.csv not present")
else:
    c = gj[-1]
    s.check("the candle is the 08:00 UTC SELL, a 47-pip body", (c.close < c.open, round(body_size(c) * 100, 1)), (True, 47.0))
    b = detect_bias(gj, [], "GBP/JPY")
    s.check("the real trade decision now gives the break-of-structure SELL",
            None if b is None else (b.origin, b.bullish), ("trend", False))

print("\n2. size decides, not the candle before — GBP/USD 18 Nov 11:00 EAT SELL:")
gu = upto_0800("GBPUSD_H1_nov18.csv")
if gu is None:
    print("   SKIP — GBPUSD_H1_nov18.csv not present")
else:
    i = len(gu) - 1
    s.check("it is SMALLER than the candle before (18.4 vs 20.7 pips)",
            (round(body_size(gu[i]) * 1e4, 1), round(body_size(gu[i - 1]) * 1e4, 1)), (18.4, 20.7))
    s.check("...and is now a momentum candle (his 2.5x size rule)", is_momentum_candle(gu, i, False, "GBP/USD"), True)
    s.check("...and may be traded", qualifies_for_trade(gu, i, False, "GBP/USD"), True)
    s.teeth("the removed rule is what refused it — 'bigger than the one before' would say no",
            not (body_size(gu[i]) > body_size(gu[i - 1])))


def _c(o, c):
    return Candle(time=0, open=o, high=max(o, c), low=min(o, c), close=c, volume=0, timeframe="H1")


s.check("hand-built: a clean candle half the size of the one before still passes the candle-only tests",
        _held_its_move([_c(1.0, 1.002), _c(1.002, 1.003)], 1, True), True)

print("\n3. news: 10 minutes before and 10 after, nothing else:")
REL = dt.datetime(2026, 11, 18, 7, 0, tzinfo=UTC)               # the UK CPI hour of his report
news = NewsContext(events=[NewsEvent("CPI y/y", "GBP", NewsImpact.HIGH, REL)])
for mins, want in ((-11, False), (-10, True), (-5, True), (0, True), (10, True), (11, False), (65, False)):
    s.check(f"{mins:+d} min from the release -> {'no trade' if want else 'may trade'}",
            in_news_window(news, "GBP/USD", now=REL + dt.timedelta(minutes=mins)), want)
s.check("the window is 10 / 10", (NEWS_BEFORE_MIN, NEWS_AFTER_MIN), (10, 10))
root = Path(__file__).resolve().parents[2]
vix1_src = (root / "strategies/vix1.py").read_text(encoding="utf-8")
pull_src = (root / "execution/news_pull.py").read_text(encoding="utf-8")
s.teeth("the news-candle skip is gone — VIX.1 calls no news-candle test", "is_news_candle(" not in vix1_src)
s.teeth("VIX.1 still calls the 10-minute window", "if in_news_window(context.news, sym):" in vix1_src)
s.teeth("waiting orders use the same window, no private 15 / 30", "after_min=30" not in pull_src
        and pull_src.count("in_news_window(news,") == 2)

s.done()
