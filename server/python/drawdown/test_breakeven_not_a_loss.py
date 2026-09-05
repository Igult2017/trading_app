"""
test_breakeven_not_a_loss.py — run with:
    cd server/python && python drawdown/test_breakeven_not_a_loss.py

HIS RULING, 2026-09-05: "Breakeven is not a loss and it should not be computed as a loss."

A stop moved to breakeven almost always closes a few cents DOWN once commission comes out. So any
code that decides "is this a loss?" from the P&L SIGN counts every scratch as a loss. Two places
did, and they disagreed with the three that did it correctly:

  * intelligence._group_drawdown counted losses off the sign while counting wins and breakevens off
    the LABEL — so a break-even was counted TWICE, once in each bucket. One win + one loss + one
    break-even at -0.40 produced FOUR outcomes from three trades and a 66.7% loss rate.
  * both grouping functions added ANY negative P&L to "loss contribution", so scratches leaked into
    the figure the drawdown page shows next to "N trades - X% loss".

The rule now lives once, in _utils.is_loss: the label decides, and the P&L sign is consulted ONLY
for a trade that carries no label at all (a percentage-only journal has nothing else to read and
would otherwise report zero losses for ever).
"""
import sys
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from drawdown._utils import is_loss, is_win                      # noqa: E402
from drawdown.intelligence import _group_drawdown, _group_metrics  # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ("" if ok else f": got {got!r}, want {want!r}"))
    globals().__setitem__('_pass', _pass + 1) if ok else globals().__setitem__('_fail', _fail + 1)


print("\nBREAK-EVEN IS NOT A LOSS\n")

# ── 1. THE RULE ITSELF ─────────────────────────────────────────────────────
print("1. the one definition, in _utils:")
check("a labelled loss is a loss",            is_loss({"outcome": "LOSS", "profitLoss": "-50"}), True)
check("a BREAK-EVEN that closed DOWN is not", is_loss({"outcome": "BE", "profitLoss": "-0.40"}), False)
check("...nor one that closed up",            is_loss({"outcome": "BE", "profitLoss": "0.30"}), False)
check("a win is not",                         is_loss({"outcome": "WIN", "profitLoss": "100"}), False)
check("a break-even is not a win either",     is_win({"outcome": "BE", "profitLoss": "0.30"}), False)
# THE FALLBACK — it exists for percentage-only journals with no outcome label at all.
check("unlabelled + negative falls back to the sign", is_loss({"profitLoss": "-12"}), True)
check("unlabelled + positive does not",               is_loss({"profitLoss": "12"}), False)

# ── 2. BOTH GROUPING PATHS ─────────────────────────────────────────────────
# _group_metrics is what the panel actually shows; _group_drawdown is the fallback when the
# Metrics parser is unavailable. They MUST agree — they used to not.
print("\n2. the same book through both paths — 37 wins, 9 losses, 4 scratches each 0.40 down:")
recs = ([NS(strategy="VIX", outcome="win", pnl=100.0)] * 37
        + [NS(strategy="VIX", outcome="loss", pnl=-50.0)] * 9
        + [NS(strategy="VIX", outcome="breakeven", pnl=-0.40)] * 4)
live = _group_metrics(recs, "strategy", 10_000.0)[0]

tr = ([{"strategy": "VIX", "outcome": "WIN",  "profitLoss": "100",   "pnlPercent": 1.0}] * 37
      + [{"strategy": "VIX", "outcome": "LOSS", "profitLoss": "-50",  "pnlPercent": -0.5}] * 9
      + [{"strategy": "VIX", "outcome": "BE",   "profitLoss": "-0.40", "pnlPercent": -0.004}] * 4)
fallback = _group_drawdown(tr, lambda t: t["strategy"])[0]

for name, g in (("live", live), ("fallback", fallback)):
    check(f"{name}: 9 losses, not 13",  g["losses"], 9)
    check(f"{name}: 4 break-evens",     g["breakevens"], 4)
    check(f"{name}: loss rate 18%",     g["lossRate"], 18.0)
    check(f"{name}: outcomes sum to the trade count",
          g["wins"] + g["losses"] + g["breakevens"], g["trades"])
    check(f"{name}: scratches are OUT of loss contribution", round(g["totalLossPct"], 2), -4.50)

check("the two paths agree on losses",   live["losses"] == fallback["losses"], True)
check("...and on loss contribution",     round(live["totalLossPct"], 2) == round(fallback["totalLossPct"], 2), True)

# ── 3. TEETH ───────────────────────────────────────────────────────────────
# Prove the check can fail: the OLD sign-only rule must get these wrong.
print("\n  teeth — the rule that was there before must fail these:")
def old_sign_rule(t):
    return (float(t.get("profitLoss", 0)) or 0) < 0
check("  the old rule called a scratch a loss", old_sign_rule({"outcome": "BE", "profitLoss": "-0.40"}), True)
check("  ...where the rule now says it is not", is_loss({"outcome": "BE", "profitLoss": "-0.40"}), False)

print(f"\n  {_pass} passed, {_fail} failed\n")
sys.exit(1 if _fail else 0)
