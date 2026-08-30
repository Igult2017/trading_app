"""
Build 1-minute candles from the FIX bid-tick stream, so a bar exists the moment it ends.

WHY. The broker publishes a finished bar **10-70 seconds after it closes** (`candle_cache.py:45`,
measured against the live feed). That delay lands on the H1 momentum candle and then again on every
M1 bar of the entry sequence, and the consequence was measured: all four stored VIX.1 signals arrived
at or past their own entry, two of them genuinely through it. His words: *"The delay begins from 1HR
momentum candle."*

A candle is only four numbers from a minute — first price, highest, lowest, last. Watching every
price as it happens means building it ourselves and knowing it is finished at the second it finishes.
The H1 candle then comes from these via `candle_aggregator`, which was already proved exact (48/48
bars across all five instruments, to the last decimal); its own note closed by naming this gap —
*"nothing finer exists to build one from."*

BID TICKS ONLY. cTrader's own candles are bid-based — *"It is not possible to get trendbars based on
ask prices"* — and measured 3-for-3 here, the broker's M1 close equals the FIX bid exactly. Building
from mid or ask would shift every level by the spread.

THE MINUTE COMES FROM THE BROKER'S CLOCK, never ours. A local clock that has drifted would bucket a
tick into the wrong minute and produce a bar that never existed.

NOTHING HERE IS TRUSTED BY ITSELF. `tick_bar_audit` compares every bar produced here against the
broker's own when it arrives, and only a symbol matching exactly is ever served. cTrader publishes no
guarantee that every tick is delivered, so "our bars look right" is not a thing that may be assumed.
"""
import logging
import threading

from core.types import Candle

log = logging.getLogger(__name__)

_MINUTE = 60
_KEEP = 240                    # minutes retained per symbol — 4 hours, ample for the freshest tail


class _Building:
    """The bar currently accumulating for one symbol."""

    __slots__ = ("minute", "open", "high", "low", "close", "ticks", "covered")

    def __init__(self, minute: int, price: float, covered: bool):
        self.minute = minute
        self.open = self.high = self.low = self.close = price
        self.ticks = 1
        # COVERED means the stream was already connected when this minute STARTED. A bar that began
        # before we were listening is missing its early ticks, so its open — and possibly its high or
        # low — would be wrong. Those are discarded rather than served.
        self.covered = covered

    def add(self, price: float) -> None:
        self.high = max(self.high, price)
        self.low = min(self.low, price)
        self.close = price
        self.ticks += 1


class TickBarBuilder:
    """1-minute bars per symbol, built from bid ticks. Thread-safe: ticks arrive on the stream's
    task while candle fetches read from another."""

    def __init__(self):
        self._lock = threading.Lock()
        self._building: dict[str, _Building] = {}
        self._done: dict[str, list[Candle]] = {}
        # When continuous coverage began, per symbol. Reset on every disconnect, because a gap means
        # the minutes around it cannot be vouched for.
        self._covered_since: dict[str, float] = {}

    # ── the stream talks to these two ──────────────────────────────────────────

    def connected(self, symbols: list[str], now: float) -> None:
        """The stream came up. Coverage starts NOW, not retroactively."""
        with self._lock:
            for s in symbols:
                self._covered_since[s] = now
                self._building.pop(s, None)      # anything half-built pre-dates this coverage

    def disconnected(self, now: float | None = None) -> None:
        """The stream dropped. Every symbol loses coverage and its part-built bar.

        DELIBERATELY DESTRUCTIVE. The bar in progress is missing whatever happened while we were
        away, and a bar with a hole in it is worse than no bar — it looks complete.
        """
        with self._lock:
            self._covered_since.clear()
            self._building.clear()

    def on_tick(self, symbol: str, price: float, epoch: float) -> None:
        """One bid tick. `epoch` is the BROKER's own send time, never the local clock."""
        if not symbol or price is None or not epoch:
            return
        minute = int(epoch // _MINUTE)
        with self._lock:
            cur = self._building.get(symbol)
            if cur is None:
                self._building[symbol] = _Building(minute, price, self._covers(symbol, minute))
                return
            if minute == cur.minute:
                cur.add(price)
                return
            if minute < cur.minute:
                # A tick older than the bar being built. Out-of-order delivery or a clock artefact;
                # either way it cannot be placed honestly, so it is dropped rather than guessed at.
                return
            self._close(symbol, cur)
            self._building[symbol] = _Building(minute, price, self._covers(symbol, minute))

    # ── what the rest of the platform reads ────────────────────────────────────

    def bars(self, symbol: str, count: int = _KEEP) -> list[Candle]:
        """Finished, fully-covered bars for this symbol, oldest first. Never the one in progress."""
        with self._lock:
            return list(self._done.get(symbol, ()))[-count:]

    def newest_minute(self, symbol: str) -> int | None:
        """The minute of the newest FINISHED bar, or None."""
        with self._lock:
            done = self._done.get(symbol)
            return int(done[-1].time // _MINUTE) if done else None

    # ── internals ──────────────────────────────────────────────────────────────

    def _covers(self, symbol: str, minute: int) -> bool:
        since = self._covered_since.get(symbol)
        return since is not None and since <= minute * _MINUTE

    def _close(self, symbol: str, b: _Building) -> None:
        """Finish a bar. Only a fully-covered one is kept."""
        if not b.covered:
            return
        bar = Candle(time=b.minute * _MINUTE, open=b.open, high=b.high, low=b.low,
                     close=b.close, volume=float(b.ticks), timeframe="M1")
        done = self._done.setdefault(symbol, [])
        # A minute we already hold must never be appended twice — that would put a duplicate
        # timestamp into a series and break the continuity check that guards the join.
        if done and done[-1].time >= bar.time:
            return
        done.append(bar)
        if len(done) > _KEEP:
            del done[:-_KEEP]


# One builder for the process — the stream is one connection and the readers are many.
builder = TickBarBuilder()
