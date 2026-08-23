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
from strategies.bx_sd_setup import detect_setup
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
# ⚠ THIS ASSERTION IS RED AS OF 2026-08-23, AND IS DELIBERATELY NOT BEING BENT TO PASS.
#
# WHAT CHANGED. `choch_verdict` had a fourth test that called a change of character fake when the
# zone price reacted from was not the FURTHEST-OUT one in its group at the time. It was deleted
# because it ran his definition backwards (decisional is the verdict, not the evidence) and because
# it refused 15 of 19 hand-counted changes of character. On THIS bar it was the only thing refusing.
#
# WHAT FIRES NOW IS A DIFFERENT ZONE, and the original defect is NOT recurring:
#   * the bad 2026-08-03 card sold the 82-day-old 13 May zone 1.35337-1.35510, which price's high
#     (1.35060) never came within 27.7 pips of
#   * what fires now is HIS OWN 16 Jul zone 1.34928-1.35208, and price IS inside it on this bar
#     (high 1.35060). Entry 1.34928 / stop 1.35208, both read off the zone's own edges — not from
#     `pb_extreme + 15 pips`, which no longer exists
#
# WHAT IT DOES EXPOSE, and this is the real question for him. The zone it reacted from
# (1.35337-1.35510) had THREE UNTOUCHED supply zones above it at that moment — 1.35792-1.35954,
# 1.35921-1.36105 and 1.36070-1.36449. That is the shape of his own `Fake CHOCH` diagram: price
# still has somewhere to go. The deleted test was, by accident, the ONLY thing in BX standing in for
# "is there still untouched supply beyond". Nothing else checks it — `bx_sd_control.control` computes
# who is in control from exactly this but its own note says it is "REPORTED, never used to reject".
#
# PENDING HIS RULING: either an "untouched zone still beyond" gate goes in and this returns to green
# on its own, or this assertion is narrowed to the zone it was written about. Do NOT do the second
# without him saying so — the whole point of this file is that it is the receipt for a real signal
# that cost him.
setup = detect_setup(win, pip, book=book)
check("detect_setup DOES NOT fire on this bar", setup.active, False)

print("\nTHE 82-DAY-OLD ZONE IT SOLD (13 May, 1.35337-1.35510)")
old = [z for z in book if z.direction == "supply" and abs(z.top - 1.35510) < 1e-4]
check("that zone is still on the book (it was never the zone book's fault)", len(old), 1)
if old:
    z = old[0]
    # THE PULLBACK ASSERTIONS ARE GONE BECAUSE THE PULLBACK IS GONE (2026-08-15). This used to check
    # that `pullback_4h` did not call a 174-pip rally a pullback. The document's entry model deleted
    # `pullback_4h`, `pb_extreme` and the stop that hung off them, so that whole class of defect —
    # a stop anchored to a "pullback" that was really a four-day rally — cannot recur by
    # construction. What still matters is the OUTCOME, asserted above and below: this bar produces
    # no setup, and the stop can now only come from the zone's own distal.
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
