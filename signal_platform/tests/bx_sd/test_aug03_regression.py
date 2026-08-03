"""REGRESSION — the 03 Aug 2026 GBP/USD SELL must never fire again.

REAL cTrader H4 bars (997 of them, pulled 2026-08-03, committed as
`data/gbpusd_h4_2026-08-03.csv`). Synthetic fixtures did not catch this bug and a synthetic fixture
that claimed to test exactly this passed while the bug shipped — so the guard is the real market
data that actually produced the bad signal.

WHAT WENT OUT, and what each number was:

    card:  SELL GBP/USD  entry 1.34872  stop 1.35210  target 1.33858  "33.8 pips risk"

  * entry 1.34872 was the close of the 02 Aug 21:00 bar (correct — the confirming close)
  * stop 1.35210 was `pb_extreme 1.35060 + 15 pips`, and 1.35060 was the HIGH OF A FOUR-DAY,
    174-PIP RALLY that `pullback_4h` had labelled a pullback
  * the zone sold was a SUPPLY zone from 13 MAY at 1.35337-1.35510 — 82 days old, and price's high
    in the entire move (1.35060) never came within 27.7 pips of it
  * the card also read "Fresh — never tapped" because `mitigation_note` had no `respected` branch

The user caught all of it from one chart. These assertions are the receipts.
"""
import csv
import datetime
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from core.types import Candle
from shared.pip import pip_size
from strategies.bx_sd_registry import build
from strategies.bx_sd_setup import detect_setup, pullback_4h
from strategies.bx_sd_strength import mitigation_note

PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


DATA = Path(__file__).parent / "data" / "gbpusd_h4_2026-08-03.csv"
bars = [Candle(time=int(r["time"]), open=float(r["open"]), high=float(r["high"]),
               low=float(r["low"]), close=float(r["close"]),
               volume=float(r["volume"]), timeframe="H4")
        for r in csv.DictReader(open(DATA, newline=""))]
pip = pip_size("GBP/USD")

# Production saw the 02 Aug 21:00 bar as the FORMING bar when it fired at 03 Aug 01:00 UTC.
SIGNAL_BAR = datetime.datetime(2026, 8, 2, 21, 0)
idx = next(i for i, b in enumerate(bars)
           if datetime.datetime.utcfromtimestamp(b.time) == SIGNAL_BAR)
win = bars[:idx + 1]
book = build(win, pip)

print("\nTHE SIGNAL THAT SHOULD NOT HAVE FIRED")
check("the fixture reproduces the exact entry bar (close 1.34872)",
      round(win[-1].close, 5), 1.34872)
setup = detect_setup(win, pip, book=book)
check("detect_setup DOES NOT fire on this bar", setup.active, False)

print("\nTHE 82-DAY-OLD ZONE IT SOLD (13 May, 1.35337-1.35510)")
old = [z for z in book if z.direction == "supply" and abs(z.top - 1.35510) < 1e-4]
check("that zone is still on the book (it was never the zone book's fault)", len(old), 1)
if old:
    z = old[0]
    ok, ext = pullback_4h(win, z.bottom, z.top - z.bottom, z.respected_at, buy=False)
    check("a 174-pip RALLY is not a pullback from it", ok, False)
    check("...and so it yields no stop level", ext, 0.0)
    hi = max(b.high for b in win[-12:])
    check("price never reached within 20 pips of that zone", (z.bottom - hi) / pip > 20, True)

print("\nTHE USER'S OWN ZONE (16 Jul, 1.34928-1.35208) — WICKED, NEVER BODY-TRADED")
his = [z for z in book if z.direction == "supply" and abs(z.top - 1.35208) < 1e-4
       and z.state != "broken"]
check("it is on the book exactly where he drew it", len(his), 1)
if his:
    z = his[0]
    check("the registry recorded it as WICK-mitigated", z.mitigation_kind, "wick")
    note = mitigation_note(z)
    check("the card does NOT claim it is fresh", "Fresh" in note, False)
    check("the card says the body never entered", "WICKED ONLY" in note, True)

print("\nNO CARD MAY SAY 'Fresh — never tapped' ABOUT A RESPECTED ZONE")
resp = [z for z in book if z.state == "respected"]
check(f"there are respected zones to check ({len(resp)})", len(resp) > 0, True)
bad = [z for z in resp if "Fresh" in mitigation_note(z)]
check("none of them render as 'Fresh'", len(bad), 0)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
