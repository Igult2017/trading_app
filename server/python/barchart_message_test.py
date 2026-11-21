"""barchart_message — which day's options, and the post. Run: python barchart_message_test.py"""
import os
import sys
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import barchart_message as M  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


utc = lambda s: datetime.fromisoformat(s).replace(tzinfo=timezone.utc)     # noqa: E731

# ── his rule: the next trading day — Monday → Tuesday, Friday → Monday ─────────────────────────────────────────
check("London, Monday 23 Nov → Tuesday 24 Nov", M.expiry_for("ln", utc("2026-11-23T08:10:00")), date(2026, 11, 24))
check("New York, Friday 20 Nov → Monday 23 Nov", M.expiry_for("ny", utc("2026-11-20T13:10:00")), date(2026, 11, 23))
check("London, Thursday → Friday", M.expiry_for("ln", utc("2026-11-19T08:10:00")), date(2026, 11, 20))
# Asia uses SYDNEY's day: Monday 21:10 UTC is Tuesday 08:10 in Sydney → Wednesday's options
check("Asia, Monday 21:10 UTC (Sydney Tuesday) → Wednesday", M.expiry_for("asia", utc("2026-11-23T21:10:00")),
      date(2026, 11, 25))
check("Asia, Thursday 21:10 UTC (Sydney Friday) → Monday", M.expiry_for("asia", utc("2026-11-19T21:10:00")),
      date(2026, 11, 23))

# ── the post ──────────────────────────────────────────────────────────────────────────────────────────────────
ok_row = {"strike": 3600.0, "fails": []}
near_row = {"strike": 3595.0, "fails": ["Vega 1.48 — should be low (≤ 1.21)"]}
gold = M.format_market("GOLD", "GCZ26", 3605.35, 3600.30, 2, ([ok_row], [near_row]), ([], []))
check("a full qualifier: strike → spot level", "✅ 3600 → <code>3594.96</code>" in gold, True)
check("a near miss says what failed and what it should be",
      "⚠️ 3595 → <code>3589.96</code> — Vega 1.48 — should be low (≤ 1.21)" in gold, True)
check("an empty side says so", gold[-1], "none today")
post = M.format_post("ny", utc("2026-11-20T13:10:00"), date(2026, 11, 23), [gold])
check("the post names the open, the day and the expiry",
      post.split("\n")[:2], ["📊 <b>OPTIONS LEVELS — NEW YORK OPEN</b>", "<i>Fri 20 Nov · options expiring Mon 23 Nov</i>"])

# ── teeth ─────────────────────────────────────────────────────────────────────────────────────────────────────
real = M.next_trading_day
M.next_trading_day = lambda d: d.replace(day=d.day + 1)                 # SABOTAGE: weekends not skipped
check("TEETH — Friday → Monday is what skips the weekend",
      M.expiry_for("ny", utc("2026-11-20T13:10:00")) != date(2026, 11, 23), True)
M.next_trading_day = real

print(f"\n{len(BAD)} of {N[0]} FAILED: {BAD}" if BAD else f"\nALL PASS ({N[0]} checks)")
sys.exit(1 if BAD else 0)
