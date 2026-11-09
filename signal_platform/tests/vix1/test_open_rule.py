"""test_open_rule.py — run with:
    cd signal_platform && python tests/vix1/test_open_rule.py

HIS RULE, 2026-11-09: *"The candle open of a momentum candle can start from the upper half of the
previous candle but not past the upper half. If it goes beyond the upper half to the lower half it
is disqualified. So it can start from the upper half going up to the body close of that candle
including leaving a gap between candles and starting after the gap"*

⚠ THE MOST IMPORTANT CHECK IN THIS FILE IS THE LAST ONE: that the rule GATES NOTHING. He was
explicit — *"first i need you to test it and when reporting momentum candles in the DM also report
it there until i approve that it is working then we will integrate it"* — and on the measurement it
would refuse 51.6% of everything the platform currently calls a momentum candle. If it ever silently
became a gate, half the strategy's candles would vanish and the log would look normal.

THE CANDLES BELOW ARE REAL GBP/USD H1 BARS, copied from the saved cTrader history, not invented:
his circled 15 July 2026 move and the two turn-backs in the same window. A hand-made fixture would
only ever confirm my own arithmetic.
"""
import sys
from pathlib import Path

# The suite's own harness, and it has to come first: it puts the platform on the path, sets a
# DATABASE_URL so the imports below do not fail on a missing setting, and stubs the observability
# write so an unreachable database cannot drown a real FAIL in SQLAlchemy noise.
from _harness import Suite  # noqa: F401

from core.types import Candle                                   # noqa: E402
from strategies import vix1_open_rule as rule                   # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want {want!r}"))
    _pass, _fail = (_pass + 1, _fail) if ok else (_pass, _fail + 1)


def teeth(what, held):
    global _pass, _fail
    print(f"   {'PASS' if held else 'FAIL'}  TEETH — {what}")
    _pass, _fail = (_pass + 1, _fail) if held else (_pass, _fail + 1)


def bar(t, o, h, l, c):
    return Candle(time=t, open=o, high=h, low=l, close=c, volume=1.0, timeframe="H1")


# ── his circled move, 15 July 2026 — real bars ────────────────────────────────────────────────
MOVE = [
    bar(1784113200, 1.33989, 1.34142, 1.33951, 1.34093),   # 11:00
    bar(1784116800, 1.34093, 1.34294, 1.34020, 1.34276),   # 12:00  momentum
    bar(1784120400, 1.34277, 1.34488, 1.34216, 1.34402),   # 13:00
    bar(1784124000, 1.34409, 1.34817, 1.34370, 1.34776),   # 14:00  momentum, 36.7 pips
    bar(1784127600, 1.34777, 1.34972, 1.34711, 1.34950),   # 15:00
    bar(1784131200, 1.34950, 1.35278, 1.34932, 1.35253),   # 16:00  momentum
    bar(1784134800, 1.35254, 1.35484, 1.35251, 1.35470),   # 17:00
]

# ── the two turn-backs in the same window — real bars ─────────────────────────────────────────
TURN_A = [bar(1784044800, 1.33820, 1.33918, 1.33751, 1.33887),
          bar(1784048400, 1.33885, 1.33907, 1.33678, 1.33763)]    # 14 Jul 17:00
TURN_B = [bar(1784095200, 1.34096, 1.34196, 1.34096, 1.34144),
          bar(1784098800, 1.34141, 1.34195, 1.34006, 1.34017)]    # 15 Jul 07:00

print("\nVIX.1 OPEN-POSITION RULE — his 2026-11-09 rule, watched on the DM, gating nothing\n")

print("1. his circled 15 July move — every candle must be APPROVED:")
for i in range(1, len(MOVE)):
    ok, pos = rule.verdict(MOVE, i, True)
    check(f"bar {i} opened {pos:.0%} along the previous body", ok, True)
