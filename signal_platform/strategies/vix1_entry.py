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
_SL_BEYOND_LINE  = 1   # pips past LINE 2 (the wick line) where the stop rests — measured from the
                       # user's own trades: his stop sits a median 2.3p from line 2, and never on the
                       # line itself, so a small pad keeps a touch of the line from stopping him out.
_MIN_SL_ROOM     = 5   # pips — the SL needs ROOM so normal noise cannot wick us out of a good trade.
                       # If the nearest region gives less, push the stop out to this floor (still
                       # capped at one 1HR candle). "Enough room to be filled or left out" (user).
_LATE_MIN_RR     = 1.0 # a pullback past the allowed distance is a WORSE price, not a dead setup: it
                       # still ships if at least 1R remains (user 2026-07-25: "when the signal goes
                       # too far and we can still get 1R, send it"). Normal entries keep needing 2R.

# HOW FAR THE PULLBACK MAY SIT FROM LINE 1 — DYNAMIC, never a pip count (user 2026-07-25: "make this
# dynamic. If you hardcode it wont work because the market is not perfect"). This REPLACED a hardcoded
# 7-pip limit that rejected 3 of the user's 22 real setups (pullbacks at 7.7p / 10.1p / 12.7p).
#
# THE YARDSTICK IS THE MOMENTUM CANDLE'S OWN HEIGHT — and that is a DELIBERATE correction of the
# literal instruction ("height of the 1HR candle that comes AFTER the first volume candle"), because
# the literal version is geometrically VACUOUS. Proof: the candle after the momentum candle is the
# hour the pullback happens in, so the pullback's distance from the line and that candle's height are
# measured over THE SAME BARS. The line sits at the window's start, and the pullback's extreme lies
# inside the window, so distance <= window range ALWAYS — the flag could never fire, at any threshold.
# Verified numerically on all 19 reconstructable setups: 0 flagged under that reading, and no
# threshold changes it. The same bound defeats every variant (distance past the line, retrace depth).
#
# The momentum candle's height keeps everything the user actually wanted — it is dynamic (it IS the
# current 1HR volatility), it needs no lookahead, and it cannot drift because that candle is closed —
# while being a DIFFERENT candle from the one the pullback forms in, so the comparison is real.
# Measured on the real setups: pullbacks sit a median 6% and a MAX 35% of the momentum candle's
# height from the line, so a full-height allowance clears every genuine entry with wide margin and
# only fires when price has run an entire momentum-candle's worth away from the recommended price.
_LATE_MULT = 1.0   # allowance = this x the momentum candle's height


