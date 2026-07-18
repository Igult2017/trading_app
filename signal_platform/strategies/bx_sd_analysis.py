"""
BX-S/D — analysis-TF refinement + MTF alignment (the book's Micro step).

After the 4H setup (Macro), the book REFINES the zone on the analysis TF before the entry
(Ch.15 steps 2-5: "refine the same zone… if refinement gives more than one obvious zone, go back UP
to the TF which provides one clear zone"). BX cycles 15M -> 30M -> 1H and keeps the CLEAREST (tightest)
refined POI. Alignment here — a supporting zone OR a CHoCH in the 4H-bias direction — is the B/A-grade
confluence. It is NOT a hard gate: the mandatory confirmation is the 1M/5M entry (bx_sd_entry). This
step only refines and reports alignment so the cascade can grade the stack.
"""
from core.types import Candle
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_ltf import LTFConfluence, refine_zone, find_ltf_choch
from strategies.bx_sd_confluence import rsi_divergence
from strategies.bx_sd_setup import SetupResult


def _tight(z: Zone) -> float:
    return z.top - z.bottom


def analysis_refine(setup: SetupResult, analysis_tfs: list[tuple[list[Candle], str]],
                    pip: float = 0.0001) -> LTFConfluence:
    """Refine the 4H zone across the analysis TFs (15M/30M/1H — clearest wins) and report MTF alignment.
    Returns an LTFConfluence with passed=True (never a gate) and confirmed = at least one analysis TF
    aligned (a refined supporting zone or a bias-direction CHoCH). The 1M/5M entry is the real confirm."""
    r = LTFConfluence(passed=True)
    if not setup.active:
        r.reason = "no active 4H setup"; return r
    buy      = setup.direction == "buy"
    zdir     = "demand" if buy else "supply"
    want_dir = "up"     if buy else "down"

    best: Zone | None = None
    aligned: list[str] = []
    div = False
    for candles, label in analysis_tfs:
        if len(candles) < 20:
            continue
        refined = refine_zone(candles, zdir, setup.zone, pip)
        choch   = find_ltf_choch(candles, want_dir, setup.zone, zdir) is not None
        if refined is not None or choch:
            aligned.append(label)                          # this analysis TF supports the 4H bias
        if refined is not None and (best is None or _tight(refined) < _tight(best)):
            best = refined                                 # keep the tightest (clearest) refined POI
        if not div and rsi_divergence(candles, setup.direction):
            div = True

    z = best or setup.zone
    r.refined_zone = best
    r.confirmed    = bool(aligned)                         # analysis-TF alignment -> B/A (NOT a gate)
    r.entry        = z.proximal
    r.sl           = z.distal - 2 * pip if buy else z.distal + 2 * pip
    r.risk_pips    = round(abs(r.entry - r.sl) / pip, 1)
    r.details      = {"aligned_tfs": aligned, "refined": best is not None, "ltf_divergence": div}
    r.reason       = f"analysis-TF aligned: {', '.join(aligned)}" if aligned else "no analysis-TF alignment (C)"
    return r
