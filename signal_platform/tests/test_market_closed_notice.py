"""
test_market_closed_notice.py — run with:
    cd signal_platform && python tests/test_market_closed_notice.py

HIS REPORT, 2026-09-05: *"Market scanner should not be working. market is closed."*

It was not working. The log just could not say so. The closed notice was a TRANSITION test
(`if _was_scanning:`), and `_was_scanning` starts False, so a platform that BOOTED into a closed
market — every weekend deploy — never printed it. All the log showed was APScheduler's own
"Market scanner … executed successfully" once a minute, which it prints whenever the job function
returns, scanned or not. A deliberately idle weekend looked exactly like a broken one.

Same lesson as the sync that said nothing on success: a system that is silent when idle cannot be
told apart from one that is failing.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.instrument_filter import is_forex_open, next_open, get_open_instruments   # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def utc(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


print("\nMARKET-CLOSED NOTICE — the week's edges, and what the log can say about them\n")

# ── 1. THE WEEK, AT ITS EDGES ──────────────────────────────────────────────
# 2026-09-04 is a Friday; the 5th Saturday, 6th Sunday, 7th Monday.
print("1. the forex week (open Sun 22:00 UTC, shut Fri 22:00 UTC):")
check("Friday 21:59 is open",           is_forex_open(utc(2026, 9, 4, 21, 59)), True)
check("Friday 22:00 is SHUT",           is_forex_open(utc(2026, 9, 4, 22, 0)),  False)
check("Saturday is shut all day",       is_forex_open(utc(2026, 9, 5, 12, 0)),  False)
check("...including Saturday 23:00",    is_forex_open(utc(2026, 9, 5, 23, 0)),  False)
check("Sunday 21:59 is still shut",     is_forex_open(utc(2026, 9, 6, 21, 59)), False)
check("Sunday 22:00 is OPEN",           is_forex_open(utc(2026, 9, 6, 22, 0)),  True)
check("Monday is open",                 is_forex_open(utc(2026, 9, 7, 9, 0)),   True)

# ── 2. NOTHING IS TRADEABLE WHILE SHUT ─────────────────────────────────────
# This is the gate the scanner actually gets its answer from, so it is asserted directly.
print("\n2. the gate the scanner reads — no instruments means the tick returns at once:")
check("Saturday offers no instruments", get_open_instruments(utc(2026, 9, 5, 2, 21)), [])
check("...and Monday offers some",      len(get_open_instruments(utc(2026, 9, 7, 9, 0))) > 0, True)

# ── 3. WHEN DOES IT REOPEN ─────────────────────────────────────────────────
# The figure printed in the notice. Wrong here means the log misinforms him, which is worse
# than saying nothing at all.
print("\n3. next_open — the time the notice promises:")
check("from Saturday 02:21 -> Sunday 22:00", next_open(utc(2026, 9, 5, 2, 21)), utc(2026, 9, 6, 22))
check("from Friday 22:00 -> Sunday 22:00",   next_open(utc(2026, 9, 4, 22, 0)), utc(2026, 9, 6, 22))
check("from Friday 23:30 -> Sunday 22:00",   next_open(utc(2026, 9, 4, 23, 30)), utc(2026, 9, 6, 22))
check("from Sunday 21:00 -> Sunday 22:00",   next_open(utc(2026, 9, 6, 21, 0)),  utc(2026, 9, 6, 22))
# Already open: returns the instant it was given, so the caller can print "0.0h" rather than lying.
check("when already open it returns now",    next_open(utc(2026, 9, 7, 9, 0)),   utc(2026, 9, 7, 9))

# TEETH — the answer must always BE open, and never be in the past.
print("\n  teeth — sweep every hour of a whole week, no exceptions:")
bad_closed, bad_past = [], []
t = utc(2026, 9, 4, 0)
for _ in range(24 * 7):
    nxt = next_open(t)
    if not is_forex_open(nxt):
        bad_closed.append(t.strftime("%a %H:%M"))
    if nxt < t:
        bad_past.append(t.strftime("%a %H:%M"))
    t += timedelta(hours=1)
check("  every answer is a moment the market is OPEN", bad_closed, [])
check("  and never earlier than the question",         bad_past, [])

# ── 4. THE NOTICE FIRES ON A BOOT INTO A CLOSED MARKET ─────────────────────
# The defect itself. The old guard was the transition flag, which is False at boot.
print("\n4. the notice is not a transition test any more:")
src = (Path(__file__).resolve().parent.parent / "orchestrator" / "scanner.py").read_text(encoding="utf-8")
check("a dedicated flag tracks whether we have said it",
      "_market_closed_logged: bool = False" in src, True)
check("the notice is guarded by THAT flag, not by _was_scanning",
      "if not _market_closed_logged:" in src, True)
check("...and it names when the market reopens",
      "next_open(tick_now)" in src, True)
check("...and says the ticks that keep firing are doing nothing",
      "scans nothing" in src, True)
check("reopening is announced too, so the quiet period has an end in the log",
      "market open — scanning resumed" in src, True)
# TEETH — the old transition-only guard must be gone, or the boot case comes straight back.
check("  teeth: the old `if _was_scanning:` notice guard is gone",
      "if _was_scanning:\n            log.info" in src, False)
# ...and the flag must be declared global in the tick, or Python rebinds a local and the
# notice repeats every 60 seconds — noisier than the silence it replaced.
check("  teeth: the flag is declared global in the tick",
      "global _was_scanning, _active_sessions, _current_interval, _market_closed_logged" in src, True)

print(f"\n  {_pass} passed, {_fail} failed\n")
sys.exit(1 if _fail else 0)
