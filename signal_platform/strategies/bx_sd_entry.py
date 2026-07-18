"""
BX-S/D — entry-TF execution & trigger (Phase 7).

The final step of the cascade: once the LTF confluence (Phase 6) has confirmed + refined,
BX-S/D drops to the entry TF (1M / 5M) INSIDE the refined POI and waits for the actual
trigger before locking a signal:

  * TRIGGER (mandatory) — a CHoCH in the trade direction on the entry TF as price reacts off
    the refined zone. The last confirmation; still never a blind limit.
  * ENTRY  — the refined proximal edge (or the 50% equilibrium of the zone to tighten a wider POI).
  * SL     — just beyond the refined distal (~2 pip) — the whole point of refinement.
  * TP     — the NEXT unmitigated opposite zone that is BOOK-VALID (3 factors — a candle beside a
    gap has no orders behind it to fill us); if none, the fib extension (-0.272 / -0.618). The chosen
    TP must clear min RR, else the setup is skipped.

Assembles Phases 1-6; reuses only generic shared resources.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_zones import find_zones
from strategies.bx_sd_validity import valid_zones
from strategies.bx_sd_ltf import find_ltf_choch, _choch_valid, refine_zone, LTFConfluence
from strategies.bx_sd_setup import SetupResult


def _flip_ok(entry_tf: list[Candle], want_dir: str, n: int = 3) -> bool:
    """Book S/D-FLIP entry ('tug of war'): a reaction FAILS to make a new extreme (a higher-low for a
    buy / lower-high for a sell), then the reaction point is TAKEN OUT — orders have flipped."""
    pts   = find_swing_points(entry_tf, n)
    highs = [p for p in pts if p.is_high]
    lows  = [p for p in pts if not p.is_high]
    if want_dir == "up":
        return len(lows) >= 2 and bool(highs) and lows[-1].price > lows[-2].price \
            and entry_tf[-1].close > highs[-1].price
    return len(highs) >= 2 and bool(lows) and highs[-1].price < highs[-2].price \
        and entry_tf[-1].close < lows[-1].price


@dataclass
class EntryTrigger:
    triggered: bool = False
    direction: str = ""
    entry: float = 0.0
    sl: float = 0.0
    tp: float = 0.0
    rr: float = 0.0
    reason: str = ""
    details: dict = field(default_factory=dict)


def _rr(entry: float, sl: float, tp: float, buy: bool) -> float:
    risk = (entry - sl) if buy else (sl - entry)
    rew  = (tp - entry) if buy else (entry - tp)
    return rew / risk if risk > 0 else 0.0


def _tp_candidates(setup: SetupResult, h4: list[Candle], entry: float, buy: bool,
                   pip: float = 0.0001) -> list[float]:
    """Next unmitigated opposite zone(s) first (real liquidity targets), fib extensions as fallback.

    The target must be a BOOK-VALID zone (3 factors), not any candle beside a gap. We take the FIRST
    candidate clearing min RR, so an invalid one sitting nearer would be picked ahead of a real zone
    and we would aim at a level with no orders resting behind it — a TP that never fills.
    """
    opp = "supply" if buy else "demand"
    cands = [z.proximal for z in valid_zones(h4, find_zones(h4), pip)
             if z.direction == opp and not z.mitigated]
    cands += [setup.tp1, setup.tp2]
    if buy:
        return sorted(c for c in cands if c > entry)
    return sorted((c for c in cands if c < entry), reverse=True)


def entry_trigger(conf: LTFConfluence, setup: SetupResult, entry_tf: list[Candle],
                  h4: list[Candle], pip: float = 0.0001, min_rr: float = 2.0) -> EntryTrigger:
    r = EntryTrigger(direction=setup.direction)
    if not conf.passed:
        r.reason = "LTF confluence did not pass"; return r
    if len(entry_tf) < 20:
        r.reason = "not enough entry-TF history"; return r
    buy      = setup.direction == "buy"
    zdir     = "demand" if buy else "supply"
    want_dir = "up"     if buy else "down"
    z        = conf.refined_zone or setup.zone

    # Book entry methods on the entry TF (CHoCH and/or S/D flip). Both = "god setup".
    # INDUCEMENT GUARD — the book's "enter AFTER the manipulation": the CHoCH must reverse off a SWEPT
    # swing (a LIQUIDITY GRAB). A reversal that left resting liquidity below (demand) / above (supply)
    # is premature — that liquidity is a magnet. This is the entry-time liquidity sweep the whole
    # method hinges on; the S/D flip already requires its reaction point to be taken out (a sweep too).
    choch_e = find_ltf_choch(entry_tf, want_dir, z, zdir)
    choch = choch_e is not None and _choch_valid(entry_tf, choch_e, zdir)
    flip  = _flip_ok(entry_tf, want_dir)
    if not (choch or flip):
        r.reason = "no entry-TF CHoCH (inducement swept) or S/D-flip off the zone (no trigger yet)"; return r
    r.triggered = True
    method = "CHoCH+Flip (god setup)" if (choch and flip) else ("CHoCH" if choch else "S/D Flip")

    # Refine DOWN to the ENTRY TF for a tight SL (book Ch.15 steps 3-4: "refine down to 1M"). The CHoCH
    # above is checked against the wider (analysis/4H) zone; the SL comes off the tightest entry-TF POI.
    # This is what lets a bare-C setup (no analysis-TF refinement) still fit a ~2-pip SL and clear RR.
    z = refine_zone(entry_tf, zdir, z, pip) or z

    # entry: proximal when the zone already fits a 2-pip SL, else the 50% EQUILIBRIUM (book: use 50%
    # when a max-2-pip SL can't cover the whole zone) so the SL stays ~<= 2 pip.
    use_eq50 = (z.top - z.bottom) / pip > 2.0
    entry = z.eq50 if use_eq50 else z.proximal
    sl    = z.distal - 2 * pip if buy else z.distal + 2 * pip
    r.entry, r.sl = entry, sl

    tp = next((c for c in _tp_candidates(setup, h4, entry, buy, pip)
              if _rr(entry, sl, c, buy) >= min_rr), None)
    if tp is None:
        r.reason = f"no TP clears {min_rr}R"; r.triggered = False; return r
    r.tp = tp
    r.rr = round(_rr(entry, sl, tp, buy), 2)
    r.details = {"risk_pips": round(abs(entry - sl) / pip, 1),
                 "entry_mode": "eq50" if use_eq50 else "proximal", "method": method,
                 "tp_source": "opposite_zone" if tp not in (setup.tp1, setup.tp2) else "fib_extension"}
    r.reason = "triggered"
    return r
