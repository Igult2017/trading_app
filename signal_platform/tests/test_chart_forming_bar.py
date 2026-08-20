"""THE CARD MUST NOT DRAW THE UNFINISHED BAR — unless the signal is about it.

WHY THIS EXISTS. The feed hands back the bar currently forming as its newest, and `_attach_chart`
passed that list straight to the renderer. So a card sent seconds after an H1 close drew the
momentum candle SECOND from the right, with a fresh near-zero-range stub beside it. To a reader that
stub is a whole candle that has already come and gone — which makes an alert that arrived 14 seconds
after the close look a full candle late. Days went into hunting a lateness bug that was in the
PICTURE, not in the platform.

Runs the REAL `_attach_chart` with the renderer intercepted, so the assertion is about the bars that
actually reach the chart rather than about the shape of the code.
"""
import asyncio
import os
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from charting import signal_card                                        # noqa: E402
from core.types import Candle, Direction, Signal, TF                    # noqa: E402
from orchestrator import strategy_runner                                # noqa: E402

failed, count = [], 0


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke_it: bool):
    global count
    count += 1
    print(f"   {'PASS' if broke_it else 'FAIL'}  TEETH — {name}: {broke_it}")
    if not broke_it:
        failed.append(f"TEETH:{name}")


# ── an H1 feed: 30 closed bars, then one that opened a minute ago ────────────
NOW = time.time()
TOP = int(NOW // 3600) * 3600                 # the forming bar's open
bars = [Candle(time=TOP - (30 - i) * 3600, open=1.10, high=1.11, low=1.09, close=1.105,
               volume=0, timeframe="H1") for i in range(30)]
FORMING = Candle(time=TOP, open=1.105, high=1.1051, low=1.1049, close=1.105,
                 volume=0, timeframe="H1")
feed = bars + [FORMING]

seen: dict = {}


async def _capture(sig, candles, digits, bands=None, subtitle="", marks=None):
    seen["bars"] = list(candles)
    return "/tmp/fake.png"


signal_card.render_async = _capture
strategy_runner.signal_card.render_async = _capture


def sig(marks=None, stage="ready"):
    return Signal(symbol="EUR/USD", direction=Direction.SELL, strategy_id="vix1",
                  strategy_name="VIX.1", primary_timeframe=TF.H1, confidence=0.8,
                  stage=stage, chart_marks=list(marks or []))


print()
print("CARD — the still-forming bar")

# ── 1. an ordinary card drops it ─────────────────────────────────────────────
asyncio.run(strategy_runner._attach_chart(sig(), feed, "EUR/USD", {TF.H1: feed}))
check("an ordinary card does NOT draw the unfinished bar", seen["bars"][-1].time, bars[-1].time)
check("...and keeps every closed bar", len(seen["bars"]), len(bars))
check("...so the newest bar drawn IS the one that just closed",
      seen["bars"][-1] is bars[-1], True)

# ── 2. a card ABOUT the forming bar keeps it ─────────────────────────────────
asyncio.run(strategy_runner._attach_chart(
    sig(marks=[(FORMING.time, "FORMING")], stage="building"), feed, "EUR/USD", {TF.H1: feed}))
check("a card that MARKS the forming bar draws it", seen["bars"][-1].time, FORMING.time)
check("...and still draws the history behind it", len(seen["bars"]), len(feed))

# ── 3. a mark on a CLOSED bar changes nothing ────────────────────────────────
asyncio.run(strategy_runner._attach_chart(
    sig(marks=[(bars[-1].time, "MOMENTUM")]), feed, "EUR/USD", {TF.H1: feed}))
check("marking a closed bar does not re-admit the forming one",
      seen["bars"][-1].time, bars[-1].time)

# ── 4. the ORDER TYPE still reads live price ─────────────────────────────────
# The trim is about the PICTURE. "Is this a stop or a market order" is a question about where price
# is RIGHT NOW, so it must keep reading the unfinished bar's close. Trimming both would silently
# start naming the order type off an hour-old price.
ready = Signal(symbol="EUR/USD", direction=Direction.SELL, strategy_id="vix1",
               strategy_name="VIX.1", primary_timeframe=TF.H1, confidence=0.8,
               stage="ready", entry_price=1.2000, stop_loss=1.2050, take_profit=1.1900)
live = Candle(time=TOP, open=1.105, high=1.106, low=1.104, close=1.1000,
              volume=0, timeframe="H1")           # live price far BELOW the 1.2000 entry
asyncio.run(strategy_runner._attach_chart(ready, bars + [live], "EUR/USD", {TF.H1: bars + [live]}))
check("the order type is derived from the LIVE (forming) close", ready.order_type, "SELL LIMIT")
check("...while the chart still dropped that bar", seen["bars"][-1].time, bars[-1].time)

# ── 5. a feed of only unfinished bars still draws something ─────────────────
asyncio.run(strategy_runner._attach_chart(sig(), [FORMING], "EUR/USD", {TF.H1: [FORMING]}))
check("an all-unclosed feed falls back to drawing it rather than losing the chart",
      len(seen["bars"]), 1)

# ── TEETH ────────────────────────────────────────────────────────────────────
asyncio.run(strategy_runner._attach_chart(sig(), feed, "EUR/USD", {TF.H1: feed}))
teeth("the trim actually removes a bar", len(seen["bars"]) == len(feed) - 1)
teeth("the forming bar is genuinely unclosed", FORMING.time + 3600 > time.time())

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
