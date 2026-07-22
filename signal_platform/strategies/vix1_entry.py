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

Two lines come off candle 1 (vix1_lines), with SEPARATE jobs — do not merge them:
  LINE 1 GATES THE ENTRY — price must have TRADED past it (vix1_pullback.traded_past), and the
         pullback is measured against it.
  LINE 2 DECIDES WHICH SIDE we are on, and adjusts the stop. It is the tolerance band: an opposite
         move is allowed to push past line 1 and reverse at line 2, so no fifth decimal decides
         alignment. It is also one region of interest among several, not the stop by right.
(This docstring used to credit line 1 with the alignment decision, which is what the code and the
settled rules have never done — corrected so nobody "fixes" the comparison to match the prose.)

The SL is the nearest 1M REGION OF INTEREST beyond the pullback (vix1_roi) — where price would go
against us in the worst case. Never a pip count: the floor is structural (clear the pullback candle
itself), the ceiling is one 1HR candle's range, because "2 candles of 1HR gives 2R" makes one candle
1R. TP = 2R, which is that same two-candle move; "or more" is the Phase 3 trailing stop.
"""
import logging

from core.types import Candle
from shared.mtf_utils import seconds
from strategies.vix1_lines import draw_lines
from strategies.vix1_pullback import find_pullback, traded_past
from strategies.vix1_fractal import fractal_broken
from strategies.vix1_roi import regions, sl_from_regions

log = logging.getLogger(__name__)

_ENTRY_BUFFER    = 1   # pips — the stop sits JUST beyond the pullback, never resting on it
_PULLBACK_NEAR   = 7   # pips — the pullback must form THIS close to Line 1. The setup is "price
                       # reaches the line, THEN pull back near it": a pullback far from the line is a
                       # different, worse entry the trader would skip. Measured on real winners the
                       # pullback sat within ~4p of the line; 7p leaves margin.
_MIN_SL_ROOM     = 5   # pips — the SL needs ROOM so normal noise cannot wick us out of a good trade.
                       # If the nearest region gives less, push the stop out to this floor (still
                       # capped at one 1HR candle). "Enough room to be filled or left out" (user).


def m1_signals(m1: list[Candle], bullish: bool, vc: Candle,
               pip: float = 0.0001, symbol: str = "") -> list[dict]:
    """
    The 1M entry — [{"kind", "entry", "sl", "sl_note"}] or [] (logs why). `vc` is the FIRST momentum
    candle of the 1HR run: its close is THE LINE. `sl_note` says WHICH region the stop sits behind, so
    the card can tell the reader too — the number alone does not explain itself.
    """
    if not m1:
        return []
    digits = 5 if pip < 0.005 else 3
    hr     = seconds(vc.timeframe)
    line, wick_line = draw_lines(vc)   # 1: body close = THE line;  2: wick = the stop's anchor
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
    # LINE 2 is the boundary, not line 1: an opposite move is allowed to push past line 1 and reverse
    # at line 2, so that band is the tolerance and no fifth decimal decides which side we are on. Past
    # line 2 the counter-move is real. (No wick on candle 1 -> line 2 IS line 1, the ordinary case.)
    last = win[-1].close
    if (last > wick_line) if bullish else (last < wick_line):
        kind = "pullback"
    else:
        # The break is a CLOSE beyond the fractal level, so it is read from CLOSED bars only — the
        # forming bar's "close" is just the live price, and a spike that later closes back inside
        # must not count as a close (same body-close rule as CHoCH).
        broke, lvl = fractal_broken(wcl, bullish)
        if not broke:
            seen = "none formed yet" if lvl is None else f"{lvl:.{digits}f}"
            log.info(f"[vix1] {symbol} 1M: price {last:.{digits}f} is the wrong side of the lines "
                     f"({line:.{digits}f}/{wick_line:.{digits}f}) and the counter-move's last fractal ({seen}) has not "
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
    pb, why = find_pullback(wcl, bullish, line, wick_line)
    if pb is None:
        log.info(f"[vix1] {symbol} 1M: aligned ({kind}) but {why} — waiting")
        return []

    # PAST THE LINE — the pullback itself must TAKE PLACE past (or on) Line 1, on BOTH paths, the
    # fractal one included (user 2026-07-22: "even fractal break requires pullback only after price
    # has gone past the 1HR line or on the 1HR line. No entry takes place in pullbacks that dont take
    # place past the 1HR candle close line."). traded_past alone only proved price crossed the line at
    # SOME point — the latest retrace could still be a pullback that formed BEFORE the break, or one
    # that formed back on the wrong side after price collapsed through the line again, and either
    # anchored the entry. The candle's line-side extreme may touch the line ("on"), never sit beyond it.
    near = pb.low if bullish else pb.high
    if (near < line - 1e-9) if bullish else (near > line + 1e-9):
        log.info(f"[vix1] {symbol} 1M: the pullback ({near:.{digits}f}) took place on the WRONG side "
                 f"of line 1 ({line:.{digits}f}) — no entry in pullbacks that are not past the line; waiting")
        return []

    # NEAR THE LINE — the pullback's line-side extreme must sit within _PULLBACK_NEAR of Line 1. The
    # method is "price reaches the line, then a pullback forms THERE"; a pullback far from the line is
    # a setup the trader looks at and skips, and taking it is what dragged the automated win rate down.
    off = abs(near - line) / pip
    if off > _PULLBACK_NEAR:
        log.info(f"[vix1] {symbol} 1M: pullback formed {off:.1f}p from the line (> {_PULLBACK_NEAR}p) "
                 f"— too far from Line 1, not the setup; waiting")
        return []

    lvl   = pb.high if bullish else pb.low          # the trend side — the stop goes just beyond it
    entry = lvl + _ENTRY_BUFFER * pip if bullish else lvl - _ENTRY_BUFFER * pip

    # THE SL — the nearest 1M region of interest beyond the pullback: where price would go against us
    # in the worst case. Not a pip count, and not the line either (the line is for entry accuracy, not
    # for the stop). Capped at ONE 1HR candle's range, because the user's own backtesting says two 1HR
    # candles deliver 2R — so one candle is 1R, and a wider stop makes the 2R target a move this setup
    # does not produce. No region on the protective side = no honest stop = no trade.
    max_risk = vc.high - vc.low
    got = sl_from_regions(entry, pb.low if bullish else pb.high, bullish,
                          regions(wcl, bullish, wick_line), pip, max_risk)
    if got is None:
        log.info(f"[vix1] {symbol} 1M: aligned ({kind}) with a pullback at {lvl:.{digits}f}, but no "
                 f"1M region of interest sits beyond it within one 1HR candle ({max_risk / pip:.0f}p) "
                 f"— nowhere honest to put the stop; skipping")
        return []
    sl, risk, sl_note = got

    # SL ROOM — a stop tighter than _MIN_SL_ROOM gets wicked out of a trade that then runs our way.
    # Push it out to the floor (still never beyond one 1HR candle); if even the floor won't fit, the
    # setup has no honest room and we skip it rather than take a stop that noise will hunt.
    if risk < _MIN_SL_ROOM * pip:
        want = _MIN_SL_ROOM * pip
        if want > max_risk:
            log.info(f"[vix1] {symbol} 1M: nearest region gives only {risk/pip:.1f}p and one 1HR "
                     f"candle is {max_risk/pip:.0f}p — no room for a {_MIN_SL_ROOM}p stop; skipping")
            return []
        sl   = entry - want if bullish else entry + want
        risk = want
        sl_note = f"{_MIN_SL_ROOM:.0f}p (min room; nearest region was tighter)"

    # The stop must still be UNFILLED — strictly beyond price in the trend direction. If the pullback
    # is already taken out, an order there is a LIMIT filling INTO the move: the inverse of this entry.
    last = win[-1].close
    if (entry <= last) if bullish else (entry >= last):
        log.info(f"[vix1] {symbol} 1M: the pullback is already taken out (price {last:.{digits}f} "
                 f"vs stop {entry:.{digits}f}) — a stop there would fill into the move; entry gone")
        return []

    log.info(f"[vix1] {symbol} 1M PULLBACK entry ({kind} path) — {'BUY' if bullish else 'SELL'} "
             f"stop {entry:.{digits}f} SL {sl:.{digits}f} ({sl_note}; line {line:.{digits}f}"
             f"{'' if wick_line == line else f' wick-line {wick_line:.{digits}f}'})")
    return [{"kind": kind, "entry": round(entry, digits), "sl": round(sl, digits),
             "sl_note": sl_note}]
