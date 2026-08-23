"""
BX-S/D — the zone lifecycle: validation, wick vs body mitigation, retaps, and breaks.

WHY THIS EXISTS. Two rules had been invented and neither is in the book (167 pages searched, zero
mentions of a candle count on the break):

  BREAK_SPAN = 6   structure had to break within 6 bars AFTER the IFC. It silently discarded the most
                   ordinary zone there is — a pullback origin inside an already-broken leg — and cost
                   a real GBP/JPY setup on 2026-07-15/29.
  200-bar window   a zone older than ~33 days did not expire, it CEASED TO EXIST, which makes
                   premarking pointless.

Both are gone. This file exists so neither comes back, and so the rules that replaced them are
pinned: mitigation by wick OR body, break by body only, retaps allowed, zones persist.

Every assertion has a TEETH case. No P&L, no win rate — lifecycle only.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                       # noqa: E402
from strategies.bx_sd_registry import LIVE_STATES, MarkedZone, _advance, _broke_structure  # noqa: E402

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


class E:                                   # a structure event
    def __init__(self, index, direction):
        self.index, self.direction = index, direction


# ── FACTOR 2: the break may PRECEDE the IFC ──────────────────────────────────────────────────────
print("FACTOR 2 — a zone belongs to a leg, not to a 6-bar clock")
# The real GBP/JPY case: UP break at 134, demand zone IFC at 136.
ev = [E(107, "up"), E(134, "up"), E(160, "down")]
chk("break 2 bars BEFORE the IFC now validates a demand zone (the 15 Jul case)",
    _broke_structure(ev, "up", 136), True)
chk("  and at the second IFC too", _broke_structure(ev, "up", 137), True)

# THE 27 JUL REGRESSION: prevailing structure runs AGAINST the zone -> must still be rejected.
ev_down = [E(50, "up"), E(130, "down")]
chk("REGRESSION 27 Jul: prevailing structure DOWN, demand candidate -> still rejected",
    _broke_structure(ev_down, "up", 131), False)
chk("  a supply candidate in that same down leg IS valid",
    _broke_structure(ev_down, "down", 131), True)
# a later break in the wanted direction still rescues a zone
chk("a break AFTER the IFC still validates", _broke_structure([E(200, "up")], "up", 150), True)
chk("no break in the zone's direction at all -> rejected", _broke_structure(ev_down, "up", 200), False)

teeth("the leg test", _broke_structure(ev_down, "up", 131) is False)
teeth("the direction requirement", _broke_structure([E(10, "down")], "up", 20) is False)

# ── MITIGATION: wick vs body ─────────────────────────────────────────────────────────────────────
print()
print("MITIGATION — wick OR body, and they are DIFFERENT events")
z = demand()
_advance(z, C(1, 1.1050, 1.1055, 1.1010, 1.1045))       # wick in, body stays above
chk("wick enters, body outside -> wick_mitigated", z.state, "wick_mitigated")
chk("  and the zone is still live", z.live, True)
chk("  wick_only flag set", z.wick_only, True)

z2 = demand()
_advance(z2, C(1, 1.1030, 1.1035, 1.1005, 1.1012))      # body closes inside
chk("body enters the zone -> body_mitigated", z2.state, "body_mitigated")
chk("  and it counts as spent", z2.spent, True)

teeth("the wick/body split", demand().body_in(C(1, 1.1050, 1.1055, 1.1010, 1.1045)) is False)

# ── BREAK: body close only ───────────────────────────────────────────────────────────────────────
print()
print("BREAK — a body close beyond the distal, never a wick")
z3 = demand()
_advance(z3, C(1, 1.1030, 1.1035, 1.0980, 1.1015))      # wick THROUGH the distal, closes inside
chk("wick through the distal, close inside -> NOT broken", z3.state != "broken", True)
chk("  it reads as mitigated instead", z3.state, "body_mitigated")
z4 = demand()
_advance(z4, C(1, 1.1030, 1.1035, 1.0980, 1.0985))      # closes beyond
chk("body CLOSE beyond the distal -> broken", z4.state, "broken")
chk("  and broken is terminal (not live)", z4.live, False)
teeth("the body-close rule", demand().broken_by(C(1, 1.1030, 1.1035, 1.0980, 1.1015)) is False)

# ── RETAPS ───────────────────────────────────────────────────────────────────────────────────────
print()
print("RETAPS — a tap never ends a zone")
z5 = demand()
_advance(z5, C(1, 1.1050, 1.1055, 1.1010, 1.1045))      # wick tap
# CHANGED 2026-08-23 — the reaction is a CANDLE COUNT now (`REACT_BARS` consecutive closed bars
# clear of the zone), not a distance. This used to be one bar closing a full zone-height away.
_advance(z5, C(2, 1.1060, 1.1080, 1.1055, 1.1075))      # away — bar 1 of 3
chk("one bar clear is not the reaction", z5.state, "wick_mitigated")
_advance(z5, C(21, 1.1060, 1.1080, 1.1055, 1.1075))     # bar 2
_advance(z5, C(22, 1.1060, 1.1080, 1.1055, 1.1075))     # bar 3
chk("three consecutive bars clear -> respected", z5.state, "respected")
_advance(z5, C(3, 1.1030, 1.1035, 1.1005, 1.1012))      # comes BACK
chk("a respected zone that is retapped is NOT dead", z5.live, True)
chk("  the retap is counted", z5.retaps >= 1, True)
# ONCE RESPECTED, ALWAYS RESPECTED. Letting a body retap demote it to body_mitigated moved the zone
# out of the RETEST path (grade B/A) into the fresh cascade (C+) — trading a PROVEN zone at a LOWER
# bar than an unproven one. Caught in review; this pins it.
chk("  and it STAYS respected (retest path keeps it, at the B/A bar)", z5.state, "respected")
z5b = demand(state="respected")
_advance(z5b, C(9, 1.1030, 1.1035, 1.0980, 1.0985))     # body close beyond the distal
chk("  but a respected zone can still BREAK", z5b.state, "broken")
teeth("the once-respected rule", demand(state="respected") is not None
      and z5.state == "respected" and z5.retaps >= 1)

print()
print("PERSISTENCE — every non-broken state stays live")
chk("live states are exactly the four non-broken ones", sorted(LIVE_STATES),
    ["body_mitigated", "respected", "unmitigated", "wick_mitigated"])
chk("'broken' is not live", "broken" in LIVE_STATES, False)
teeth("the persistence rule", demand(state="broken").live is False)

print()
print("A ZONE IS MARKED ONLY ONCE ITS QUALIFYING BREAK HAS PRINTED (2026-08-15)")
# HIS RULE: "zones dont form immediately but as its features develop along the way. For example BOS
# is not instant so we cant make it instantly."
#
# THE PROPERTY REPLAY DETERMINISM COULD NOT SEE. `_broke_structure` searched the whole event list, so
# a break 10 or 100 bars in the FUTURE qualified a zone on the bar after its imbalance. Both a short
# and a long build did that identically, so N-vs-N+1 agreed and the check passed. Measured on 3,500
# real H4 bars before the fix: 247 of 720 GBP/USD zones (34%) and 236 of 724 EUR/USD (33%) were
# marked early — median 10 bars, worst 111 (18.5 days). A zone marked early is AGED across bars on
# which it was not a zone, so taps and "respected" accrue from price that predates it.
from strategies.bx_sd_registry import _broke_structure, build          # noqa: E402
from strategies.bx_sd_structure import map_structure                   # noqa: E402
from shared.mtf_utils import closed_only                               # noqa: E402
import csv as _csv                                                     # noqa: E402

_CT = r"C:\Users\FSD\trading_app_data\ctrader"


def _load_bars(fn):
    """Real broker H4. Returns [] when the file is absent so this section SKIPS rather than errors."""
    p = os.path.join(_CT, fn)
    if not os.path.exists(p):
        return []
    out = []
    for r in _csv.reader(open(p, newline="")):
        if r and r[0].strip().lstrip("-").isdigit():
            out.append(Candle(time=int(r[0]), open=float(r[1]), high=float(r[2]), low=float(r[3]),
                              close=float(r[4]), volume=0.0, timeframe="H4"))
    return sorted(out, key=lambda c: c.time)

_ev = [type("E", (), {"direction": "up", "index": 40})()]
chk("a FUTURE break does not qualify a zone now", _broke_structure(_ev, "up", 10, 20), False)
chk("  ...and does once the bar arrives", _broke_structure(_ev, "up", 10, 40), True)
chk("  unbounded still sees it (the isolated-arm case)", _broke_structure(_ev, "up", 10, None), True)
teeth("the future-break bound", _broke_structure(_ev, "up", 10, 39) is False)

for _pair, _f in (("GBP/USD", "GBPUSD_H4real.csv"), ("EUR/USD", "EURUSD_H4real.csv")):
    _bars = _load_bars(_f)
    if len(_bars) < 400:
        continue
    _cb = closed_only(_bars)
    _idx = {c.time: i for i, c in enumerate(_cb)}
    _events = map_structure(_cb).events
    _early = 0
    for _z in build(_bars):
        if _z.marked_at is None or _z.ifc_time not in _idx or _z.marked_at not in _idx:
            continue
        _ifc, _mk = _idx[_z.ifc_time], _idx[_z.marked_at]
        _want = "up" if _z.direction == "demand" else "down"
        _prior = [e for e in _events if e.index <= _ifc]
        if _prior and _prior[-1].direction == _want:
            continue                                   # pullback origin: the break already existed
        _fut = [e.index for e in _events if e.direction == _want and e.index > _ifc]
        if _fut and min(_fut) > _mk:
            _early += 1
    chk(f"{_pair}: zones marked before their break printed", _early, 0)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
