"""HIS VOID RULE (2026-11-15) and NEWS THAT CAN NEVER BE SILENTLY MISSED — on real GBP/USD bars.

His words: *"twice the size of a momentum candle that we would pick at that time, meaning anything
less than twice the momentum candle is a normal momentum candle"* and *"News release leads to less
trading activities which causes a liquidity void."* And the safety order: *"if we miss the news we
risk trading news candles which can be disastrous for propfirms."*

Pinned on HIS two charts:
  image 1  14 Oct 2026 15:00 his clock (12:00 UTC) — a 62-pip drop, 4.4x the recent momentum
           candles. A VOID.
  image 2  10 Nov 2026 16:00-18:00 his clock (13:00-15:00 UTC) — strong candles after the news, 1.3x /
           0.8x / 1.8x. NOT voids: traded normally. The old "> 5x normal" line called two of them voids.
"""
import datetime as dt
import sys
from datetime import timedelta, timezone

from _harness import Suite, load

from core.types import NewsContext, NewsEvent, NewsImpact
from news import news_fetcher
from strategies import vix1_void

S = Suite("VIX.1 — his void rule, and unknown news treated as news")
U = timezone.utc
h1 = load("GBPUSD_H1_7y.csv", "H1")
if not h1:
    print("   SKIP  GBPUSD_H1_7y.csv not on this machine")
    sys.exit(0)
IX = {c.time: k for k, c in enumerate(h1)}


def at(y, m, d, h_utc):
    i = IX[int(dt.datetime(y, m, d, h_utc, tzinfo=U).timestamp())]
    w = h1[max(0, i - 2999): i + 1]
    return w, len(w) - 1


def cal(*releases, start=dt.datetime(2026, 9, 1, tzinfo=U)):
    """A KNOWN calendar: one far-away anchor release so it covers the test dates, plus `releases`."""
    ev = [NewsEvent("anchor", "USD", NewsImpact.HIGH, start)]
    ev += [NewsEvent("test release", cur, NewsImpact.HIGH, when) for cur, when in releases]
    return NewsContext(events=ev)


QUIET_NEWS = cal()                                     # known, and nothing near his candles
OCT14, NOV10_16, NOV10_17, NOV10_18 = at(2026, 10, 14, 12), at(2026, 11, 10, 13), \
    at(2026, 11, 10, 14), at(2026, 11, 10, 15)


def big(wj, news=QUIET_NEWS):
    w, j = wj
    return vix1_void._big_enough(w, j, "GBP/USD", news)


# ── 1. his two charts, with the news KNOWN ──────────────────────────────────────────────────────
S.check("image 1, 14 Oct 15:00 his clock: a void (too long to be normal)", big(OCT14), True)
S.check("image 2, 10 Nov 16:00 his clock: normal", big(NOV10_16), False)
S.check("image 2, 10 Nov 17:00 his clock: normal", big(NOV10_17), False)
S.check("image 2, 10 Nov 18:00 his clock: normal", big(NOV10_18), False)

w, j = at(2026, 10, 14, 14)
S.check("2 h after image 1, VIX.1 sees the void (selling into it is held back)",
        vix1_void.find_void(w, j, False, "GBP/USD", news=QUIET_NEWS) is not None, True)
w, j = at(2026, 11, 10, 17)
S.check("2 h after image 2, VIX.1 sees NO void (the move is traded)",
        vix1_void.find_void(w, j, False, "GBP/USD", news=QUIET_NEWS) is None, True)

# ── 2. part 3: a long candle WITH news is a void; the same candle without news is not ─────────────
release = dt.datetime(2026, 11, 10, 13, 30, tzinfo=U)            # inside the 13:00 UTC candle
S.check("10 Nov 16:00 his clock WITH a GBP release in it: a void", big(NOV10_16, cal(("GBP", release))), True)
S.check("...with the release in the hour BEFORE it: a void",
        big(NOV10_16, cal(("USD", release - timedelta(hours=1)))), True)
S.check("...with a release for an unrelated currency (JPY): not a void",
        big(NOV10_16, cal(("JPY", release))), False)
S.check("...a candle UNDER 5x normal stays normal even with news (10 Nov 17:00)",
        big(NOV10_17, cal(("GBP", release + timedelta(hours=1)))), False)

# ── 3. NEWS UNKNOWN IS TREATED AS NEWS — the safe side ───────────────────────────────────────────
S.check("no calendar at all: the > 5x candle counts as a void", big(NOV10_16, None), True)
S.check("calendar marked not-ok: counts as a void", big(NOV10_16, NewsContext(events=QUIET_NEWS.events,
                                                                              ok=False, why="t")), True)
S.check("calendar that starts AFTER the candle (the Monday case): counts as a void",
        big(NOV10_16, cal(start=dt.datetime(2026, 11, 12, tzinfo=U))), True)

# ── 4. the news feed itself: unknown is NOT "no news" ────────────────────────────────────────────
now = dt.datetime(2026, 11, 15, 12, tzinfo=U)
future = [NewsEvent("CPI", "USD", NewsImpact.HIGH, now + timedelta(days=1))]
past = [NewsEvent("CPI", "USD", NewsImpact.HIGH, now - timedelta(days=1))]
news_fetcher._last_good_at = None
S.check("no calendar ever received -> news unknown", news_fetcher._known(future, now)[0], False)
news_fetcher._last_good_at = now - timedelta(hours=1)
S.check("calendar 1 h old with releases ahead -> known", news_fetcher._known(future, now)[0], True)
S.check("empty calendar -> unknown", news_fetcher._known([], now)[0], False)
S.check("calendar that ends before now -> unknown", news_fetcher._known(past, now)[0], False)
news_fetcher._last_good_at = now - timedelta(hours=7)
S.check("calendar 7 h old -> unknown (limit 6 h)", news_fetcher._known(future, now)[0], False)
news_fetcher._last_good_at = None

# ── 5. B35: the GBP/JPY void is measured in GBP/JPY pips ─────────────────────────────────────────
j1 = load("GBPJPY_H1_7y.csv", "H1")
if j1:
    k = len(j1) - 10
    v = vix1_void.Void(True, j1[k].close + 2.0, j1[k].close, k, k)        # a 2.00-yen band
    got = vix1_void._is_a_void(j1, v, "GBP/JPY")
    S.check("a 2.00-yen GBP/JPY band is 200 pips (was printed as 20)", round(got.pips, 1) if got else None, 200.0)

# ── 6. TEETH: the assertions can fail ────────────────────────────────────────────────────────────
saved = vix1_void._RECENT_X
vix1_void._RECENT_X = 100.0                                   # break part (a)
broke = big(OCT14) is not True
vix1_void._RECENT_X = saved
S.teeth("image 1 stops being a void when 'twice' is broken", broke)
saved_rn = vix1_void.release_near
vix1_void.release_near = lambda *a, **k: False                 # pretend the unknown were "no news"
broke = big(NOV10_16, None) is not True
vix1_void.release_near = saved_rn
S.teeth("unknown news stops counting as news when the fallback is broken", broke)

S.done()
