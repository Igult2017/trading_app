"""Run the whole VIX.1 suite. Exit non-zero if anything failed.

    python signal_platform/tests/vix1/run_all.py

No test framework, no network, no DB. Cheap enough to run on every change to VIX.1 — and per the
standing rule, the strategy doc is updated in the same change as the code, so run this before you
write the doc entry, not after.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TESTS = [
    "test_atr.py",                  # the volatility yardstick every depth is divided by
    "test_swings.py",               # highs and lows in REAL TIME — no 48-bar wait
    "test_retracement.py",          # the retracement, counted in real time (bars + depth)
    "test_regime.py",               # directional efficiency — the range detector
    "test_momentum.py",             # the gates and grading, hand-built candles
    "test_line_pullback.py",        # the line, and the past-the-line rule
    "test_manage.py",               # the R ratchet and the structure exit
    "test_invariants_real_data.py", # the real functions over real candles
    "test_trend.py",              # the 1HR trend read — stability + do reversals mean anything
    "test_structure.py",            # the leg gate (no pullbacks/ranges) + the freeze regression
    # MISSING FROM THIS LIST UNTIL 2026-08-19, and it had been passing unrun since the route
    # shipped. The CHoCH route is the ONE entry that does not ask for a pullback, so it is exactly
    # the file that must run whenever the pullback gate is touched.
    "test_choch.py",                # the change-of-character entry route
    "test_stage_tracker.py",       # the log throttle + VIX.1 reason-shape keying
    "test_spacing.py",              # signal spacing + the 27 Jul duplicate-signal regression
]

worst = 0
results = []
for t in TESTS:
    print("=" * 78)
    r = subprocess.run([sys.executable, "-u", os.path.join(HERE, t)],
                       cwd=HERE, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    results.append((t, r.returncode))
    worst = max(worst, r.returncode)

print("=" * 78)
for t, code in results:
    print(f"   {'PASS' if code == 0 else 'FAIL'}  {t}")
print()
print("VIX.1 SUITE: ALL PASS" if worst == 0 else "VIX.1 SUITE: FAILURES PRESENT")
sys.exit(worst)
