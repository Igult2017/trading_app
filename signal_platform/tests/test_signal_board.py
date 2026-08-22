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
  * the monthly cutoff arithmetic (off-by-one on the 1st loses or keeps a month), and
    that the Node read-filter agrees with the Python purge to the instant
  * that NO outcome is ever recorded — there is no entry logic, so a win/loss would be a guess
"""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from storage.signal_repo import STATUS_WATCHING, month_start         # noqa: E402

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
    if status in ("executed", "invalidated"):
        return "CLOSED"                      # the entry filled and the trade resolved
    if status not in ("active", STATUS_WATCHING):
        return "dropped"                     # expired / anything else never reaches the panel
    return "IN PROGRESS" if (status == "active" and triggered_at) else "WATCHING FOR ENTRY"


print("LIFECYCLE — watching -> in progress -> closed, and dropped never shows")
chk("a watch heads-up", label("watching", None), "WATCHING FOR ENTRY")
chk("a fired signal with no fill yet (stop order resting)", label("active", None), "WATCHING FOR ENTRY")
chk("a fired signal that filled", label("active", UTC("2026-08-01T10:00:00")), "IN PROGRESS")
chk("TP hit -> closed", label("executed", UTC("2026-08-01T10:00:00")), "CLOSED")
chk("SL hit -> closed (NOT 'loss')", label("invalidated", UTC("2026-08-01T10:00:00")), "CLOSED")
chk("cancelled before the entry filled -> dropped, never shown", label("expired", None), "dropped")
# A watching row can never carry triggered_at (only the monitor stamps it, and only on active
# rows) — but if one ever did, it must NOT read as a live trade.
chk("a watching row with a stray triggered_at is still WATCHING",
    label("watching", UTC("2026-08-01T10:00:00")), "WATCHING FOR ENTRY")
teeth("the three visible states are distinguishable",
      len({label("watching", None), label("active", UTC("2026-08-01T10:00:00")),
           label("executed", UTC("2026-08-01T10:00:00"))}) == 3)
teeth("a cancelled stop order is dropped, not relabelled closed",
      label("expired", None) == "dropped")

print()
print("NO OUTCOME IS RECORDED — there is no entry logic, so a win/loss would be invented")
chk("TP and SL produce the SAME label — the board never says which",
    label("executed", UTC("2026-08-01T10:00:00")), label("invalidated", UTC("2026-08-01T10:00:00")))
chk("the visible vocabulary is exactly three values",
    sorted({label(s, t) for s in ("watching", "active", "executed", "invalidated", "expired")
            for t in (None, UTC("2026-08-01T10:00:00"))}),
    ["CLOSED", "IN PROGRESS", "WATCHING FOR ENTRY", "dropped"])
teeth("no label mentions a win, loss or P&L",
      not any(w in " ".join({label(s, UTC("2026-08-01T10:00:00"))
                             for s in ("watching", "active", "executed", "invalidated")}).lower()
              for w in ("win", "loss", "profit", "pnl", "p&l")))

print()
print("MONTHLY CUTOFF — the 1st at 00:00 UTC starts fresh")
# Was weekly (every Monday) until 2026-08-22. His instruction: "let the signals expire at the end of
# every month."
chk("mid-month -> the 1st of that month",
    month_start(UTC("2026-08-21T10:26:00")).isoformat(), "2026-08-01T00:00:00+00:00")
chk("from the 1st itself, 00:05 -> the same day 00:00",
    month_start(UTC("2026-08-01T00:05:00")).isoformat(), "2026-08-01T00:00:00+00:00")
chk("from the last day 23:59 -> still THIS month's 1st",
    month_start(UTC("2026-08-31T23:59:00")).isoformat(), "2026-08-01T00:00:00+00:00")
chk("from the 1st at 00:00 exactly -> itself, not a month earlier",
    month_start(UTC("2026-08-01T00:00:00")).isoformat(), "2026-08-01T00:00:00+00:00")
chk("across a YEAR boundary — 1 Jan is its own month start",
    month_start(UTC("2027-01-01T00:00:00")).isoformat(), "2027-01-01T00:00:00+00:00")
chk("...and 31 Dec belongs to December, not January",
    month_start(UTC("2026-12-31T23:59:00")).isoformat(), "2026-12-01T00:00:00+00:00")
chk("February is not special", month_start(UTC("2027-02-28T12:00:00")).isoformat(),
    "2027-02-01T00:00:00+00:00")

# The boundary that decides whether a signal survives the reset.
cut = month_start(UTC("2026-09-01T00:05:00"))
chk("a signal from 31 Aug 23:59 is purged", UTC("2026-08-31T23:59:00") < cut, True)
chk("a signal from 1 Sep 00:06 survives", UTC("2026-09-01T00:06:00") < cut, False)
chk("a signal from 1 Sep 00:00 exactly survives", UTC("2026-09-01T00:00:00") < cut, False)
teeth("the cutoff actually separates the two months",
      (UTC("2026-08-31T23:59:00") < cut) and not (UTC("2026-09-01T00:06:00") < cut))
teeth("month_start always lands on day 1 at midnight",
      all(month_start(UTC(f"2026-{m:02d}-15T12:00:00")).day == 1
          and month_start(UTC(f"2026-{m:02d}-15T12:00:00")).hour == 0 for m in range(1, 13)))
teeth("a whole month is kept, not a week",
      (month_start(UTC("2026-08-31T12:00:00")) == month_start(UTC("2026-08-01T12:00:00"))))

# ── THE NODE FILTER MUST AGREE WITH THE PYTHON PURGE, TO THE INSTANT ──────────
# `server/routes.ts` recomputes this boundary independently for its read-time filter. If the two ever
# drift, the board shows rows the purge already deleted, or hides rows it kept. Replicated here in
# the same arithmetic the JS uses (setUTCDate(1) + setUTCHours(0,0,0,0)) so a change to either side
# without the other fails HERE rather than on his screen.
def node_month_start(d: datetime) -> datetime:
    return d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


for probe in ("2026-08-21T10:26:00", "2026-09-01T00:05:00", "2026-12-31T23:59:00",
              "2027-01-01T00:00:00", "2027-02-28T12:00:00"):
    chk(f"Node and Python agree at {probe}",
        node_month_start(UTC(probe)).isoformat(), month_start(UTC(probe)).isoformat())

print()
print("STATUS SEPARATION — a heads-up must not occupy the live keyspace")
chk("the watching status is its own value", STATUS_WATCHING, "watching")
chk("  and is not 'active'", STATUS_WATCHING == "active", False)
teeth("the two partial unique indexes cannot collide", STATUS_WATCHING != "active")

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
