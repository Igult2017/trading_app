"""
test_recovery_sample.py — run with:
    cd server/python && python drawdown/test_recovery_sample.py

THE DEFECT THIS PINS, FROM HIS OWN SCREEN (2026-11-03). The Drawdown page's Recovery Pattern card
read "1.61x baseline risk" under a red "Behavioural Risk Detected" heading and, in its own last
line, "across 1 underwater trade".

The ratio was real. The conclusion was not: with one underwater trade the figure is just that single
trade's size divided by the average of the others, so ANY trade more than 15% larger produced a
confident statement about his psychology. `compute_recovery` needed only one underwater trade and
one baseline trade to return a verdict.

WHAT IS GUARDED HERE:
  * below `MIN_UNDERWATER` the verdict is "insufficient" — no behavioural claim is made;
  * at or above it the three real verdicts work exactly as before;
  * the RATIO is unchanged either way, because the number is genuine information and is still shown.
    Withholding the verdict must not quietly change the arithmetic.

The sibling module `montecarlo.py` already refuses to project below five trades; this one was the
odd one out, not the pioneer.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from drawdown.recovery import compute_recovery, MIN_UNDERWATER   # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def teeth(what, broke_it_and_failed):
    global _pass, _fail
    print(f"  {'PASS' if broke_it_and_failed else 'FAIL'}  TEETH — {what}")
    if broke_it_and_failed:
        _pass += 1
    else:
        _fail += 1


SB = 10_000.0


def trade(day: int, pnl: float, lot: float) -> dict:
    """One journal entry, with only the fields this module reads."""
    return {"tradeDate": f"2026-10-{day:02d}", "profitLoss": str(pnl), "lotSize": str(lot)}


def book(n_underwater: int, uw_lot: float = 1.61, base_lot: float = 1.0) -> list:
    """A book whose shape is known: two trades at the peak, then `n_underwater` below it.

    Trade 1 wins, so it is entered AT the peak -> baseline, and lifts the peak to 10,500.
    Trade 2 is entered at that new peak -> also baseline, and loses enough to go underwater.
    Every trade after it is entered below 10,500, so each one is UNDERWATER. Their losses are tiny
    so the balance never climbs back to the peak and the classification cannot drift.
    """
    rows = [trade(1, +500.0, base_lot),      # entered at 10,000 = peak  -> baseline
            trade(2, -1000.0, base_lot)]     # entered at 10,500 = peak  -> baseline, ends at 9,500
    for i in range(n_underwater):
        rows.append(trade(3 + i, -1.0, uw_lot))   # entered below the peak -> underwater
    return rows


print("\nRECOVERY PATTERN — a verdict needs a sample, not one trade\n")

print(f"the floor is MIN_UNDERWATER = {MIN_UNDERWATER}")
check("and it is more than one", MIN_UNDERWATER > 1, True)

# ── 1. THE BOOK IS SHAPED THE WAY THIS TEST CLAIMS ─────────────────────────
# If the classification ever changes, every assertion below would silently test nothing.
print("\n1. the fixture really does produce the counts it says:")
for n in (1, 4):
    r = compute_recovery(book(n), SB)
    check(f"{n} underwater trade(s) counted", r["underwaterCount"], n)
    check(f"...and 2 baseline trades",        r["baselineCount"], 2)

# ── 2. BELOW THE FLOOR — NO BEHAVIOURAL CLAIM ──────────────────────────────
print("\n2. below the floor, the card is told it cannot judge:")
for n in range(1, MIN_UNDERWATER):
    r = compute_recovery(book(n), SB)
    check(f"{n} underwater trade(s) -> insufficient", r["verdict"], "insufficient")

# HIS EXACT CASE: one underwater trade at 1.61x. This is the screen that started it.
one = compute_recovery(book(1, uw_lot=1.61), SB)
teeth("his 1.61x on ONE trade is no longer called a behavioural risk",
      one["verdict"] != "increase")
check("...and the ratio is still reported", one["sizeRatio"], 1.61)
check("...with the floor sent to the card", one["minSample"], MIN_UNDERWATER)

# ── 3. AT AND ABOVE THE FLOOR — THE REAL VERDICTS STILL WORK ───────────────
print("\n3. at the floor the three real verdicts are unchanged:")
check("4 bigger trades -> increase",
      compute_recovery(book(MIN_UNDERWATER, uw_lot=1.61), SB)["verdict"], "increase")
check("4 smaller trades -> reduce",
      compute_recovery(book(MIN_UNDERWATER, uw_lot=0.5), SB)["verdict"], "reduce")
check("4 same-size trades -> steady",
      compute_recovery(book(MIN_UNDERWATER, uw_lot=1.0), SB)["verdict"], "steady")

# ── 4. THE GUARD CHANGES THE VERDICT ONLY, NEVER THE ARITHMETIC ────────────
print("\n4. withholding the verdict does not touch the number:")
thin = compute_recovery(book(1, uw_lot=1.61), SB)
full = compute_recovery(book(MIN_UNDERWATER, uw_lot=1.61), SB)
check("same ratio either side of the floor", thin["sizeRatio"], full["sizeRatio"])
teeth("and the verdicts genuinely differ", thin["verdict"] != full["verdict"])

# ── 5. NOTHING TO MEASURE AT ALL IS STILL ITS OWN STATE ────────────────────
print("\n5. an empty or one-sided book still reports no data:")
check("no trades", compute_recovery([], SB)["hasData"], False)
# Only baseline trades — nothing was ever entered underwater, so there is no comparison to make.
check("no underwater trades at all",
      compute_recovery([trade(1, +500.0, 1.0), trade(2, +100.0, 1.0)], SB)["hasData"], False)

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
