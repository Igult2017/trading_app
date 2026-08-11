"""Everything drawn ON TOP of the candles: the risk/reward shading, the level labels, the marked
candle, and the projection arrow.

Split out of `price_panel.py` on 2026-08-11 when it passed 200 lines. The seam is a real one, not a
line count: `price_panel` draws WHAT HAPPENED — bars, bands, the axis. This draws WHAT THE SIGNAL
CLAIMS — what you risk, what you stand to make, which candle set it off, and where price is expected
to go next.

STRATEGY-AGNOSTIC, like its caller. It is handed prices, colours and label text. It does not know
what a supply zone, a momentum candle or a trend is, and must not learn.
"""
from matplotlib.patches import Rectangle, FancyArrowPatch

from core.types import Candle
from charting import theme

# The reserved margin to the right of the last candle, as a fraction of the chart width. It holds
# TWO things that must not overlap: the projection arrow (nearest the candles) and the level labels
# (outermost). The arrow used to be drawn straight through the labels because both were positioned
# from the candles independently — they are now split at ARROW_SHARE.
PROJECT = 0.46
ARROW_SHARE = 0.56       # of the margin belongs to the arrow; the rest is the label column


def span(n: int) -> float:
    """The full x extent of the axis: the candles plus the reserved right-hand margin."""
    return n + n * PROJECT + 2


def label_x(n: int) -> float:
    """Where the label column starts — past the arrow, so the two can never collide."""
    return n + n * PROJECT * ARROW_SHARE + 1.4


def risk_reward_zones(ax, entry: float, stop: float, target: float,
                      right: float, full: float) -> None:
    """Shade what you RISK and what you STAND TO MAKE, instead of drawing three bare rules.

    The user, 2026-08-11, with a reference card: *"Can you make our chart card look this cool."* The
    single biggest difference was this — the reference fills the areas, so the trade reads at a
    glance; three horizontal lines make the reader compute it. The zones stop where the labels start
    so nothing is drawn under the text.
    """
    if not (entry and stop and target):
        return
    xmax = (right + 1) / full
    ax.axhspan(min(entry, stop), max(entry, stop), xmax=xmax,
               color=theme.STOP, alpha=0.085, zorder=0)
    ax.axhspan(min(entry, target), max(entry, target), xmax=xmax,
               color=theme.TARGET, alpha=0.085, zorder=0)


def level_labels(ax, levels, right: float, x: float, digits: int,
                 candles: list[Candle]) -> None:
    """The level lines, with labels that CANNOT overlap each other.

    THE BUG THIS FIXES. Each label was drawn at its own price with no regard for the others, so any
    setup whose stop sat close to its entry printed "STOP", "ENTRY" and the two prices on top of one
    another — illegible exactly when the stop is tightest. A 4.3-pip stop on GBP/USD did it every
    time. Labels are now pushed apart vertically to a minimum spacing, while the LINES stay at their
    true prices — the chart never lies about where a level is, only the text moves.

    `levels` is [(price, colour, text, dashed, show_price)]. `dashed is None` means the caller has
    already drawn the line (a band's own rule or edges), so only the text is placed.
    """
    live = [(p, c, t, d, s) for p, c, t, d, s in levels if p]
    if not live:
        return
    lo_ax, hi_ax = ax.get_ylim()
    if hi_ax <= lo_ax:                       # limits not set yet — fall back to the data
        prices = [p for p, *_ in live] + [c.low for c in candles] + [c.high for c in candles]
        lo_ax, hi_ax = min(prices), max(prices)
    gap = (hi_ax - lo_ax) * 0.098            # a 13pt label over an 11pt price, in data units

    live.sort(key=lambda r: r[0])
    ys = [r[0] for r in live]
    for i in range(1, len(ys)):              # push up from the bottom, then settle from the top
        ys[i] = max(ys[i], ys[i - 1] + gap)
    for i in range(len(ys) - 2, -1, -1):
        ys[i] = min(ys[i], ys[i + 1] - gap)

    for (price, colour, label, dashed, show_price), y in zip(live, ys):
        # `dashed is None` — a band already drew its own line or edges. Drawing again would double
        # the stroke on a single-price level and put a bogus rule through the middle of a zone.
        if dashed is not None:
            ax.plot([-1, right], [price, price], color=colour, linewidth=1.6,
                    linestyle=((0, (4, 3)) if dashed else "-"), zorder=5)
        # When the label has been nudged, a hairline connects it back to its true price so the
        # reader is never in doubt which line it names.
        if abs(y - price) > gap * 0.12:
            ax.plot([right, x - 0.15], [price, y], color=colour, linewidth=0.9,
                    alpha=0.55, zorder=6)
        ax.text(x, y, label, va=("bottom" if show_price else "center"), ha="left",
                color=colour, fontproperties=theme.font(13, bold=True), zorder=7)
        if show_price:
            ax.text(x, y, f"{price:.{digits}f}", va="top", ha="left",
                    color=theme.INK_DIM, fontproperties=theme.font(11), zorder=7)


def mark_candles(ax, candles: list[Candle], marks: list[tuple] | None) -> None:
    """Highlight the candle(s) a strategy pointed at, by TIMESTAMP, and label them.

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
        # A SOFT FILLED COLUMN, not an outline. The reference card highlights its key candle with a
        # tinted band behind it; a dashed ring competes with the candle it is pointing at, and all
        # but disappears once Telegram scales the card down.
        box = ((i - 0.58, c.low - pad * 1.6), 1.16, (c.high - c.low) + pad * 3.2)
        ax.add_patch(Rectangle(*box, facecolor=theme.MARK_WASH, edgecolor="none", zorder=2))
        ax.add_patch(Rectangle(*box, facecolor="none", edgecolor=theme.MARK,
                               linewidth=1.1, zorder=6))
        if label:
            ax.text(i, c.high + pad * 1.9, label, va="bottom", ha="center", color=theme.INK,
                    fontproperties=theme.font(11, bold=True), zorder=7)


def projection(ax, n: int, entry: float, target: float, buy: bool) -> None:
    """The arrow: from the entry, into the empty margin, toward the target.

    The user asked for *"an arrow that shows where we expect price to move after entry"*. It is
    drawn in the reserved space to the RIGHT of the last candle — i.e. in the future — so it can
    never be mistaken for something price has already done. It ends AT the target level, which is
    the claim the signal is actually making.
    """
    if not entry or not target:
        return
    x0 = n - 0.5
    x1 = n + n * PROJECT * ARROW_SHARE * 0.92
    colour = theme.PROJECT

    # A SHADED CORRIDOR behind it, so the arrow reads as "the move we expect" rather than a stray
    # annotation — the reference card the user sent shades the forward area the same way.
    ax.add_patch(Rectangle((x0, min(entry, target)), x1 - x0, abs(target - entry),
                           facecolor=colour, alpha=0.07, edgecolor="none", zorder=1))

    # HEAVY, NEARLY STRAIGHT, AND FULLY OPAQUE. It was a thin, 75%-transparent arc that read as
    # decoration; the user asked for it *"styled properly like in the image i sent"*, where the
    # arrow is the loudest thing on the card. A faint curve saying where price should go is worse
    # than no arrow at all — it is the one mark on the chart making a claim about the future.
    ax.add_patch(FancyArrowPatch(
        (x0, entry), (x1, target),
        connectionstyle="arc3,rad=" + ("0.08" if buy else "-0.08"),
        arrowstyle="-|>,head_length=1.05,head_width=0.62",
        mutation_scale=22, linewidth=5.0, capstyle="round",
        color=colour, alpha=1.0, zorder=8))
