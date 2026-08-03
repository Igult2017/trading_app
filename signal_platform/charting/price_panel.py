"""The chart at the top of a signal card: candles, the levels, the zone band, and the projection.

STRATEGY-AGNOSTIC BY CONSTRUCTION. This module knows about candles and three price levels. It does
not know what a supply zone, a momentum candle, a CHoCH or a pullback is, and it must not learn —
each strategy is independent, and a renderer that special-cases one is how one strategy's ideas leak
into another's picture. Anything strategy-specific arrives as the generic `bands` argument, already
reduced to (low, high, colour, label) by the caller.
"""
from matplotlib.patches import Rectangle, FancyArrowPatch

from core.types import Candle
from charting import theme

_PROJECT = 0.30      # the arrow reaches this fraction of the chart width past the last candle


def draw(ax, candles: list[Candle], entry: float, stop: float, target: float,
         digits: int, bands: list[tuple] | None = None, buy: bool = False,
         arrow: bool = True) -> None:
    """Draw `candles` with the three levels, any `bands` = [(lo, hi, colour, label)], and an arrow
    projecting from the entry toward the target — where price is expected to go if the setup works."""
    n = len(candles)
    # Candles drawn directly rather than with a charting library. A library that owns the whole
    # figure (its own fig, axes and style) fights the layout this card needs, and the bars are ~15
    # lines. `mplfinance` was a declared dependency for exactly this and was never imported by
    # anything — it was removed 2026-08-03 rather than left in the image.
    # SOLID BODIES, BOTH DIRECTIONS. Up bars were drawn hollow (white fill, coloured outline) as an
    # editorial flourish; the user: *"use real full green candles not green candles with white
    # inside."* Hollow bodies also lose almost all their colour once Telegram scales the card down,
    # which is the opposite of what a glanceable card needs.
    width = 0.62
    for i, c in enumerate(candles):
        up = c.close >= c.open
        col = theme.UP if up else theme.DOWN
        ax.plot([i, i], [c.low, c.high], color=col, linewidth=1.3, solid_capstyle="round", zorder=3)
        lo, hi = (c.open, c.close) if up else (c.close, c.open)
        h = hi - lo
        if h <= 0:                      # doji — a hairline so the bar is still visible
            ax.plot([i - width / 2, i + width / 2], [lo, lo], color=col, linewidth=1.6, zorder=4)
        else:
            ax.add_patch(Rectangle((i - width / 2, lo), width, h, facecolor=col,
                                   edgecolor=col, linewidth=0.8, zorder=4))

    span = n + n * _PROJECT + 2
    right = n - 0.4                     # every line and band stops here; labels live past it
    for lo, hi, colour, _label in (bands or []):
        ax.axhspan(lo, hi, xmax=(right + 1) / span, color=colour, alpha=0.10, zorder=1)
        for edge in (lo, hi):
            ax.plot([-1, right], [edge, edge], color=colour, linewidth=1.2, alpha=0.6, zorder=2)

    for price, colour, label, dashed in ((stop, theme.STOP, "STOP", False),
                                         (entry, theme.ENTRY, "ENTRY", True),
                                         (target, theme.TARGET, "TARGET", False)):
        if not price:
            continue
        ax.plot([-1, right], [price, price], color=colour, linewidth=1.8,
                linestyle=((0, (4, 3)) if dashed else "-"), zorder=5)
        ax.text(right + 1.2, price, label, va="bottom", ha="left", color=colour,
                fontproperties=theme.font(13, bold=True), zorder=7)
        ax.text(right + 1.2, price, f"{price:.{digits}f}", va="top", ha="left",
                color=theme.INK_DIM, fontproperties=theme.font(11), zorder=7)

    if arrow:
        _projection(ax, n, entry, target, buy)

    ax.set_xlim(-1.5, span)
    lows = [c.low for c in candles] + [p for p in (entry, stop, target) if p]
    highs = [c.high for c in candles] + [p for p in (entry, stop, target) if p]
    for lo, hi, _, _ in (bands or []):
        lows.append(lo); highs.append(hi)
    pad = (max(highs) - min(lows)) * 0.06 or 0.001
    ax.set_ylim(min(lows) - pad, max(highs) + pad)

    ax.set_facecolor(theme.PAPER)
    ax.grid(True, axis="y", color=theme.GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.tick_params(colors=theme.INK_DIM, labelsize=11, length=0, pad=3)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xticks([])
    ax.yaxis.tick_right()
    for lbl in ax.get_yticklabels():
        lbl.set_fontproperties(theme.font(10.5))


def _projection(ax, n: int, entry: float, target: float, buy: bool) -> None:
    """The arrow: from the entry, into the empty margin, toward the target.

    The user asked for *"an arrow that shows where we expect price to move after entry"*. It is
    drawn in the reserved space to the RIGHT of the last candle — i.e. in the future — so it can
    never be mistaken for something price has already done. It ends AT the target level, which is
    the claim the signal is actually making.
    """
    if not entry or not target:
        return
    x0 = n - 0.5
    x1 = n + n * _PROJECT * 0.78
    colour = theme.UP if buy else theme.DOWN
    ax.add_patch(FancyArrowPatch(
        (x0, entry), (x1, target),
        connectionstyle="arc3,rad=" + ("0.22" if buy else "-0.22"),
        arrowstyle="-|>", mutation_scale=20, linewidth=2.6,
        color=colour, alpha=0.75, zorder=6))