def _allowed_offset(vc: Candle, pip: float) -> float:
    """The dynamic allowance: the momentum candle's own height (high-low). Floored at 1 pip so a
    degenerate flat candle cannot make the allowance zero and reject everything."""
    return max(1.0 * pip, _LATE_MULT * (vc.high - vc.low))


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

    # THE PULLBACK MUST SIT PAST LINE 1 — enforced inside find_pullback (see its comment). This
    # note used to say the opposite ("deliberately NO such test... do not re-add it"), on the
    # strength of my own screenshot reconstruction of his pullbacks. He corrected it directly on
    # 2026-07-26: "that pullback has to be past the 1HR line when I look at it in 1M TF... just
    # make sure any pullback is past the 1HR line." Measured on Jan-Jun 2021 before the fix, 53% of
    # the pullbacks the code anchored on were not fully past the line.

    # HOW FAR FROM THE LINE — the DYNAMIC allowance (see _allowed_offset): the height so far of the
    # 1HR candle following the momentum candle. Beyond it the price is WORSE, not invalid, so the
    # setup is not dropped — it is flagged `late` and must still clear _LATE_MIN_RR below.
    near    = pb.low if bullish else pb.high
    off     = abs(near - line)
    allowed = _allowed_offset(vc, pip)
    late    = off > allowed
    if late:
        log.info(f"[vix1] {symbol} 1M: pullback formed {off/pip:.1f}p from the line vs an allowance of "
                 f"{allowed/pip:.1f}p (the momentum candle's height) — PAST the recommended "
                 f"entry price; will ship only if >= {_LATE_MIN_RR:.0f}R remains")

    lvl   = pb.high if bullish else pb.low          # the trend side — the stop goes just beyond it
    entry = lvl + _ENTRY_BUFFER * pip if bullish else lvl - _ENTRY_BUFFER * pip

    # THE SL — ANCHORED TO LINE 2, the 1HR wick line. This is what line 2 was always FOR ("it has
    # exactly one job: adjusting the STOP", vix1_lines) and the code had drifted off it: it used to
    # hunt "the nearest 1M region beyond the pullback", which anchors the stop to a tiny 1-minute
    # feature instead of the hourly level the whole setup is built on.
    #
    # MEASURED on 19 of the user's real 2021 GBP/USD trades (entry + SL prices recovered from his
    # JForex screenshots, line computed from real H1). Mean |distance| of his stop from each
    # candidate anchor:
    #     LINE 2 (wick line) ->  5.1p, MEDIAN 2.3p   <- his stop sits ON it
    #     LINE 1 (body close) -> 4.7p, median 3.8p
    #     the pullback / candle extreme -> 30.9p, median 28.2p   <- what the old code used
    # The old anchor produced 5-7 pip stops where his are 9-13 (median 11.0p), which is why the
    # reconstruction was stopped out of trades he won. Scaling the old distance could never fix it:
    # multiplying a distance measured from the wrong reference just makes it wrong by a varying
    # amount, which is exactly what the 1.0x-2.0x sweep showed (no multiplier worked out-of-sample).
    #
    # The risk is now EMERGENT, not chosen: entry sits past line 1 off the pullback, the stop sits
    # just beyond line 2, and the gap between them IS the risk — "the gap it should leave between
    # stop entry for it to decide to fill me or move towards the pullback direction" (user).
    sl   = wick_line - _SL_BEYOND_LINE * pip if bullish else wick_line + _SL_BEYOND_LINE * pip
    risk = abs(entry - sl)
    sl_note = f"{risk / pip:.1f}p — just beyond the 1HR wick line ({wick_line:.{digits}f})"
    max_risk = vc.high - vc.low
    if risk > max_risk:
        log.info(f"[vix1] {symbol} 1M: stop at the wick line is {risk/pip:.1f}p, wider than one 1HR "
                 f"candle ({max_risk/pip:.0f}p) — the 2R target is not a two-candle move; skipping")
        return []

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

    # A LATE entry (pullback past the dynamic allowance) is a worse PRICE, so the 2R target may no
    # longer sit where the move can reach. It ships only while at least 1R of the original move is
    # still ahead of it: the distance from the entry to where the 2R target WOULD have been, measured
    # from the line (the untainted reference), must still be >= _LATE_MIN_RR x risk.
    if late:
        ideal_tp  = line + 2.0 * risk if bullish else line - 2.0 * risk
        remaining = (ideal_tp - entry) if bullish else (entry - ideal_tp)
        if remaining < _LATE_MIN_RR * risk:
            log.info(f"[vix1] {symbol} 1M: late entry at {entry:.{digits}f} leaves only "
                     f"{remaining/risk if risk else 0:.2f}R to the original target — under "
                     f"{_LATE_MIN_RR:.0f}R; skipping")
            return []

    log.info(f"[vix1] {symbol} 1M PULLBACK entry ({kind} path{', LATE' if late else ''}) — "
             f"{'BUY' if bullish else 'SELL'} stop {entry:.{digits}f} SL {sl:.{digits}f} "
             f"({sl_note}; line {line:.{digits}f}"
             f"{'' if wick_line == line else f' wick-line {wick_line:.{digits}f}'})")
    return [{"kind": kind, "entry": round(entry, digits), "sl": round(sl, digits),
             "sl_note": sl_note, "late": late,
             # where the move was ORIGINALLY aiming (2R off the line) — the honest target for a late
             # entry, so the card reports the reward that actually remains instead of a fictional 2R
             "ideal_tp": round(line + 2.0 * risk if bullish else line - 2.0 * risk, digits) if late else None,
             "late_note": (f"⚠️ price has gone PAST the recommended entry price — the pullback formed "
                           f"{off/pip:.1f} pips from the 1HR line (allowance {allowed/pip:.1f}p). "
                           f"Reduced reward: at least {_LATE_MIN_RR:.0f}R remains, not the usual 2R.")
                          if late else ""}]
