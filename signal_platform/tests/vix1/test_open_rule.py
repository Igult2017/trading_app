"""test_open_rule.py — run with:
    cd signal_platform && python tests/vix1/test_open_rule.py

HIS RULE HAS THREE SENTENCES, 2026-11-09, and this file holds all three:

 1. CANNOT QUALIFY — *"It cannot qualify if its open is the same level or close to same level as the
    previous candle's and the previous candles body is more than half its body or has body equal to
    its"*.
 2. CAN QUALIFY — *"it can qualify if its candle open starts past half the body of the previous
    candle all the way to the point I have pointed"*, *"and even past it"*, *"including leaving a
    gap between candles and starting after the gap"*.
 3. CAN ALSO QUALIFY — *"if the open of the momentum candle is same level or close to same level IF
    the previous candle body was less than half the body of the momentum candle"*.

⚠ THE FIRST BUILD SHIPPED SENTENCE 2 ONLY, and that is why sections 2 and 9 exist. On 26,000 real
GBP/USD H1 bars it refused 1,439 of 2,759 momentum candles — but 1,033 of those are candles his
sentence 3 QUALIFIES. It was wrongly refusing more than twice as many as it correctly refused. He
found it by reading his own rule back: *"are we still doing this?"*

⚠ IT DECIDES, SINCE 2026-11-10 — *"Turn it on. I have seen it working and it is doing the job."*
THIS FILE HOLDS WHAT THE RULE SAYS. **WHERE it is wired in now lives in `test_open_rule_wiring.py`**
— who may read it, who may opt out of it, and whether it actually refuses a trade. Both run in the
suite; a change to this rule that forgets the second one is the dangerous kind.

THE CANDLES IN SECTIONS 1 AND 2 ARE REAL GBP/USD H1 BARS, copied from the saved cTrader history, not
invented: his circled 15 July 2026 move and the two turn-backs in the same window.
"""
import sys
from pathlib import Path

# The suite's own harness, and it has to come first: it puts the platform on the path, sets a
# DATABASE_URL so the imports below do not fail on a missing setting, and stubs the observability
# write so an unreachable database cannot drown a real FAIL in SQLAlchemy noise.
from _harness import Suite  # noqa: F401

from core.types import Candle                                   # noqa: E402
from strategies import vix1_open_rule as rule                   # noqa: E402

# the repo root, used by the last section to prove the size test reuses the shared helper
root = Path(__file__).resolve().parents[2]

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
# ⚠ THESE TWO LOOK ALIKE AND HIS RULE SPLITS THEM. Both open barely 3-6% along the previous body,
# so sentence 2 refuses both. The difference is the SIZE of the candle before:
#   TURN_A  previous 6.7 pips vs momentum 12.2  -> 55% -> sentence 1 REFUSES it
#   TURN_B  previous 4.8 pips vs momentum 12.4  -> 39% -> sentence 3 QUALIFIES it
TURN_A = [bar(1784044800, 1.33820, 1.33918, 1.33751, 1.33887),
          bar(1784048400, 1.33885, 1.33907, 1.33678, 1.33763)]    # 14 Jul 17:00
TURN_B = [bar(1784095200, 1.34096, 1.34196, 1.34096, 1.34144),
          bar(1784098800, 1.34141, 1.34195, 1.34006, 1.34017)]    # 15 Jul 07:00

print("\nVIX.1 THE STOMACH RULE — all three of his sentences, watched on the DM, gating nothing\n")

print("1. his circled 15 July move — every candle must be APPROVED:")
for i in range(1, len(MOVE)):
    ok, pos, why = rule.verdict(MOVE, i, True)
    check(f"bar {i} opened {pos:.0%} along the previous body", ok, True)
teeth("...and every one of them opened at the far edge or beyond, never short of halfway",
      all(rule.verdict(MOVE, i, True)[1] >= 0.5 for i in range(1, len(MOVE))))
teeth("...so it is his SENTENCE 2 that approves them, not the small-previous escape",
      all(rule.verdict(MOVE, i, True)[2] == "past-stomach" for i in range(1, len(MOVE))))

print("\n2. the two real turn-backs — his rule SPLITS them, on the size of the candle before:")
ok, pos, why = rule.verdict(TURN_A, 1, False)
check(f"14 Jul 17:00 SELL opened {pos:.0%} along, previous candle 55% of it -> REFUSED", ok, False)
check("...by his sentence 1", why, "short-of-stomach")
# ⚠ THIS EXPECTATION CHANGED ON 2026-11-10, and the change is the whole point of this build.
# It used to assert False. His sentence 3 qualifies it: the candle before is 4.8 pips against this
# one's 12.4, so at 39% it is far too small for its midpoint to mean anything. Flipped deliberately,
# never silently — if he tells me this candle should stay refused, my reading of sentence 3 is wrong.
ok, pos, why = rule.verdict(TURN_B, 1, False)
check(f"15 Jul 07:00 SELL opened {pos:.0%} along, previous candle 39% of it -> APPROVED", ok, True)
check("...by his sentence 3", why, "small-previous")

