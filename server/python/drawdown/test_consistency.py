"""Drawdown page — the numbers must agree with each other, and must not depend on arrival order.

    python server/python/drawdown/test_consistency.py

WHY THIS FILE EXISTS. On 2026-08-29 the same "maximum drawdown" was being shown twice on this page
with two different values — the headline said -31.43% while the Edge & Risk card said -54.64%, and
risk-of-ruin was wrong in both directions (41.8% where it should read 17.9%). Two causes, both in
`montecarlo.py`:

  1. IT READ THE TRADES BACKWARDS. The database returns entries newest-first
     (`storage.getJournalEntries`, `orderBy(desc(createdAt))`). Every other order-sensitive module
     called `sort_by_date`; this one never did. A drawdown is a property of the SEQUENCE, so it was
     measuring an account history that never happened.

  2. IT COMPOUNDED PERCENTAGES THAT WERE DELIBERATELY MADE NON-COMPOUNDING. `core._annotate_pnl_pct`
     measures each trade against the STARTING balance on purpose. `montecarlo` applied those figures
     multiplicatively to a running balance, mixing two models.

THE ROOT CAUSE WAS NEITHER OF THOSE. It was that "walk a trade list into a running balance" had been
written out FIVE times — in metrics, intelligence, recovery, distribution and montecarlo — with
nothing forcing the copies to agree. They had drifted into three different behaviours. There is now
ONE definition (`_utils.equity_curve`), and these tests exist so a sixth copy cannot quietly appear.

NOT A BACKTEST: nothing here scores a win, a loss or an R. It checks that two numbers on one page
agree, and that the page gives the same answer when handed the same trades in a different order.
"""
import datetime
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from drawdown.core import compute_drawdown                              # noqa: E402
from drawdown._utils import equity_curve, max_drawdown_pct              # noqa: E402

_passed, _failed = 0, []


def check(label, got, want):
    global _passed
    ok = got == want
    if ok:
        _passed += 1
        print(f"   PASS  {label}: got {got}")
    else:
        _failed.append(label)
        print(f"   FAIL  {label}: got {got!r}, want {want!r}")


def teeth(label, condition):
    """A check that must FAIL when the fix is removed — otherwise it is decoration."""
    check(f"TEETH — {label}", bool(condition), True)


def trades(n, sb, risk_pct, win_rate, payoff, seed, shuffle=False):
    """A plausible journal. Cash results only — exactly what the app stores."""
    rng = random.Random(seed)
    t0 = datetime.datetime(2026, 1, 1, 9, 0)
    out = []
    for i in range(n):
        win = rng.random() < win_rate
        pl = sb * risk_pct / 100 * payoff if win else -sb * risk_pct / 100
        out.append({
            "id": str(i),
            "exitTime":  (t0 + datetime.timedelta(hours=6 * i)).isoformat(),
            "entryTime": (t0 + datetime.timedelta(hours=6 * i - 2)).isoformat(),
            "pnl": round(pl, 2),
            "outcome": "win" if win else "loss",
            "instrument": rng.choice(["EURUSD", "GBPUSD", "XAUUSD"]),
            "direction": rng.choice(["long", "short"]),
            "positionSize": round(rng.uniform(0.5, 2.0), 2),
        })
    if shuffle:
        random.Random(seed + 500).shuffle(out)
    return out


SETS = [
    ("100 trades, 1% risk, 45% win, 2R", 100, 10_000, 1.0, 0.45, 2.0, 1),
    ("300 trades, 1% risk, 45% win, 2R", 300, 10_000, 1.0, 0.45, 2.0, 2),
    ("200 trades, 2% risk, 40% win, 2R", 200, 10_000, 2.0, 0.40, 2.0, 3),
    ("200 trades, 5% risk, 40% win, 2R", 200, 10_000, 5.0, 0.40, 2.0, 4),
    ("150 trades, 3% risk, 35% win, 3R", 150, 10_000, 3.0, 0.35, 3.0, 5),
]

