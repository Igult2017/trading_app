"""The journal sidebar's monthly figures — one engine, and the carry-over rules hold.

    python server/python/test_monthly_parity.py

WHY THIS FILE EXISTS. Until 2026-08-29 the journal sidebar fetched the raw journal entries and
recomputed every figure in the browser: monthly grouping, net P&L, fees, buys/sells, best and worst
trade, win rate, profit factor, average RR, expectancy — and a prop-firm balance carry-over that
existed ONLY in that component. His instruction:

    "there is no need of it recalculating what already exists, let it take data directly and in real
     time from metrics page and trade vault if necessary to make everything consistent"

The duplication was worse than untidy. Because the carry-over lived nowhere else, the sidebar was
using a different model of the account balance from every other page, so it could disagree with all
of them and nothing could test it. `metrics_calculator.calc_monthly` now owns it.

WHAT IS PINNED HERE. Before the switch, 228 values (19 fields x 12 months) were compared field by
field against the old browser code and every one matched. That comparison cannot live in this file —
the browser code is deleted, which is the point. What CAN be pinned is the behaviour that comparison
established, so a later edit cannot quietly change it:

  * the carry-over rules themselves, on hand-worked numbers
  * the month totals against the same trades summed independently
  * that months come back in chronological order, since each depends on the one before it

NOT A BACKTEST: nothing here scores a strategy. It checks one engine's arithmetic.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_passed, _failed = 0, []


def check(label, got, want):
    global _passed
    if got == want:
        _passed += 1
        print(f"   PASS  {label}: got {got}")
    else:
        _failed.append(label)
        print(f"   FAIL  {label}: got {got!r}, want {want!r}")


def teeth(label, condition):
    check(f"TEETH — {label}", bool(condition), True)


def run(trades, starting_balance=5000):
    """Through the REAL entry point the Node service uses — stdin JSON, stdout JSON.

    Returns {} when the engine omits the group entirely, which it does for an empty trade list: it
    short-circuits before any calculator runs. That is pre-existing behaviour for EVERY metric group,
    not something the monthly one introduced, and the sidebar reads the value through optional access
    so it shows its empty state rather than breaking.
    """
    p = subprocess.run([sys.executable, os.path.join(HERE, "metrics_calculator.py")],
                       input=json.dumps({"trades": trades, "startingBalance": starting_balance}),
                       capture_output=True, text=True)
    if not p.stdout.strip():
        raise SystemExit("metrics_calculator produced no output:\n" + p.stderr[-800:])
    return json.loads(p.stdout)["metrics"].get("monthly", {})


def T(i, month, pnl, direction="long", outcome=None, commission=0.0, rr=2.0, day=None):
    if outcome is None:
        outcome = "win" if pnl > 0 else ("loss" if pnl < 0 else "breakeven")
    d = day if day is not None else (i % 28) + 1
    return {"id": str(i), "sessionId": "s1", "instrument": "EURUSD", "direction": direction,
            "outcome": outcome, "profitLoss": str(pnl), "riskReward": str(rr),
            "manualFields": {"commission": commission},
            "tradeDate": f"2021-{month:02d}-{d:02d}T09:00:00Z", "startingBalance": 5000}


# ── 1. THE CARRY-OVER, ON NUMBERS WORKED BY HAND ─────────────────────────────────────────────────
# A winning month pays out and resets; a losing month carries its shortfall into the next.
print()
print("THE PROP-FIRM CARRY-OVER")
m = run([
    T(1, 1, 300, commission=5.0), T(2, 1, -100, "short", commission=5.0),   # Jan: +200 gross, -10 fees -> +190
    T(3, 2, -400, commission=5.0), T(4, 2, -150, "short", commission=5.0),  # Feb: -550 gross, -10 fees -> -560
    T(5, 3, 200, commission=5.0),                                           # Mar: +200 gross,  -5 fees -> +195
], starting_balance=5000)
jan, feb, mar = m["months"]["2021-01"], m["months"]["2021-02"], m["months"]["2021-03"]

check("January opens at the starting balance", jan["startBalance"], 5000.0)
check("...ends above it", jan["endBalance"], 5190.0)
check("...so the excess is withdrawn", jan["withdrawn"], 190.0)
check("...and nothing is carried", jan["carriedDeficit"], 0.0)

check("February therefore opens at the starting balance again", feb["startBalance"], 5000.0)
check("...ends below it", feb["endBalance"], 4440.0)
check("...so nothing is withdrawn", feb["withdrawn"], 0.0)
check("...and the shortfall is carried", feb["carriedDeficit"], 560.0)

check("March opens LOWER, by exactly that shortfall", mar["startBalance"], 4440.0)
check("...and knows what it inherited", mar["carriedDeficitIn"], 560.0)
check("...a profit that does not clear the hole carries the rest", mar["carriedDeficit"], 365.0)
teeth("a losing month really does lower the next month's opening balance",
      mar["startBalance"] < jan["startBalance"])

# ── 2. FEES COME OUT OF THE NET ──────────────────────────────────────────────────────────────────
# The engine never carried commission until this change, which is why the sidebar had to work fees
# out in the browser. If it is ever dropped from the trade record again, this fails.
print()
print("FEES ARE CARRIED, AND SUBTRACTED")
f = run([T(1, 5, 100, commission=25.0), T(2, 5, 100, commission=25.0)])
check("both commissions are counted", f["months"]["2021-05"]["commissions"], 50.0)
check("...and taken off the net", f["months"]["2021-05"]["netPnL"], 150.0)
teeth("fees really move the number — without them this would read 200",
      f["months"]["2021-05"]["netPnL"] != 200.0)

# ── 3. THE MONTH TOTALS ──────────────────────────────────────────────────────────────────────────
print()
print("THE PER-MONTH FIGURES")
g = run([T(1, 7, 500, "long"), T(2, 7, -200, "short"), T(3, 7, 0, "long", "breakeven"),
         T(4, 7, 150, "short")])
jul = g["months"]["2021-07"]
check("trade count", jul["total"], 4)
check("buys",  jul["buys"], 2)
check("sells", jul["sells"], 2)
check("wins",  jul["wins"], 2)
check("losses", jul["losses"], 1)
check("best trade",  jul["bestTrade"], 500.0)
check("worst trade", jul["worstTrade"], -200.0)
check("net", jul["netPnL"], 450.0)
teeth("a break-even trade counts in the total but is neither a win nor a loss",
      jul["total"] == 4 and jul["wins"] + jul["losses"] == 3)

# ── 4. ORDER MATTERS, SO IT MUST BE GUARANTEED ───────────────────────────────────────────────────
# Each month's opening balance depends on the month before it, so an unordered walk would produce
# different balances from the same trades.
print()
print("MONTHS COME BACK IN ORDER, AND THE ANSWER DOES NOT DEPEND ON INPUT ORDER")
rows = [T(1, 3, -300), T(2, 1, 400), T(3, 2, -100), T(4, 12, 250), T(5, 6, -50)]
a = run(rows)
b = run(list(reversed(rows)))
check("keys are chronological", a["keys"], sorted(a["keys"]))
check("shuffling the input changes nothing", a["months"], b["months"])
teeth("the fixture really was reordered", [r["id"] for r in rows] != [r["id"] for r in reversed(rows)])

# ── 5. NOTHING TO REPORT ON IS NOT AN ERROR ──────────────────────────────────────────────────────
print()
print("EMPTY AND ODD INPUTS")
e = run([])
check("no trades gives no months", e.get("months", {}), {})
n = run([{"id": "x", "sessionId": "s1", "profitLoss": "100", "outcome": "win",
          "direction": "long", "startingBalance": 5000}])          # no date at all
check("a trade with no date is skipped rather than crashing", n.get("months", {}), {})

print()
if _failed:
    print(f"{len(_failed)} of {_passed + len(_failed)} FAILED: {_failed}")
    sys.exit(1)
print(f"ALL PASS ({_passed} checks)")
