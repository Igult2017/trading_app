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
from shared.swing_points import find_swing_points
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


def ltf_confluence(setup: SetupResult, ltf: list[Candle], pip: float = 0.0001,
                   higher: list[list[Candle]] | None = None) -> LTFConfluence:
    """`ltf` = the primary confluence TF (15M) — its CHoCH inside the zone is the MANDATORY confirm.
    `higher` = optional slower confluence TFs (1H / 30M); a CHoCH inside the zone on those is a
    strength BONUS (they lag, so they are never required — the 15M confirm keeps the signal timely)."""
    r = LTFConfluence()
    if not setup.active:
        r.reason = "no active 4H setup"; return r
    if len(ltf) < 20:
        r.reason = "not enough LTF history"; return r
    buy      = setup.direction == "buy"
    zdir     = "demand" if buy else "supply"
    want_dir = "up"     if buy else "down"

    choch = find_ltf_choch(ltf, want_dir, setup.zone, zdir)
    if choch is None:
        r.reason = "no LTF CHoCH inside the 4H zone (unconfirmed — no blind entry)"; return r
    if not _choch_valid(ltf, choch, zdir):
        r.reason = "LTF CHoCH reversed off a higher low — inducement still unswept (premature)"; return r
    r.confirmed = True

    refined = refine_zone(ltf, zdir, setup.zone, pip)
    r.refined_zone = refined
    z = refined or setup.zone                     # refined POI when available, else the 4H zone
    r.entry = z.proximal
    r.sl    = z.distal - 2 * pip if buy else z.distal + 2 * pip
    r.risk_pips = round(abs(r.entry - r.sl) / pip, 1)

    # ---- confluence score ----
    higher_confirms = sum(1 for hc in (higher or [])
                          if len(hc) >= 20 and find_ltf_choch(hc, want_dir, setup.zone, zdir) is not None)
    pricing = setup.confluences.get("pricing", "equilibrium")
    div     = rsi_divergence(ltf, setup.direction)
    score   = 25                                  # 15M CHoCH confirmed (mandatory floor)
    score  += 20 if pricing in ("discount", "premium") else 10
    score  += 15 if div else 0
    score  += (20 if r.risk_pips <= 5 else 12 if r.risk_pips <= 10 else 4) if refined else 4
    score  += 10 * higher_confirms                # H1 / 30M also CHoCH'd inside the zone
    score   = min(100, score)

    r.score  = score
    r.passed = score >= _PASS
    r.grade  = "A" if score >= 80 else "B" if score >= _PASS else "C" if score >= 50 else "reject"
    r.details = {"choch_index": choch.index, "pricing": pricing, "ltf_divergence": div,
                 "refined": refined is not None, "risk_pips": r.risk_pips,
                 "higher_tf_confirms": higher_confirms}
    r.reason  = "confirmed" if r.passed else f"confluence too weak (score {score} < {_PASS})"
    return r
