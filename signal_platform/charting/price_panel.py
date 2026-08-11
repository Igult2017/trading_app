"""The chart at the top of a signal card: the candles, the zone bands, and the axis.

Everything drawn ON TOP of the bars — the risk/reward shading, the level labels, the marked candle
and the projection arrow — lives in `charting/annotations.py`. That split happened 2026-08-11: this
module draws what price DID, that one draws what the signal CLAIMS.

STRATEGY-AGNOSTIC BY CONSTRUCTION. This module knows about candles and three price levels. It does
not know what a supply zone, a momentum candle, a CHoCH or a pullback is, and it must not learn —
each strategy is independent, and a renderer that special-cases one is how one strategy's ideas leak
into another's picture. Anything strategy-specific arrives as the generic `bands` argument, already
reduced to (low, high, colour, label) by the caller.
"""
from matplotlib.patches import Rectangle

from core.types import Candle
from charting import annotations as ann
from charting import theme


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

    extra: list[tuple] = []             # band labels join the level labels in one column
    full = ann.span(n)
    right = n - 0.4                     # every line and band stops here
    for lo, hi, colour, label in (bands or []):
        # A ZERO-HEIGHT BAND IS A LINE, and is drawn as one. Some levels are a band (a supply zone);
        # others are a single price (VIX.1's line — the body close of the first momentum candle, the
        # level its whole entry model is read against). Rather than invent a second concept, a band
        # whose edges coincide renders as one solid, labelled line. `chart_bands` stays the only
        # overlay contract the strategies have to know about.
        if abs(hi - lo) < 1e-9:
            ax.plot([-1, right], [lo, lo], color=colour, linewidth=1.6, alpha=0.9, zorder=2)
            if label:
                # DEFERRED to the single spacing pass below. Drawing it here is what put VIX.1's
                # "LINE" on top of "ENTRY": one label column can only be laid out once, with every
                # label in it considered together. The price IS shown — a zero-height band is a
                # real single level.
                extra.append((lo, colour, label, None, True))
            continue
        ax.axhspan(lo, hi, xmax=(right + 1) / full, color=colour, alpha=0.10, zorder=1)
        for edge in (lo, hi):
            ax.plot([-1, right], [edge, edge], color=colour, linewidth=1.2, alpha=0.6, zorder=2)
        if label:
            # A BAND'S NAME WAS BEING THROWN AWAY. Only the zero-height case ever drew one, so a
            # zone's name arrived on every card and rendered nowhere — the shaded box had no label
            # on it. Named at the band's middle, and with NO number: a zone is its two edges, and
            # printing the midpoint would put a price on the card at a level that is not a level.
            extra.append(((lo + hi) / 2, colour, label, None, False))

    # LIMITS ARE SET BEFORE THE LABELS ARE PLACED. `level_labels` spaces the text by a fraction of
    # the visible price range, so it has to be able to ask the axis what that range is. Setting the
    # limits afterwards (as this did) left it reading matplotlib's autoscale — a different number,
    # and the spacing came out wrong.
    ax.set_xlim(-1.5, full)
    lows = [c.low for c in candles] + [p for p in (entry, stop, target) if p]
    highs = [c.high for c in candles] + [p for p in (entry, stop, target) if p]
    for lo, hi, _, _ in (bands or []):
        lows.append(lo); highs.append(hi)
    pad = (max(highs) - min(lows)) * 0.06 or 0.001
    ax.set_ylim(min(lows) - pad, max(highs) + pad)

    ann.risk_reward_zones(ax, entry, stop, target, right, full)
    ann.level_labels(ax, [(stop, theme.STOP, "STOP", False, True),
                          (entry, theme.ENTRY, "ENTRY", True, True),
                          (target, theme.TARGET, "TARGET", False, True)] + extra,
                     right, ann.label_x(n), digits, candles)
    ann.mark_candles(ax, candles, marks)
    if arrow:
        ann.projection(ax, n, entry, target, buy)

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
