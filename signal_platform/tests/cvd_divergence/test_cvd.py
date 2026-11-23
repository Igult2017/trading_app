"""HIS cTRADER CVD DIVERGENCE INDICATOR, COPIED — proved on hand-built hours with answers worked out by hand (23 Nov 2026).

The real `alerts.cvd_divergence.cvd`. In words:
  * delta: close at the high = all buying (+volume), at the low = all selling, in the middle = 0, no range = 0;
  * CVD = the last 20 deltas; none before 39 candles (his indicator holds NaN there);
  * swing high: an equal high BEFORE disqualifies it, an equal one AFTER does not;
  * the worked case: swing A high 2.0 with CVD +1,600; swing B high 3.0 with CVD −600 → a BEARISH D on B, comparing A —
    and only once the 5 hours after B have closed; the mirror image gives a BULLISH D.
Run: python tests/cvd_divergence/test_cvd.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from core.types import Candle  # noqa: E402
from alerts.cvd_divergence import cvd as C  # noqa: E402
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _cases import T0, bar, worked, mirror  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


# ── delta and CVD ──────────────────────────────────────────────────────────────────────────────────────────────────
check("close at the high = all buying", C.delta(bar(0, 2, 1, 2)), 100.0)
check("close at the low = all selling", C.delta(bar(0, 2, 1, 1)), -100.0)
check("close in the middle = 0", C.delta(bar(0, 2, 1, 1.5)), 0.0)
check("a candle with no range = 0", C.delta(bar(0, 1, 1, 1)), 0.0)
buying = [bar(i, 2, 1, 2) for i in range(60)]
cv = C.cvd_series(buying)
check("no CVD before candle 39 (his indicator holds NaN there)", (cv[20], cv[38]), (None, None))
check("CVD at candle 39 = the last 20 deltas (20 × +100)", cv[39], 2000.0)

# ── swing tie rules ────────────────────────────────────────────────────────────────────────────────────────────────
flat = [bar(i, 1.0, 0.9, 0.95) for i in range(20)]
peak = list(flat)
peak[10] = bar(10, 1.5, 0.9, 0.95)
check("a high above the 5 each side is a swing high", C.is_swing_high(peak, 10, 19), True)
before = list(peak)
before[7] = bar(7, 1.5, 0.9, 0.95)
check("an EQUAL high before it: not a swing high", C.is_swing_high(before, 10, 19), False)
after = list(peak)
after[13] = bar(13, 1.5, 0.9, 0.95)
check("an EQUAL high after it: still a swing high", C.is_swing_high(after, 10, 19), True)


# ── the worked case ────────────────────────────────────────────────────────────────────────────────────────────────
w = worked()
cv = C.cvd_series(w)
check("CVD at swing A = +1,600 (worked by hand)", round(cv[45], 6), 1600.0)
check("CVD at swing B = −600 (worked by hand)", round(cv[60], 6), -600.0)
marks, last_hi, _ = C.scan(w[:66])
check("5 hours after B closed: ONE bearish D on B, compared with A",
      [(m.side, m.time, m.price, round(m.cvd, 6), m.prev_time, m.prev_price, round(m.prev_cvd, 6)) for m in marks],
      [("bearish", T0 + 60 * 3600, 3.0, -600.0, T0 + 45 * 3600, 2.0, 1600.0)])
check("…and B is now the last swing high", last_hi, 60)
check("only 4 hours after B closed: no D yet (it appears 5 hours late, like his)", C.scan(w[:65])[0], [])
mm = C.scan(mirror(w)[:66])[0]
check("the mirror image: ONE bullish D, at the low −3.0", [(m.side, m.price) for m in mm], [("bullish", -3.0)])
higher = worked()
for i in range(46, 60):
    higher[i] = bar(i, 1.0, 0.9, 1.0)                    # buying all the way from A to B …
higher[60] = bar(60, 3.0, 0.9, 3.0)                      # … and B bought too: CVD 19 × 100 + 100 = +2,000 > +1,600
check("CVD at B, worked by hand: +2,000", round(C.cvd_series(higher)[60], 6), 2000.0)
check("CVD HIGHER at the higher high (they agree): no D", C.scan(higher[:66])[0], [])

# ── TEETH: the rules broken on purpose must change the answer ──────────────────────────────────────────────────────
real = C.is_swing_high
C.is_swing_high = lambda cs, p, last: all(cs[j].high <= cs[p].high for j in range(p - C.SWING, p + C.SWING + 1) if j != p)
check("TEETH: with equal-before allowed, the equal-high case would count as a swing",
      C.is_swing_high(before, 10, 19), True)
C.is_swing_high = real
real_lower = C._lower
C._lower = lambda a, b: True
check("TEETH: without the CVD comparison, the agreeing case WOULD get a D", len(C.scan(higher[:66])[0]), 1)
C._lower = real_lower

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
