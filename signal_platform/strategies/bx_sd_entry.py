"""
BX-S/D — entry-TF execution & trigger (Phase 7).

The final step of the cascade: once the LTF confluence (Phase 6) has confirmed + refined,
BX-S/D drops to the entry TF (1M / 5M) INSIDE the refined POI and waits for the actual
trigger before locking a signal:

  * TRIGGER (mandatory) — one of the book's THREE entry methods on the entry TF (Ch.9 step 4):
    CHoCH, S/D flip, or continuation BOS. Never a blind limit.
  * RESPECT — the 4H zone must be HELD, not ground against: the confirming close must sit
    _RESPECT_BUFFER of the zone height inside it, off the distal.
  * ENTRY  — a STOP ORDER just beyond the confirming bar's extreme (2026-08-15). The confirmation
    says the reaction happened; the stop says price then CONTINUED, so it fills only if the move
    carries on and never if the reaction fails.
  * SL     — _SL_BUFFER_PIPS beyond the 4H ZONE's distal — the document's "a few pips above the
    highest point of the zone". One rule now, no fallback.
  * TP     — a fixed _TP_R multiple of that risk.

Assembles Phases 1-6; reuses only generic shared resources.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_ltf import find_ltf_choch, _choch_valid, LTFConfluence
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_setup import (SetupResult, _SL_BUFFER_PIPS,
                                    _TP_R, _RESPECT_BUFFER)

# `_PULLBACK_LOOKBACK = 24` (entry-TF bars) lived here and is DELETED, as is the 4H `pullback_4h` it
# was a second, tighter definition of — the whole pullback model went with the 2026-08-15 change to
# the document's entry.

_ENTRY_STOP_BUFFER_PIPS = 1.0
"""How far beyond the confirming bar's extreme the STOP ORDER rests, so it does not sit exactly on a
price the market has already printed. One pip: small enough not to move the risk materially against a
stop that is `_SL_BUFFER_PIPS` off the 4H distal, large enough that a single tick does not fill it."""


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
                  session_candles: list[Candle] | None = None) -> EntryTrigger:
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

    # ENTRY = A STOP ORDER JUST BEYOND THE CONFIRMING BAR (his instruction, 2026-08-15:
    # "we will do confirmation in LTF plus we use stop orders").
    #
    # The confirmation says the reaction happened; the stop order says price then CONTINUED. Placed
    # beyond the confirming bar's own extreme in the trade direction, so it fills only if the move
    # carries on and never if the reaction fails — the "no trade, no risk" property.
    #
    # THIS REPLACES A MARKET ENTRY AT THE CONFIRMING CLOSE, and that trade-off is real: a market
    # entry cannot expire, a resting stop can. Some signals will now never become trades. That is
    # accepted deliberately, not overlooked — it is the same property that stops us paying for a
    # reaction that immediately reverses. `bx_sd_watch` already invalidates a locked setup.
    #
    # NOT a limit back inside the zone. The document draws a limit, but he chose a stop, and the
    # older limit-at-the-POI behaviour is exactly what once fired 13-14% of signals with price
    # already past the entry and left 22-29% unfilled inside 24h. A stop cannot fire behind price.
    last = entry_tf[-1]
    entry = (last.high + _ENTRY_STOP_BUFFER_PIPS * pip if buy
             else last.low - _ENTRY_STOP_BUFFER_PIPS * pip)

    # STOP comes from the 4H ZONE, never from the refined POI. User's rule: "mark zone in 4H and then
    # use it to enter where price can't wick us out — ~5 to 6 pips behind the 4H zone; we enter in 5M
    # or 1M using confirmed entry so we are sure price is in our favour, so we won't need a broader SL."
    #
    # This used to take the SL off the REFINED zone, which produced ~3 pip stops sitting inside noise:
    # spread was 20-30% of risk and any wick took the trade out. The 4H stop was already computed in
    # detect_setup and then silently discarded here.
    # STOP: BEYOND THE 4H ZONE'S DISTAL — the document's rule, *"setting the stop-loss a few pips
    # above the highest point of the zone"* (mirrored below a demand zone).
    #
    # The trade is now the FIRST return to the zone, so the zone IS the structure being entered and
    # its distal is what a wick has to clear. `_SL_BUFFER_PIPS = 6` is his own "5 to 6 pips behind
    # the 4H zone".
    #
    # THIS WAS TWO BRANCHES until 2026-08-15. The other put the stop 15 pips behind the 4H
    # PULLBACK's extreme — correct for the model where price left the zone, ran, and was entered on
    # a retracement far from it. That model is gone (`bx_sd_setup` now triggers on the tap itself),
    # so the pullback branch, `setup.pb_extreme` and `pullback_4h` went with it rather than being
    # left as an unreachable path that reads like a live rule.
    sl = (zone4h.distal - _SL_BUFFER_PIPS * pip if buy
          else zone4h.distal + _SL_BUFFER_PIPS * pip)
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
