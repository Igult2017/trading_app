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
check("the momentum candle is pointed at on the chart", len(hs.chart_marks), 1)
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

print("\nTHE CHART MUST DRAW THE SIGNAL'S OWN TIMEFRAME")
# The user checked a VIX.1 card against his cTrader H1 chart, 2026-08-03: "the chart displays green
# where there is no green ... in sell signals for VIX there can never be green as the first momentum
# candle." The card was drawing the strategy's HIGHEST timeframe (H4) under an H1 signal, so it
# disagreed with his platform bar for bar. An H4 bar can close bullish across a bearish hour.
from orchestrator.strategy_runner import _chart_candles


def series(tf, n=30, base=1.30):
    return [Candle(time=1_700_000_000 + i * 60, open=base, high=base + 1e-3, low=base - 1e-3,
                   close=base, volume=1, timeframe=tf) for i in range(n)]


view = {"M1": series("M1"), "H1": series("H1"), "H4": series("H4")}
fallback = view["H4"]
check("an H1 signal charts H1, not the strategy's highest TF",
      _chart_candles(sig(primary_timeframe="H1"), view, fallback)[0].timeframe, "H1")
check("an H4 signal charts H4", _chart_candles(sig(primary_timeframe="H4"), view, fallback)[0].timeframe, "H4")
check("an M1 signal charts M1", _chart_candles(sig(primary_timeframe="M1"), view, fallback)[0].timeframe, "M1")
check("an unknown TF falls back rather than drawing nothing",
      _chart_candles(sig(primary_timeframe="W1"), view, fallback)[0].timeframe, "H4")
check("an empty series is skipped, not chosen",
      _chart_candles(sig(primary_timeframe="H1"), {"H1": [], "H4": fallback}, fallback)[0].timeframe, "H4")

print("\nTHE MOMENTUM CANDLE IS MARKED, AND THE 1H LINE IS DRAWN")
check("VIX.1 stage 1 marks a candle by TIMESTAMP", hs.chart_marks, [(vc.time, "MOMENTUM")])
# THE LINE is the body close of the first momentum candle (vix1_lines.draw_line) — the level the
# whole 1M entry model is read against: which side price is on decides whether the pullback is the
# entry, and the stop may never rest past it. A card without it cannot be checked against a chart.
# It is passed as a ZERO-HEIGHT band, which price_panel renders as one labelled line rather than a
# shaded span — so the strategies only ever learn one overlay contract.
from strategies.vix1_lines import draw_line
check("the card carries exactly one band — the line", len(hs.chart_bands), 1)
lo, hi, _colour, lbl = hs.chart_bands[0]
check("it is zero-height, i.e. a LINE not a zone", lo, hi)
check("...drawn at the momentum candle's CLOSE", lo, vc.close)
check("...which is what draw_line returns", lo, draw_line(vc))
check("...and it is labelled", lbl, "1H LINE")

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
