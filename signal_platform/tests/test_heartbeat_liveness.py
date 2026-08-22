"""THE HEARTBEAT MUST MEAN "THIS LOOP IS ALIVE", NOT "A SCAN HAPPENED".

The defect this file exists to stop, found 2026-08-22:

`obs.beat()` was called at the very END of `scan_markets`, past four legitimate early returns —
paused, `SCAN_ENABLED=false`, market closed, no strategies registered. So a tick that correctly
decided to do nothing never stamped the heartbeat. The moment forex closed on a Friday the heartbeat
froze and stayed frozen for ~49 hours, and `detect_downtime` compared its age at the next boot
against a 300s threshold and reported the whole idle weekend as an outage.

A healthy engine idling through a closed market produced a byte-identical report to a dead one. That
is what sent the false "signal engine was NOT RUNNING for 30m" alert on Fri 21 Aug 2026, and what
recorded a fabricated 106-minute outage across the following night.

**No unit test of the alert could ever have caught it** — the alert was working perfectly on the
input it was given. The lie was upstream, in what the heartbeat measured. So this drives the REAL
`scan_markets` with the clock moved, and asserts on what actually got written.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

failed, count = [], 0


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke_it: bool):
    global count
    count += 1
    print(f"   {'PASS' if broke_it else 'FAIL'}  TEETH — {name}: {broke_it}")
    if not broke_it:
        failed.append(f"TEETH:{name}")


from orchestrator import scanner                              # noqa: E402
from storage import observability_repo as obs                 # noqa: E402

# Intercept the heartbeat at the DB boundary — everything above it is the real code path.
beats: list[dict] = []
obs.beat = lambda scanned=True, tick_ms=None: beats.append({"scanned": scanned, "tick_ms": tick_ms})

FRI_OPEN  = datetime(2026, 8, 21, 21, 59, tzinfo=timezone.utc)   # 1 min before the weekend close
FRI_SHUT  = datetime(2026, 8, 21, 22, 30, tzinfo=timezone.utc)   # market closed
SATURDAY  = datetime(2026, 8, 22, 12, 0,  tzinfo=timezone.utc)   # closed all day


def run_tick_at(when: datetime):
    """Run the REAL scan_markets with the clock forced to `when`."""
    beats.clear()
    real_dt = scanner.datetime

    class _Clock(real_dt):                       # subclass so isinstance/strftime still work
        @classmethod
        def now(cls, tz=None):
            return when

    scanner.datetime = _Clock
    try:
        asyncio.run(scanner.scan_markets())
    finally:
        scanner.datetime = real_dt
    return list(beats)


print()
print("HEARTBEAT LIVENESS — an idle tick is still a live tick")

# ── THE DEFECT, STATED AS A TEST ─────────────────────────────────────────────
sat = run_tick_at(SATURDAY)
check("a Saturday tick STILL writes the heartbeat", len(sat), 1)
check("...and does not claim to have scanned", sat[0]["scanned"] if sat else None, False)
check("...and reports no tick duration, because nothing was timed",
      sat[0]["tick_ms"] if sat else "?", None)

shut = run_tick_at(FRI_SHUT)
check("a Friday-after-22:00 tick still writes the heartbeat", len(shut), 1)
check("...and does not claim to have scanned", shut[0]["scanned"] if shut else None, False)

# ── the disabled path beats too ──────────────────────────────────────────────
real_enabled = scanner.settings.scan_enabled
try:
    object.__setattr__(scanner.settings, "scan_enabled", False)
    off = run_tick_at(FRI_OPEN)
    check("SCAN_ENABLED=false still writes the heartbeat", len(off), 1)
    check("...and does not claim to have scanned", off[0]["scanned"] if off else None, False)
finally:
    object.__setattr__(scanner.settings, "scan_enabled", real_enabled)

# ── an exception mid-tick must not swallow the heartbeat ─────────────────────
# The write lives in a `finally` precisely so a crash still proves liveness. If someone moves it back
# onto the success path, this is the check that fails.
real_filter = scanner.instrument_filter.get_open_instruments


def _boom(_now=None):
    raise RuntimeError("feed exploded")


scanner.instrument_filter.get_open_instruments = _boom
crashed = False
beats.clear()
try:
    run_tick_at(FRI_OPEN)
except RuntimeError:
    crashed = True
finally:
    scanner.instrument_filter.get_open_instruments = real_filter
check("a tick that RAISES still stamped the heartbeat first", len(beats), 1)
check("...and the exception is not swallowed", crashed, True)

# ── TEETH — would this harness notice the bug coming back? ───────────────────
# Re-create the OLD behaviour (beat only on a completed scan) and confirm the checks above go red.
saved = scanner.scan_markets


async def _old_behaviour():
    """The pre-fix shape: return early on a closed market, never beat."""
    now = scanner.datetime.now(timezone.utc)
    if not scanner.instrument_filter.get_open_instruments(now):
        return
    obs.beat(True, 1)

scanner.scan_markets = _old_behaviour
regressed = run_tick_at(SATURDAY)
scanner.scan_markets = saved
teeth("the old code writes NO heartbeat on a Saturday (so this file has teeth)", len(regressed) == 0)
teeth("the fixed code does", len(run_tick_at(SATURDAY)) == 1)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
