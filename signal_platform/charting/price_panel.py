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
         arrow: bool = True, marks: list[tuple] | None = None) -> None:
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
    for lo, hi, colour, label in (bands or []):
        # A ZERO-HEIGHT BAND IS A LINE, and is drawn as one. Some levels are a band (a supply zone);
        # others are a single price (VIX.1's line — the body close of the first momentum candle, the
        # level its whole entry model is read against). Rather than invent a second concept, a band
        # whose edges coincide renders as one solid, labelled line. `chart_bands` stays the only
        # overlay contract the strategies have to know about.
        if abs(hi - lo) < 1e-9:
            ax.plot([-1, right], [lo, lo], color=colour, linewidth=1.6, alpha=0.9, zorder=2)
            if label:
                ax.text(right + 1.2, lo, label, va="bottom", ha="left", color=colour,
                        fontproperties=theme.font(11, bold=True), zorder=7)
                ax.text(right + 1.2, lo, f"{lo:.{digits}f}", va="top", ha="left",
                        color=theme.INK_DIM, fontproperties=theme.font(9.5), zorder=7)
            continue
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

    _mark_candles(ax, candles, marks)
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


def _mark_candles(ax, candles: list[Candle], marks: list[tuple] | None) -> None:
    """Ring the candle(s) a strategy pointed at, by TIMESTAMP, and label them.

    The user, 2026-08-03: *"also display the real momentum candles, these one doesnt look like a
    momentum candle."* It did not, because the card shaded a horizontal price BAND across the whole
    chart at that candle's body range — which is a level, not a candle. Marking the bar itself means
    the reader sees the actual candle, with its real body and wicks, exactly as their platform draws
    it.

    Matched on time so it is immune to indexing: the view is a tail slice of a longer series, and an
    index would silently point at the wrong bar the moment the slice length changed.
    """
    if not marks:
        return
    by_time = {c.time: i for i, c in enumerate(candles)}
    for mark in marks:
        t, label = (mark + ("",))[:2] if isinstance(mark, tuple) else (mark, "")
        i = by_time.get(int(t))
        if i is None:                       # older than the window — nothing to point at
            continue
        c = candles[i]
        pad = (c.high - c.low) * 0.16 or 0.0002
        ax.add_patch(Rectangle((i - 0.52, c.low - pad), 1.04, (c.high - c.low) + 2 * pad,
                               facecolor="none", edgecolor=theme.INK, linewidth=1.6,
                               linestyle=(0, (3, 2)), zorder=6))
        if label:
            ax.text(i, c.high + pad * 1.9, label, va="bottom", ha="center", color=theme.INK,
                    fontproperties=theme.font(11, bold=True), zorder=7)


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