teeth("...and every one of them opened at the far edge or beyond, never short of halfway",
      all(rule.verdict(MOVE, i, True)[1] >= 0.5 for i in range(1, len(MOVE))))

print("\n2. the two turn-backs in the same window must be DISQUALIFIED:")
for name, bars in (("14 Jul 17:00 SELL", TURN_A), ("15 Jul 07:00 SELL", TURN_B)):
    ok, pos = rule.verdict(bars, 1, False)
    check(f"{name} opened {pos:.0%} along the previous body", ok, False)

print("\n3. the boundary is HALF, and the far side of it is what fails:")
up = [bar(0, 1.3000, 1.3025, 1.2995, 1.3020), bar(1, 1.3010, 1.3060, 1.3008, 1.3055)]
check("an open exactly at the midpoint is allowed", rule.verdict(up, 1, True)[0], True)
check("...and it measures as 50%", round(rule.verdict(up, 1, True)[1], 2), 0.5)
just_under = [up[0], bar(1, 1.30099, 1.3060, 1.3008, 1.3055)]
teeth("a hair the far side of the midpoint is refused", rule.verdict(just_under, 1, True)[0] is False)

print("\n4. a gap beyond the previous body qualifies — his own words:")
gap = [bar(0, 1.3000, 1.3025, 1.2995, 1.3020), bar(1, 1.3030, 1.3080, 1.3028, 1.3075)]
ok, pos = rule.verdict(gap, 1, True)
check("an open above the whole previous body is approved", ok, True)
teeth("...and it is reported as a gap, not as a percentage",
      "gapped beyond" in rule.line(gap, 1, True).lower())

print("\n5. a SELL is the mirror image, not a special case:")
dn = [bar(0, 1.3020, 1.3025, 1.2995, 1.3000), bar(1, 1.3000, 1.3002, 1.2950, 1.2955)]
check("a sell carrying on from the previous low is approved", rule.verdict(dn, 1, False)[0], True)
dn_back = [bar(0, 1.3000, 1.3025, 1.2995, 1.3020), bar(1, 1.3020, 1.3022, 1.2970, 1.2975)]
check("a sell starting from the previous HIGH is refused", rule.verdict(dn_back, 1, False)[0], False)

print("\n6. nothing to judge must never invent a refusal:")
doji = [bar(0, 1.3000, 1.3010, 1.2990, 1.3000), bar(1, 1.3000, 1.3050, 1.2998, 1.3045)]
check("a previous candle with no body -> approved", rule.verdict(doji, 1, True)[0], True)
check("...and it says it was not judged", "not judged" in rule.line(doji, 1, True), True)
check("the very first bar -> approved", rule.verdict(MOVE, 0, True)[0], True)

# ── 7. ⚠ IT GATES NOTHING ─────────────────────────────────────────────────────────────────────
print("\n7. IT GATES NOTHING — the check this whole arrangement rests on:")
root = Path(__file__).resolve().parents[2]
users = []
for f in root.rglob("*.py"):
    if f.name in ("vix1_open_rule.py", "test_open_rule.py"):
        continue
    if "vix1_open_rule" in f.read_text(encoding="utf-8", errors="replace"):
        users.append(f.relative_to(root).as_posix())
check("only the DM card uses it", users, ["strategies/vix1_momentum_watch.py"])

watch = (root / "strategies/vix1_momentum_watch.py").read_text(encoding="utf-8")
teeth("the DM card puts it in the TEXT, never in a decision",
      "vix1_open_rule.line(" in watch and "vix1_open_rule.verdict(" not in watch)
mom = (root / "strategies/vix1_momentum.py").read_text(encoding="utf-8")
teeth("the momentum test itself does not know this rule exists", "vix1_open_rule" not in mom)
teeth("...and the announcement still fires for a DISQUALIFIED candle",
      "if not qualifies_for_trade" in watch and "open_rule" not in
      watch.split("if not qualifies_for_trade")[1].split("return")[0])

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
