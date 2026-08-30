"""
Are our tick-built candles the SAME candles the broker eventually sends? The gate on the whole idea.

WHY THIS IS A GATE AND NOT A NICETY. cTrader publishes **no guarantee that every tick is delivered**
— its FIX limitations page is silent on throttling and completeness, and cTrader itself recommends
the Open API alongside FIX for market data. If ticks are ever coalesced or dropped, our high or low
differs from the broker's. **A fast wrong candle is far worse than a slow right one**: the momentum
test could pass when it should not, or the line be drawn at the wrong level, and we would then be
placing trades faster onto wrong numbers.

So nothing built from ticks is served until it has been proved, and the proof runs continuously in
production rather than once at build time. Every bar we build is compared against the broker's own
when it arrives 10-70s later.

THE BAR IS EXACTNESS, and it is the bar the aggregator already cleared: open, high, low and close
identical to the last decimal, over a minimum sample, with a 100% recent match rate. Not "close
enough" — a tenth of a pip on a 3-pip stop is a third of the risk.

TRUST IS PER SYMBOL. One instrument's feed misbehaving must not disqualify the others, and a symbol
that fails is simply served from the broker exactly as it is today.

PHASE 1 SERVES NOTHING. This module only observes and reports; `serve_enabled` is what turns the
result into a behaviour change, and it stays off until the match rate has been read off a live
session.
"""
import logging
import threading
from collections import deque

log = logging.getLogger(__name__)

# How many consecutive matching bars before a symbol is trusted. One live hour gives ~60 per symbol,
# so this is minutes of evidence, not days — but it is never zero.
MIN_SAMPLE = 30
# How many recent comparisons the verdict is taken over.
_WINDOW = 200


class _SymbolAudit:
    __slots__ = ("results", "matched", "compared", "last_mismatch")

    def __init__(self):
        self.results = deque(maxlen=_WINDOW)
        self.matched = 0
        self.compared = 0
        self.last_mismatch: str | None = None


class TickBarAudit:
    """Per-symbol scoreboard of tick-built bars against the broker's own."""

    def __init__(self):
        self._lock = threading.Lock()
        self._by_symbol: dict[str, _SymbolAudit] = {}

    def compare(self, symbol: str, ours, theirs) -> bool | None:
        """One bar against its broker counterpart. True/False, or None if not comparable.

        None means the pair could not be judged (no counterpart for that minute) and is NOT counted
        either way — scoring an unanswerable comparison as a pass is how a bad feed earns trust.
        """
        if ours is None or theirs is None or ours.time != theirs.time:
            return None
        ok = (ours.open == theirs.open and ours.high == theirs.high
              and ours.low == theirs.low and ours.close == theirs.close)
        with self._lock:
            a = self._by_symbol.setdefault(symbol, _SymbolAudit())
            a.results.append(ok)
            a.compared += 1
            if ok:
                a.matched += 1
            else:
                a.last_mismatch = (
                    f"{symbol} @{ours.time}: ours O{ours.open} H{ours.high} L{ours.low} "
                    f"C{ours.close} vs broker O{theirs.open} H{theirs.high} L{theirs.low} "
                    f"C{theirs.close}")
                log.warning(f"[tick-audit] MISMATCH {a.last_mismatch}")
        return ok

    def trusted(self, symbol: str) -> bool:
        """May this symbol's tick-built bars be served?

        Requires a minimum sample AND no mismatch anywhere in the recent window. A single wrong bar
        withdraws trust — there is no partial credit, because there is no such thing as a candle that
        is mostly right.
        """
        with self._lock:
            a = self._by_symbol.get(symbol)
            if a is None or len(a.results) < MIN_SAMPLE:
                return False
            return all(a.results)

    def report(self, symbol: str | None = None) -> dict:
        """The scoreboard, for logs and the reader tool."""
        with self._lock:
            out = {}
            for sym, a in self._by_symbol.items():
                if symbol and sym != symbol:
                    continue
                n = len(a.results)
                out[sym] = {
                    "compared": a.compared,
                    "matched": a.matched,
                    "recent": n,
                    "recent_matched": sum(1 for r in a.results if r),
                    "trusted": n >= MIN_SAMPLE and all(a.results),
                    "last_mismatch": a.last_mismatch,
                }
            return out


audit = TickBarAudit()
