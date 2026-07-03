"""
BX-S/D — LTF confluence, refinement & scoring (Phase 6).

After the 4H setup gate (Phase 5) is active, BX-S/D drops to the lower timeframes
(1H / 30M / 15M) to CONFIRM and REFINE before ever handing off to the entry TF:

  * CONFIRM (mandatory) — a CHoCH in the trade direction must print INSIDE the 4H zone.
    This is the locked "confirmed entries only" rule: no blind limit into the zone; the LTF
    must change character first.
  * REFINE — collapse the wide 4H zone onto the tight LTF POI that produced the CHoCH, so the
    entry TF works a ~1-3 pip zone instead of the whole 4H block.
  * SCORE — grade the stack (CHoCH + pricing + RSI divergence + refinement tightness) so only
    high-grade setups reach the entry TF (win-rate filter).

Assembles Phases 1-5; reuses only generic shared resources.
"""
from dataclasses import dataclass, field

from core.types import Candle
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_zones import find_zones, Zone
from strategies.bx_sd_confluence import rsi_divergence
from strategies.bx_sd_setup import SetupResult

_RECENT = 20
_PASS   = 65     # min score to reach the entry TF


@dataclass
class LTFConfluence:
    confirmed:    bool = False           # a CHoCH inside the 4H zone printed (character changed)
    passed:       bool = False           # confirmed AND score >= _PASS (clear to hand to entry TF)
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
    tapped = any((ltf[j].low <= zone.top) if zdir == "demand" else (ltf[j].high >= zone.bottom)
                 for j in range(lo, e.index + 1))
    return e if tapped else None


def refine_zone(ltf: list[Candle], zdir: str, zone: Zone,
                pip: float = 0.0001, tol_pips: float = 1.0) -> Zone | None:
    """Tightest fresh LTF zone sitting inside the 4H zone — the refined POI for the entry TF."""
    tol = tol_pips * pip
    inside = [z for z in find_zones(ltf)
              if z.direction == zdir and not z.mitigated
              and z.bottom >= zone.bottom - tol and z.top <= zone.top + tol]
    return inside[-1] if inside else None


def ltf_confluence(setup: SetupResult, ltf: list[Candle], pip: float = 0.0001) -> LTFConfluence:
    r = LTFConfluence()
    if not setup.active:
        r.reason = "no active 4H setup"; return r
    if len(ltf) < 20:
        r.reason = "not enough LTF history"; return r
    buy      = setup.direction == "buy"
    zdir     = "demand" if buy else "supply"
    want_dir = "up"     if buy else "down"

    if find_ltf_choch(ltf, want_dir, setup.zone, zdir) is None:
        r.reason = "no LTF CHoCH inside the 4H zone (unconfirmed — no blind entry)"; return r
    r.confirmed = True
    choch = find_ltf_choch(ltf, want_dir, setup.zone, zdir)

    refined = refine_zone(ltf, zdir, setup.zone, pip)
    r.refined_zone = refined
    z = refined or setup.zone                     # refined POI when available, else the 4H zone
    r.entry = z.proximal
    r.sl    = z.distal - 2 * pip if buy else z.distal + 2 * pip
    r.risk_pips = round(abs(r.entry - r.sl) / pip, 1)

    # ---- confluence score ----
    score   = 30                                  # CHoCH confirmed (mandatory floor)
    pricing = setup.confluences.get("pricing", "equilibrium")
    score  += 25 if pricing in ("discount", "premium") else 12
    div     = rsi_divergence(ltf, setup.direction)
    score  += 20 if div else 0
    score  += (25 if r.risk_pips <= 5 else 15 if r.risk_pips <= 10 else 8) if refined else 5

    r.score  = score
    r.passed = score >= _PASS
    r.grade  = "A" if score >= 80 else "B" if score >= _PASS else "C" if score >= 50 else "reject"
    r.details = {"choch_index": choch.index, "pricing": pricing, "ltf_divergence": div,
                 "refined": refined is not None, "risk_pips": r.risk_pips}
    r.reason  = "confirmed" if r.passed else f"confluence too weak (score {score} < {_PASS})"
    return r
