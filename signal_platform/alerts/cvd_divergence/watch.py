"""THE LIVE WATCH — his indicator's comparison made AS IT HAPPENS, then the 1M turn (his words, 23 Nov 2026).

*"I think it can spot divergence in real time because when the price and CVD are moving the opposite direction that can
be spotted in real time and so we wait and when reversal starts we are in. First spot divergence and then send
notification when reversal has started in 1M."*

Run once a minute per market, on the 1H candles (CLOSED hours + the hour in progress rebuilt from closed 1M candles) and
the closed 1M candles. Pure: state in, (state, events) out — `job.py` does the reading, saving and sending.

  * THE LEVEL — the last swing high/low his indicator has CONFIRMED (5 closed hours each side, `cvd.scan`): closed
    candles only, so it never moves while price does.
  * STARTED (bearish) — an hour after that swing (closed, or the one in progress) goes ABOVE it while CVD at that hour is
    LOWER than CVD at the swing: the comparison his indicator will make if that hour becomes the swing, made now instead
    of 5 hours later. Bullish mirrored (below the swing low, CVD higher).
  * CANCELLED — his rule: *"when the predicted divergence fails and the price and CVD converge"*: while the watch is open,
    CVD now reaches (or passes) its value at the swing — they agree again. Checked BEFORE the turn, so a failed divergence
    never also reports a reversal.
  * 1M REVERSAL — his words *"1m candles have changed direction"*, read as (approved plan, 23 Nov): bearish — follow the
    1M candle that made the HIGHEST high since the diverging hour opened; the turn is a LATER closed 1M candle closing
    BELOW that candle's low. A candle that makes a new high replaces it and can never be its own turn. Bullish mirrored.
  * One watch per market per side at a time; each reference swing is watched once (never re-announced).
"""
from __future__ import annotations

from alerts.cvd_divergence import cvd as C

DONE_KEEP = 200


def _key(symbol: str, side: str) -> str:
    return f"{symbol}|{side}"


def find_start(series: list, cvds: list, ref: int, side: str) -> int | None:
    """The first hour after swing `ref` that diverges from it (index into `series`), or None."""
    if ref < 0 or cvds[ref] is None:
        return None
    for h in range(ref + 1, len(series)):
        if cvds[h] is None:
            continue
        if side == "bearish" and series[h].high > series[ref].high and cvds[h] < cvds[ref]:
            return h
        if side == "bullish" and series[h].low < series[ref].low and cvds[h] > cvds[ref]:
            return h
    return None


def _converged(side: str, now_cvd, ref_cvd) -> bool:
    """Price and CVD agree again: CVD now at/above its value at the swing high (bearish), at/below the swing low's."""
    if now_cvd is None or ref_cvd is None:
        return False
    return now_cvd >= ref_cvd if side == "bearish" else now_cvd <= ref_cvd


def _turn(w: dict, m1_closed: list) -> dict | None:
    """Feed the new closed 1M candles to the watch; the candle that turned it, or None. Updates `w` in place."""
    bear = w["side"] == "bearish"
    for m in m1_closed:
        if m.time < w["since"] or m.time <= w["last_m1"]:
            continue
        w["last_m1"] = m.time
        if w["ext"] is None or (m.high > w["ext"] if bear else m.low < w["ext"]):
            w["ext"], w["ext_time"], w["guard"] = (m.high if bear else m.low), m.time, (m.low if bear else m.high)
        elif (m.close < w["guard"]) if bear else (m.close > w["guard"]):
            return {"time": m.time, "close": m.close}
    return None


def step(state: dict, symbol: str, closed_h1: list, forming, m1_closed: list) -> tuple[dict, list[dict]]:
    """One minute for one market. `forming` = the hour in progress (None when nothing has traded in it)."""
    events: list[dict] = []
    watches = state.setdefault("watches", {})
    done = state.setdefault("done", [])
    _, last_hi, last_lo = C.scan(closed_h1)
    series = closed_h1 + ([forming] if forming is not None else [])
    cvds = C.cvd_series(series)
    now_cvd = cvds[-1] if cvds else None
    for side, ref in (("bearish", last_hi), ("bullish", last_lo)):
        k = _key(symbol, side)
        w = watches.get(k)
        if w is None:
            h = find_start(series, cvds, ref, side)
            if h is None:
                continue
            tag = f"{k}|{series[ref].time}"
            if tag in done:
                continue                       # this swing was already watched: never announced twice
            done.append(tag)
            del done[:-DONE_KEEP]
            if _converged(side, now_cvd, cvds[ref]):
                continue                       # found late and already over: a "started" + "cancelled" pair is noise
            px = series[h].high if side == "bearish" else series[h].low
            w = {"side": side, "ref_time": series[ref].time, "ref_price": series[ref].high if side == "bearish"
                 else series[ref].low, "ref_cvd": cvds[ref], "since": series[h].time, "price": px, "cvd": cvds[h],
                 "ext": None, "ext_time": None, "guard": None, "last_m1": 0}
            watches[k] = w
            events.append({"kind": "started", "symbol": symbol, **w})
        if _converged(side, now_cvd, w["ref_cvd"]):
            events.append({"kind": "cancelled", "symbol": symbol, "now_cvd": now_cvd, **w})
            del watches[k]
            continue
        turn = _turn(w, m1_closed)
        if turn is not None:
            events.append({"kind": "reversal", "symbol": symbol, "turn": turn, **w})
            del watches[k]
    return state, events
