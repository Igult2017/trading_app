"""VIX.1 — THE RANGE GATE: is price still inside the box the last move made?

HIS RULE, 2026-09-21, after he rejected two versions of mine for hardcoding numbers:

    "The price needs to get out of the two lines and be moving in a direction. Until the price gets
     out of the two lines which I have drawn, we are in a range... it is ranging until it breaks
     that range. The whole thing by the way works with CHOCH and BOS, it is nothing new."

So the two lines are the trend engine's own `bos_price` (the extreme the last move reached) and
`protected` (the level whose break ends it). **There is no window, no threshold and no counter in
this rule, and this file exists partly to keep it that way.**

Three kinds of fact are pinned here:

  * WHAT IT READS — inside the two lines is a range; a close outside either is not; a missing line
    is "cannot say", which allows.
  * HIS OWN CHART — the range he circled on 14-16 Sep reads ranging throughout, and the 67.5-pip
    drop that ended it reads broken out ON THE BAR ITSELF.
  * THAT IT IS WIRED AND FINAL — `detect_bias` asks it and returns; nothing below can argue.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
import datetime

from _harness import Suite, load

from strategies import vix1_chop
from strategies.vix1_bias import detect_bias, _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state

s = Suite("VIX.1 — the range gate (his two lines, no numbers in it)")


class FakeTrend:
    """Only the two fields the rule reads, so the reading can be tested on its own."""
    def __init__(self, bos, prot):
        self.bos_price, self.protected = bos, prot


def bar(close):
    from core.types import Candle
    return Candle(time=1_700_000_000, open=close, high=close, low=close, close=close,
                  volume=0, timeframe="H1")


# ── 1. WHAT IT READS ────────────────────────────────────────────────────────────────────────────
print()
print("THE TWO LINES, read on their own")
box = FakeTrend(1.1000, 1.1100)          # the move ran down to 1.1000, protected by 1.1100
s.check("a close between the lines is RANGING", vix1_chop.box_state([bar(1.1050)], box).ranging,
        True)
s.check("a close BELOW the lower line is not", vix1_chop.box_state([bar(1.0990)], box).ranging,
        False)
s.check("a close ABOVE the upper line is not", vix1_chop.box_state([bar(1.1110)], box).ranging,
        False)
s.check("exactly ON the line still counts as inside — a touch is not a break",
        vix1_chop.box_state([bar(1.1100)], box).ranging, True)
s.check("the lines are read whichever way round they come",
        vix1_chop.box_state([bar(1.1050)], FakeTrend(1.1100, 1.1000)).ranging, True)
s.teeth("it is the CLOSE against the lines that decides",
        vix1_chop.box_state([bar(1.1050)], box).ranging
        and not vix1_chop.box_state([bar(1.0990)], box).ranging)

print()
print("A MISSING LINE NEVER REFUSES")
s.check("no move on record yet -> cannot say", vix1_chop.box_state([bar(1.1)], FakeTrend(None, 1.1)).judged,
        False)
s.check("  ...and cannot say allows", vix1_chop.not_tradeable([bar(1.1)], FakeTrend(None, None)), None)
s.check("no bars at all -> allows", vix1_chop.not_tradeable([], box), None)
s.check("no trend state at all -> allows", vix1_chop.not_tradeable([bar(1.1)], None), None)

# ── 2. HIS OWN CHART ────────────────────────────────────────────────────────────────────────────
sep = load("EURUSD_H1_sep18.csv", "H1")
if not sep:
    print("  SKIP — EURUSD_H1_sep18.csv not present on this machine")
    s.done()


def at(stamp):
    t = int(datetime.datetime.strptime(stamp, "%Y-%m-%d %H:%M")
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    return next(i for i, c in enumerate(sep) if c.time == t)


def ranging(stamp):
    i = at(stamp)
    w = sep[max(0, i - _H1_TREND_BARS + 1): i + 1]
    st = trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))
    return vix1_chop.box_state(sep[: i + 1], st).ranging


print()
print("HIS CIRCLED 14-16 SEP RANGE — inside the box the whole way")
for stamp in ("2026-09-14 15:00", "2026-09-14 19:00", "2026-09-15 08:00", "2026-09-15 20:00",
              "2026-09-16 09:00", "2026-09-16 15:00"):
    s.check(f"   {stamp[5:]} — ranging", ranging(stamp), True)

print()
print("AND IT BREAKS ON THE BAR THAT BREAKS IT — the 67.5-pip drop")
s.check("16 Sep 18:00 — broken out, on the drop's own bar", ranging("2026-09-16 18:00"), False)
s.teeth("the hour before and the hour of the drop differ",
        ranging("2026-09-16 15:00") and not ranging("2026-09-16 18:00"))

print()
print("THE TWO TRADES NOTHING ELSE CATCHES — the hole this closes")
# Reported to him on 2026-09-21: VIX.1 takes these inside his circled range and neither the void
# rule nor the previous range gate refused them. Both are inside the box, so both go now.
for stamp in ("2026-09-14 19:00", "2026-09-15 08:00"):
    i = at(stamp)
    w = sep[max(0, i - _H1_TREND_BARS + 1): i + 1]
    st = trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))
    s.check(f"   {stamp[5:]} — refused, and the reason names the box",
            "still inside the" in (vix1_chop.not_tradeable(sep[: i + 1], st) or ""), True)

# ── 3. WIRED, AND FINAL ─────────────────────────────────────────────────────────────────────────
print()
print("WIRED AND FINAL — detect_bias returns on it")
s.check("in a ranging market no bias is produced at all",
        detect_bias(sep[: at("2026-09-15 08:00") + 1], [], "EUR/USD"), None)
s.teeth("the gate is what stops it — with the rule removed the trade comes back",
        (lambda: (setattr(vix1_chop, "_saved", vix1_chop.not_tradeable),
                  setattr(vix1_chop, "not_tradeable", lambda *a, **k: None),
                  detect_bias(sep[: at("2026-09-15 08:00") + 1], [], "EUR/USD") is not None,
                  setattr(vix1_chop, "not_tradeable", vix1_chop._saved))[2])())

print()
print("NO TUNED NUMBERS IN IT — his whole objection")
import inspect  # noqa: E402
_src = inspect.getsource(vix1_chop)
_body = "\n".join(l for l in _src.splitlines()
                  if not l.strip().startswith("#") and '"""' not in l and "    " in l)
s.check("the module defines no window, threshold or counter constant",
        any(w in _body for w in ("LOOK =", "WANDER_ON", "_CAME_BACK", "_NEED", "_REPLAY")), False)

s.done()
