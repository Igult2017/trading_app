"""Run every copy-platform test file and report once.

`python copy_platform/tests/run_all.py` — exits non-zero if any file fails, so it works the same
by hand and in a build step.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

files = sorted(f for f in os.listdir(HERE)
               if f.startswith("test_") and f.endswith(".py"))

failed = []
for f in files:
    r = subprocess.run([sys.executable, f], cwd=HERE)
    if r.returncode != 0:
        failed.append(f)

print()
print("=" * 70)
if failed:
    print(f"{len(failed)} of {len(files)} FILES FAILED: {failed}")
    sys.exit(1)
print(f"ALL {len(files)} FILES PASS")
