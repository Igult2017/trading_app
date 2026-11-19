"""Run EVERY signal-platform test — the platform files here AND the VIX.1 suite. Non-zero on any failure.

    python signal_platform/tests/run_all.py

WHY THIS EXISTS (15 Nov 2026). `tests/vix1/run_all.py` ran only its own folder, so the files beside
this one were run by nothing. One of them (`test_memory_candle_not_traded.py`) went red on 10 Nov and
nobody saw it, and four of them would not even start, because they import the settings without the
dummy database address the VIX.1 harness sets. Both gaps are closed here: the address is set for
every child process, and every `test_*.py` in this folder runs, then the VIX.1 runner.

No test framework, no network, no database — the same rules as the VIX.1 suite.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = {**os.environ, "DATABASE_URL": os.environ.get("DATABASE_URL", "postgresql://x.invalid/x"),
       "PYTHONIOENCODING": "utf-8"}

files = sorted(f for f in os.listdir(HERE) if f.startswith("test_") and f.endswith(".py"))
failed = []
for f in files:
    r = subprocess.run([sys.executable, f], cwd=HERE, env=ENV, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    print(f"   {'PASS' if r.returncode == 0 else 'FAIL'}  {f}")
    if r.returncode != 0:
        failed.append(f)
        print("\n".join(l for l in (r.stdout + r.stderr).splitlines() if "FAIL" in l or "Error" in l)[:2000])

# THE STRATEGY FOLDERS (18 Nov 2026). `tests/pix` and `tests/bx_sd` were run by NOTHING — the same gap the paragraph
# at the top describes. Each file runs from its own folder, as it is written to.
for sub in ("pix", "bx_sd"):
    d = os.path.join(HERE, sub)
    for f in sorted(x for x in os.listdir(d) if x.startswith("test_") and x.endswith(".py")):
        r = subprocess.run([sys.executable, f], cwd=d, env=ENV, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        print(f"   {'PASS' if r.returncode == 0 else 'FAIL'}  {sub}/{f}")
        if r.returncode != 0:
            failed.append(f"{sub}/{f}")
            print("\n".join(l for l in (r.stdout + r.stderr).splitlines() if "FAIL" in l or "Error" in l)[:2000])

vix = subprocess.run([sys.executable, os.path.join(HERE, "vix1", "run_all.py")], env=ENV)
if vix.returncode != 0:
    failed.append("vix1/run_all.py")

print()
if failed:
    print(f"SIGNAL PLATFORM TESTS: {len(failed)} FAILED: {failed}")
    sys.exit(1)
print(f"SIGNAL PLATFORM TESTS: ALL PASS ({len(files)} platform files + the PIX, BX-S/D and VIX.1 suites)")
