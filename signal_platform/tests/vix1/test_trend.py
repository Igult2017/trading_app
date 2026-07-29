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
    """(agreement across window sizes, trend flips, % flat) — the arbitrariness of the reading."""
    agree = tot = 0
    seq = []
    for end in range(max(wins) + 40, len(bars), step):
        w = bars[:end]
        v = [clear_trend(w[-x:], n=n) for x in wins]
        tot += 1
        agree += (v[0] == v[1]) + (v[0] == v[2])
        seq.append(v[1])
    flips = sum(1 for a, b in zip(seq, seq[1:]) if a != b)
    return (100 * agree / (2 * tot)) if tot else 0, flips, tot


for pair in ("EURUSD", "GBPUSD"):
    bars = load(f"{pair}_H1.csv", "H1")
    if not bars:
        print(f"      SKIP {pair} — no local data")
        continue
    new_a, new_f, n_pts = measure(bars, WINS_NEW, _H1_SWING_N)
    old_a, old_f, _ = measure(bars, WINS_OLD, _SWING_N)
    print(f"      {pair}: now {new_a:.0f}% agree / {new_f} flips   "
          f"(old settings: {old_a:.0f}% / {old_f} flips, {n_pts} samples)")
    s.check(f"{pair}: windows agree at least 80% of the time", new_a >= 80.0, True)
    s.check(f"{pair}: the trend is more stable than the old settings", new_a > old_a, True)
    # 183 and 166 flips before = a trend change every ~6 days, which is not a main trend.
    s.check(f"{pair}: fewer than 60 trend changes in 4 years", new_f < 60, True)
    s.check(f"{pair}:   and far fewer than before", new_f < old_f / 2, True)

# ── teeth ────────────────────────────────────────────────────────────────────────────────────────
print()
eur = load("EURUSD_H1.csv", "H1")
if eur:
    a_new, f_new, _ = measure(eur, WINS_NEW, _H1_SWING_N)
    a_old, f_old, _ = measure(eur, WINS_OLD, _SWING_N)
    s.teeth("the agreement bar", a_old < 80.0)
    s.teeth("the flip-count bar", f_old >= 60)
    # the old settings on the old window really are less stable — if this ever fails, the premise of
    # the whole change is gone and the numbers above mean nothing
    s.teeth("the stability comparison", not (a_old > a_new and f_old < f_new))

s.done()
