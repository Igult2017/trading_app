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
from strategies.vix1_pullback import find_pullback
from strategies.vix1_fractal import fractal_broken
from strategies.vix1_roi import regions, sl_from_regions

log = logging.getLogger(__name__)

_ENTRY_BUFFER = 1   # pips — the stop sits JUST beyond the pullback, never resting on it


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
        broke, lvl = fractal_broken(win, bullish)
        if not broke:
            seen = "none formed yet" if lvl is None else f"{lvl:.{digits}f}"
            log.info(f"[vix1] {symbol} 1M: price {last:.{digits}f} is the wrong side of the lines "
                     f"({line:.{digits}f}/{wick_line:.{digits}f}) and the counter-move's last fractal ({seen}) has not "
                     f"broken — waiting (playbook: do nothing until the 1M lines up)")
            return []
        kind = "fractal"

    # THE ENTRY — the first pullback candle PAST the line, in both cases.
    pb, why = find_pullback(win, bullish, line, wick_line)
    if pb is None:
        log.info(f"[vix1] {symbol} 1M: aligned ({kind}) but {why} — waiting")
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
                          regions(win, bullish, wick_line), pip, max_risk)
    if got is None:
        log.info(f"[vix1] {symbol} 1M: aligned ({kind}) with a pullback at {lvl:.{digits}f}, but no "
                 f"1M region of interest sits beyond it within one 1HR candle ({max_risk / pip:.0f}p) "
                 f"— nowhere honest to put the stop; skipping")
        return []
    sl, risk, sl_note = got

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
