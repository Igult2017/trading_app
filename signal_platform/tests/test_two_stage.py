"""TWO-STAGE SIGNALLING — a "building" heads-up, then a "ready" entry.

The user, 2026-08-03: *"send one signal twice. The first signal when higher TF is building up — like
the zone has been mitigated if its BX, but entry not yet; or if its VIX the first volume candle has
closed so we are waiting for entry. Then the second signal only sends a ready entry setup with a
visual display of where trader should put SL and TP and whether it is buy stop, sell stop or market
buy or sell."*

THE RISK THESE TESTS GUARD. If a stage-1 heads-up is ever mistaken for a ready entry, the reader
takes the trade before the entry confirms — the precise failure the split exists to prevent. So the
assertions are about the things that would cause that: a building card must carry no order type, no
tradeable levels, and no projection arrow.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.types import Candle, Signal, Direction
from orchestrator.strategy_runner import _set_order_type
from strategies import vix1_building

PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def sig(**kw):
    d = dict(symbol="GBP/USD", direction=Direction.BUY, stage="ready", entry_price=1.3500)
    d.update(kw)
    return Signal(**d)


print("\nORDER TYPE — derived from the entry against LIVE price")
PRICE = 1.3450
cases = [
    ("buy, entry ABOVE market", sig(direction=Direction.BUY, entry_price=1.3500), "BUY STOP"),
    ("buy, entry BELOW market", sig(direction=Direction.BUY, entry_price=1.3400), "BUY LIMIT"),
    ("sell, entry BELOW market", sig(direction=Direction.SELL, entry_price=1.3400), "SELL STOP"),
    ("sell, entry ABOVE market", sig(direction=Direction.SELL, entry_price=1.3500), "SELL LIMIT"),
    ("buy, entry AT market", sig(direction=Direction.BUY, entry_price=PRICE), "MARKET BUY"),
    ("sell, entry AT market", sig(direction=Direction.SELL, entry_price=PRICE), "MARKET SELL"),
]
for label, s, want in cases:
    _set_order_type(s, PRICE, 5)
    check(label, s.order_type, want)

# Half a pip is inside the spread — closer than that is not worth a pending order.
s = sig(direction=Direction.BUY, entry_price=PRICE + 0.00004)
_set_order_type(s, PRICE, 5)
check("within half a pip counts as AT market", s.order_type, "MARKET BUY")

print("\nA BUILDING CARD MUST NOT LOOK TRADEABLE")
b = sig(stage="building", entry_price=0.0)
_set_order_type(b, PRICE, 5)
check("a building signal gets NO order type", b.order_type, "")
b2 = sig(stage="building", entry_price=1.3500)
_set_order_type(b2, PRICE, 5)
check("...even when it happens to carry an entry price", b2.order_type, "")
check("stage defaults to 'ready' so existing signals are unchanged", sig().stage, "ready")

s3 = sig(order_type="BUY STOP", entry_price=1.3400)
_set_order_type(s3, PRICE, 5)
check("a strategy's own order type is never overwritten", s3.order_type, "BUY STOP")

print("\nVIX.1 STAGE 1 — the momentum candle closed, entry pending")
vc = Candle(time=1_700_000_000, open=1.3460, high=1.3498, low=1.3458, close=1.3494,
            volume=1, timeframe="H1")
hs = vix1_building.building_signal("GBP/USD", True, vc, "1HR trend", 2, "A", 5, "VIX.1", 0.0001)
check("it is stage 'building'", hs.stage, "building")
check("it is alert_only (DM, never the channel)", hs.alert_only, True)
check("strategy_id carries the _watch suffix the dispatcher routes on", hs.strategy_id, "vix1_watch")
check("it carries NO entry", hs.entry_price, 0.0)
check("it carries NO stop", hs.stop_loss, 0.0)
check("it carries NO target", hs.take_profit, 0.0)
check("confidence is 0 until the entry confirms", hs.confidence, 0.0)
check("the momentum candle is shaded on the chart", len(hs.chart_bands), 1)
check("it says plainly that it is not a trade",
      any("HEADS-UP" in r for r in hs.technical_reasons), True)

k1 = vix1_building.dedup_key("vix1", "GBP/USD", True, vc)
k2 = vix1_building.dedup_key("vix1", "GBP/USD", True, vc)
vc2 = Candle(time=vc.time + 3600, open=vc.open, high=vc.high, low=vc.low, close=vc.close,
             volume=1, timeframe="H1")
check("the dedup key is stable for one momentum candle", k1, k2)
check("...and differs for the next candle",
      k1 != vix1_building.dedup_key("vix1", "GBP/USD", True, vc2), True)
check("...and differs by direction",
      k1 != vix1_building.dedup_key("vix1", "GBP/USD", False, vc), True)

print("\nRENDERING — the two stages must be visually distinguishable")
from charting import signal_card
import os

bars = [Candle(time=1_700_000_000 + i * 14400, open=1.3450 + i * 1e-4, high=1.3460 + i * 1e-4,
               low=1.3440 + i * 1e-4, close=1.3455 + i * 1e-4, volume=1, timeframe="H4")
        for i in range(60)]
pb = signal_card.render(hs, bars, 5, list(hs.chart_bands))
check("a building card renders", bool(pb) and os.path.isfile(pb), True)
ready = sig(stage="ready", direction=Direction.SELL, entry_price=1.3500, stop_loss=1.3530,
            take_profit=1.3410, risk_reward=3.0, order_type="SELL LIMIT",
            technical_reasons=["r"])
pr = signal_card.render(ready, bars, 5)
check("a ready card renders", bool(pr) and os.path.isfile(pr), True)
check("the two cards are different images", os.path.getsize(pb) != os.path.getsize(pr), True)
os.unlink(pb); os.unlink(pr)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
