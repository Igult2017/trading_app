"""
test_pip_value.py — run with:
    cd signal_platform && python tests/test_pip_value.py

WHAT IT GUARDS. `size_lots` priced a pip at $10 for EVERY instrument — a default parameter that
nothing in the platform ever computed. Right for three of the five traded symbols, wrong for two:

    EUR/USD  100,000 x 0.0001          = $10.00   correct
    GBP/USD  100,000 x 0.0001          = $10.00   correct
    XAU/USD      100 x 0.1             = $10.00   correct
    GBP/JPY  100,000 x 0.01   = Y1,000 = ~$6.62   priced as $10 -> a $200 trade risked $132
    USD/JPY  100,000 x 0.01   = Y1,000 = ~$6.62   priced as $10 -> a $200 trade risked $132

He found it from the other end, 2026-11-08: *"the entries dont adjust according to the market ...
sometimes a risk of 200 dollars can only buy 1.2 lots ... But when i use autotrade, it does not adopt
to these."* And the VIX.1 doc had predicted it when GBP/JPY was added on 2026-10-05: *"FOR WHEN
AUTOTRADE RETURNS: sizing IS pip-denominated, so the first real GBP/JPY order wants checking by
hand."*

⚠ THE CHECKS THAT MATTER MOST ARE THE THREE THAT MUST NOT MOVE. EUR/USD, GBP/USD and XAU/USD are
correct today and real money is sized by them, so "nothing changed for those" is tested before
anything else — a fix that quietly re-prices a working instrument would be far worse than the bug.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from execution.pip_value import (ACCOUNT_CCY, needs_rate, pip_value_per_lot,   # noqa: E402
                                 quote_currency)
from execution.sizing import plan_size, size_lots                              # noqa: E402

_pass = _fail = 0
USDJPY = 151.0          # a fixed rate so every number below is checkable by hand


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def close(what, got, want, tol=0.01):
    global _pass, _fail
    ok = got is not None and abs(got - want) <= tol
    print(f"  {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want ~{want}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def teeth(what, held):
    global _pass, _fail
    print(f"  {'PASS' if held else 'FAIL'}  TEETH — {what}: {held}")
    if held:
        _pass += 1
    else:
        _fail += 1


print("\nWHAT ONE PIP OF ONE LOT IS ACTUALLY WORTH\n")

# ── 1. ⚠ THE THREE THAT ARE ALREADY CORRECT MUST NOT MOVE ────────────────────
print("1. the dollar-quoted three are EXACTLY $10 and unchanged:")
for sym in ("EUR/USD", "GBP/USD", "XAU/USD"):
    check(f"{sym} is exactly 10.0", pip_value_per_lot(sym), 10.0)
teeth("...and none of them needs a conversion rate at all",
      not any(needs_rate(s) for s in ("EUR/USD", "GBP/USD", "XAU/USD")))
teeth("...so a dead feed cannot stop them: no rate passed, still priced",
      all(pip_value_per_lot(s, usd_jpy=None) == 10.0
          for s in ("EUR/USD", "GBP/USD", "XAU/USD")))

# ── 2. the two yen pairs, which were wrong ───────────────────────────────────
print("\n2. the yen pairs are priced in yen and converted:")
for sym in ("GBP/JPY", "USD/JPY"):
    close(f"{sym} at USD/JPY {USDJPY} is ~$6.62", pip_value_per_lot(sym, usd_jpy=USDJPY), 6.6225)
    check(f"...and {sym} is flagged as needing a rate", needs_rate(sym), True)
close("Y1,000 a lot is the quote-currency value", 100_000 * 0.01, 1000.0)
close("...which is 1000/151 in dollars", 1000.0 / USDJPY, 6.6225)

# ── 3. ⚠ NO RATE MEANS REFUSE, NEVER THE OLD $10 DEFAULT ─────────────────────
print("\n3. without a rate it refuses rather than guessing:")
for sym in ("GBP/JPY", "USD/JPY"):
    teeth(f"{sym} with no rate returns None", pip_value_per_lot(sym) is None)
    teeth(f"{sym} with a zero rate returns None", pip_value_per_lot(sym, usd_jpy=0.0) is None)
    teeth(f"{sym} never silently falls back to 10.0",
          pip_value_per_lot(sym) != 10.0)
teeth("an unknown instrument returns None", pip_value_per_lot("WTF/XYZ") is None)
teeth("an index we have no contract size for returns None", pip_value_per_lot("US30") is None)
teeth("an empty symbol returns None", pip_value_per_lot("") is None)

print("\n4. the quote currency is read off the pair, not assumed:")
check("EURUSD quotes in USD", quote_currency("EUR/USD"), "USD")
check("GBPJPY quotes in JPY", quote_currency("gbp_jpy"), "JPY")
check("XAUUSD quotes in USD", quote_currency("XAUUSD"), "USD")
check("an index has no readable quote currency", quote_currency("US30"), None)
check("the account currency is the USD this was verified against", ACCOUNT_CCY, "USD")

# ── 5. END TO END: the risk a trade actually takes ───────────────────────────
# This is the number he cares about. At 2% of a $10,000 starting balance the intended risk is $200.
print("\n5. end to end — what $200 of intended risk really costs:")
EQUITY, PCT = 10_000.0, 2.0


def real_risk(symbol, entry, stop, usd_jpy=None):
    """Lots the platform would send, and what a stop-out would REALLY cost at the true pip value."""
    lots, _vol, pips = plan_size(equity=EQUITY, entry=entry, stop=stop, symbol=symbol,
                                 risk_pct=PCT, usd_jpy=usd_jpy)
    pv = pip_value_per_lot(symbol, usd_jpy=usd_jpy)
    return lots, pips, (None if pv is None else lots * pips * pv)


lots, pips, risk = real_risk("GBP/USD", 1.30000, 1.30100)      # a 10-pip stop
close("GBP/USD, 10-pip stop -> 2.00 lots", lots, 2.00)
close("...and really costs the $200 asked for", risk, 200.0, tol=0.5)

lots, pips, risk = real_risk("GBP/JPY", 190.000, 190.100, usd_jpy=USDJPY)   # a 10-pip stop
close("GBP/JPY, 10-pip stop -> 3.02 lots (was 2.00)", lots, 3.02, tol=0.02)
close("...and really costs ~$200 (it used to cost $132)", risk, 200.0, tol=2.0)
# The defect, stated as arithmetic: the OLD behaviour, reproduced by forcing the $10 assumption.
old_lots = size_lots(EQUITY, PCT, 10.0, pip_value_per_lot=10.0)
close("the OLD code sized GBP/JPY at 2.00 lots", old_lots, 2.00)
close("...which really risked $132, not $200", old_lots * 10.0 * (1000.0 / USDJPY), 132.45, tol=0.5)

print("\n6. an unpriceable pip sizes NOTHING — it must never place a guessed size:")
lots, _vol, _pips = plan_size(equity=EQUITY, entry=190.000, stop=190.100, symbol="GBP/JPY",
                              risk_pct=PCT, usd_jpy=None)
teeth("GBP/JPY with no rate -> 0 lots (the caller's SKIP)", lots == 0.0)
# `fixed_lots` is the diagnostic mode and deliberately skips the risk maths, so it still sizes.
lots, _vol, _pips = plan_size(equity=EQUITY, entry=190.000, stop=190.100, symbol="GBP/JPY",
                              risk_pct=PCT, fixed_lots=0.05, usd_jpy=None)
check("...but the fixed-lot diagnostic mode is untouched", lots, 0.05)

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
