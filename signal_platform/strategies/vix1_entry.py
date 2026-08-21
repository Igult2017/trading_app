"""
VIX.1 — 1M entry. The 1HR sets the bias and the line; the 1M decides WHEN, and NOTHING ELSE.

His instruction, 2026-08-20: *"Everything has been settled in 1HR, in 1 min we are only looking for
entries."* So this file reads no structure on the 1M — no swing points, no zones, no retrace search.
It waits for the cross and puts an order one tick beyond how far price got. That is the whole thing.

    price CLOSES a 1M candle past the line  ->  wait exactly ONE candle  ->  order one tick beyond
    the furthest point reached across those two candles.

WHY IT WORKS AS A STOP ORDER, in his words:

    "we leave space on the predicted path of the price and also expect the price to pullback and
     never fill us. So if the price finishes pullback and fills us we are fine. And if it goes the
     pullback direction without filling us we are safe too. However, in some cases the price tend to
     be volatile so it would just knock us and then goes the pullback direction. In that case, we
     are out and wait for the next trade."

NO PULLBACK IS NOT A REASON TO STAND ASIDE: *"A valid setup is not skipped because there is no
pullback. If there is no pullback where we expect it, we assume it is there and enter but report that
in the signal."* The card says PULLBACK ASSUMED on its face when that happens.

ALIGNMENT IS UNCHANGED and stays his: price on our side of the line means the 1M is running with the
1HR. Price the WRONG side means the 1M is running against us, and the last fractal of that counter-
move must break first — *"we wait for a 1M fractal break to confirm the price will go to our
predicted direction"* (vix1_fractal). The break confirms; the cross still sets the level.

THE STOP — his rule, 2026-08-20: *"The stop can be behind the 1HR line or on it depending on when we
get the pullback."* So it anchors to whichever is FURTHER from the trade: the line, or the pullback's
own far edge when the pullback dipped through the line. Never a pip count; every size below is a
multiple of something the market drew, which is what he asked for: *"Make it dynamic and conforming
to market dynamics. Not hardcoded but practical."*

WHAT WAS DELETED HERE, 2026-08-20, and must not come back. The stop used to hunt the nearest 1M
"region of interest" — fractals, swing points and zones (`vix1_roi`, now gone). A swing point needs
seven bars, and the window it searched began at the momentum candle's close, so for the first ~8
minutes after ANY momentum candle there was nothing to find and the setup was refused outright. On
XAU/USD 20 Aug that moved the entry from 4457.92 to 4450.58 and the risk from $11.19 to $18.58. It
answered a question he never asked.
"""
import logging
import math

from core.types import Candle
from shared.candle_math import full_range
from shared.mtf_utils import closed_only, seconds
from strategies import vix1_cross, vix1_log
from strategies.vix1_fractal import fractal_broken
from strategies.vix1_lines import draw_line

log = logging.getLogger(__name__)

# Every size here is a MULTIPLE OF SOMETHING THE MARKET DREW. These three are his, settled
# 2026-07-26 when a flat 5-pip stop was removed: *"make this dynamic. If you hardcode it wont work
# because the market is not perfect."* They are carried into the rebuild unchanged, because changing
# a settled multiplier while rebuilding around it is how a rebuild quietly becomes a re-tune.
_SL_GAP_MULT   = 0.5   # how far BEYOND the anchor the stop sits, x the 1M's recent average range
_GAP_AVG_N     = 14    # bars of 1M in that average — the platform's usual baseline
_MIN_ROOM_MULT = 1.0   # the floor: the noise a stop has to survive, x that same average


def _m1_range(wcl: list[Candle]) -> float:
    """The 1M's own recent average RANGE — the yardstick every size here is measured in."""
    if not wcl:
        return 0.0
    tail = wcl[-_GAP_AVG_N:]
    return sum(full_range(c) for c in tail) / len(tail)


