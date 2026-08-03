"""Render a Signal to a PNG card: masthead, chart, levels, stats, then the numbered read.

PUBLIC ENTRY POINT — `render(signal, candles, ...) -> path | None`.

VERTICAL, LIGHT, ONE COLUMN. The user's instruction after seeing the first build, 2026-08-03:
*"at the top we have the chart and below it an explanation follows"*, and the first attempt was
*"not clear"*. A tall light card reads on a phone the way a page does; a dark two-column one asks
the eye to jump between columns in a thumbnail.

REBUILT FROM SCRATCH at the user's instruction: *"This is not just wiring but full rebuilt because
the existing may not be reliable."* The previous `chart_generator.py` had been orphaned for months —
no callers, nothing ever set `Signal.chart_path`, so `_send_photo` never fired and every card went
out as text. Unexercised code is untrusted code; it was deleted rather than revived.

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
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure

from core.types import Candle, Signal
from charting import theme, price_panel, card_panel, read_panel

log = logging.getLogger(__name__)

_MAX_CANDLES = 70        # enough context to see the move; more and the bodies vanish on a phone
_OUT = Path(tempfile.gettempdir()) / "bx_charts"


def _notes(sig: Signal, buy: bool, digits: int) -> list[str]:
    """The caption under each level. A strategy may supply its own via `Signal.level_notes`;
    otherwise these are derived generically, so the renderer never has to know what produced them."""
    given = list(getattr(sig, "level_notes", None) or [])
    if len(given) == 3:
        return given
    pip = 0.01 if digits <= 3 else 0.0001
    to_tp = abs(sig.take_profit - sig.entry_price) / pip if sig.take_profit and sig.entry_price else 0
    return ["Confirmed entry",
            "Beyond the invalidation",
            f"{to_tp:.0f} pips from entry" if to_tp else "Fixed R multiple"]


def render(sig: Signal, candles: list[Candle], digits: int = 5,
           bands: list[tuple] | None = None, subtitle: str = "") -> str | None:
    """PNG path, or None if anything at all goes wrong."""
    try:
        if not candles or len(candles) < 5:
            log.warning("[chart] %s: only %d candles — skipping", sig.symbol, len(candles))
            return None
        theme.register()
        view = candles[-_MAX_CANDLES:]
        buy = str(getattr(sig.direction, "value", sig.direction)).lower() == "buy"

        # The read section is sized to its CONTENT, in inches, matching the rhythm `card_panel`
        # lays type on. Five one-line reasons left a third of the card blank at a fixed height;
        # five wrapped ones would have been clipped. Everything above it is fixed, so the figure
        # grows only by what the text actually needs.
        read_in = read_panel.read_inches(sig)
        fixed_in = 8.05                     # masthead + chart + levels + stats, at the ratios below
        fig = Figure(figsize=(8.6, fixed_in + read_in), dpi=125, facecolor=theme.PAPER)
        # A bare Figure gets a FigureCanvasBase, which has no `get_renderer()`. `card_panel` needs a
        # real renderer to MEASURE text — proportional type means the bold lead-in of each reason
        # can only be butted against its body by measuring, not estimating. Attaching Agg here keeps
        # the thread-safety win of avoiding pyplot while making measurement possible.
        FigureCanvasAgg(fig)
        # Ratios ARE inches here (they sum with `read_in` to the figure height), so the read panel
        # receives exactly the height `card_panel` asked for.
        gs = fig.add_gridspec(5, 1, height_ratios=[0.95, 4.35, 1.25, 0.75, read_in], hspace=0.0,
                              left=0.062, right=0.938, top=0.972, bottom=0.028)
        card_panel.masthead(fig.add_subplot(gs[0]), sig, buy, subtitle)
        price_panel.draw(fig.add_subplot(gs[1]), view, sig.entry_price, sig.stop_loss,
                         sig.take_profit, digits, bands, buy)
        card_panel.levels(fig.add_subplot(gs[2]), sig, digits, _notes(sig, buy, digits))
        card_panel.stats(fig.add_subplot(gs[3]), sig, digits)
        read_panel.reasons(fig.add_subplot(gs[4]), sig)

        _OUT.mkdir(parents=True, exist_ok=True)
        path = _OUT / f"{sig.strategy_id or 'sig'}_{sig.symbol.replace('/', '')}_{uuid.uuid4().hex[:8]}.png"
        fig.savefig(path, facecolor=theme.PAPER, bbox_inches="tight", pad_inches=0.30)
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

# NO cleanup() HERE. `notifications/dispatcher` already unlinks the file after the send, on both the
# confirmed and the alert path, and two owners of one file's lifetime is how a card gets deleted
# before it is sent. The dispatcher deletes it because only the dispatcher knows when the send
# finished.
