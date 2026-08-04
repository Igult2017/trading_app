"""
BX-S/D — the TAP ALERT ("cheeky one"), asserted.  Run: python tests/bx_sd/test_tap_alert.py

THE FIXTURES ARE BUILT TO BREAK THE CODE, NOT TO PASS IT. This is the lesson from the pullback
defect (2026-08-03): the old `test_pullback_4h` claimed to assert "a one-way move is not a pullback"
and PASSED against code that had no pullback test in it at all, because the fixture happened to put
the extreme where the broken code rejected it. A fixture that only ever exercises the case the code
gets right is worse than no fixture — it certifies the bug.

So each block below states the claim, then feeds the input that would expose the claim being false.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from core.types import Candle                                          # noqa: E402
from core import delivery_ledger                                       # noqa: E402
from strategies.bx_sd_registry import MarkedZone                       # noqa: E402
from strategies.bx_sd_reports import scan_reports                      # noqa: E402

N, F = 0, []


def chk(name, got, want):
    global N
    N += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if not ok:
        F.append(name)


T0 = 1700000000
ZTOP, ZBOT = 1.1020, 1.1000


def h4_bars(tap: bool):
    """40 H4 bars well clear of the zone, then a LIVE bar that either dips into it or does not."""
    out = [Candle(T0 + i * 14400, 1.1100, 1.1120, 1.1080, 1.1105, 100, "H4") for i in range(40)]
    live = (Candle(T0 + 40 * 14400, 1.1060, 1.1065, 1.1010, 1.1040, 100, "H4") if tap
            else Candle(T0 + 40 * 14400, 1.1100, 1.1120, 1.1080, 1.1105, 100, "H4"))
    return out + [live]


def zone(**kw):
    d = dict(direction="demand", top=ZTOP, bottom=ZBOT, proximal=ZTOP, distal=ZBOT, eq50=1.1010,
             kind="institutional", ifc_time=T0 + 2 * 14400, origin_time=T0 + 1 * 14400,
             state="wick_mitigated", mitigation_kind="wick")
    d.update(kw)
    return MarkedZone(**d)


def path(waypoints, per_leg=7, spike=0.00020):
    """M5 bars walking through `waypoints`, with each turn SPIKED so it is the unique extreme.

    Without the spike, the last bar of one leg and the first of the next share a price, and
    `find_swing_points` returns the same turn TWICE. `_flip_ok` then compares `lows[-1] > lows[-2]`
    across two identical lows and a genuine higher low reads as flat — the fixture would have
    reported "no reaction" for a textbook flip, and I would have gone looking in the wrong file.
    """
    out = []
    t = T0
    for a, b in zip(waypoints, waypoints[1:]):
        down, step = b < a, (b - a) / per_leg
        for i in range(per_leg):
            o = a + step * i
            c = o + step
            hi, lo = max(o, c) + 0.00005, min(o, c) - 0.00005
            if i == per_leg - 1:                      # the turning bar: poke beyond, close back
                lo, hi = (lo - spike, hi) if down else (lo, hi + spike)
            out.append(Candle(t, o, hi, lo, c, 50, "M5"))
            t += 300
    return out


def m5_reversal():
    """A REAL S/D-flip signature for a demand zone: down into the zone, rally, back down to a
    HIGHER LOW, then a close above the prior swing high. `reaction_on` must accept this."""
    return path([1.1050, 1.1005, 1.1035, 1.1017, 1.1055])


def m5_stepped_down():
    """A stepped DECLINE — lower highs and lower lows, so it has real structure and a down BOS,
    but nothing a DEMAND zone can call a reaction. Deliberately not a straight line: a straight
    line has zero swing points, so every arm returns "" and the fixture would prove nothing."""
    return path([1.1090, 1.1050, 1.1066, 1.1022, 1.1038, 1.1005])


def m5_faded_rally():
    """A rally that BROKE structure upward and has since faded, closing back below its own high.

    This is the fixture that isolates the CONTINUATION arm: the last BOS is up, so continuation
    says "confirmed", while both reversal arms decline — the flip needs a close above the last
    swing high and this closes below it. Exactly the shape the room would get a card for on every
    trending pair if the alert kept the continuation arm.
    """
    return path([1.1000, 1.1040, 1.1020, 1.1060, 1.1030])


def run(book, m5, m1=None, sid="bx_sd"):
    delivery_ledger._MEM.clear() if hasattr(delivery_ledger, "_MEM") else None
    h4 = h4_bars(tap=True) if book is not None else h4_bars(tap=True)
    return scan_reports("EUR/USD", m5, m5, m1 or [], h4, {}, 0.0001, 5, "BX-S/D", sid, book=book)


def taps(sigs):
    return [s for s in sigs if s.to_channel]


# ── 1. THE REACTION TEST ITSELF ────────────────────────────────────────────────────────────────
print("\nTHE 1M/5M REACTION — the same one the entry uses")
from strategies.bx_sd_entry import reaction_on                          # noqa: E402
from strategies.bx_sd_registry import to_zone                           # noqa: E402
from shared.mtf_utils import closed_only                                # noqa: E402

z = to_zone(zone(), closed_only(h4_bars(tap=True)))
chk("a real flip signature is a reaction",
    bool(reaction_on(m5_reversal(), "up", z, "demand", reversal_only=True)), True)
chk("a stepped DECLINE is NOT a demand reaction (reversal-only)",
    reaction_on(m5_stepped_down(), "up", z, "demand", reversal_only=True), "")
# THE TEETH — the case that justifies `reversal_only`. A faded rally has broken structure upward and
# nothing more; both reversal arms decline it, and the continuation arm calls it confirmed because
# the move is simply still going. Keep the continuation arm and the room gets a card for that on
# every trending pair. If the alert ever stops passing reversal_only, this check goes red.
chk("a faded rally: the REVERSAL arms decline it",
    reaction_on(m5_faded_rally(), "up", z, "demand", reversal_only=True), "")
chk("  ...yet the continuation arm calls it confirmed — why the alert excludes it",
    reaction_on(m5_faded_rally(), "up", z, "demand", reversal_only=False), "Continuation")

# ── 2. THE GATE ────────────────────────────────────────────────────────────────────────────────
print("\nWHEN THE CHEEKY ALERT FIRES — and when it must not")
chk("tap + a real 5M reaction -> exactly one public alert", len(taps(run([zone()], m5_reversal()))), 1)
chk("tap but NO reaction -> nothing public", len(taps(run([zone()], m5_stepped_down()))), 0)

# RESPECTED is the divider. This is the whole design: past this state the ENTRY cascade owns the
# zone, and a cheeky alert here would be a second card for a moment that already has one.
chk("a RESPECTED zone -> nothing (the entry cascade owns it)",
    len(taps(run([zone(state="respected", respected_at=T0)], m5_reversal()))), 0)
chk("a BROKEN zone -> nothing", len(taps(run([zone(state="broken")], m5_reversal()))), 0)

# No live tap: the reaction alone must not publish. `tapped_by` reads the LIVE bar (levels vs
# triggers), so a zone price is nowhere near cannot alert however good the 5M looks.
sigs = scan_reports("EUR/USD", m5_reversal(), m5_reversal(), [], h4_bars(tap=False), {}, 0.0001, 5,
                    "BX-S/D", "bx_sd_notap", book=[zone()])
chk("a reaction with NO live tap -> nothing", len(taps(sigs)), 0)

# A micro zone is noise at any confirmation quality.
chk("a sub-3-pip zone -> nothing",
    len(taps(run([zone(top=1.10020, bottom=1.10000, proximal=1.10020, distal=1.10000)],
                 m5_reversal()))), 0)

# ── 3. THE CARD CARRIES NO TRADE ───────────────────────────────────────────────────────────────
print("\nTHE CARD IS NOT A TRADE")
sig = taps(run([zone()], m5_reversal()))[0]
chk("no entry price", sig.entry_price, 0.0)
chk("no stop", sig.stop_loss, 0.0)
chk("no target", sig.take_profit, 0.0)
chk("stage is 'building'", sig.stage, "building")
chk("NOT qualified — and it says why", sig.qualified, False)
chk("  the missing pieces are named", len(sig.disqualifiers), 2)
chk("routed PUBLIC", (sig.alert_only, sig.to_channel), (True, True))
chk("the zone is on the chart", len(sig.chart_bands), 1)
chk("the tapping bar is marked", sig.chart_marks[0][0], T0 + 40 * 14400)

# ── 4. DEDUP — once per VISIT ──────────────────────────────────────────────────────────────────
print("\nONE PER VISIT")
delivery_ledger.mark_delivered(sig.dedup_key)
chk("the same zone, same visit, next scan -> silent",
    len(taps(scan_reports("EUR/USD", m5_reversal(), m5_reversal(), [], h4_bars(tap=True), {},
                          0.0001, 5, "BX-S/D", "bx_sd", book=[zone()]))), 0)
# A RETURN VISIT IS A NEW EVENT. The key carries `live_visit()`, which is derived from `retaps` and
# `in_zone` — there is no `visits` field, and setting one (as this test first did) changed nothing
# and quietly asserted the opposite of what it claimed. A retap is what makes it a new visit, per
# the rule that a wick tap signals AND its later retap signals again.
z2 = zone(retaps=1)
chk("  but a NEW visit to the same zone alerts again",
    len(taps(scan_reports("EUR/USD", m5_reversal(), m5_reversal(), [], h4_bars(tap=True), {},
                          0.0001, 5, "BX-S/D", "bx_sd", book=[z2]))), 1)

# ── 5. THE COPY ────────────────────────────────────────────────────────────────────────────────
print("\nTHE MESSAGE")
from notifications.telegram_tap_alert import format_tap_alert, _SIGNOFFS   # noqa: E402

msg = format_tap_alert(sig)
chk("never calls itself a signal", "SIGNAL" in msg.upper().replace("SIGNAL PLATFORM", ""), False)
chk("says plainly it is not an entry", "Not an entry" in msg, True)
chk("shows what is there", "WHAT'S THERE" in msg, True)
chk("shows what is missing", "WHAT'S MISSING" in msg, True)
chk("carries the disclaimer", "does not offer financial advice" in msg, True)
chk("escapes the ampersand for HTML mode", "Trade&amp;Journal" in msg, True)
chk("no raw unescaped ampersand", "&" in msg.replace("&amp;", ""), False)
# DETERMINISTIC, not random: a failed send re-fires the same key next scan, and a fresh punchline
# under an identical card reads to the room like a second event.
chk("the sign-off is stable for one signal",
    format_tap_alert(sig) == msg, True)
chk("  and different keys can draw different sign-offs", len(set(_SIGNOFFS)), len(_SIGNOFFS))

# THE CAPTION CAP. This card always ships with a chart, and Telegram REJECTS a photo caption over
# 1024 chars — it does not truncate. Over the line and the send fails, the reader gets text with no
# picture, and nothing in the logs says why. The first draft measured 988 on a plain EUR/USD card:
# a yen symbol plus an HTF backing tag would have gone straight through it in production.
# So assert the WORST case, not the sample: longest sign-off, widest symbol, full backing.
from notifications.telegram_tap_alert import CAPTION_CAP                  # noqa: E402
from strategies.bx_sd_tap_alert import tap_alert_signal                   # noqa: E402

worst_zone = to_zone(zone(retaps=9, mitigation_kind="body"), closed_only(h4_bars(tap=True)))
worst = tap_alert_signal(worst_zone, "GBP/JPY", "CHoCH+Flip (god setup)", "entry TF", 3,
                         "BX-S/D", "bx_sd", ["D1", "W1", "MN"], T0, "body", 9)
longest = 0
for i in range(len(_SIGNOFFS) * 4):          # enough keys to land on every sign-off
    worst.dedup_key = f"key{i}"
    longest = max(longest, len(format_tap_alert(worst)))
print(f"      (worst-case caption: {longest} chars, cap {CAPTION_CAP})")
chk("the worst-case caption still fits a photo", longest < CAPTION_CAP, True)

print(f"\n{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + ', '.join(F)}  ({N} checks)")
sys.exit(1 if F else 0)
