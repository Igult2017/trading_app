"""PIX OPTIONS — WAS THE LEVEL RESPECTED? (his rule 23 Nov 2026, answers 4A + 5B). Pure: one level + the CLOSED 1M
candles since the map was made → "signal", "broken" or "waiting". Replayed from the map's time every minute, so a
restart cannot lose or double anything; a level that has signalled or broken is marked in the database and not asked
again (one reaction per level per session — the guide's single-touch rule).

  * SELL level L: TOUCH = a 1M candle's high reaches L. A candle CLOSING above L = BROKEN (a close through, not a
    reaction). After the touch, the first LATER 1M candle closing below L = RESPECTED → signal. (The touching candle is
    never its own confirmation — a reaction is shown by the candle after.)
  * BUY level L: mirrored (low reaches L; a close below = broken; a later close above = respected).
  * SWEEP TRAP (his picture + guide: "wait for price to sweep/break below the level and then close back above"): price
    must trade BELOW L first — a close below is part of the sweep, not a break — then a LATER candle closes back above L.
    A touch alone is never enough.
  * ENTRY = the close of the confirming candle. STOP = PIX's own sizes (`strategies/pix_entry.py`, imported so the two
    can never drift): beyond the visit's extreme (highest high for a sell, lowest low for a buy) by SL_GAP_MULT × the 1M
    average range (GAP_AVG_N candles), + the spread on a sell; never closer than MIN_ROOM_MULT × that range + the
    spread. TARGET = TARGET_R (3R) — PIX's `pix_skeleton.TARGET_R`.
"""
from __future__ import annotations

from strategies.pix_entry import GAP_AVG_N, MIN_ROOM_MULT, SL_GAP_MULT, avg_range
from strategies.pix_skeleton import TARGET_R


def _plan(level: dict, visit: list, confirm, history: list, spread: float) -> dict:
    sell = level["side"] == "sell"
    sp = max(0.0, spread)
    rng = avg_range(history[-GAP_AVG_N:])
    entry = confirm.close
    if sell:
        ext = max(x.high for x in visit)
        sl = ext + SL_GAP_MULT * rng + sp
    else:
        ext = min(x.low for x in visit)
        sl = ext - SL_GAP_MULT * rng
    note = f"stop {SL_GAP_MULT:g}× the 1M average range beyond the reaction's {'high' if sell else 'low'} {ext:g}" + \
        (" + the spread" if sell else "")
    room = MIN_ROOM_MULT * rng + sp
    if abs(entry - sl) < room:
        sl = entry + room if sell else entry - room
        note = f"stop widened to the floor: {MIN_ROOM_MULT:g}× the 1M average range + the spread"
    risk = abs(entry - sl)
    tp = entry - TARGET_R * risk if sell else entry + TARGET_R * risk
    return {"entry": entry, "sl": sl, "tp": tp, "rr": TARGET_R, "extreme": ext, "confirm_at": confirm.time,
            "touch_at": visit[0].time, "note": note}


def judge(level: dict, m1: list, spread: float = 0.0) -> tuple[str, dict | str]:
    """("signal", plan) | ("broken", why) | ("waiting", why). `m1` = closed 1M candles since the map, oldest first."""
    L, sell, sweep = level["strike"], level["side"] == "sell", level.get("sweep", False)
    first = None
    for k, x in enumerate(m1):
        touched = (x.high >= L) if sell else (x.low <= L if not sweep else x.low < L)
        if first is None:
            if not touched:
                continue
            first = k
            if not sweep and ((x.close > L) if sell else (x.close < L)):
                return "broken", f"a 1M candle closed {'above' if sell else 'below'} {L:g} — broken, not respected"
            continue
        if not sweep and ((x.close > L) if sell else (x.close < L)):
            return "broken", f"a 1M candle closed {'above' if sell else 'below'} {L:g} — broken, not respected"
        if (x.close < L) if sell else (x.close > L):
            return "signal", _plan(level, m1[first:k + 1], x, m1[:k + 1], spread)
    if first is None:
        return "waiting", ("price has not swept below the level yet" if sweep else "price has not reached the level")
    return "waiting", ("swept — waiting for a 1M close back above" if sweep else
                       "touched — waiting for a 1M close back " + ("below" if sell else "above"))
