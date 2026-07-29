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
    "test_momentum.py",             # the gates and grading, hand-built candles
    "test_line_pullback.py",        # the line, and the past-the-line rule
    "test_manage.py",               # the R ratchet and the structure exit
    "test_invariants_real_data.py", # the real functions over real candles
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
