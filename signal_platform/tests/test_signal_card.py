"""Chart card rendering — the contract the dispatcher depends on.

THE ONE RULE: a chart must never take a signal down. Every failure path returns None, and the
dispatcher falls back to a text card. These tests exist because the previous chart generator was
never exercised at all — it had no callers for months and nothing ever set `Signal.chart_path`, so
the whole feature was silently dead. Unexercised code is untrusted code.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.types import Candle, Signal, Direction
from charting import signal_card, theme

PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def bars(n=60, base=1.3000):
    out = []
    for i in range(n):
        o = base + (i % 7) * 0.0004
        c = o + (0.0006 if i % 3 else -0.0005)
        out.append(Candle(time=1_700_000_000 + i * 14400, open=o, high=max(o, c) + 0.0003,
                          low=min(o, c) - 0.0003, close=c, volume=100, timeframe="H4"))
    return out


def sig(**kw):
    d = dict(symbol="GBP/USD", direction=Direction.SELL, strategy_id="bx_sd",
             strategy_name="BX-S/D", entry_price=1.3020, stop_loss=1.3050,
             take_profit=1.2930, risk_reward=3.0, technical_reasons=["a reason"])
    d.update(kw)
    return Signal(**d)


print("\nTHE FONT")
check("Playfair TTFs are bundled next to the module", theme.REGULAR.exists() and theme.BOLD.exists(), True)
check("register() succeeds", theme.register(), True)
check("register() is idempotent (returns the cached answer)", theme.register(), True)

print("\nRENDERING")
p = signal_card.render(sig(), bars(), digits=5)
check("a normal signal renders", bool(p) and os.path.isfile(p), True)
check("the file is a real PNG", open(p, "rb").read(4), b"\x89PNG")
size = os.path.getsize(p)
check("the PNG is not a blank stub (>20KB)", size > 20_000, True)
os.unlink(p)

p2 = signal_card.render(sig(direction=Direction.BUY, chart_bands=[]), bars(), digits=5,
                        bands=[(1.2990, 1.3010, "#26A96C", "DEMAND")])
check("renders with a band", bool(p2) and os.path.isfile(p2), True)
os.unlink(p2)

p3 = signal_card.render(sig(symbol="USD/JPY", entry_price=147.2, stop_loss=147.6,
                            take_profit=146.2), bars(base=147.0), digits=3)
check("renders a 3-digit (JPY) pair", bool(p3) and os.path.isfile(p3), True)
os.unlink(p3)

print("\nFAILURE PATHS — none may raise, all must return None")
check("no candles -> None", signal_card.render(sig(), [], 5), None)
check("too few candles -> None", signal_card.render(sig(), bars(3), 5), None)
check("garbage candles -> None (no exception escapes)",
      signal_card.render(sig(), ["not a candle"] * 10, 5), None)
check("zero levels still render (a watch alert has no entry/stop/tp)",
      bool(signal_card.render(sig(entry_price=0, stop_loss=0, take_profit=0), bars(), 5)), True)

print("\nCONCURRENCY — the scan loop renders several instruments at once")


async def many():
    # pyplot is not thread-safe; this is why the renderer uses Figure() directly. Ten concurrent
    # renders in executor threads is the shape production actually produces.
    out = await asyncio.gather(*[
        signal_card.render_async(sig(symbol=f"X{i}/USD"), bars(), 5) for i in range(10)])
    return out


paths = asyncio.run(many())
check("10 concurrent renders all produced a file", all(p and os.path.isfile(p) for p in paths), True)
check("...and they are 10 DISTINCT files", len({p for p in paths if p}), 10)
for p in paths:
    if p:
        os.unlink(p)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
