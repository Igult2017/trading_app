"""ONE MODULE OWNS THE TREND — and it reads the 1HR chart and nothing else.

His ruling, 2026-09-08: *"If it has a different role, then why is it veto for another module. Cant we
have everything for trend in one module but structured in a way that instead of conflicting they
coordinate? Also make them have memory."*

And the constraint, in the same breath and pinned here because it is the easiest thing to lose:

    ***"even if you give trend memory, we are still using 1HR TF for trend."***

WHAT THIS FILE GUARDS, in order:
  1. the second trend gate is gone and cannot come back
  2. the shape check has NO direction of its own, so it can never contradict the trend
  3. memory records only AGE, never a verdict, and the recomputed reading always wins
  4. the trend is read on 1HR — no other timeframe is consulted anywhere in the trend path

NOT A BACKTEST: no P&L, no win rate, no trades simulated.
"""
import ast
import os
from pathlib import Path

from _harness import Suite

from strategies import vix1_regime, vix1_structure, vix1_trend
from strategies.vix1_trend import TrendState, _shape, forget, remember

s = Suite("VIX.1 — one module owns the trend")

STRAT = Path(__file__).resolve().parents[2] / "strategies"

# ── 1. THE SECOND GATE IS GONE ────────────────────────────────────────────
print("   the second trend gate is gone and cannot come back:")
s.check("vix1_regime no longer exports a veto", hasattr(vix1_regime, "market_permits"), False)
s.check("nor does vix1_structure", hasattr(vix1_structure, "market_permits"), False)

bias_src = (STRAT / "vix1_bias.py").read_text(encoding="utf-8")
s.check("vix1_bias does not import one", "import market_permits" in bias_src, False)
s.check("vix1_bias still COMPUTES the regime, for the CARD", "vix1_regime.classify(" in bias_src, True)
s.check("...and the trend's own shape is what it refuses on", "mstate.in_shape" in bias_src, True)

# `vix1_choch` keeps its OWN use of classify — a different question, asked of the bars BEFORE the
# break (his condition 3). Pinned so a later tidy-up does not take it as more of the same.
choch_src = (STRAT / "vix1_choch.py").read_text(encoding="utf-8")
s.check("the CHoCH route still asks what the break came out of",
        "vix1_regime.classify(" in choch_src, True)

# ── 2. THE SHAPE CHECK HAS NO DIRECTION OF ITS OWN ────────────────────────
print()
print("   the shape check answers in the TREND's terms, so it cannot contradict it:")
UP_SHAPE = ([1.1000, 1.1050], [1.0950, 1.0980])      # higher high, higher low
DOWN_SHAPE = ([1.1050, 1.1000], [1.0980, 1.0950])    # lower high, lower low

s.check("an uptrend with an up shape is in shape", _shape(1, *UP_SHAPE)[0], True)
s.check("a downtrend with a down shape is in shape", _shape(-1, *DOWN_SHAPE)[0], True)
s.check("an UPtrend with a DOWN shape is refused", _shape(1, *DOWN_SHAPE)[0], False)
s.check("a DOWNtrend with an UP shape is refused", _shape(-1, *UP_SHAPE)[0], False)
s.check("no trend -> never 'in shape'", _shape(0, *UP_SHAPE)[0], False)
s.check("too few swings -> not permission", _shape(1, [1.10], [1.09])[0], False)

# THE DEFECT THIS REPLACED, stated as a property: the SAME four numbers must give OPPOSITE answers
# for opposite trends. The deleted gate returned one verdict for both, which is how it approved a
# trade while describing the other direction (17.1% EUR/USD, 15.8% GBP/USD over 4.3 years).
s.check("the same numbers answer differently for opposite trends — the whole point",
        _shape(1, *DOWN_SHAPE)[0] == _shape(-1, *DOWN_SHAPE)[0], False)

# ── 3. MEMORY: AGE ONLY, AND THE RECOMPUTE ALWAYS WINS ────────────────────
print()
print("   memory records how long, never what:")
forget()
up = TrendState(direction=1)
up.in_shape, up.shape_why = True, "in shape"
T = 1788700000
remember("EUR/USD", up, T)
remember("EUR/USD", up, T + 3600)
third = remember("EUR/USD", up, T + 7200)
s.check("age grows while the answer holds", third["direction_bars"], 2)

down = TrendState(direction=-1)
down.in_shape, down.shape_why = True, "in shape"
flipped = remember("EUR/USD", down, T + 10800)
s.check("a flip resets the age — memory never carries a stale direction",
        flipped["direction_bars"], 0)
s.check("...and the flip itself is honoured, not overridden",
        vix1_trend._memory["EUR/USD"]["direction"], -1)

s.check("another symbol is independent", remember("GBP/USD", up, T + 10800)["direction_bars"], 0)
forget("EUR/USD")
s.check("a cold start behaves like the first ever scan",
        remember("EUR/USD", up, T + 14400)["direction_bars"], 0)

# MEMORY MAY NEVER BE A SOURCE. `trend_state` must not consult it — the verdict is a pure replay of
# the window, which is what stops stored state drifting out of step across a restart.
trend_src = (STRAT / "vix1_trend.py").read_text(encoding="utf-8")
fn = [n for n in ast.parse(trend_src).body
      if isinstance(n, ast.FunctionDef) and n.name == "trend_state"][0]
body = ast.get_source_segment(trend_src, fn) or ""
s.check("trend_state never reads memory — the replay stays the source of truth",
        "_memory" in body, False)

# ── 4. THE TREND IS READ ON 1HR, FULL STOP ────────────────────────────────
print()
print("   his constraint: the trend is 1HR, and memory is not a back door to anything slower:")
# SEARCH THE CODE, NOT THE PROSE. The first version of this check grepped the whole file and went
# red on its OWN comment — the note in `vix1_trend` saying that finding an H4 read there would be a
# defect. A guard that trips on the sentence describing it is worse than no guard, because the
# obvious way to "fix" it is to delete the warning.
import io as _io                                                           # noqa: E402
import tokenize as _tok                                                    # noqa: E402

def _code_only(src: str) -> str:
    """The source with every comment and string literal removed."""
    out = []
    for t in _tok.generate_tokens(_io.StringIO(src).readline):
        if t.type not in (_tok.COMMENT, _tok.STRING):
            out.append(t.string)
    return " ".join(out)

trend_code = _code_only(trend_src)
for name in ("H4", "D1", "W1", "MN"):
    s.check(f"vix1_trend's CODE consults no {name} bars", name in trend_code, False)
s.check("the memory helper counts in HOURS (3600s), i.e. 1HR bars", "3600" in trend_code, True)

# And the guard must be able to fail: a real H4 read in the code would be caught.
s.check("teeth on that check — an H4 reference in code WOULD be seen",
        "H4" in _code_only("tf = 'x'  # comment\nbars = fetch(H4)\n"), True)

# `vix1_bias` may MENTION H4 — the muted fallback branch lives there — but it must stay muted.
s.check("the 4HR fallback in vix1_bias is still switched off", "_ALLOW_H4 = False" in bias_src, True)

# ── teeth ─────────────────────────────────────────────────────────────────
print()
s.teeth("the shape rule really refuses a contradiction", _shape(1, *DOWN_SHAPE)[0] is False)
s.teeth("the shape rule really allows agreement", _shape(1, *UP_SHAPE)[0] is True)
forget()
s.teeth("a fresh memory really starts at zero",
        remember("XAU/USD", up, T)["direction_bars"] == 0)

s.done()