print("\n3. the WHERE boundary is HALF, and the far side of it is what fails:")
up = [bar(0, 1.3000, 1.3025, 1.2995, 1.3020), bar(1, 1.3010, 1.3060, 1.3008, 1.3055)]
check("an open exactly at the midpoint is allowed", rule.verdict(up, 1, True)[0], True)
check("...and it measures as 50%", round(rule.verdict(up, 1, True)[1], 2), 0.5)
# the previous body is 20 pips against this candle's 30, i.e. 66% — big enough that sentence 3
# cannot rescue it, so this isolates the POSITION test on its own.
just_under = [up[0], bar(1, 1.30099, 1.3045, 1.3008, 1.3040)]
teeth("a hair the far side of the midpoint is refused", rule.verdict(just_under, 1, True)[0] is False)

print("\n4. a gap beyond the previous body qualifies — his own words:")
gap = [bar(0, 1.3000, 1.3025, 1.2995, 1.3020), bar(1, 1.3030, 1.3080, 1.3028, 1.3075)]
ok, pos, why = rule.verdict(gap, 1, True)
check("an open above the whole previous body is approved", ok, True)
teeth("...and it is reported as a gap, not as a percentage",
      "gapped clear" in rule.line(gap, 1, True).lower())

print("\n5. a SELL is the mirror image, not a special case:")
dn = [bar(0, 1.3020, 1.3025, 1.2995, 1.3000), bar(1, 1.3000, 1.3002, 1.2950, 1.2955)]
check("a sell carrying on from the previous low is approved", rule.verdict(dn, 1, False)[0], True)
# again a 20-pip previous body against a 35-pip momentum body (57%), so sentence 3 cannot rescue it
dn_back = [bar(0, 1.3000, 1.3025, 1.2995, 1.3020), bar(1, 1.3020, 1.3022, 1.2980, 1.2985)]
check("a sell starting from the previous HIGH is refused", rule.verdict(dn_back, 1, False)[0], False)

print("\n6. nothing to judge must never invent a refusal:")
doji = [bar(0, 1.3000, 1.3010, 1.2990, 1.3000), bar(1, 1.3000, 1.3050, 1.2998, 1.3045)]
check("a previous candle with no body -> approved", rule.verdict(doji, 1, True)[0], True)
check("...and it says it was not judged", "not judged" in rule.line(doji, 1, True), True)
check("the very first bar -> approved", rule.verdict(MOVE, 0, True)[0], True)

# ── 7. ⚠ IT GATES NOTHING ─────────────────────────────────────────────────────────────────────
# ── 7. HIS SENTENCES 1 AND 3 — THE SIZE TEST, which the first build left out entirely ─────────
print("")
print("7. the SIZE of the candle before decides what a far-half open means:")
PREV_SMALL = bar(0, 1.3000, 1.3012, 1.2998, 1.3010)     # 10 pip body
PREV_BIG = bar(0, 1.3000, 1.3035, 1.2998, 1.3030)       # 30 pip body
PREV_HALF = bar(0, 1.3000, 1.3025, 1.2995, 1.3020)      # 20 pip body
MOM = bar(1, 1.3000, 1.3045, 1.2999, 1.3040)            # 40 pip body, opening at the FAR edge

ok, pos, why = rule.verdict([PREV_SMALL, MOM], 1, True)
check("far-half open, previous candle only 25% of it -> APPROVED (his sentence 3)", ok, True)
check("...and it says which sentence saved it", why, "small-previous")
ok, pos, why = rule.verdict([PREV_BIG, MOM], 1, True)
check("far-half open, previous candle 75% of it -> REFUSED (his sentence 1)", ok, False)
check("...and it says so", why, "short-of-stomach")
check("the same open position in both cases", round(pos, 3), 0.0)
teeth("a previous body of EXACTLY half is REFUSED — his words are 'less than half' to qualify, "
      "'more than half or equal' to refuse",
      rule.verdict([PREV_HALF, MOM], 1, True)[0] is False)
teeth("the card tells him the size, not just the verdict",
      "25%" in rule.line([PREV_SMALL, MOM], 1, True)
      and "75%" in rule.line([PREV_BIG, MOM], 1, True))
teeth("the size test reuses the platform's own body measurement, not a second copy",
      "from shared.candle_math import body_size" in
      (root / "strategies/vix1_open_rule.py").read_text(encoding="utf-8"))


print("")
print(("ALL PASS" if _fail == 0 else f"{_fail} FAILED") + f" - {_pass + _fail} checks")
print("")
sys.exit(0 if _fail == 0 else 1)
