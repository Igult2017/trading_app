"""THE OPTIONS MAP AS A PICTURE — his sample `Desktop\\Option 2 .png` (23 Nov 2026: *"I also thought you were doing mapping
visually like done on the sample card i sent. A chart marked and text explaining bellow it."*).

The candles of the last ~2 days (30-minute bars), each QUALIFIED level drawn across them as a horizontal line with its
name written on it — sell levels red, buy levels blue as in his sample, the sweep trap dashed — and our price marked on
the right. The explanation is NOT on the image: it is the text under it (the Telegram caption), so the picture stays
readable on a phone (the signal card's rule, `charting/signal_card.py`).

Knows candles and (price, name, colour) lines — nothing about options. Never raises: None = no picture, the caller
sends the text alone.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from matplotlib.figure import Figure
from matplotlib.backends.backend_agg import FigureCanvasAgg

from charting import price_panel, theme

log = logging.getLogger(__name__)
_OUT = Path("/tmp/pix_maps")
SELL = theme.DOWN
BUY = "#2F6FDB"                      # his sample draws buy levels blue — never the candles' green, so a line is not a bar


def render(title: str, candles: list, lines: list[dict], price: float | None, digits: int) -> str | None:
    """PNG path. `lines` = [{"price", "name", "side" ("buy"|"sell"), "dashed"}]. None on any failure."""
    try:
        if len(candles) < 5 or not lines:
            return None
        theme.register()
        fig = Figure(figsize=(9.4, 6.2), dpi=150, facecolor=theme.PAPER)
        FigureCanvasAgg(fig)
        ax = fig.add_axes((0.04, 0.06, 0.84, 0.84))
        n = len(candles)
        price_panel.bars(ax, candles)
        lows = [c.low for c in candles] + [x["price"] for x in lines]
        highs = [c.high for c in candles] + [x["price"] for x in lines]
        pad = (max(highs) - min(lows)) * 0.06 or 0.001
        ax.set_xlim(-1, n + 1)
        ax.set_ylim(min(lows) - pad, max(highs) + pad)
        for x in lines:
            col = SELL if x["side"] == "sell" else BUY
            ax.axhline(x["price"], color=col, linewidth=1.5, linestyle="--" if x.get("dashed") else "-", zorder=5)
            ax.text(n * 0.55, x["price"], f" {x['name'].lower()} ", color=col, fontproperties=theme.font(12),
                    ha="center", va="center", zorder=6, bbox=dict(facecolor=theme.PAPER, edgecolor="none", pad=1.5))
            ax.text(n + 1.3, x["price"], f"{x['price']:.{digits}f}", color=theme.PAPER, fontproperties=theme.font(10, True),
                    ha="left", va="center", zorder=6, clip_on=False, bbox=dict(facecolor=col, edgecolor="none", pad=2))
        if price:
            ax.text(n + 1.3, price, f"{price:.{digits}f}", color=theme.PAPER, fontproperties=theme.font(10, True),
                    ha="left", va="center", zorder=7, clip_on=False,
                    bbox=dict(facecolor=theme.INK, edgecolor="none", pad=2))
        ax.set_title(title, loc="left", color=theme.INK, fontproperties=theme.font(15, True), pad=10)
        ax.set_facecolor(theme.PAPER)
        ax.grid(True, axis="y", color=theme.GRID, linewidth=0.6)
        ax.set_axisbelow(True)
        ax.set_xticks([])
        ax.set_yticks([])
        for s in ax.spines.values():
            s.set_visible(False)
        _OUT.mkdir(parents=True, exist_ok=True)
        path = _OUT / f"map_{uuid.uuid4().hex[:10]}.png"
        fig.savefig(path, facecolor=theme.PAPER, bbox_inches="tight", pad_inches=0.25)
        return str(path)
    except Exception as exc:                                        # noqa: BLE001 — a picture never loses the map
        log.warning("[levels-map] render failed: %s: %s", type(exc).__name__, exc)
        return None
