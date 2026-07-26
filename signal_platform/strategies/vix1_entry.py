"""
VIX.1 — 1M entry. The 1HR sets the bias and the lines; the 1M decides WHEN.

Playbook p2: "if the 1M is still not aligned with the 1HR, wait — do nothing until the 1M lines up."
That wait is OPEN-ENDED — the 1HR can be ready for hours while the 1M is not. A bias flip
(vix1_watch) ends a setup; a timer never does.

THE ENTRY IS ALWAYS THE PULLBACK (vix1_pullback) — 1M only, past the line, stop just beyond it:
continue and it fills us along the way, reverse and we are never in ("no trade, no risk", p6).
Setups differ ONLY in how the 1M's ALIGNMENT is established:

  price OUR side of the line -> the 1M is running with the 1HR. Wait for the pullback, enter.
  price the WRONG side       -> the 1M is running against us. The LAST fractal of that counter-move
                     must break first (vix1_fractal) — that CONFIRMS the turn, it is NOT the
                     entry. Then the pullback, exactly as above.

The line is what answers "is the 1M with us?" — not swing structure. A spike-and-return inside one
hour never prints the two highs and two lows a trend read needs, so structure said "not aligned" in
every long-wick case and real entries were thrown away.

ONE LINE comes off candle 1 (vix1_lines) — its body close — and it does every job:
  it DECIDES WHICH SIDE we are on, it GATES the entry (price must have TRADED past it,
  vix1_pullback.traded_past), the pullback must sit wholly past it, and the stop must sit behind it.
(A second "wick line" shared those jobs until 2026-07-26. It was never the user's rule and it is
deleted — vix1_lines carries the post-mortem. This docstring described it as settled fact, which is
exactly how an invention survives review; do not reintroduce it in prose or in code.)

The SL is the nearest 1M REGION OF INTEREST beyond the pullback (vix1_roi) — where price would go
against us in the worst case — and it may NEVER rest past the line: a stop between the entry and the
line can be hit while price is still on the winning side of the level the setup is built on. When
the nearest region falls short of the line, the stop is pushed to the line plus a derived gap.
Never a pip count anywhere: the floor is the 1M's own recent range, the ceiling is one 1HR candle's
range, because "2 candles of 1HR gives 2R" makes one candle 1R. TP = 2R, that same two-candle move.
"""
import logging
import math

from core.types import Candle
from shared.candle_math import full_range
from shared.mtf_utils import seconds
from strategies.vix1_lines import draw_line
from strategies.vix1_pullback import find_pullback, traded_past
from strategies.vix1_fractal import fractal_broken
from strategies.vix1_roi import regions, sl_from_regions

log = logging.getLogger(__name__)

_ENTRY_BUFFER    = 1   # pips — the stop sits JUST beyond the pullback, never resting on it
_SL_GAP_MULT     = 0.5 # when the stop has to be pushed behind the line, it goes this x the
                       # 1M's recent average RANGE beyond it. DERIVED, not a pip count. His
                       # setup 1: a 2.6p gap against a 4.3p 1M average range = 0.60x.
_GAP_AVG_N       = 14  # bars of 1M for that average — the platform's usual baseline
_MIN_ROOM_MULT   = 1.0 # the SL floor, as a multiple of the 1M's recent average RANGE — the noise it
                       # has to survive. DERIVED, replacing a flat 5-pip count on 2026-07-26.
                       # "Enough room to be filled or left out" (user).

