"""
ONE TRADE AT A TIME — AND WHEN SIGNALS ARRIVE TOGETHER, THE BEST ONE IS THE ONE TAKEN.

HIS RULE, 15 Nov 2026: *"On the correlated pair, if all the pairs have signals at the same time, we
should choose the best one because we only trade 1 signal at a time."*

The guard (`guards.check`, rule 7) already refuses a new order while one is live. That alone would
make the FIRST signal win, not the best: the pairs are scanned side by side (`orchestrator/scanner.py`,
`asyncio.gather`), so EUR/USD and GBP/USD closing the same candle reach the placer a moment apart and
whichever happened to finish its scan first would take the slot.

SO SIGNALS ARE HELD FOR A SHORT CHOOSING WINDOW (`_WINDOW_S`) after the first one arrives, then the
best is placed and the others are told why not. Signals on different pairs usually arrive minutes
apart; then the window costs the one signal five seconds and changes nothing else.

"BEST", IN THIS ORDER:
  1. HIS GRADE — the signal's confidence, which IS the momentum candle's grade (A = 0.85, weaker shapes
     0.74 down to 0.60; `docs/strategies/vix1.md`).
  2. ON A TIE, THE ONE THE SPREAD EATS LEAST — spread as a share of the stop. That is the measured
     lever: over 222 real fills the spread cost the sells 37.9R in a year
     (`docs/strategies/vix1-measured.md`), and the smaller its share of the stop, the smaller that cost.
  3. Still tied — the one that arrived first.

Never raises into the placer: a fault here lets the signal through to the guards, which still refuse
anything unsafe. The window is a CHOICE between good signals, not a safety check.
"""
import asyncio
import logging

log = logging.getLogger(__name__)

#: How long the first signal waits for others to arrive. His number to change; 5 s covers signals from
#: the same candle close, which is the only case where "the same time" is real.
_WINDOW_S = 5.0

# The signals waiting in the current window, in arrival order, each with the future that answers it.
_waiting: list | None = None


def _spread_share(sig) -> float:
    """How much of the stop the spread takes. 1.0 (the worst) when it cannot be worked out."""
    stop = abs(float(getattr(sig, "entry_price", 0) or 0) - float(getattr(sig, "stop_loss", 0) or 0))
    spread = float(getattr(sig, "spread_used", 0.0) or 0.0)
    return spread / stop if stop > 0 else 1.0


def _grade(sig) -> float:
    """His grade (the confidence); 0 when a signal carries none."""
    return float(getattr(sig, "confidence", 0.0) or 0.0)


def score(sig) -> tuple[float, float]:
    """Higher is better: his grade first, then the smaller spread share."""
    return (round(_grade(sig), 4), -_spread_share(sig))


def describe(sig) -> str:
    d = getattr(getattr(sig, "direction", None), "value", "")
    side = "BUY" if d == "buy" else "SELL"
    return (f"{getattr(sig, 'symbol', '?')} {side} (grade {_grade(sig):.2f}, spread "
            f"{_spread_share(sig) * 100:.0f}% of its stop)")


async def take_turn(signal) -> str | None:
    """Wait for the choosing window. None = this signal is the one to place; a string = why not."""
    global _waiting
    try:
        answer: asyncio.Future = asyncio.get_running_loop().create_future()
        if _waiting is not None:                 # a window is open: join it and wait for the verdict
            _waiting.append((signal, answer))
            return await answer
        _waiting = [(signal, answer)]
        try:
            await asyncio.sleep(_WINDOW_S)
        finally:
            batch, _waiting = _waiting, None
            # max() keeps the FIRST of equal scores, so a full tie goes to the earliest arrival.
            best = max(batch, key=lambda e: score(e[0]))[0]
            for sig, fut in batch:
                if fut.done():
                    continue
                fut.set_result(None if sig is best else
                               f"one trade at a time — another signal arrived together and was "
                               f"better: {describe(best)}, against this one's "
                               f"{_grade(sig):.2f} grade and "
                               f"{_spread_share(sig) * 100:.0f}% spread")
            if len(batch) > 1:
                log.info(f"[best_signal] {len(batch)} signals together — placing {describe(best)}")
        return await answer
    except Exception as exc:
        log.warning(f"[best_signal] choosing failed ({type(exc).__name__}: {exc}) — letting this "
                    f"signal through to the guards")
        return None


def reset() -> None:
    """Tests only."""
    global _waiting
    _waiting = None
