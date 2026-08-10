"""VIX.1 — the 1HR trend read (`vix1_trend.clear_trend`, `vix1_bias._H1_SWING_N`).

WHAT BROKE (2026-07-29). The user drew a two-month EUR/USD downtrend and the detector reported UP.
Not a logic bug — a keyhole. It was handed 120 H1 bars (five days) and called a 7-hour wiggle a
swing, so every swing it could see was from the previous two days, in which price genuinely had made
a higher high and a higher low. VIX.1 is pro-trend only, so a valid SELL that day would have been
thrown away as counter-trend while price fell 24 pips.

THE PROPERTY UNDER TEST IS STABILITY, NOT A SINGLE VERDICT. "It says DOWN today" is worth almost
nothing — two rejected candidate fixes each said DOWN on the day they were tried and were WORSE over
four years. What matters is that the answer stops depending on how many bars the caller happens to
pass, so this measures agreement across window sizes and how often the trend flips.

Offline: uses the saved 4-year H1 CSVs, no network.
NOT A BACKTEST — no P&L, no win rate. Purely "is the trend label stable and non-arbitrary".
"""
from _harness import Suite, load

from strategies.vix1_bias import _H1_SWING_N
from strategies.vix1_trend import _SWING_N, clear_trend

s = Suite("VIX.1 — the 1HR trend is read from wide swings over a long window")

print("   the swing half-width is a PARAMETER, and the default is unchanged:")
tiny = load("EURUSD_H1.csv", "H1", limit=400)
s.check("clear_trend accepts an explicit n", isinstance(clear_trend(tiny, n=12), int), True)
s.check("its default still matches the module constant",
        clear_trend(tiny), clear_trend(tiny, n=_SWING_N))
s.check("the 1HR read uses a 2-day swing (48 H1 bars either side)", _H1_SWING_N, 48)

# ── the property that matters ────────────────────────────────────────────────────────────────────
print()
print("   STABILITY over 4 years — the verdict must not depend on the caller's buffer size:")
WINS_NEW = (1200, 1800, 2400)
WINS_OLD = (120, 300, 800)


def measure(bars, wins, n, step=96):
    """(agreement across window sizes, COMPLETED reversals, raw steps, samples).

    WHY THERE ARE NOW TWO COUNTS — decided by the user 2026-08-11, and the reasoning matters more
    than the number. Until 2026-08-11 the trend went straight from UP to DOWN, so counting every
    state change counted every reversal exactly once. The trend now passes through a middle state
    ("changing"): a break of the protecting level only PROPOSES a reversal, and the market must
    prove the new direction with a BOS before the trend actually turns. One reversal therefore reads
    UP -> changing -> DOWN, and the old count scores it as TWO.

    So `completed` ignores the middle step and counts real UP<->DOWN reversals. `raw` is the OLD
    count, kept deliberately and reported alongside — the user: "I don't want the test changed
    simply to make the results look better; I want it changed because the definition of a reversal
    has genuinely changed." Keeping both is what lets anyone check that claim instead of trusting it.
    """
    agree = tot = 0
    seq = []
    for end in range(max(wins) + 40, len(bars), step):
        w = bars[:end]
        v = [clear_trend(w[-x:], n=n) for x in wins]
        tot += 1
        agree += (v[0] == v[1]) + (v[0] == v[2])
        seq.append(v[1])
    raw = sum(1 for a, b in zip(seq, seq[1:]) if a != b)
    settled = [t for t in seq if t != 0]                    # drop the "changing" step
    completed = sum(1 for a, b in zip(settled, settled[1:]) if a != b)
    return (100 * agree / (2 * tot)) if tot else 0, completed, raw, tot


