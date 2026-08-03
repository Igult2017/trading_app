"""Render a Signal to a PNG card: price panel on the left, the numbers in Playfair on the right.

PUBLIC ENTRY POINT — `render(signal, candles, ...) -> path | None`.

REBUILT FROM SCRATCH 2026-08-03 at the user's instruction: *"This is not just wiring but full
rebuilt because the existing may not be reliable."* The previous `chart_generator.py` had been
orphaned for months — no callers, nothing ever set `Signal.chart_path`, so `_send_photo` never
fired and every card went out as text. Unexercised code is untrusted code; it was deleted rather
than revived.

THREE RULES THIS MODULE IS BUILT AROUND:
  * NEVER TAKE A SIGNAL DOWN. Every failure path returns None and the dispatcher falls back to the
    text card. A chart is a nicety; the signal is the product. Any exception here is caught.
  * STRATEGY-AGNOSTIC. It takes candles, three levels, and optional generic bands. It does not know
    what any strategy means by them, and must not — the strategies are independent.
  * OFF THE EVENT LOOP. matplotlib is synchronous and CPU-bound; `render_async` hands it to the
    default executor so a 60s scan loop is never blocked by drawing.
"""
import asyncio
import logging
import tempfile
import uuid
from functools import partial
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
from matplotlib.figure import Figure

from core.types import Candle, Signal
from charting import theme, price_panel, card_panel

log = logging.getLogger(__name__)

_MAX_CANDLES = 90        # enough context to see the move; more and the bodies vanish on a phone
_OUT = Path(tempfile.gettempdir()) / "bx_charts"


def render(sig: Signal, candles: list[Candle], digits: int = 5,
           bands: list[tuple] | None = None, subtitle: str = "") -> str | None:
    """PNG path, or None if anything at all goes wrong."""
    try:
        if not candles or len(candles) < 5:
            log.warning("[chart] %s: only %d candles — skipping", sig.symbol, len(candles))
            return None
        theme.register()
        view = candles[-_MAX_CANDLES:]

        # `Figure()` DIRECTLY, NOT `pyplot`. pyplot keeps a global registry of open figures and is
        # not thread-safe; these renders run in executor threads and several instruments are scanned
        # concurrently, so two pyplot figures in flight can corrupt each other's state. A bare
        # Figure owns nothing global, needs no `close()`, and is garbage-collected normally.
        fig = Figure(figsize=(12.4, 6.4), dpi=125, facecolor=theme.BG)
        gs = fig.add_gridspec(1, 2, width_ratios=[1.52, 1], wspace=0.03,
                              left=0.045, right=0.985, top=0.94, bottom=0.05)
        price_panel.draw(fig.add_subplot(gs[0, 0]), view, sig.entry_price, sig.stop_loss,
                         sig.take_profit, digits, bands)
        card_panel.draw(fig.add_subplot(gs[0, 1]), sig, digits, subtitle)

        _OUT.mkdir(parents=True, exist_ok=True)
        path = _OUT / f"{sig.strategy_id or 'sig'}_{sig.symbol.replace('/', '')}_{uuid.uuid4().hex[:8]}.png"
        fig.savefig(path, facecolor=theme.BG, bbox_inches="tight", pad_inches=0.22)
        return str(path)
    except Exception as exc:                      # noqa: BLE001 — a chart must never kill a signal
        log.warning("[chart] render failed for %s: %s: %s",
                    getattr(sig, "symbol", "?"), type(exc).__name__, exc)
        return None


async def render_async(sig: Signal, candles: list[Candle], digits: int = 5,
                       bands: list[tuple] | None = None, subtitle: str = "") -> str | None:
    """`render` on the default executor — matplotlib would otherwise block the scan loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, partial(render, sig, candles, digits, bands, subtitle))

# NO cleanup() HERE. `notifications/dispatcher.on_signal_confirmed` already unlinks the file after
# the send, and two owners of one file's lifetime is how a card gets deleted before it is sent.
# The dispatcher deletes it because only the dispatcher knows when the send finished.
