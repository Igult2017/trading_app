"""
VOCANT.1 — 1M entry at the 1HR volume-candle TRANSITION.

Playbook STEP 2: once the 1HR volume bias is set, drop to the 1M, "wait for price to align with the
1HR direction" (p2 ALIGNMENT — a rule, not a suggestion), then "price pulls back, forms the fractal,
and then breaks below it" (p5) — taken with a stop just beyond that level so a reversal never fills:
"no trade, no risk" (p6).

WHERE the entry lives: the TRANSITION — the 1st volume candle ENDING while the 2nd one FORMS. Candle
1's close IS candle 2's open, one price: THE LINE. In that handover price pulls back against the
trend by a single candle, and the continuation out of it is the entry. On the 1HR that pullback is
candle 2's open-side wick, and candle 1's own open-side wick sizes it — so the stop is DERIVED from
the line + that band rather than guessed. A volume candle has small wicks by definition (that IS the
1HR filter), which is what keeps the band tight enough to trade at all.

The entry window is candle 2's lifetime — nothing arbitrary. Early in it the line is close, so the
stop sits at the line; if price ran first and the pullback comes late, that same stop is unreasonably
far and is capped at the standard. Once candle 2 has formed the transition is over and there is no
entry: we never hunt a stale fractal hours downstream of the move that justified it.
"""
import logging

from core.types import Candle
from shared.candle_math import is_bullish, upper_wick, lower_wick
from shared.mtf_utils import seconds
from strategies.vocant1_bias import clear_trend

log = logging.getLogger(__name__)

# The standard stop, per instrument: a stop has to be reasonable and 2R has to stay reachable.
# GBP/USD ranges ~1.3-1.5x EUR/USD, so one flat number would stop it inside its own noise.
_MAX_SL_PIPS     = {"EUR/USD": 15.0, "GBP/USD": 20.0}
_MAX_SL_FALLBACK = 15.0
_MIN_SL_PIPS     = 5.0   # never stop tighter than this, however close the line sits
_ENTRY_BUFFER    = 1     # pips — the stop sits JUST beyond the level, never resting on it
_SL_BUFFER       = 2     # pips — clear of the line and of the wick band printed off it
_PB_ORIGIN       = 3     # candles ending at the pullback that define the level it came from


def open_side_wick(vc: Candle, bullish: bool) -> float:
    """Candle 1's wick on its OPEN side: a bull candle opens at the body's bottom (so, its lower
    wick), a bear candle at the top (its upper wick). This sizes the pullback candle 2 prints as it
    opens off the line — the band the stop must clear to survive a routine transition wick."""
    return lower_wick(vc) if bullish else upper_wick(vc)


def _max_sl(symbol: str) -> float:
    return _MAX_SL_PIPS.get(symbol, _MAX_SL_FALLBACK)


def _dynamic_sl(entry: float, line: float, band: float, bullish: bool,
                pip: float, max_sl: float) -> tuple[float, float, bool]:
    """
    The stop is DYNAMIC:
      - pullback NEAR the line -> stop slightly beyond THE LINE and clear of its wick band, so the
        transition's own wick cannot take us out;
      - price ran first and the pullback came LATE -> that structural stop is now unreasonably far,
        so cap it at the standard and accept that a deep retrace stops us out.
    The line only serves as a stop while it sits on the protective side of the entry (i.e. price is
    already past it); otherwise the standard carries the trade. Returns (sl, risk, capped).
    """
    ideal  = (line - band - _SL_BUFFER * pip) if bullish else (line + band + _SL_BUFFER * pip)
    usable = (ideal < entry) if bullish else (ideal > entry)
    risk   = abs(entry - ideal) if usable else max_sl * pip
    capped = (not usable) or risk > max_sl * pip
    risk   = min(max(risk, _MIN_SL_PIPS * pip), max_sl * pip)
    return (entry - risk if bullish else entry + risk), risk, capped


