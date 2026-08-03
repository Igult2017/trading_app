"""The price half of a signal card: candles, the entry/stop/target levels, and an optional zone band.

STRATEGY-AGNOSTIC BY CONSTRUCTION. This module knows about candles and three price levels. It does
not know what a supply zone, a momentum candle, a CHoCH or a pullback is, and it must not learn —
each strategy is independent, and a renderer that special-cases one is how one strategy's ideas leak
into another's picture. Anything strategy-specific arrives as the generic `bands` argument, already
reduced to (low, high, colour, label) by the caller.
"""
from core.types import Candle
from charting import theme


def draw(ax, candles: list[Candle], entry: float, stop: float, target: float,
         digits: int, bands: list[tuple] | None = None) -> None:
    """Draw `candles` on `ax` with the three levels and any `bands` = [(lo, hi, colour, label)]."""
    n = len(candles)
    # Candles drawn directly rather than with a charting library. A library that owns the whole
    # figure (its own fig, axes and style) fights the text panel this card needs beside it, and the
    # bars are ~15 lines. `mplfinance` was a declared dependency for exactly this and was never
    # imported by anything — it was removed 2026-08-03 rather than left in the image.
    width = 0.62
    for i, c in enumerate(candles):
        up = c.close >= c.open
        col = theme.UP if up else theme.DOWN
        ax.plot([i, i], [c.low, c.high], color=col, linewidth=0.9, solid_capstyle="round", zorder=2)
        lo, hi = (c.open, c.close) if up else (c.close, c.open)
        h = hi - lo
        if h <= 0:                      # doji — draw a hairline so the bar is still visible
            ax.plot([i - width / 2, i + width / 2], [lo, lo], color=col, linewidth=1.1, zorder=3)
        else:
            ax.add_patch(_rect(i - width / 2, lo, width, h, col))

    # LINES STOP AT THE LAST CANDLE; LABELS LIVE IN THE MARGIN BEYOND IT.
    # `axhline` spans the whole axis, so labels drawn at the right edge sat ON TOP of their own
    # dashed line and were struck through — caught by looking at the rendered PNG, which is the
    # only way this kind of defect shows up. The margin is reserved below and nothing is drawn into
    # it except these labels.
    right = n - 0.4                      # where every line ends
    label_x = n + 0.6                    # where every label starts — clear of the lines

    for lo, hi, colour, label in (bands or []):
        ax.axhspan(lo, hi, xmax=_frac(right, n), color=colour, alpha=0.13, zorder=1)
        for edge in (lo, hi):
            ax.plot([-0.5, right], [edge, edge], color=colour, linewidth=0.7, alpha=0.55, zorder=1)
        if label:
            ax.text(label_x, (lo + hi) / 2, label, va="center", ha="left", color=colour,
                    fontproperties=theme.font(8), alpha=0.95, zorder=6)

    for price, colour, label in ((entry, theme.ENTRY, "ENTRY"),
                                 (stop, theme.STOP, "STOP"),
                                 (target, theme.TARGET, "TARGET")):
        if not price:
            continue
        ax.plot([-0.5, right], [price, price], color=colour, linewidth=1.15,
                linestyle=(0, (5, 3)), zorder=5)
        ax.text(label_x, price, f"{label}  {price:.{digits}f}", va="center", ha="left",
                color=colour, fontproperties=theme.font(9, bold=True), zorder=6)

    ax.set_xlim(-1, n + max(11, n * 0.42))    # reserved right margin — labels only
    lows = [c.low for c in candles] + [p for p in (entry, stop, target) if p]
    highs = [c.high for c in candles] + [p for p in (entry, stop, target) if p]
    for lo, hi, _, _ in (bands or []):
        lows.append(lo); highs.append(hi)
    pad = (max(highs) - min(lows)) * 0.08 or 0.001
    ax.set_ylim(min(lows) - pad, max(highs) + pad)

    ax.set_facecolor(theme.BG)
    ax.grid(True, color=theme.GRID, linewidth=0.5, alpha=0.6)
    ax.set_axisbelow(True)
    ax.tick_params(colors=theme.INK_DIM, labelsize=8, length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xticks([])
    for lbl in ax.get_yticklabels():
        lbl.set_fontproperties(theme.font(8))


def _rect(x, y, w, h, colour):
    from matplotlib.patches import Rectangle
    return Rectangle((x, y), w, h, facecolor=colour, edgecolor=colour, linewidth=0.5, zorder=3)


def _frac(x: float, n: int) -> float:
    """`axhspan`'s xmax is an AXES FRACTION (0-1), not a data coordinate — so the band shading has
    to be converted, or it silently spans the full width including the label margin."""
    lo, hi = -1, n + max(11, n * 0.42)
    return max(0.0, min(1.0, (x - lo) / (hi - lo)))