# ── 1. THE PAGE MUST NOT CONTRADICT ITSELF ───────────────────────────────────────────────────────
# The headline "Max Drawdown" and the Edge & Risk card's "actual max drawdown" are the same
# quantity. They are computed in different modules, which is exactly how they came apart.
print()
print("THE TWO MAXIMUM-DRAWDOWN FIGURES ON THE PAGE MUST AGREE")
_agree = True
for label, n, sb, risk, wr, po, seed in SETS:
    r = compute_drawdown(trades(n, sb, risk, wr, po, seed), sb)
    head = r["topStats"]["maxDrawdown"]
    card = r["monteCarlo"]["actualMaxDd"]
    same = abs(head - card) < 0.011
    _agree = _agree and same
    check(f"{label}: headline {head}% == Edge card {card}%", same, True)
teeth("the two are computed in different modules and must still land on the same number", _agree)

# ── 2. THE SAME TRADES IN A DIFFERENT ORDER MUST GIVE THE SAME ANSWER ────────────────────────────
# This is the one that catches a missing sort ANYWHERE on the page, including in a module nobody has
# written yet. The database really does deliver these newest-first, so this is not a hypothetical.
print()
print("THE ANSWER MUST NOT DEPEND ON THE ORDER THE TRADES ARRIVE IN")
for label, n, sb, risk, wr, po, seed in SETS:
    a = compute_drawdown(trades(n, sb, risk, wr, po, seed, shuffle=False), sb)
    b = compute_drawdown(trades(n, sb, risk, wr, po, seed, shuffle=True), sb)
    differing = sorted(s for s in a if a[s] != b.get(s))
    check(f"{label}: identical whichever order they arrive in", differing, [])

# ── 3. THE EQUITY CURVE IS SORTED AT SOURCE ──────────────────────────────────────────────────────
# Sorting lives INSIDE `equity_curve` so a caller cannot forget it. If that is ever moved back out to
# the callers, this fails.
print()
print("THE SHARED EQUITY CURVE SORTS FOR ITS CALLERS")
_t = trades(60, 10_000, 2.0, 0.45, 2.0, 9)
_shuf = list(_t)
random.Random(3).shuffle(_shuf)
_, curve_ordered = equity_curve(_t, 10_000)
_, curve_shuffled = equity_curve(_shuf, 10_000)
check("the curve is the same whichever order it is handed", curve_ordered, curve_shuffled)
check("...and the drawdown read off it likewise",
      round(max_drawdown_pct(curve_ordered, 10_000), 6),
      round(max_drawdown_pct(curve_shuffled, 10_000), 6))
teeth("an unsorted walk really would differ — the fixture is genuinely out of order",
      [t["id"] for t in _t] != [t["id"] for t in _shuf])

# ── 4. NO MODULE MAY REBUILD THE EQUITY CURVE ────────────────────────────────────────────────────
# The root cause was five private copies. `distribution.py` is the one deliberate exception: it
# re-bases each month and measures against the starting balance for comparability across months,
# which is a different quantity — see the comment there.
print()
print("NOBODY REBUILDS THE EQUITY CURVE PRIVATELY")
_here = os.path.dirname(os.path.abspath(__file__))
_allowed = {"_utils.py", "distribution.py", "test_consistency.py"}
_offenders = []
for fn in sorted(os.listdir(_here)):
    if not fn.endswith(".py") or fn in _allowed:
        continue
    body = open(os.path.join(_here, fn), encoding="utf-8").read()
    for marker in ("bal += pl", "balance += pl", "bal *= (1 +", "balance = balance * (1 +",
                   "eq *= (1 +", "bal = bal * (1 +"):
        if marker in body:
            _offenders.append(f"{fn} ({marker})")
check("no module walks its own running balance", _offenders, [])
teeth("the check can actually see the pattern it forbids",
      "bal += pl" in open(os.path.join(_here, "_utils.py"), encoding="utf-8").read())

print()
if _failed:
    print(f"{len(_failed)} of {_passed + len(_failed)} FAILED: {_failed}")
    sys.exit(1)
print(f"ALL PASS ({_passed} checks)")
