"""THE OUTAGE THAT LEAVES NO PROCESS BEHIND TO REPORT IT.

The existing S3 alert fires from `write_status` on a BOOT ERROR — Python started, ran its checks and
found a fault. A process that was KILLED, a container that died, a host that went away: none of them
call `write_status` at all, so no ⏬ goes out, and no ⏫ either (recovery only fires when a prior ⏬
left the marker behind). That class of absence is invisible to it BY CONSTRUCTION.

It happened: 15 Aug 2026, 09:00 → 13:45 UTC, 4h 45m, in silence. The outage WAS written to
`platform_downtime` at the next boot and then sat there, because nothing read it.

Runs the REAL `report_downtime` with the Telegram send intercepted, so what is asserted is the
message that would actually be transmitted.
"""
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
# The message carries emoji and a Windows console is cp1252 — without this the SUITE dies on its own
# print while the code under test is perfectly fine, which is a maddening way to read a red run.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from core import startup_helpers as sh                       # noqa: E402
from storage.observability_repo import Outage                # noqa: E402

failed, count = [], 0
sent: list[str] = []
sh._send_coded = lambda text: sent.append(text)


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


def D(*a):
    return datetime(*a, tzinfo=timezone.utc)


print()
print("BOOT ALERT — the platform was down and nothing said so")

# ── durations read like a length someone can feel ────────────────────────────
check("4h 45m", sh._spell_duration(17109), "4h 45m")
check("under an hour", sh._spell_duration(12 * 60), "12m")
check("whole hours drop the minutes", sh._spell_duration(2 * 3600), "2h")
check("over a day", sh._spell_duration(27 * 3600), "1d 3h")
check("exactly a day", sh._spell_duration(24 * 3600), "1d")
check("never rounds to zero", sh._spell_duration(20), "1m")

# ── THE REAL 15 AUGUST OUTAGE ────────────────────────────────────────────────
sent.clear()
sh.report_downtime(Outage(down_from=D(2026, 8, 15, 9, 0, 15),
                          down_to=D(2026, 8, 15, 13, 45, 25), seconds=17109))
check("it sends exactly one message", len(sent), 1)
msg = sent[0] if sent else ""
check("coded, and ⏫ because it is back by the time this runs", msg.startswith("🛰️ S3 ⏫"), True)
check("it states the length in plain words", "4h 45m" in msg, True)
check("...and the window it covers", "15 Aug 09:00" in msg and "15 Aug 13:45" in msg, True)
check("it says what that MEANS, not just that it happened",
      "MISSED, not declined" in msg, True)
check("it says the platform is back", "back up and scanning" in msg, True)
# STRATEGIES ARE INDEPENDENT — a platform message must not name one, or compare them.
check("it names no strategy", not any(s in msg.upper() for s in ("VIX", "BX", "CHOCH")), True)

# ── a clean boot says nothing ────────────────────────────────────────────────
sent.clear()
sh.report_downtime(None)
check("no outage -> no message at all", len(sent), 0)

# ── a short absence is not an outage — that gate lives upstream ──────────────
# `detect_downtime` returns None under 300s, so `report_downtime` never sees one. Asserted here so a
# future change that starts passing short gaps in is caught by this file rather than by his phone.
sent.clear()
sh.report_downtime(Outage(down_from=D(2026, 8, 20, 1, 0, 0),
                          down_to=D(2026, 8, 20, 1, 6, 0), seconds=360))
check("a 6-minute gap still reports (the threshold is upstream, by design)", len(sent), 1)
check("...and reads as minutes, not hours", "6m" in sent[0], True)

# ── a send that fails must never stop the platform booting ───────────────────
def _boom(_text):
    raise RuntimeError("telegram down")


sh._send_coded = _boom
crashed = False
try:
    sh.report_downtime(Outage(down_from=D(2026, 8, 15, 9, 0), down_to=D(2026, 8, 15, 13, 45),
                              seconds=17109))
except Exception:
    crashed = True
check("a failing Telegram send does not raise into boot", crashed, False)
sh._send_coded = lambda text: sent.append(text)

# ── TEETH ────────────────────────────────────────────────────────────────────
sent.clear()
sh.report_downtime(None)
teeth("silence on a clean boot is real silence", len(sent) == 0)
sh.report_downtime(Outage(down_from=D(2026, 8, 15, 9, 0), down_to=D(2026, 8, 15, 13, 45),
                          seconds=17109))
teeth("the harness would notice a message", len(sent) == 1)
teeth("the duration is computed, not hardcoded", sh._spell_duration(3600) != sh._spell_duration(7200))

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
print()
print("   The message he would have received on 15 August:")
print("   " + "-" * 66)
for line in sent[0].splitlines():
    print("   | " + line)
print("   " + "-" * 66)
