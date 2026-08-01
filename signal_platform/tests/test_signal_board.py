"""
The signal board — what gets recorded, how it is labelled, and when it is cleared.

WHY THIS EXISTS. The Assets panel showed "NO ACTIVE SIGNALS" for its entire life. Not a rendering
bug: `strategy_runner` returned early on `alert_only` signals with the comment "Telegram only — no
DB save", so the heads-ups — the common case — were never written. Confirmed entries were saved but
are rare, so the table was empty either way and the panel had nothing to read.

Measured against production before the fix: /api/trading-signals?status=active -> 0,
?status=closed -> 0. The endpoint is public and unscoped, so those counts were authoritative.

Covers the three things that can silently break again:
  * the state mapping (a watch row must never read as a live trade)
  * the weekly cutoff arithmetic (off-by-one on a Monday loses or keeps a week)
  * that NO outcome is ever recorded — there is no entry logic, so a win/loss would be a guess
"""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from storage.signal_repo import STATUS_WATCHING, week_start          # noqa: E402

F, N = [], 0


def chk(name, got, want):
    global N
    N += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        F.append(name)


def teeth(name, broke):
    global N
    N += 1
    print(f"   {'PASS' if broke else 'FAIL'}  TEETH — {name}: {bool(broke)}")
    if not broke:
        F.append("TEETH:" + name)


def UTC(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


# The label rule, mirroring signalState() in AssetPage.tsx. Kept here as the single written
# statement of the mapping — the TS side is one expression and cannot be imported from Python.
def label(status: str, triggered_at) -> str:
    if status not in ("active", STATUS_WATCHING):
        return "hidden"                      # closed / cancelled / expired never reach the panel
    return "IN PROGRESS" if (status == "active" and triggered_at) else "WATCHING FOR ENTRY"


print("STATE MAPPING — two labels, and everything else stays off the board")
chk("a watch heads-up", label("watching", None), "WATCHING FOR ENTRY")
chk("a fired signal with no fill yet (stop order resting)", label("active", None), "WATCHING FOR ENTRY")
chk("a fired signal that filled", label("active", UTC("2026-08-01T10:00:00")), "IN PROGRESS")
chk("a closed signal is not shown at all", label("closed", UTC("2026-08-01T10:00:00")), "hidden")
chk("cancelled is not shown either", label("cancelled", None), "hidden")
chk("expired is not shown either", label("expired", None), "hidden")
# A watching row can never carry triggered_at (only the monitor stamps it, and only on active
# rows) — but if one ever did, it must NOT read as a live trade.
chk("a watching row with a stray triggered_at is still WATCHING",
    label("watching", UTC("2026-08-01T10:00:00")), "WATCHING FOR ENTRY")
teeth("the two live states are distinguishable",
      label("active", None) != label("active", UTC("2026-08-01T10:00:00")))
teeth("closed rows are excluded, not relabelled", label("closed", None) == "hidden")

print()
print("NO OUTCOME IS RECORDED — there is no entry logic, so a win/loss would be invented")
chk("the label vocabulary is exactly two visible values",
    sorted({label(s, t) for s in ("watching", "active", "closed", "cancelled")
            for t in (None, UTC("2026-08-01T10:00:00"))}),
    ["IN PROGRESS", "WATCHING FOR ENTRY", "hidden"])
teeth("no label mentions a win, loss or P&L",
      not any(w in " ".join({label(s, None) for s in ("watching", "active")}).lower()
              for w in ("win", "loss", "profit", "pnl", "p&l")))

print()
print("WEEKLY CUTOFF — every Monday 00:00 UTC starts fresh")
chk("from a Saturday -> that week's Monday",
    week_start(UTC("2026-08-01T10:26:00")).isoformat(), "2026-07-27T00:00:00+00:00")
chk("from the Monday itself, 00:05 -> the same day 00:00",
    week_start(UTC("2026-08-03T00:05:00")).isoformat(), "2026-08-03T00:00:00+00:00")
chk("from Sunday 23:59 -> still the PREVIOUS Monday",
    week_start(UTC("2026-08-02T23:59:00")).isoformat(), "2026-07-27T00:00:00+00:00")
chk("from Monday 00:00 exactly -> itself, not a week earlier",
    week_start(UTC("2026-08-03T00:00:00")).isoformat(), "2026-08-03T00:00:00+00:00")

# The boundary that decides whether a signal survives the reset.
cut = week_start(UTC("2026-08-03T00:05:00"))
chk("a signal from Sunday 23:59 is purged", UTC("2026-08-02T23:59:00") < cut, True)
chk("a signal from Monday 00:06 survives", UTC("2026-08-03T00:06:00") < cut, False)
chk("a signal from Monday 00:00 exactly survives", UTC("2026-08-03T00:00:00") < cut, False)
teeth("the cutoff actually separates the two weeks",
      (UTC("2026-08-02T23:59:00") < cut) and not (UTC("2026-08-03T00:06:00") < cut))
teeth("week_start always lands on a Monday",
      all(week_start(UTC(f"2026-08-0{d}T12:00:00")).weekday() == 0 for d in range(1, 9)))

print()
print("STATUS SEPARATION — a heads-up must not occupy the live keyspace")
chk("the watching status is its own value", STATUS_WATCHING, "watching")
chk("  and is not 'active'", STATUS_WATCHING == "active", False)
teeth("the two partial unique indexes cannot collide", STATUS_WATCHING != "active")

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