def m1_signals(m1: list[Candle], bullish: bool, vc: Candle,
               pip: float = 0.0001, symbol: str = "",
               spread: float | None = None,
               quote: tuple[float, float] | None = None,
               now: float | None = None) -> list[dict]:
    """The 1M entry — [{"kind", "entry", "sl", "sl_note"}] or [] (logs why).

    `vc` is the FIRST momentum candle of the 1HR run; its body close is THE LINE. The caller turns
    `entry`/`sl` into a 4R target, so risk-reward is fixed by construction.

    `spread` (price units, ask - bid) shifts a BUY order up by exactly one spread so the trigger means
    "the bid broke the high" rather than "the ask did" — see `vix1_cross.decide`. It also widens the
    risk floor, because a stop shorter than the cost of getting in cannot win. None or 0 reproduces
    the pre-spread behaviour exactly.

    `quote` is the live (bid, ask). The two decisions below that are about THIS INSTANT — which side
    of the line price is on, and whether a stop order would fill immediately — used the newest closed
    M1 close, up to ~2 min old on this feed. None falls back to it, so a missing quote never silences
    the instrument.
    """
    if not m1:
        return []
    # PRICE PRECISION derived EXACTLY from the pip, never guessed — cTrader's convention is
    # pip = 10^-(pipDigits-1), so this inverts it with no symbol lookup.
    digits = max(0, round(1.0 - math.log10(pip))) if pip > 0 else 5
    hr, line = seconds(vc.timeframe), draw_line(vc)
    win    = [c for c in m1 if c.time >= vc.time + hr]   # only since the line was set
    if len(win) < 2:
        vix1_log.say(symbol, f"[vix1] {symbol} 1M: only {len(win)} bars since the momentum candle "
                             f"closed — waiting")
        return []

    # LEVELS vs TRIGGERS (the hard rule). `wcl` is CLOSED and is what the cross, the level and the
    # stop are read from; the live quote below answers the trigger questions.
    #
    # THIS LINE USED TO DROP A REAL BAR EVERY TIME (fixed 2026-08-21). It read
    # `win[:-1] if win[-1].time == m1[-1].time else win` — and `win` is a suffix of `m1`, so
    # `win[-1] IS m1[-1]` and the condition was ALWAYS true. Written to drop the forming bar, it
    # binned a finished one instead (the feed serves closed bars only) and saw the cross a full
    # minute late on every entry. `closed_only` asks whether the bar is ACTUALLY still forming.
    wcl = closed_only(win, now)
    if len(wcl) < 2:
        return []

    # ALIGNMENT — unchanged, and his. The line answers "is the 1M with us?"
    #
    # READ ON THE BID, because the line is drawn from bid candles and this compares the two. Falls
    # back to the newest closed close when there is no quote.
    last = quote[0] if quote else win[-1].close
    if (last > line) if bullish else (last < line):
        route = ""
    else:
        broke, lvl = fractal_broken(wcl, bullish)
        if not broke:
            seen = "none formed yet" if lvl is None else f"{lvl:.{digits}f}"
            vix1_log.say(symbol, f"[vix1] {symbol} 1M: price {last:.{digits}f} is the wrong side of the "
                                 f"line ({line:.{digits}f}) and the counter-move's last fractal ({seen}) "
                                 f"has not broken — waiting")
            return []
        route = "fractal_"

    # THE CROSS and the level (vix1_cross) — the only thing the 1M is asked.
    sp = max(0.0, spread or 0.0)
    x = vix1_cross.decide(wcl, bullish, line, pip, spread=sp)
    if x is None:
        ci = vix1_cross.cross_index(wcl, bullish, line)
        why = ("no 1M candle has CLOSED past the line yet" if ci is None else
               f"the cross closed at {wcl[ci].close:.{digits}f}; waiting for the candle after it")
        vix1_log.say(symbol, f"[vix1] {symbol} 1M: {why} — waiting")
        return []
    entry = x.entry

    # THE STOP anchors to whichever is FURTHER from the trade — the line, or the pullback's own far
    # edge when the pullback dipped through it. One expression covers both halves of his rule.
    anchor = line
    if x.pullback is not None:
        anchor = min(anchor, x.pullback.low) if bullish else max(anchor, x.pullback.high)
    m1_rng = _m1_range(wcl)
    gap    = max(_SL_GAP_MULT * m1_rng, vix1_cross.tick(pip))
    sl     = anchor - gap if bullish else anchor + gap
    where  = "the pullback's far edge" if (x.pullback is not None and anchor != line) else "the line"
    sl_note = f"{abs(entry - sl)/pip:.1f}p — {gap/pip:.1f}p beyond {where} ({anchor:.{digits}f})"

    # ALREADY THROUGH THE LEVEL? Then the order would be a stop sitting behind the market, which the
    # broker fills at once — so it IS a market entry, and it is priced honestly as one rather than
    # the setup being thrown away. His rule again: a valid setup is not skipped. The ceiling below is
    # what refuses it once price has run so far that the stop can no longer pay off two candles.
    #
    # TESTED ON THE SIDE THE ORDER ACTUALLY TRIGGERS ON. A BUY stop triggers on the ASK and a SELL
    # stop on the BID — the same broker fact that made `vix1_cross.decide` add the spread to buys.
    # `entry` already carries that spread, so asking "has the bid passed it" compared an ask-frame
    # trigger against a bid price and called a live stop order a market entry a spread too early.
    # Without a quote this falls back to the closed close on both sides, which is the old behaviour.
    trigger = (quote[1] if bullish else quote[0]) if quote else last
    market = (entry <= trigger) if bullish else (entry >= trigger)
    if market:
        entry   = trigger
        sl_note += " — price already through the level, so this is a MARKET entry"

    risk     = abs(entry - sl)
    max_risk = full_range(vc)          # "2 candles of 1HR gives 2R" -> one candle is 1R
    # THE FLOOR NOW CARRIES THE SPREAD TOO. It was the NOISE a stop must survive; the cost of
    # getting in is the other thing it must survive, and a stop shorter than the spread is a
    # guaranteed loss — you buy at the ask and the stop sits on the bid, so the market only has to
    # move (risk - spread) against you. Measured 2026-08-20: 32% of EUR/USD stops were under 3 pips
    # against a 1.2 pip spread. Added, not multiplied — no new tuning constant.
    room     = max(_MIN_ROOM_MULT * m1_rng + sp, vix1_cross.tick(pip))
    if risk < room:
        # A stop too tight gets wicked out of a trade that then runs our way. The floor is the NOISE
        # it has to survive, measured in the 1M's own range — never in pips.
        if room > max_risk:
            vix1_log.say(symbol, f"[vix1] {symbol} 1M: the 1M needs {room/pip:.1f}p of room and one 1HR "
                                 f"candle is only {max_risk/pip:.0f}p — no honest stop fits; skipping")
            return []
        sl      = entry - room if bullish else entry + room
        risk    = room
        sl_note = (f"{room/pip:.1f}p (floor = {_MIN_ROOM_MULT:.1f}x the 1M's recent range"
                   + (f" + {sp/pip:.1f}p spread)" if sp else ")"))
    if risk > max_risk:
        vix1_log.say(symbol, f"[vix1] {symbol} 1M: the stop is {risk/pip:.1f}p from the entry, wider than "
                             f"one 1HR candle ({max_risk/pip:.0f}p) — it cannot pay 1:2 off a "
                             f"two-candle move; skipping")
        return []

    kind = f"{route}{'pullback' if x.seen else 'assumed'}"
    vix1_log.say_always(f"[vix1] {symbol} 1M {kind.upper()} entry — {'BUY' if bullish else 'SELL'} "
                        f"{'market' if market else 'stop'} {entry:.{digits}f} SL {sl:.{digits}f} "
                        f"({sl_note}; line {line:.{digits}f})")
    return [{"kind": kind, "entry": entry, "sl": sl, "sl_note": sl_note,
             # kept so the card and the DB row need no schema change — the path that set them is gone
             "late": False, "late_note": ""}]