for pair in ("EURUSD", "GBPUSD"):
    bars = load(f"{pair}_H1.csv", "H1")
    if not bars:
        print(f"      SKIP {pair} — no local data")
        continue
    new_a, new_c, new_raw, n_pts = measure(bars, WINS_NEW, _H1_SWING_N)
    old_a, old_c, old_raw, _ = measure(bars, WINS_OLD, _SWING_N)
    print(f"      {pair}: now {new_a:.0f}% agree / {new_c} completed reversals "
          f"({new_raw} raw steps incl. 'changing')   "
          f"(old settings: {old_a:.0f}% / {old_c} reversals / {old_raw} raw, {n_pts} samples)")
    s.check(f"{pair}: windows agree at least 80% of the time", new_a >= 80.0, True)
    # 183 and 166 flips before = a trend change every ~6 days, which is not a main trend.
    s.check(f"{pair}: fewer than 60 COMPLETED reversals in 4 years", new_c < 60, True)
    s.check(f"{pair}:   and far fewer than the old settings", new_c < old_c / 2, True)
    # THE OLD COUNT IS KEPT AS A DIAGNOSTIC, not an assertion. It cannot be compared like-for-like
    # across the definition change, which is the whole reason `completed` exists — but it is printed
    # every run so the two can always be seen side by side.

# ── does a reversal mean anything? ───────────────────────────────────────────────────────────────
# The user, 2026-08-11: "I want the new tests to confirm that the system still catches genuine
# reversals while reducing the false reversals that caused the original bad sell." Fewer reversals
# is worthless on its own — a detector that never changes its mind scores perfectly and is useless.
# So this asks BOTH questions of every trend phase:
#   FALSE  — did it change its mind again within two days? That is noise, not a trend.
#   REAL   — while it lasted, did price actually travel the way the trend said?
# The second is measured as the BEST move in the trend's own direction during the phase, NOT
# start-to-end: a phase ENDS because price turned against it, so start-to-end is biased negative by
# construction and would fail a perfect detector. (I made exactly that mistake first.)
print()
print("   a reversal must be RARE and it must be RIGHT:")
PIP = 0.0001


def phase_quality(bars, n, step=96, window=1500):
    """(phases, how many were under 2 days, median best favourable move in pips, how many never moved)"""
    idx = list(range(window + 40, len(bars), step))
    seq = [clear_trend(bars[:e][-window:], n=n) for e in idx]
    settled = [(i, t) for i, t in zip(idx, seq) if t != 0]
    phases, cur, start = [], None, None
    for i, t in settled:
        if t != cur:
            if cur is not None:
                phases.append((cur, start, i))
            cur, start = t, i
    if cur is not None:
        phases.append((cur, start, idx[-1]))
    short = sum(1 for d, a, b in phases if (b - a) < 48)
    best = []
    for d, a, b in phases:
        if b <= a:
            continue
        seg = bars[a:b + 1]
        best.append(((max(c.high for c in seg) - seg[0].close) if d == 1
                     else (seg[0].close - min(c.low for c in seg))) / PIP)
    best.sort()
    med = best[len(best) // 2] if best else 0.0
    return len(phases), short, med, sum(1 for x in best if x < 10)


for pair in ("EURUSD", "GBPUSD"):
    bars = load(f"{pair}_H1.csv", "H1")
    if not bars:
        continue
    n_ph, short, med, dead = phase_quality(bars, _H1_SWING_N)
    print(f"      {pair}: {n_ph} phases, {short} under 2 days, median best move {med:+.0f} pips, "
          f"{dead} never moved the trend's way")
    s.check(f"{pair}: NO trend phase lasts under two days (false reversals)", short, 0)
    s.check(f"{pair}: the median phase catches at least 80 pips its own way", med >= 80.0, True)
    s.check(f"{pair}: at most one phase never moves the trend's way at all", dead <= 1, True)

# ── teeth ────────────────────────────────────────────────────────────────────────────────────────
print()
eur = load("EURUSD_H1.csv", "H1")
if eur:
    a_new, c_new, raw_new, _ = measure(eur, WINS_NEW, _H1_SWING_N)
    a_old, c_old, raw_old, _ = measure(eur, WINS_OLD, _SWING_N)
    s.teeth("the reversal-count bar", c_old >= 60)
    # The old settings really are less stable — if this ever fails, the premise of the whole change
    # is gone and the numbers above mean nothing.
    s.teeth("the stability comparison", not c_old < c_new)

s.done()