def m1_signals(m1: list[Candle], bullish: bool, vc: Candle,
               pip: float = 0.0001, symbol: str = "") -> list[dict]:
    """
    The 1M entry — [{"kind", "entry", "sl", "sl_note"}] or [] (logs why). `vc` is the FIRST momentum
    candle of the 1HR run: its close is THE LINE. `sl_note` says WHICH region the stop sits behind, so
    the card can tell the reader too — the number alone does not explain itself.
    """
    if not m1:
        return []
    # PRICE PRECISION — derived EXACTLY from the pip, never guessed. cTrader's convention is
    # pip = 10^-(pipDigits-1), so pipDigits = 1 - log10(pip); that inverts it with no symbol lookup,
    # so a harness passing an odd symbol string cannot silently pick the wrong precision.
    # This was `5 if pip < 0.005 else 3` until 2026-07-26 — right for 5-digit FX and for
    # JPY/XAU/XAG, WRONG for oil and crypto (2, we said 3) and for indices (1, we said 3). Same
    # class of bug as the one already fixed in shared/pip.py, and latent for the same reason:
    # VIX.1 trades EUR/USD and GBP/USD, which the guess happens to get right.
    digits = max(0, round(1.0 - math.log10(pip))) if pip > 0 else 5
    hr     = seconds(vc.timeframe)
    line   = draw_line(vc)             # THE line — the momentum candle's body close
    win    = [c for c in m1 if c.time >= vc.time + hr]     # only price action since the line was set

    if len(win) < 2:
        log.info(f"[vix1] {symbol} 1M: only {len(win)} bars since the 1st momentum candle closed — waiting")
        return []

    # LEVELS vs TRIGGERS (the hard rule): the feed's newest M1 bar is still FORMING — its high, low
    # and close move every scan, so nothing read from it may set a level. `win` (live) answers only
    # trigger questions: has price traded past the line, which side is it on, is the stop unfilled.
    # `wcl` (closed) is what the pullback candle, fractal levels/breaks and SL regions are read from
    # — the entry/SL used to be drawn off the live bar's edges, which drift until it closes.
    wcl = win[:-1] if win[-1].time == m1[-1].time else win

    # ALIGNMENT (playbook p2) — THE LINE decides which side we are on, and that is the whole reason it
    # is drawn. Price on our side of it = the 1M is running with the 1HR, so the pullback alone is the
    # entry. Price the WRONG side = the 1M is running against us, and the LAST fractal of that
    # counter-move has to break before anything means a thing.
    # THE LINE is the boundary. This used to test a second "wick line" — deleted 2026-07-26, it was
    # never the user's (vix1_lines). One line decides it, which is what he draws and what he reads.
    last = win[-1].close
    if (last > line) if bullish else (last < line):
        kind = "pullback"
    else:
        # The break is a CLOSE beyond the fractal level, so it is read from CLOSED bars only — the
        # forming bar's "close" is just the live price, and a spike that later closes back inside
        # must not count as a close (same body-close rule as CHoCH).
        broke, lvl = fractal_broken(wcl, bullish)
        if not broke:
            seen = "none formed yet" if lvl is None else f"{lvl:.{digits}f}"
            log.info(f"[vix1] {symbol} 1M: price {last:.{digits}f} is the wrong side of the lines "
                     f"({line:.{digits}f}) and the counter-move's last fractal ({seen}) has not "
                     f"broken — waiting (playbook: do nothing until the 1M lines up)")
            return []
        kind = "fractal"

    # LINE 1 GATE — has price actually TRADED past it since it was drawn? A tick test, so the LIVE
    # window answers it (an intrabar push past the line counts the moment it happens).
    if not traded_past(win, bullish, line):
        log.info(f"[vix1] {symbol} 1M: price has not traded past line 1 ({line:.{digits}f}) yet "
                 f"— an entry does not belong here; waiting")
        return []

    # THE ENTRY — the first pullback candle PAST the line, in both cases. CLOSED bars only: the
    # candle's edges become the entry and the SL clearance, and a level must not drift.
    pb, why = find_pullback(wcl, bullish, line)
    if pb is None:
        log.info(f"[vix1] {symbol} 1M: aligned ({kind}) but {why} — waiting")
        return []

    # THE PULLBACK MUST SIT PAST LINE 1 — enforced inside find_pullback (see its comment). This
    # note used to say the opposite ("deliberately NO such test... do not re-add it"), on the
    # strength of my own screenshot reconstruction of his pullbacks. He corrected it directly on
    # 2026-07-26: "that pullback has to be past the 1HR line when I look at it in 1M TF... just
    # make sure any pullback is past the 1HR line." Measured on Jan-Jun 2021 before the fix, 53% of
    # the pullbacks the code anchored on were not fully past the line.

    # NO "LATE ENTRY" PATH — DELETED 2026-07-26, it was provably unreachable. It flagged a pullback
    # sitting further from the line than the momentum candle's own height and then required >= 1R of
    # the original move to remain. Both halves are dead:
    #   * the flag: real pullbacks sit at a median 30% and a MAX 96% of that height, so a 100%
    #     allowance can never fire — the same geometric vacuity this file already documents for the
    #     literal reading of the rule, reintroduced by choosing a 1.00x multiplier.
    #   * the guard it protected: with d = entry's distance past the line and gap = stop's distance
    #     BEHIND it, risk = d + gap, and remaining = 2*risk - d. So remaining >= 1R reduces to
    #     gap >= 0, which the stop-behind-the-line invariant guarantees. Measured max d/risk = 0.99.
    # It is therefore redundant as well as unreachable: more than 1R to the original target is
    # structurally assured. Do not re-add it without first breaking one of those two invariants.

    lvl   = pb.high if bullish else pb.low          # the trend side — the stop goes just beyond it
    entry = lvl + _ENTRY_BUFFER * pip if bullish else lvl - _ENTRY_BUFFER * pip

    # THE SL — the NEAREST 1M REGION OF INTEREST beyond the pullback (vix1_roi), which is his own
    # rule in his own words: "put our SL at a region of interest where price might pullback to in
    # the worst case scenario... any zone where the price might revisit in 1M... think of all the
    # zones that can reverse the price or act as a road block."
    #
    # RESTORED 2026-07-26. This module was still imported and had not been called for weeks: the SL
    # had been re-anchored to "line 2", a wick line that was never his (see vix1_lines for the full
    # post-mortem). That anchor produced a ~3 pip median risk because it was derived from the
    # momentum candle's counter-wick — the one thing the momentum filter drives toward zero — so the
    # better the setup scored, the tighter its stop. The region-of-interest stop is a level the
    # MARKET drew, so it cannot collapse just because the entry candle was clean.
    max_risk = vc.high - vc.low          # "2 candles of 1HR gives 2R" -> one candle is 1R
    pb_protective = pb.low if bullish else pb.high
    got = sl_from_regions(entry, pb_protective, bullish,
                          regions(wcl, bullish), pip, max_risk)
    if got is None:
        log.info(f"[vix1] {symbol} 1M: no 1M region of interest sits beyond the pullback within one "
                 f"1HR candle ({max_risk/pip:.0f}p) — no honest place for the stop; skipping")
        return []
    sl, risk, sl_note = got

    # THE STOP MAY NEVER SIT PAST THE LINE. His rule: "I put stop loss abit behind the 1HR line."
    # Behind means the far side — ABOVE the line on a sell, BELOW it on a buy. A stop on the near
    # side sits BETWEEN the entry and the line, so the trade can be stopped out while price is still
    # on the winning side of the level the whole setup is built on.
    #
    # REGRESSION, introduced 2026-07-26 and caught the same day. While the stop was anchored to
    # "line 2" this was guaranteed for free — line 2 always lay beyond line 1, so the stop always
    # landed behind it (178 of 178 signals). Deleting line 2 removed the guarantee and nothing
    # replaced it: the region-of-interest stop hunts the NEAREST 1M level beyond the pullback, and
    # the nearest one is usually still short of the line. Measured immediately after: only 58 of 146
    # signals kept the stop behind the line, median 0.8 pips on the WRONG side.
    #
    # The fix is a FLOOR, not a replacement: a region that already sits behind the line is kept (it
    # is a level the market drew, which is the point of vix1_roi); one that does not is pushed back
    # to the line plus a derived gap. The gap is the 1M's own recent range — the noise a stop has to
    # survive — never a pip count.
    # >= / <= on purpose: a stop resting EXACTLY on the line is stopped out by a touch of it.
    m1_rng = (sum(full_range(c) for c in wcl[-_GAP_AVG_N:]) / min(len(wcl), _GAP_AVG_N)) if wcl else 0.0
    wrong_side = (sl >= line) if bullish else (sl <= line)
    if wrong_side:
        gap    = max(_SL_GAP_MULT * m1_rng, pip)
        sl     = line - gap if bullish else line + gap
        risk   = abs(entry - sl)
        sl_note = f"{risk/pip:.1f}p — {gap/pip:.1f}p behind the line ({line:.{digits}f})"
        if risk > max_risk:
            log.info(f"[vix1] {symbol} 1M: the nearest region sat PAST the line and a stop behind it "
                     f"is {risk/pip:.1f}p, wider than one 1HR candle ({max_risk/pip:.0f}p); skipping")
            return []

    # SL ROOM — a stop too tight gets wicked out of a trade that then runs our way. The floor is the
    # NOISE the stop has to survive, so it is measured in the 1M's own recent range, never in pips
    # ("make this dynamic. If you hardcode it wont work because the market is not perfect"). It was a
    # flat 5 pips until 2026-07-26 — an invented number that fired on 9.7% of signals and pinned them
    # all to the same risk whatever the market was doing. Push out to the floor (never beyond one 1HR
    # candle); if even that will not fit, the setup has no honest room and we skip it.
    room = max(_MIN_ROOM_MULT * m1_rng, pip)
    if risk < room:
        if room > max_risk:
            log.info(f"[vix1] {symbol} 1M: the region gives only {risk/pip:.1f}p, the 1M needs "
                     f"{room/pip:.1f}p of room and one 1HR candle is {max_risk/pip:.0f}p — no honest "
                     f"stop fits; skipping")
            return []
        sl   = entry - room if bullish else entry + room
        risk = room
        sl_note = f"{room/pip:.1f}p (min room = {_MIN_ROOM_MULT:.1f}x the 1M's recent range)"

    # The stop must still be UNFILLED — strictly beyond price in the trend direction. If the pullback
    # is already taken out, an order there is a LIMIT filling INTO the move: the inverse of this entry.
    last = win[-1].close
    if (entry <= last) if bullish else (entry >= last):
        log.info(f"[vix1] {symbol} 1M: the pullback is already taken out (price {last:.{digits}f} "
                 f"vs stop {entry:.{digits}f}) — a stop there would fill into the move; entry gone")
        return []

    log.info(f"[vix1] {symbol} 1M PULLBACK entry ({kind} path) — "
             f"{'BUY' if bullish else 'SELL'} stop {entry:.{digits}f} SL {sl:.{digits}f} "
             f"({sl_note}; line {line:.{digits}f})")
    # `late` / `ideal_tp` / `late_note` are kept in the payload as constants so downstream readers
    # (vix1.py's card, the DB row) need no change; the path that could set them is gone, see above.
    return [{"kind": kind, "entry": round(entry, digits), "sl": round(sl, digits),
             "sl_note": sl_note, "late": False, "ideal_tp": None, "late_note": ""}]