def m1_signals(m1: list[Candle], bullish: bool, vc: Candle,
               pip: float = 0.0001, symbol: str = "") -> list[dict]:
    """
    The 1M entry for THIS transition — [{"kind", "entry", "sl"}] or [] (logs why).
    `vc` is the FIRST volume candle of the 1HR run: its close is the line, its open-side wick the band.
    """
    if not m1:
        return []
    digits = 5 if pip < 0.005 else 3
    bar    = max(1, seconds(m1[0].timeframe))     # never 0 — an unknown TF string must not divide-by-zero
    hr     = seconds(vc.timeframe)
    start  = vc.time + hr      # candle 1 closes == candle 2 opens == THE LINE
    end    = start + hr        # candle 2 has finished forming — the transition is over
    line   = vc.close
    band   = open_side_wick(vc, bullish)

    if m1[-1].time < start:
        log.info(f"[vocant1] {symbol} 1M: 1st volume candle just closed — transition not printed yet")
        return []
    if m1[-1].time >= end:
        log.info(f"[vocant1] {symbol} 1M: no entry — the 2nd candle finished forming "
                 f"{(m1[-1].time - end) // 60}m ago, so this transition is over; the entry sits at the "
                 f"1st->2nd handover. Waiting for the next volume candle.")
        return []

    win = [c for c in m1 if c.time >= start]
    if len(win) < 3:
        log.info(f"[vocant1] {symbol} 1M: only {len(win)} bars into the transition — waiting")
        return []

    # PLAYBOOK p2 ALIGNMENT — "do nothing until the 1M lines up with the 1HR". VOCANT.1's own
    # structure rule, read on the 1M across candle 1's own hour. A clearly counter-trend 1M waits;
    # an unformed read (0) is not a refusal — the transition is too young to have printed swings.
    if clear_trend(m1[-(hr // bar):]) == (-1 if bullish else 1):
        log.info(f"[vocant1] {symbol} 1M: structure still counter-trend to the 1HR bias — waiting "
                 f"for the 1M to line up (playbook: do nothing until it aligns)")
        return []

    # THE PULLBACK — one candle against the trend, inside the transition.
    p = next((i for i in range(len(win) - 1, -1, -1) if is_bullish(win[i]) != bullish), None)
    if p is None:
        log.info(f"[vocant1] {symbol} 1M: no pullback candle yet in the transition ({len(win)} bars "
                 f"in) — price is running; the stop needs a retrace to sit behind")
        return []

    # The level the pullback came FROM = the playbook's fractal: in a downtrend, the low price pulled
    # back up out of. The stop sits just beyond it, so a move the other way never fills us.
    seg   = win[max(0, p - _PB_ORIGIN + 1): p + 1]
    lvl   = max(c.high for c in seg) if bullish else min(c.low for c in seg)
    entry = lvl + _ENTRY_BUFFER * pip if bullish else lvl - _ENTRY_BUFFER * pip
    sl, risk, capped = _dynamic_sl(entry, line, band, bullish, pip, _max_sl(symbol))

    # The stop must still be UNFILLED — strictly beyond price in the trend direction. If price has
    # already taken the level, an order there is a LIMIT that fills INTO the move, which is the exact
    # opposite of this entry ("if price rises instead you stay out"). That continuation is gone.
    last = win[-1].close
    if (entry <= last) if bullish else (entry >= last):
        log.info(f"[vocant1] {symbol} 1M: the level is already broken (price {last:.{digits}f} vs stop "
                 f"{entry:.{digits}f}) — a stop there would fill into the move; that entry has gone")
        return []

    kind = "late" if capped else "transition"
    log.info(f"[vocant1] {symbol} 1M {kind.upper()} entry — {'BUY' if bullish else 'SELL'} stop "
             f"{entry:.{digits}f} SL {sl:.{digits}f} ({risk / pip:.1f}p, "
             f"{'capped at the standard' if capped else 'at the line'}; band {band / pip:.1f}p, "
             f"{(m1[-1].time - start) // 60}m into the transition)")
    return [{"kind": kind, "entry": round(entry, digits), "sl": round(sl, digits)}]
