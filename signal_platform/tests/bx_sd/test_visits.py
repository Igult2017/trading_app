"""
BX-S/D — VISITS: what counts as a retap, and what the zone book reports about one.

WHY THIS EXISTS — four defects found in the 2026-07-30 audit, all in the same seam:

  retaps counted BARS      `_advance` incremented on every bar price sat inside a zone, so a zone
                           visited twice reported `retaps=16`. `bx_sd_strength` rewards retaps as
                           evidence the zone is respected, and grinding sideways inside a zone is the
                           OPPOSITE of respecting it — the count was highest where the zone was weakest.
  one heads-up per ZONE    the mitigation dedup key had no visit component, so the FIRST tap alerted
                           and every later retap was silently swallowed — the opposite of the rule
                           that a wick tap signals AND its retap signals again.
  the card said nothing    a wick-only sweep and a full body mitigation rendered identically, while a
                           comment claimed "the card distinguishes them".
  strength lost its HTF    `detect_setup` called `score()` with no `htf_map`, so HTF confluence — the
                           user's first-named input and the heaviest weight — scored 0 of 196 zones.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                            # noqa: E402
from strategies.bx_sd_zones import Zone                                  # noqa: E402
from strategies.bx_sd_registry import MarkedZone, _advance               # noqa: E402
from strategies.bx_sd_strength import score, mitigation_note             # noqa: E402
from strategies.bx_sd_mitigation import mitigation_signal                # noqa: E402

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


def C(t, o, h, l, c):
    return Candle(time=1700000000 + t * 14400, open=o, high=h, low=l, close=c,
                  volume=0, timeframe="H4")


def demand(**kw):
    d = dict(direction="demand", top=1.1020, bottom=1.1000, proximal=1.1020, distal=1.1000,
             eq50=1.1010, kind="institutional", ifc_time=0, origin_time=0, state="unmitigated")
    d.update(kw)
    return MarkedZone(**d)


IN   = lambda t: C(t, 1.1030, 1.1035, 1.1005, 1.1012)   # body inside the zone
AWAY = lambda t: C(t, 1.1060, 1.1080, 1.1055, 1.1075)   # entirely clear of the zone

# ── A TAP MEANS THE BAR AND THE BAND OVERLAP ─────────────────────────────────────────────────────
# Fixed 2026-08-25 in THREE places at once (`MarkedZone.tapped_by`, `bx_sd_ltf.find_ltf_choch`,
# `bx_sd_zones._is_mitigated`) — each asked only half the question. For a demand zone: "did the bar
# reach DOWN to the top?" and never "did it also reach UP to the bottom?", so a bar sitting ENTIRELY
# BELOW the zone reported a tap. Leaving any one copy would have made fixing the others pointless.
print("A TAP IS AN OVERLAP — not 'the bar got past the near edge'")
_z = demand()                                            # 1.1000 - 1.1020
chk("a bar inside the band taps it", _z.tapped_by(C(1, 1.1030, 1.1035, 1.1005, 1.1012)), True)
chk("a bar straddling the whole band taps it", _z.tapped_by(C(1, 1.1050, 1.1060, 1.0980, 1.0990)), True)
chk("a bar wholly ABOVE it does not", _z.tapped_by(C(1, 1.1060, 1.1080, 1.1055, 1.1075)), False)
chk("a bar wholly BELOW it does not — THE BUG",
    _z.tapped_by(C(1, 1.0960, 1.0975, 1.0950, 1.0955)), False)
chk("touching the top edge exactly still counts",
    _z.tapped_by(C(1, 1.1030, 1.1040, 1.1020, 1.1025)), True)
_s = demand(direction="supply", proximal=1.1000, distal=1.1020)
chk("mirrored: a bar wholly ABOVE a supply zone does not tap it — THE BUG",
    _s.tapped_by(C(1, 1.1080, 1.1090, 1.1070, 1.1075)), False)
chk("  ...and a bar inside it does", _s.tapped_by(C(1, 1.1015, 1.1025, 1.1005, 1.1010)), True)
teeth("the one-sided test would have called a bar far below a demand zone a tap",
      C(1, 1.0960, 1.0975, 1.0950, 1.0955).low <= _z.top          # what the old code asked
      and _z.tapped_by(C(1, 1.0960, 1.0975, 1.0950, 1.0955)) is False)

print()
print("A RETAP IS A RETURN VISIT, NOT A BAR")
z = demand()
_advance(z, IN(1))                                   # first mitigation — not a retap
chk("the first tap is a mitigation, not a retap", z.retaps, 0)
for t in (2, 3, 4):
    _advance(z, IN(t))                               # LINGERS three more bars
chk("three more bars inside the same visit add nothing", z.retaps, 0)
chk("  and the zone remembers it is inside", z.in_zone, True)
_advance(z, AWAY(5))
chk("leaving clears in_zone", z.in_zone, False)
# CHANGED 2026-08-23 — this read "a full-height departure earns 'respected'", because the reaction
# was a DISTANCE (`REACT_MULT = 1.0`, a body close a full zone-height clear). It is now a CANDLE
# COUNT: `REACT_BARS` consecutive closed bars clear of the zone. One bar away is no longer enough.
chk("  ONE bar away is not yet the reaction", z.state, "body_mitigated")
_advance(z, AWAY(51)); _advance(z, AWAY(52))
chk("  three consecutive bars clear earns 'respected'", z.state, "respected")
_advance(z, IN(6))
chk("COMING BACK is the retap", z.retaps, 1)
_advance(z, IN(7))
chk("  lingering on the retap still adds nothing", z.retaps, 1)
# The old rule was `if state != "unmitigated": retaps += 1` on every bar inside — 6 bars in the zone
# above, minus the first (unmitigated), would have scored 5.
teeth("bars-inside and visits actually differ here", z.retaps == 1)

print()
print("live_visit() — the heads-up dedup unit")
fresh = demand()
chk("an untouched zone is visit 0", fresh.live_visit(), 0)
lingering = demand(state="body_mitigated", retaps=0, in_zone=True)
chk("still inside -> same visit, so the key does not change", lingering.live_visit(), 0)
returning = demand(state="respected", retaps=0, in_zone=False)
chk("came back -> the NEXT visit, so the key changes", returning.live_visit(), 1)
later = demand(state="respected", retaps=3, in_zone=False)
chk("  and it tracks the count", later.live_visit(), 4)
teeth("a lingering zone and a returning zone get DIFFERENT keys",
      lingering.live_visit() != returning.live_visit())

print()
print("STRENGTH — HTF confluence must actually arrive")
book = [demand(ifc_time=1)]
bars = [C(i, 1.1000, 1.1010, 1.0990, 1.1005) for i in range(5)]
as_zone = Zone(direction="demand", top=1.1020, bottom=1.1000, proximal=1.1020, distal=1.1000,
               eq50=1.1010, origin_index=0, ifc_index=1)
htf_map = {"Daily": [Zone(direction="demand", top=1.1050, bottom=1.0990, proximal=1.1050,
                          distal=1.0990, eq50=1.1020, origin_index=0, ifc_index=1)]}
no_htf = score(book[0], book, bars)                                     # the old call shape
with_htf = score(book[0], book, bars, htf_map=htf_map, as_zone=as_zone)
chk("without htf_map the backing is empty (the bug)", no_htf.htf, [])
chk("with it, the Daily zone is found", with_htf.htf, ["Daily"])
chk("  and it moves the score", with_htf.score > no_htf.score, True)
chk("  by the full HTF weight", with_htf.score - no_htf.score, 3)
teeth("the two call shapes really diverge", no_htf.score != with_htf.score)

print()
print("THE CARD — a wick sweep and a body mitigation must not read the same")
wick_note = mitigation_note(demand(state="wick_mitigated"))
body_note = mitigation_note(demand(state="body_mitigated"))
chk("wick-only says so", "WICKED ONLY" in wick_note, True)
chk("body says so", "Properly mitigated" in body_note, True)
chk("a retap of a spent zone carries a caution",
    "CAUTION" in mitigation_note(demand(state="respected", retaps=2)), True)
sig = mitigation_signal(as_zone, "GBP/JPY", [], 3, "BX-S/D", "bx_sd_watch",
                        note=wick_note, retaps=2)
body = " | ".join(sig.technical_reasons)
chk("the note reaches the card", "WICKED ONLY" in body, True)
chk("  and so does the visit number", "Return visit #2" in body, True)
bare = " | ".join(mitigation_signal(as_zone, "GBP/JPY", [], 3, "BX-S/D", "bx_sd_watch").technical_reasons)
chk("an un-noted card carries neither (the old output)", ("WICKED" in bare or "visit" in bare), False)
teeth("the card actually changed", body != bare)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
