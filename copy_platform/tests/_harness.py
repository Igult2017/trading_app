"""Shared helpers for the copy-platform test suite.

Same shape as signal_platform/tests/vix1/_harness.py deliberately — plain scripts that print
PASS/FAIL and exit non-zero, no test framework, no new dependency.

THE POINT IS TO RUN THE REAL FUNCTIONS. Every defect this suite locks down was found by reading
code, not by a failing test, because until now `copy_platform/` had no tests at all. A suite that
re-implements the rule it is checking would have stayed green through all of them.

Settings are stubbed here, before any copy_platform module is imported: `config` validates its
required settings at import time and raises if they are absent (which is itself one of the fixes),
so without this every import in the suite would fail. Nothing here touches a real database or a
real broker — SQLAlchemy does not connect until a query runs, and no test runs one.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.abspath(os.path.join(_HERE, ".."))
_REPO = os.path.abspath(os.path.join(_PLATFORM, ".."))
if _PLATFORM not in sys.path:
    sys.path.insert(0, _PLATFORM)

# A 64-hex key so crypto takes its AES path rather than the padded-string fallback — the same
# shape the deployment actually uses.
TEST_KEY = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
os.environ.setdefault("COPY_ENCRYPTION_KEY", TEST_KEY)
os.environ.setdefault("CTRADER_CLIENT_ID", "test-client-id")
os.environ.setdefault("CTRADER_CLIENT_SECRET", "test-client-secret")


def repo_path(*parts: str) -> str:
    """A path inside the repo — for the checks that read the Node side's source."""
    return os.path.join(_REPO, *parts)


class Suite:
    """Collects results so a file can report once and exit with the right code."""

    def __init__(self, title):
        self.failed = []
        self.count = 0
        print()
        print(title)

    def check(self, name, got, want):
        self.count += 1
        ok = got == want
        print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
        if not ok:
            self.failed.append(name)
        return ok

    def teeth(self, name, broke_it_and_failed: bool):
        """Prove an assertion CAN fail. A test that cannot fail proves nothing."""
        self.count += 1
        ok = bool(broke_it_and_failed)
        print(f"   {'PASS' if ok else 'FAIL'}  TEETH — {name} fails when deliberately broken: {ok}")
        if not ok:
            self.failed.append(f"TEETH:{name}")
        return ok

    def done(self):
        print()
        if self.failed:
            print(f"{len(self.failed)} of {self.count} FAILED: {self.failed}")
            sys.exit(1)
        print(f"ALL PASS ({self.count} checks)")
        sys.exit(0)


class FakeFollower:
    """The handful of CopyFollower fields lot_calc actually reads."""

    def __init__(self, **kw):
        self.lot_mode = kw.get("lot_mode", "mult")
        self.lot_multiplier = kw.get("lot_multiplier", 1.0)
        self.fixed_lot = kw.get("fixed_lot")
        self.risk_percent = kw.get("risk_percent")
        self.symbol_whitelist = kw.get("symbol_whitelist")
        self.symbol_blacklist = kw.get("symbol_blacklist")
