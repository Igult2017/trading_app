"""
BX-S/D — entry-TF execution & trigger (Phase 7).

The final step of the cascade: once the LTF confluence (Phase 6) has confirmed + refined,
BX-S/D drops to the entry TF (1M / 5M) INSIDE the refined POI and waits for the actual
trigger before locking a signal:

  * TRIGGER (mandatory) — one of the book's THREE entry methods on the entry TF (Ch.9 step 4):
    CHoCH, S/D flip, or continuation BOS. Never a blind limit.
  * RESPECT — the 4H zone must be HELD, not ground against: the confirming close must sit
    _RESPECT_BUFFER of the zone height inside it, off the distal.
  * ENTRY  — the CONFIRMING BAR'S CLOSE. The confirmation is the signal, so we enter where price is,
    not at a level it has just reacted away from.
  * SL     — _SL_BUFFER_PIPS beyond the 4H ZONE's distal (never the refined POI).
  * TP     — a fixed _TP_R multiple of that risk.

Assembles Phases 1-6; reuses only generic shared resources.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_ltf import find_ltf_choch, _choch_valid, refine_zone, LTFConfluence
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_setup import SetupResult, _SL_BUFFER_PIPS, _TP_R, _RESPECT_BUFFER


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


def entry_trigger(conf: LTFConfluence, setup: SetupResult, entry_tf: list[Candle],
                  h4: list[Candle], pip: float = 0.0001, min_rr: float = 2.0,
                  session_candles: list[Candle] | None = None) -> EntryTrigger:
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
    # THIRD book method (Ch.9 step 4: "S/D flips - CHoCH - Continuation"): the entry TF's last
    # structure break is a BOS in the trade direction, i.e. the move is continuing. Built from
    # map_structure only — no FVG is wrapped as a zone; that path stays deleted.
    _last = map_structure(entry_tf).last_bos
    cont  = _last is not None and _last.direction == want_dir
    if not (choch or flip or cont):
        r.reason = ("no entry-TF reaction off the zone — none of CHoCH (inducement swept), "
                    "S/D flip, or continuation BOS")
        return r
    r.triggered = True
    method = ("CHoCH+Flip (god setup)" if (choch and flip)
              else "CHoCH" if choch else "S/D Flip" if flip else "Continuation")

    # Refine DOWN to the ENTRY TF for a tight SL (book Ch.15 steps 3-4: "refine down to 1M"). The CHoCH
    # above is checked against the wider (analysis/4H) zone; the SL comes off the tightest entry-TF POI.
    # This is what lets a bare-C setup (no analysis-TF refinement) still fit a ~2-pip SL and clear RR.
    z = refine_zone(entry_tf, zdir, z, pip) or z

    # THE ZONE MUST BE RESPECTED, not being ground against. User's rule: "the 4H distal will only guide
    # to ensure the 4H zone has been respected and the price has moved away from it a little, not
    # struggling to break it." Price sitting on the distal is a zone about to break, not one holding.
    zone4h = setup.zone or z
    h4_height = zone4h.top - zone4h.bottom
    if h4_height > 0:
        px = entry_tf[-1].close
        # distance INSIDE the zone, measured from the distal edge
        off_distal = (px - zone4h.distal) if buy else (zone4h.distal - px)
        if off_distal < _RESPECT_BUFFER * h4_height:
            r.reason = (f"4H zone not respected yet — price is {off_distal / pip:.1f} pips off the "
                        f"distal, needs {_RESPECT_BUFFER * h4_height / pip:.1f} (still struggling to break it)")
            r.triggered = False
            return r

    # ENTRY = WHERE THE REACTION IS, not a limit behind it. The confirmation IS the signal ("we enter in
    # 5M or 1M using confirmed entry so we are sure the price is in our favour"), so entering at the
    # confirming close is the whole point. It used to post a limit back at the refined POI — a level
    # price had just reacted away from — which is why 13-14% of signals fired with price ALREADY past
    # the entry and 22-29% never filled at all inside 24h.
    entry = entry_tf[-1].close

    # STOP comes from the 4H ZONE, never from the refined POI. User's rule: "mark zone in 4H and then
    # use it to enter where price can't wick us out — ~5 to 6 pips behind the 4H zone; we enter in 5M
    # or 1M using confirmed entry so we are sure price is in our favour, so we won't need a broader SL."
    #
    # This used to take the SL off the REFINED zone, which produced ~3 pip stops sitting inside noise:
    # spread was 20-30% of risk and any wick took the trade out. The 4H stop was already computed in
    # detect_setup and then silently discarded here.
    sl = zone4h.distal - _SL_BUFFER_PIPS * pip if buy else zone4h.distal + _SL_BUFFER_PIPS * pip
    r.entry, r.sl = entry, sl

    # TP is a FIXED 3R. User: "just leave TP at 3R — TP can take care of itself if we take care of
    # entry well." Structural targets are gone: hunting the first H4 level clearing 2R put the median
    # target at 20R (60+ pips off a 3-pip stop), which essentially never filled.
    risk = abs(entry - sl)
    if risk <= 0:
        r.reason = "zero risk (entry sits on the stop)"; r.triggered = False; return r
    tp = entry + _TP_R * risk if buy else entry - _TP_R * risk
    r.tp = tp
    r.rr = round(_rr(entry, sl, tp, buy), 2)
    r.details = {"risk_pips": round(risk / pip, 1),
                 "entry_mode": "confirmation_close", "method": method,
                 "tp_source": f"fixed_{_TP_R:g}R"}
    r.reason = "triggered"
    return r
