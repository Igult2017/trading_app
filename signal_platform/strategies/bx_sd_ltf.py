"""
BX-S/D — LTF primitives: CHoCH detection, the INDUCEMENT guard, and zone refinement.

Shared building blocks for the confirmation cascade. The orchestration lives elsewhere:
`bx_sd_analysis.analysis_refine` refines + reports MTF alignment, `bx_sd_entry.entry_trigger` is the
mandatory confirmation entry, and `bx_sd_confirm.confirm_grade` assembles and grades the stack.

  * find_ltf_choch — the most recent CHoCH in the trade direction whose reversal tapped the zone.
  * _choch_valid  — INDUCEMENT guard: that reversal must have SWEPT the prior swing (grabbed the
    resting liquidity). The book's "enter AFTER the manipulation" — a reversal off an unswept swing
    leaves that liquidity as a magnet and is premature.
  * refine_zone   — collapse a wide zone onto the tight LTF POI inside it, so the entry works a
    ~1-3 pip zone instead of the whole block.

Reuses only generic shared resources.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_zones import find_zones, Zone

_RECENT = 20


@dataclass
class LTFConfluence:
    confirmed:    bool = False           # a CHoCH inside the 4H zone printed (character changed)
    passed:       bool = False           # cleared to hand to the entry TF (set by the caller)
    refined_zone: Zone | None = None
    entry:        float = 0.0
    sl:           float = 0.0
    risk_pips:    float = 0.0
    score:        int = 0
    grade:        str = "reject"
    details:      dict = field(default_factory=dict)
    reason:       str = ""


def find_ltf_choch(ltf: list[Candle], want_dir: str, zone: Zone, zdir: str, recent: int = _RECENT):
    """Most recent CHoCH in want_dir whose reversal tapped the 4H zone (else None)."""
    chochs = [e for e in map_structure(ltf).events if e.kind == "CHoCH" and e.direction == want_dir]
    if not chochs:
        return None
    e = chochs[-1]
    if e.index < len(ltf) - recent:
        return None
    lo = max(0, e.index - recent)
    # THE BAR AND THE BAND MUST OVERLAP — a second copy of the one-sided tap test, fixed with
    # `MarkedZone.tapped_by` on 2026-08-25 (see its docstring). Written one-sided, a lower-timeframe
    # bar sitting wholly BELOW a demand zone counted as having "tapped" it, so a change of character
    # that happened nowhere near the 4H zone could still be accepted as a reversal off it. Here the
    # blast radius is larger than in the registry: nothing closes an LTF bar out of the running the
    # way a body-close break retires a 4H zone, so price genuinely does sit past the band for long
    # stretches of the `recent` window.
    tapped = any(ltf[j].low <= zone.top and ltf[j].high >= zone.bottom
                 for j in range(lo, e.index + 1))
    return e if tapped else None


def _choch_valid(ltf: list[Candle], choch, zdir: str, recent: int = _RECENT) -> bool:
    """Inducement guard (book): enter only AFTER the inducement is taken. The swing the CHoCH reversed
    from must have SWEPT the prior swing (grabbed the resting liquidity) — for a demand the reversal
    low must be BELOW the previous swing low; a reversal off a HIGHER low leaves that liquidity resting
    below (a magnet) and is premature. Mirror for supply. Lenient when there is nothing yet to judge."""
    lo  = max(0, choch.index - recent)
    pts = find_swing_points(ltf)
    if zdir == "demand":
        lows = [p.price for p in pts if not p.is_high and lo <= p.index < choch.index]
        return len(lows) < 2 or lows[-1] < lows[-2]
    highs = [p.price for p in pts if p.is_high and lo <= p.index < choch.index]
    return len(highs) < 2 or highs[-1] > highs[-2]


def refine_zone(ltf: list[Candle], zdir: str, zone: Zone,
                pip: float = 0.0001, tol_pips: float = 1.0) -> Zone | None:
    """Most-recent fresh LTF zone whose entry edge sits inside the 4H zone and is TIGHTER than it —
    the refined POI. Anchoring on the proximal (not full containment) is robust to LTF reaction
    zones that straddle a 4H edge, which full containment would wrongly reject."""
    tol    = tol_pips * pip
    four_h = zone.top - zone.bottom
    inside = [z for z in find_zones(ltf)
              if z.direction == zdir and not z.mitigated
              and (zone.bottom - tol) <= z.proximal <= (zone.top + tol)
              and (z.top - z.bottom) < four_h]
    return inside[-1] if inside else None
