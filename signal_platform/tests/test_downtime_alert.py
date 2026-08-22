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
# 15 Aug 2026 WAS A SATURDAY. The 4h 45m absence this whole alert was built to catch happened with
# the forex market shut, so it cost nothing — and the message as originally written would have told
# him the opposite ("anything that set up was MISSED"). This assertion used to demand that wrong
# sentence. Corrected 2026-08-22: the length and the window are still reported exactly as before,
# but what it MEANS is now the truth about a closed market.
sent.clear()
sh.report_downtime(Outage(down_from=D(2026, 8, 15, 9, 0, 15),
                          down_to=D(2026, 8, 15, 13, 45, 25), seconds=17109))
check("it sends exactly one message", len(sent), 1)
msg = sent[0] if sent else ""
check("coded, and ⏫ because it is back by the time this runs", msg.startswith("🛰️ S3 ⏫"), True)
check("it states the length in plain words", "4h 45m" in msg, True)
check("...and the window it covers", "15 Aug 09:00" in msg and "15 Aug 13:45" in msg, True)
check("it says what that MEANS — and 15 Aug was a Saturday, so it cost nothing",
      "market was CLOSED for all of it" in msg, True)
check("it says the platform is back", "back up and scanning" in msg, True)
# STRATEGIES ARE INDEPENDENT — a platform message must not name one, or compare them.
check("it names no strategy", not any(s in msg.upper() for s in ("VIX", "BX", "CHOCH")), True)

# ── THE 21 AUGUST FALSE ALARM — the market was shut for 29 of those 30 minutes ───────────────
# He received "down for 30m, 21:59 → 22:29 UTC" on a FRIDAY. Forex closes Fri 22:00 UTC, so all but
# one minute of it was a closed market. The old message told him outright that anything setting up
# had been MISSED, which was false. Reproduced here from the times he was actually sent.
print()
print("MARKET HOURS — what the outage actually cost")

check("Fri 21:59 is still open",  sh.open_market_seconds(D(2026, 8, 21, 21, 59), D(2026, 8, 21, 22, 0)), 60)
check("Fri 22:00 onward is shut", sh.open_market_seconds(D(2026, 8, 21, 22, 0), D(2026, 8, 21, 23, 0)), 0)
check("all Saturday is shut",     sh.open_market_seconds(D(2026, 8, 22, 0, 0), D(2026, 8, 22, 23, 0)), 0)
check("Sun before 22:00 is shut", sh.open_market_seconds(D(2026, 8, 23, 20, 0), D(2026, 8, 23, 22, 0)), 0)
check("Sun 22:00 reopens",        sh.open_market_seconds(D(2026, 8, 23, 22, 0), D(2026, 8, 23, 23, 0)), 3600)
check("a midweek hour counts in full",
      sh.open_market_seconds(D(2026, 8, 18, 10, 0), D(2026, 8, 18, 11, 0)), 3600)
check("HIS window: only 1 of the 30 minutes was open market",
      sh.open_market_seconds(D(2026, 8, 21, 21, 59), D(2026, 8, 21, 22, 29)), 60)
check("the 106-minute weekend 'outage' cost nothing at all",
      sh.open_market_seconds(D(2026, 8, 21, 22, 29), D(2026, 8, 22, 0, 15)), 0)
check("a reversed/degenerate window is 0, not a hang",
      sh.open_market_seconds(D(2026, 8, 18, 11, 0), D(2026, 8, 18, 10, 0)), 0)

# ── and the MESSAGE says which it was ────────────────────────────────────────
sent.clear()
sh.report_downtime(Outage(down_from=D(2026, 8, 21, 22, 29),
                          down_to=D(2026, 8, 22, 0, 15), seconds=6368))
weekend = sent[0] if sent else ""
check("a weekend outage says the market was closed", "market was CLOSED for all of it" in weekend, True)
check("...and does NOT claim anything was missed", "was MISSED" in weekend, False)

sent.clear()
sh.report_downtime(Outage(down_from=D(2026, 8, 18, 10, 0),
                          down_to=D(2026, 8, 18, 12, 0), seconds=7200))
midweek = sent[0] if sent else ""
check("a midweek outage still says plainly that setups were missed",
      "MISSED, not declined" in midweek, True)

sent.clear()
sh.report_downtime(Outage(down_from=D(2026, 8, 21, 21, 30),
                          down_to=D(2026, 8, 21, 23, 30), seconds=7200))
straddle = sent[0] if sent else ""
check("an outage straddling the Friday close reports only the open part",
      "30m fell in OPEN market" in straddle, True)

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
