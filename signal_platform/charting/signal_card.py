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
from charting import theme, price_panel, card_panel

log = logging.getLogger(__name__)

_MAX_CANDLES = 55        # fewer, fatter candles. At 90 the bodies were hairlines once Telegram
                         # scaled the card to a phone bubble, which is the only size that matters.
_DPI = 200               # HD. Costs ~0.2s of render time (in an executor, off the scan loop) and
                         # a few hundred KB against Telegram's 10MB ceiling. Note it does NOT by
                         # itself make text bigger — Telegram scales to the bubble width, so more
                         # pixels are scaled down by proportionally more. It buys crispness when
                         # the user taps to zoom; LEGIBILITY comes from the type size and the
                         # short card above.
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

        # THE CARD IS SHORT ON PURPOSE — the reasons live in the Telegram CAPTION, not on the image.
        #
        # The user: *"Why do I have to zoom to see everything clearly? ... If that is not possible
        # then send the chart and accompany with the text explaining. So the chart explains visually
        # and text carries information."*
        #
        # Telegram scales a photo to the bubble WIDTH, and squeezes it further when it is tall. The
        # first version was 8.6 x 12.6in of chart AND prose, so on a phone the body text landed at
        # about a third of legible size. Nothing about resolution fixes that: more pixels are scaled
        # down by proportionally more. What fixes it is fewer things on the image and larger type
        # relative to the canvas — so the image now carries the picture and the numbers only, and
        # `dispatcher` sends the full written card as the caption beneath it.
        fig = Figure(figsize=(9.4, 7.15), dpi=_DPI, facecolor=theme.PAPER)
        # A bare Figure gets a FigureCanvasBase, which has no `get_renderer()`. `card_panel` needs a
        # real renderer to MEASURE text — proportional type means the bold lead-in of each reason
        # can only be butted against its body by measuring, not estimating. Attaching Agg here keeps
        # the thread-safety win of avoiding pyplot while making measurement possible.
        FigureCanvasAgg(fig)
        gs = fig.add_gridspec(4, 1, height_ratios=[1.05, 4.05, 1.30, 0.80], hspace=0.0,
                              left=0.058, right=0.942, top=0.968, bottom=0.032)
        card_panel.masthead(fig.add_subplot(gs[0]), sig, buy, subtitle)
        # NO PROJECTION ARROW ON A STAGE-1 CARD. The arrow asserts where price should go after an
        # entry; on a "building" heads-up there is no confirmed entry, so drawing it would promise a
        # trade that has not been agreed yet.
        price_panel.draw(fig.add_subplot(gs[1]), view, sig.entry_price, sig.stop_loss,
                         sig.take_profit, digits, bands, buy, arrow=sig.stage == "ready")
        card_panel.levels(fig.add_subplot(gs[2]), sig, digits, _notes(sig, buy, digits))
        card_panel.stats(fig.add_subplot(gs[3]), sig, digits)

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
