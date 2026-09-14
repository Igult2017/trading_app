"""
test_loss_share.py — run with:
    cd server/python && python drawdown/test_loss_share.py

The two pie charts on the Drawdown page (his request, 2026-09-14): each pair's and each session's share
of the total loss. A pie that does not add up to the whole is wrong in EVERY slice, so most of these
checks are about the whole: nothing capped, nothing untagged dropped, break-evens kept out.
"""
import sys
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from drawdown._utils import get_instrument, get_session              # noqa: E402
from drawdown.intelligence import _group_drawdown, _group_metrics      # noqa: E402
from drawdown.loss_share import _shares, compute_loss_share           # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def slices(rows):
    return [(r["name"], r["share"]) for r in rows]


SB = 10_000.0
print("\nLOSS SHARE — THE TWO PIES\n")

# ── 1. A SMALL BOOK ────────────────────────────────────────────────────────
# EURUSD loses 100 twice, GBPUSD and USDJPY once each. A win counts for nothing. A break-even that
# closed 0.40 down sits in Tokyo and must not move Tokyo's figure. USDJPY's loss has no session tag.
print("1. who lost what — by pair and by session:")
book = [
    NS(instrument="EURUSD", session="London", outcome="loss",      pnl=-100.0),
    NS(instrument="EURUSD", session="London", outcome="loss",      pnl=-100.0),
    NS(instrument="EURUSD", session="London", outcome="win",       pnl=300.0),
    NS(instrument="GBPUSD", session="Tokyo",  outcome="loss",      pnl=-100.0),
    NS(instrument="USDJPY", session="",       outcome="loss",      pnl=-100.0),
    NS(instrument="USDJPY", session="Tokyo",  outcome="breakeven", pnl=-0.40),
]
pairs = _shares(_group_metrics(book, "instrument", SB, limit=None, empty_label="Unknown"))
check("EURUSD lost twice what each other pair did -> half the pie",
      slices(pairs), [("EURUSD", 50.0), ("GBPUSD", 25.0), ("USDJPY", 25.0)])
check("EURUSD's actual loss is 2% of the starting balance", pairs[0]["lossPct"], -2.0)
check("...from 2 losing trades", pairs[0]["losses"], 2)
check("the pair shares add up to the whole", round(sum(r["share"] for r in pairs), 1), 100.0)

sess = _shares(_group_metrics(book, "session", SB, limit=None, empty_label="Unknown"))
check("sessions: London half, Tokyo a quarter, the untagged loss a quarter",
      slices(sess), [("London", 50.0), ("Tokyo", 25.0), ("Unknown", 25.0)])
check("the break-even 0.40 down is NOT in Tokyo's loss", sess[1]["lossPct"], -1.0)
check("the session shares add up to the whole", round(sum(r["share"] for r in sess), 1), 100.0)

# ── 2. NOTHING CAPPED ──────────────────────────────────────────────────────
print("\n2. ten losing pairs:")
ten = [NS(instrument=f"P{i:02d}", session="London", outcome="loss", pnl=-100.0) for i in range(10)]
wide = _shares(_group_metrics(ten, "instrument", SB, limit=None, empty_label="Unknown"))
check("10 losing pairs -> 10 slices", len(wide), 10)
check("...each exactly a tenth", {r["share"] for r in wide}, {10.0})
# Teeth: the list the page already had stops at 8. A pie drawn from it would be wrong everywhere.
capped = _shares(_group_metrics(ten, "instrument", SB))
check("  teeth: the page's capped list gives only 8 slices", len(capped), 8)
check("  ...and would call each 12.5% instead of 10%", capped[0]["share"], 12.5)

# ── 3. NOTHING LOST ────────────────────────────────────────────────────────
print("\n3. a book with no losses:")
wins_only = [NS(instrument="EURUSD", session="London", outcome="win", pnl=100.0)]
check("no losing trades -> no slices",
      _shares(_group_metrics(wins_only, "instrument", SB, limit=None, empty_label="Unknown")), [])
check("an empty journal -> two empty pies", compute_loss_share([], SB), {"byPair": [], "bySession": []})

# ── 4. THE SAME BOOK AS REAL JOURNAL ROWS, THROUGH BOTH READING PATHS ──────
print("\n4. the same book as journal rows:")
raw = [
    {"instrument": "EURUSD", "session": "London", "outcome": "LOSS", "profitLoss": "-100",  "pnlPercent": -1.0},
    {"instrument": "EURUSD", "session": "London", "outcome": "LOSS", "profitLoss": "-100",  "pnlPercent": -1.0},
    {"instrument": "EURUSD", "session": "London", "outcome": "WIN",  "profitLoss": "300",   "pnlPercent": 3.0},
    {"instrument": "GBPUSD", "session": "Tokyo",  "outcome": "LOSS", "profitLoss": "-100",  "pnlPercent": -1.0},
    {"instrument": "USDJPY",                      "outcome": "LOSS", "profitLoss": "-100",  "pnlPercent": -1.0},
    {"instrument": "USDJPY", "session": "Tokyo",  "outcome": "BE",   "profitLoss": "-0.40", "pnlPercent": -0.004},
]
for i, t in enumerate(raw):
    t["id"] = f"t{i}"
check("fallback path: the same pair slices",
      slices(_shares(_group_drawdown(raw, get_instrument, limit=None))), slices(pairs))
check("fallback path: the same session slices",
      slices(_shares(_group_drawdown(raw, get_session, limit=None))), slices(sess))
live = compute_loss_share(raw, SB)
check("the real entry point: pair slices", slices(live["byPair"]), slices(pairs))
check("the real entry point: session slices", slices(live["bySession"]), slices(sess))

print(f"\n  {_pass} passed, {_fail} failed\n")
sys.exit(1 if _fail else 0)
