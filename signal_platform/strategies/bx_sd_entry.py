"""
BX-S/D — entry-TF execution & trigger (Phase 7).

The final step of the cascade: once the LTF confluence (Phase 6) has confirmed + refined,
BX-S/D drops to the entry TF (1M / 5M) INSIDE the refined POI and waits for the actual
trigger before locking a signal:

  * TRIGGER (mandatory) — one of the book's THREE entry methods on the entry TF (Ch.9 step 4):
    CHoCH, S/D flip, or continuation BOS. Never a blind limit.
  * RESPECT — the 4H zone must be HELD, not ground against: the confirming close must sit
    _RESPECT_BUFFER of the zone height inside it, off the distal.
  * ENTRY  — the START (proximal) of the refined 5M zone. The BOOK, p81: "you put your entry at
    the START of the supply/demand and the sl at the FURTHEST POINT of the supply/demand."
  * SL     — the FURTHEST POINT (distal) of that same 5M zone. No buffer, and NO SPREAD ADDED —
    the book says to add spread, the user said not to (2026-08-15).
  * TP     — a fixed _TP_R multiple of that risk.

Assembles Phases 1-6; reuses only generic shared resources.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_ltf import find_ltf_choch, _choch_valid, refine_zone, LTFConfluence
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_setup import SetupResult, _TP_R, _RESPECT_BUFFER

# `_PULLBACK_LOOKBACK = 24` (entry-TF bars) lived here and is DELETED, as is the 4H `pullback_4h` it
# was a second, tighter definition of — the whole pullback model went with the 2026-08-15 change to
# the document's entry.


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


def reaction_on(entry_tf: list[Candle], want_dir: str, zone, zdir: str,
                reversal_only: bool = False) -> str:
    """Is the entry TF (1M/5M) REACTING off this zone, and by which book method?

    Returns the method name — "CHoCH+Flip (god setup)" / "CHoCH" / "S/D Flip" / "Continuation" —
    or "" for no reaction.

    ONE DEFINITION OF "a confirmation in 1M or 5M", shared by the entry trigger and the tap alert
    (`bx_sd_tap_alert`). It was inline in `entry_trigger` until the tap alert needed the same
    question answered without an entry, a stop or a target. Two copies would drift, and the drift
    would be invisible: the room would be told a zone is "confirmed" while the cascade that decides
    whether to actually trade it disagrees.

    `reversal_only` drops the CONTINUATION arm. Continuation asks only "is the last entry-TF BOS in
    my direction", i.e. the move is still going — which is evidence at a zone price has already
    reacted from, and nearly nothing at a zone that has proven nothing yet. The tap alert fires on
    the unproven case, so it asks for a reversal signature; the entry trigger keeps all three.
    """
    # INDUCEMENT GUARD — the book's "enter AFTER the manipulation": the CHoCH must reverse off a
    # SWEPT swing (a LIQUIDITY GRAB). A reversal that left resting liquidity below (demand) / above
    # (supply) is premature — that liquidity is a magnet.
    choch_e = find_ltf_choch(entry_tf, want_dir, zone, zdir)
    choch = choch_e is not None and _choch_valid(entry_tf, choch_e, zdir)
    flip  = _flip_ok(entry_tf, want_dir)
    if choch and flip:
        return "CHoCH+Flip (god setup)"
    if choch:
        return "CHoCH"
    if flip:
        return "S/D Flip"
    if reversal_only:
        return ""
    # THIRD book method (Ch.9 step 4: "S/D flips - CHoCH - Continuation"): the entry TF's last
    # structure break is a BOS in the trade direction, i.e. the move is continuing. Built from
    # map_structure only — no FVG is wrapped as a zone; that path stays deleted.
    _last = map_structure(entry_tf).last_bos
    return "Continuation" if (_last is not None and _last.direction == want_dir) else ""


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
                  h4: list[Candle], pip: float = 0.0001,
                  session_candles: list[Candle] | None = None,
                  refine_tf: list[Candle] | None = None) -> EntryTrigger:
    # `min_rr` was a parameter here and was never read: TP is a fixed _TP_R multiple of the risk, so
    # RR is 3.0 by construction and there is nothing to threshold. Removed rather than left as a knob
    # that looks like it does something.
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
    method = reaction_on(entry_tf, want_dir, z, zdir)
    if not method:
        r.reason = ("no entry-TF reaction off the zone — none of CHoCH (inducement swept), "
                    "S/D flip, or continuation BOS")
        return r
    r.triggered = True

    # NO SECOND REFINEMENT HERE. There used to be a `z = refine_zone(entry_tf, zdir, z, pip) or z`
    # on this line, commented "the SL comes off the tightest entry-TF POI". That stopped being true
    # when the stop moved to the 4H distal (the user's rule, see below) — `z` was never read again,
    # so the call scanned every entry-TF bar for zones on every trigger and threw the answer away,
    # while its comment told the next reader the stop came from somewhere it does not. `refine_zone`
    # still runs once upstream (bx_sd_analysis) where its result IS used.

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

    # ENTRY AND STOP COME FROM THE REFINED 5M ZONE — the BOOK's method (p81), 2026-08-15.
    #
    #     "To enter off a CHoCH you put your ENTRY AT THE START of the supply/demand and the SL AT
    #      THE FURTHEST POINT of the supply/demand."
    #     "I will only use these entry methods in HTF supply or demand ... I personally use anywhere
    #      from the 15M to the 1M to enter trades in these HTF zones."
    #
    # WHICH TIMEFRAME IS THE WHOLE BALL GAME, and it was measured before choosing. Applying p81 to
    # the refinement BX already had produced unusable stops — on 31 confirmed EUR/USD taps:
    #
    #        refine on   median stop   max    under 5 pips
    #        1M               0.8      3.6      23 of 23     <- inside the spread; every trade dies
    #        5M               3.2      9.8      22 of 25
    #        15M              4.3     11.4      15 of 21
    #        30M              6.0     15.1       4 of 14
    #
    # The user settled it: *"I do use 5M and it is perfect."* So the entry zone is refined on 5M
    # specifically, not on whatever `analysis_refine` happened to find tightest across 15M/30M/1H —
    # that path exists for GRADING and its `entry`/`sl` were always overwritten here (open defect 5).
    #
    # NO SPREAD ADDED. The book says to add it; he said not to (2026-08-15). Recorded rather than
    # silently followed, because it is a deliberate departure from p81.
    ez = refine_zone(refine_tf, zdir, zone4h, pip) if refine_tf else None
    if ez is None:
        # NO CITATION IN A USER-FACING STRING — `test_no_book_citations` failed the first version of
        # this line for saying "the book". The reader wants the reason, not the source.
        r.reason = ("no refined 5M zone inside the 4H zone — the entry sits at the START of the "
                    "supply/demand the reaction left, and there is none to enter at")
        r.triggered = False
        return r
    entry = ez.proximal
    sl = ez.distal

    # A stop on the wrong side of the entry is unusable. It happens when the confirming close lands
    # BELOW the pullback's low on a buy — the confirmation fired past the level the stop hangs off.
    # `risk <= 0` below would catch it, but silently; this says which of the two is at fault.
    if (buy and sl >= entry) or (not buy and sl <= entry):
        r.reason = (f"stop ({sl:.5f}) is on the wrong side of the entry ({entry:.5f}) — "
                    f"the confirmation fired beyond the pullback's own extreme")
        r.triggered = False
        return r
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
