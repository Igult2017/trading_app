"""test_open_rule_wiring.py — run with:
    cd signal_platform && python tests/vix1/test_open_rule_wiring.py

WHERE the stomach rule is wired in, as opposed to WHAT it says. `test_open_rule.py` holds his three
sentences and the arithmetic; this file holds the one thing that can go wrong around them.

⚠ IT DECIDES, SINCE 2026-11-10 — *"Turn it on. I have seen it working and it is doing the job."*
Before that it only put words on a message, and the old teeth asserted "only the DM card uses it".
That is now false by design, so the checks were made HARDER rather than weaker:

  * exactly TWO files read it — `vix1_momentum` DECIDES, `vix1_momentum_watch` DESCRIBES;
  * the decision is taken in ONE place, `qualifies_for_trade`, never scattered across its callers;
  * exactly ONE caller may opt out — the DM announcement, so the candles the rule turns away stay
    visible to him. A second opt-out would silently stop the rule deciding for whatever that caller
    feeds, and nothing else in the suite would notice;
  * and it really refuses: the last block calls the REAL `qualifies_for_trade` both ways.

The end-to-end proof on untouched data is not here — it is the 26,000-bar frequency count, which
puts 2,759 real momentum candles through this same path and refuses 408 of them (14.8%).
"""
import sys
from pathlib import Path

from _harness import Suite  # noqa: F401

from core.types import Candle                                 # noqa: E402
from strategies import vix1_open_rule as rule                 # noqa: E402
from strategies import vix1_momentum as vm                    # noqa: E402

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


# opens at the far edge of a BIG previous body -> his sentence 1 refuses it
BIG_PREV = [bar(0, 1.3000, 1.3035, 1.2998, 1.3030), bar(1, 1.3000, 1.3045, 1.2999, 1.3040)]
# the same open, but the previous candle is a quarter the size -> his sentence 3 qualifies it
SMALL_PREV = [bar(0, 1.3000, 1.3012, 1.2998, 1.3010), bar(1, 1.3000, 1.3045, 1.2999, 1.3040)]
# carries the move on from the previous body's close -> his sentence 2 qualifies it
CARRIES_ON = [bar(0, 1.3000, 1.3025, 1.2995, 1.3020), bar(1, 1.3020, 1.3060, 1.3018, 1.3055)]
# the candle before has no body at all -> nothing to judge
NO_BODY = [bar(0, 1.3000, 1.3010, 1.2990, 1.3000), bar(1, 1.3000, 1.3050, 1.2998, 1.3045)]

root = Path(__file__).resolve().parents[2]

print("\nVIX.1 STOMACH RULE — where it is wired in, now that it DECIDES\n")

print("1. it decides in ONE place, and only two files read it at all:")
users = []
for f in root.rglob("*.py"):
    if f.name.startswith("test_open_rule") or f.name == "vix1_open_rule.py":
        continue
    if "vix1_open_rule" in f.read_text(encoding="utf-8", errors="replace"):
        users.append(f.relative_to(root).as_posix())
check("exactly two files read it — the one that DECIDES and the one that DESCRIBES",
      sorted(users), ["strategies/vix1_momentum.py", "strategies/vix1_momentum_watch.py"])

watch = (root / "strategies/vix1_momentum_watch.py").read_text(encoding="utf-8")
mom = (root / "strategies/vix1_momentum.py").read_text(encoding="utf-8")
teeth("the DM card still only DESCRIBES — it asks line/tag, never verdict",
      "vix1_open_rule.line(" in watch and "vix1_open_rule.tag(" in watch
      and "vix1_open_rule.verdict(" not in watch)
teeth("the decision is taken inside qualifies_for_trade, not scattered across its callers",
      mom.count("vix1_open_rule.verdict(") == 1)

print("\n2. exactly ONE caller may opt out of the gate — the DM announcement:")
optouts = []
for f in root.rglob("*.py"):
    if f.name.startswith("test_open_rule"):
        continue
    if ", ignore_open_rule=True" in f.read_text(encoding="utf-8", errors="replace"):
        optouts.append(f.relative_to(root).as_posix())
check("only the DM announcement opts out", optouts, ["strategies/vix1_momentum_watch.py"])

print("\n3. and it really refuses — the REAL qualifies_for_trade, asked both ways:")
# The SIZE stage is forced to pass so this isolates the new gate. Everything else is the real
# function, including the real rule; only `size_yardstick` is stood aside.
_real = vm.size_yardstick
try:
    vm.size_yardstick = lambda h1, i, bullish, symbol: i
    check("a candle this rule REFUSES may not be traded",
          vm.qualifies_for_trade(BIG_PREV, 1, True, "GBP/USD"), False)
    check("...but the DM announcement still receives it",
          vm.qualifies_for_trade(BIG_PREV, 1, True, "GBP/USD", ignore_open_rule=True), True)
    check("a candle it APPROVES is untouched",
          vm.qualifies_for_trade(SMALL_PREV, 1, True, "GBP/USD"), True)
    teeth("the gate is the ONLY difference between those two answers",
          vm.qualifies_for_trade(BIG_PREV, 1, True, "GBP/USD") is False
          and vm.qualifies_for_trade(BIG_PREV, 1, True, "GBP/USD", ignore_open_rule=True) is True)
finally:
    vm.size_yardstick = _real

# ── 4. THE VERDICT MUST BE UNMISSABLE ─────────────────────────────────────────────────────────
# His instruction, 2026-11-09: *"The DM message should clearly state that it is either approved by
# that new rule or not."* The details list is capped at five bullets and the card already fills all
# five, so the short tag goes in the LABEL — the second line of the message.
print("\n4. the verdict is stated in the label, in one glance:")
check("an approved candle says so", rule.tag(CARRIES_ON, 1, True), "STOMACH RULE: APPROVED")
check("a refused candle says so", rule.tag(BIG_PREV, 1, True), "STOMACH RULE: DISQUALIFIED")
check("nothing to judge says that too", rule.tag(NO_BODY, 1, True), "STOMACH RULE: NOT JUDGED")
teeth("the card actually puts the tag in the label",
      "stomach[0]" in watch and "label" in watch.split("stomach[0]")[0][-220:])

# ⚠ THE CARD MUST NOT TELL HIM IT GATES NOTHING. It said exactly that for a day, correctly, and the
# words outlived the design by one commit. A refusal now stops a signal, so the card says so.
print("\n5. the card's words match what the platform actually does:")
refused_text = rule.line(BIG_PREV, 1, True)
teeth("a refusal says the signal will not be taken",
      "No signal will be taken" in refused_text)
teeth("...and nothing on the card still claims it gates nothing",
      not any("gate anything yet" in t or "gates nothing" in t
              for t in (rule.line(BIG_PREV, 1, True), rule.line(SMALL_PREV, 1, True),
                        rule.line(CARRIES_ON, 1, True), rule.line(NO_BODY, 1, True))))
teeth("an APPROVAL promises no trade — the other gates still apply",
      "No signal will be taken" not in rule.line(CARRIES_ON, 1, True)
      and "will trade" not in rule.line(CARRIES_ON, 1, True))

print("")
print(("ALL PASS" if _fail == 0 else f"{_fail} FAILED") + f" - {_pass + _fail} checks")
print("")
sys.exit(0 if _fail == 0 else 1)
