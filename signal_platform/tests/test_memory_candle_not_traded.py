"""
test_memory_candle_not_traded.py — run with:
    cd signal_platform && python tests/test_memory_candle_not_traded.py

HIS RULE, 2026-11-08: *"Autotrader should only take trades from candles that qualify momentum candle
size or misses it by the margine of error but not the previous momentum candles before the momentum
candle size changes."*

The size test admits a momentum candle three ways (`vix1_momentum.size_yardstick`):

  1. body >= 2.5x its OWN 100-bar median body               — his rule, keeps trading
  2. >= 2.3x, i.e. 2.5 less his 0.2 margin of error          — his rule, keeps trading
  3. clears the LOWEST requirement remembered from a candle that qualified ON ITS OWN in the
     previous 24 CLOCK hours                                 — ⚠ NO LONGER TRADED

Route 3 is what he means by *"the previous momentum candles before the momentum candle size
changes"*. A big move raises its own yardstick — in his 10-11 Sep GBP/USD move the requirement climbed
9.2 -> 11.6 pips — and route 3 let a candle too small for the NEW bar through on the OLD one.

⚠ THE HARDEST CHECKS HERE ARE THE ONES THAT PROVE NOTHING ELSE MOVED. He scoped it himself in the
next breath: *"This only affects trades taken by autotrade. Everything else including DM remains the
same."* So `qualifies_for_trade` must still say yes to a memory candle, the signal must still be
built and sent, and only the ORDER is declined. A fix that quietly silenced the DM would be a worse
outcome than the behaviour being changed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.types import Signal                                  # noqa: E402
from strategies import vix1_momentum as vm                     # noqa: E402

_pass = _fail = 0
ROOT = Path(__file__).resolve().parent.parent


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want {want!r}"))
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


print("\nAUTOTRADE DOES NOT TRADE A CANDLE THE 24-HOUR MEMORY LET IN\n")

# ── 1. the question is answered from size_yardstick, not a second copy of the rule ──────────────
# `size_yardstick` returns the candle's OWN index when it was big on its own, and an EARLIER index
# when the memory admitted it. `traded_on_memory` is that answer read one way — so the size rule
# cannot drift between the two.
print("1. 'was this only the memory?' is read off the existing answer:")


class _Yard:
    def __init__(self, result):
        self.result = result

    def __enter__(self):
        self._real = vm.size_yardstick
        vm.size_yardstick = lambda h1, i, bullish, symbol: self.result
        return self

    def __exit__(self, *exc):
        vm.size_yardstick = self._real


BARS = [None] * 60          # only the index matters; size_yardstick is stubbed
with _Yard(59):             # judged against ITSELF -> big on its own (route 1 or 2)
    check("big on its own is NOT a memory candle", vm.traded_on_memory(BARS, 59, True, "GBP/USD"), False)
with _Yard(40):             # judged against an EARLIER candle -> the memory admitted it
    check("admitted by the memory IS flagged", vm.traded_on_memory(BARS, 59, True, "GBP/USD"), True)
with _Yard(None):           # not a momentum candle at all
    teeth("not a momentum candle is not flagged either",
          vm.traded_on_memory(BARS, 59, True, "GBP/USD") is False)

# ── 2. ⚠ NOTHING ELSE CHANGED — the half that matters most ─────────────────────────────────────
print("\n2. the signal, the DM and every other caller keep the memory:")
mom = (ROOT / "strategies/vix1_momentum.py").read_text(encoding="utf-8")
check("qualifies_for_trade still accepts a memory candle (unchanged)",
      "return size_yardstick(h1, i, bullish, symbol) is not None" in mom, True)
teeth("...so it does NOT consult the new flag",
      "traded_on_memory" not in mom.split("def qualifies_for_trade")[1].split("def ")[0])
check("the 0.2 margin is untouched", vm._SIZE_MARGIN, 0.2)
check("the 2.5x bar is untouched", vm._MIN_BODY_MULT, 2.5)
check("...so the size test still asks 2.3x", round(vm._size_mult(), 2), 2.3)
check("the 24-hour memory itself is untouched", vm._MEMORY_HOURS, 24)
for caller, path in (("the DM momentum announcement", "strategies/vix1_momentum_watch.py"),
                     ("the count-wait DM", "strategies/vix1_countwatch.py")):
    src = (ROOT / path).read_text(encoding="utf-8")
    teeth(f"{caller} still asks qualifies_for_trade, not the new flag",
          "qualifies_for_trade" in src and "size_from_memory" not in src)

# ── 3. the flag is set at the one place a CONFIRMED entry is built ──────────────────────────────
print("\n3. the flag is stamped where the traded signal is made:")
v1 = (ROOT / "strategies/vix1.py").read_text(encoding="utf-8")
set_at = v1.find("sig.size_from_memory = traded_on_memory(")
teeth("vix1 really SETS it (a call, not just an import)", set_at > 0)
check("...on the newest closed candle, which is the one being qualified",
      "traded_on_memory(h1, len(h1) - 1, bullish, sym)" in v1, True)
teeth("...and the name it calls is actually imported",
      "traded_on_memory)" in v1 or "traded_on_memory," in v1)
check("the flag defaults to False, so nothing else is affected",
      Signal(symbol="EUR/USD").size_from_memory, False)

# ── 4. the placer declines, and only the placer ────────────────────────────────────────────────
print("\n4. autotrade declines it, visibly, and places everything else:")
pl = (ROOT / "execution/placer.py").read_text(encoding="utf-8")
gate = pl.find('if getattr(signal, "size_from_memory", False):')
teeth("the placer really checks the flag", gate > 0)
teeth("...before it sizes anything (no point sizing a trade it will not place)",
      0 < gate < pl.index("lots, volume, stop_pips = plan_size("))
check("the refusal is recorded for the Autotrade screen",
      "decision_log.refused(signal, why)" in pl, True)
check("...and names the memory, so the reason is readable",
      "24-hour memory" in pl, True)
teeth("the refusal returns without placing", "return None" in pl[gate:gate + 1400])
# ⚠ The dispatcher sends the card BEFORE autotrade, so this gate can never suppress the DM.
dsp = (ROOT / "notifications/dispatcher.py").read_text(encoding="utf-8")
teeth("autotrade still runs only AFTER the card has gone out",
      dsp.index("await _autotrade(signal)") > dsp.index("if chart and os.path.isfile(chart):"))
teeth("...and only for a confirmed signal, never a _watch DM card",
      "if not is_watch:" in dsp)

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
