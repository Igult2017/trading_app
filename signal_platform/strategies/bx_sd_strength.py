"""
BX-S/D — how strong is this zone?

THE USER'S DEFINITION (2026-07-30), asked for explicitly rather than invented:

    "HTF confluence + violent departure. HTF confluence such as 1D, 1W or 1month. Also when zones are
     in order, the furthest in that order is likely to be respected. I think a retap of a zone is also
     a confirmation that it has been respected."

So four inputs, and nothing else:

  1. HTF CONFLUENCE — does a same-direction D1 / W1 / MN zone sit over this one? Reuses
     `bx_sd_htf.htf_backing`, which already answers exactly this and is already computed each scan.
  2. VIOLENT DEPARTURE — how hard price left. A zone price crawled away from is weak; one it fled is
     strong. Measured as the impulse's extent in zone-heights, so it is scale-free across pairs.
  3. DEPTH IN THE STACK — among overlapping same-side zones, the FURTHEST from price ranks highest.
     Shallower ones in front of it are the ones that get run through.
  4. RETAPS — a zone price returned to and did not break has demonstrated it holds.

THIS DOES NOT GATE ANYTHING. A weak zone still fires; it is labelled weak. Strength is information on
the card, and a tiebreaker when several zones are tapped at once — turning it into a filter would be
a trading-rule change nobody asked for.
"""
from dataclasses import dataclass

from core.types import Candle
from strategies.bx_sd_htf import htf_backing
from strategies.bx_sd_registry import MarkedZone

# Weights. Deliberately blunt integers: this is a RANKING, and pretending to two decimal places of
# precision about "violence" would be false confidence.
_W_HTF = 3          # per higher timeframe backing it (max 3 -> D1 + W1 + MN)
_W_VIOLENT = 2      # departure of >= _VIOLENT_MULT zone-heights
_W_DEEPEST = 2      # furthest in a stack of overlapping same-side zones
_W_RETAP = 1        # per retap it survived (capped)
_VIOLENT_MULT = 3.0
_MAX_RETAP_POINTS = 2


@dataclass
class Strength:
    score: int
    htf: list[str]              # which of D1/W1/MN back it
    violent: bool
    deepest: bool
    retaps: int

    @property
    def label(self) -> str:
        if self.score >= 6:
            return "STRONG"
        return "MODERATE" if self.score >= 3 else "WEAK"

    def reasons(self) -> list[str]:
        out = []
        if self.htf:
            out.append(f"backed by {'+'.join(self.htf)}")
        if self.violent:
            out.append("violent departure")
        if self.deepest:
            out.append("furthest zone in the stack")
        if self.retaps:
            out.append(f"held {self.retaps} retap{'s' if self.retaps > 1 else ''}")
        return out or ["no confluence"]


def _departure(z: MarkedZone, bars: list[Candle]) -> bool:
    """Did price LEAVE violently? Measured from the zone's own bars forward, in zone-heights.

    Scale-free on purpose — 30 pips is a shove on GBP/JPY and a stampede on EUR/USD, so an absolute
    pip threshold would rank pairs against each other rather than zones.
    """
    h = z.height
    if h <= 0:
        return False
    after = [b for b in bars if b.time > z.ifc_time]
    if not after:
        return False
    if z.direction == "demand":
        reach = max(b.high for b in after[:12]) - z.top
    else:
        reach = z.bottom - min(b.low for b in after[:12])
    return reach >= _VIOLENT_MULT * h


def _is_deepest(z: MarkedZone, book: list[MarkedZone]) -> bool:
    """Furthest from current price among overlapping same-side zones — the last line, and the one the
    user expects to hold once the ones in front have been run."""
    peers = [o for o in book
             if o is not z and o.direction == z.direction and o.live
             and o.bottom <= z.top and z.bottom <= o.top]
    if not peers:
        return True
    return (z.bottom <= min(p.bottom for p in peers)) if z.direction == "demand" \
        else (z.top >= max(p.top for p in peers))


def score(z: MarkedZone, book: list[MarkedZone], bars: list[Candle],
          htf_map: dict | None = None, as_zone=None) -> Strength:
    """Rank one zone. `as_zone` is the plain Zone form htf_backing expects (bx_sd_registry.to_zone)."""
    htf: list[str] = []
    if htf_map and as_zone is not None:
        try:
            htf = htf_backing(as_zone, htf_map)
        except Exception:
            htf = []                     # confluence is a bonus; never let it break the scan
    violent = _departure(z, bars)
    deepest = _is_deepest(z, book)
    retap_pts = min(z.retaps, _MAX_RETAP_POINTS)
    total = (_W_HTF * len(htf) + (_W_VIOLENT if violent else 0)
             + (_W_DEEPEST if deepest else 0) + _W_RETAP * retap_pts)
    return Strength(score=total, htf=htf, violent=violent, deepest=deepest, retaps=z.retaps)


def mitigation_note(z: MarkedZone) -> str:
    """What the card must say about HOW this zone was mitigated — the user's rule, in his terms.

    THE `respected` BRANCH IS NOT OPTIONAL. The cascade fires ONLY on respected zones, so before it
    existed every entry card fell through to "Fresh — never tapped." — on a zone that had by
    definition been tapped. The user was shown that on a zone he had watched get wicked, alongside a
    line saying the same zone had been respected and pulled back from. Two claims that cannot both
    be true. `MarkedZone.mitigation_kind` retains the fact `state` overwrites; read it here.
    """
    if z.state == "wick_mitigated":
        return ("WICKED ONLY — the body never entered, so the orders were not filled. "
                "Price is likely to come back for a proper mitigation.")
    if z.retaps and z.state in ("body_mitigated", "respected"):
        return ("CAUTION: retap of a zone that had already been properly mitigated. "
                "The body traded it before, so it is largely spent.")
    if z.state == "respected":
        if z.mitigation_kind == "wick":
            return ("Respected after a WICK-ONLY tap — the body never entered, so the orders are "
                    "still loaded and price reacted away from it.")
        if z.mitigation_kind == "body":
            return "Respected — the body traded the zone and price reacted away from it."
        return "Respected — price reacted a full zone-height away from it."
    if z.state == "body_mitigated":
        return "Properly mitigated — the body entered the zone."
    return "Fresh — never tapped."
