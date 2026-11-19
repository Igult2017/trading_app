"""PLUMBING: anything that wants every live price tick registers here (18 Nov 2026).

`monitor/entry_watcher.py` hands each registered listener to the live price stream (FIX) every time it (re)connects,
as `(symbol, bid, broker_epoch)` for every tick. The stream calls each listener inside its own try (`data/fix_book.py`),
so a listener that fails is logged and can never stop the stream or the other listeners.

First user: PIX's per-market buy/sell estimate (`strategies/pix_tickflow.py`). Nothing strategy-specific lives here — it is a
list, so the watcher never has to import a strategy.
"""
LISTENERS: list = []


def register(fn) -> None:
    if fn not in LISTENERS:
        LISTENERS.append(fn)
