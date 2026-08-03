"""The text half of a signal card — everything the reader acts on, set in Playfair.

This is the reason the cards became images. Telegram renders one font and cannot weight or align
anything; the numbers a trader acts on deserve better than a monospace blob. Rendering also means
the strategy name, the levels and the reasons all arrive as ONE artefact that survives forwarding.

NO SOURCE CITATIONS REACH THIS PANEL. It renders `signal.technical_reasons` verbatim, and those are
kept citation-free at the producer (`tests/test_no_book_citations.py`). Do not add a chapter or page
reference here — a page number is noise to someone deciding whether to take a trade.
"""
from core.types import Signal
from charting import theme

_MAX_REASONS = 6          # beyond this the card stops being scannable on a phone
_WRAP = 62                # characters per reason line at the panel's width


def draw(ax, sig: Signal, digits: int, subtitle: str = "") -> None:
    ax.set_facecolor(theme.PANEL)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)

    buy = str(getattr(sig.direction, "value", sig.direction)).lower() == "buy"
    accent = theme.UP if buy else theme.DOWN
    side = "BUY" if buy else "SELL"
    y = 0.955

    ax.text(0.04, y, f"{side}  {sig.symbol}", color=accent,
            fontproperties=theme.font(19, bold=True), va="top", ha="left")
    if sig.label:
        ax.text(0.96, y, sig.label, color=theme.INK_DIM,
                fontproperties=theme.font(11), va="top", ha="right")
    y -= 0.075
    # STRATEGY IS ALWAYS NAMED. Standing rule: every card says which strategy produced it, and the
    # template stays strategy-agnostic — no hardcoded indicator or setup wording.
    ax.text(0.04, y, f"{sig.strategy_name}  ·  {subtitle}" if subtitle else sig.strategy_name,
            color=theme.INK_DIM, fontproperties=theme.font(10), va="top", ha="left")
    y -= 0.055
    ax.plot([0.04, 0.96], [y, y], color=theme.GRID, linewidth=1)
    y -= 0.055

    for label, value, colour in (("Entry", sig.entry_price, theme.ENTRY),
                                 ("Stop", sig.stop_loss, theme.STOP),
                                 ("Target", sig.take_profit, theme.TARGET)):
        ax.text(0.04, y, label, color=theme.INK_DIM, fontproperties=theme.font(10.5),
                va="top", ha="left")
        ax.text(0.44, y, f"{value:.{digits}f}", color=colour,
                fontproperties=theme.font(13, bold=True), va="top", ha="left")
        y -= 0.062

    risk = abs(sig.entry_price - sig.stop_loss)
    pip = 0.01 if digits <= 3 else 0.0001
    bits = [f"{sig.risk_reward:g}R"] if sig.risk_reward else []
    if risk:
        bits.append(f"{risk / pip:.1f} pips risk")
    if sig.confidence:
        bits.append(f"{sig.confidence * 100:.0f}%")
    if bits:
        y -= 0.012
        ax.text(0.04, y, "   ·   ".join(bits), color=theme.INK,
                fontproperties=theme.font(11), va="top", ha="left")
        y -= 0.06

    ax.plot([0.04, 0.96], [y, y], color=theme.GRID, linewidth=1)
    y -= 0.05
    for line in _reasons(sig):
        ax.text(0.04, y, line, color=theme.INK, fontproperties=theme.font(9.2),
                va="top", ha="left")
        y -= 0.042
        if y < 0.04:
            break


def _reasons(sig: Signal) -> list[str]:
    """Wrapped, bulleted, capped. Long reasons are wrapped rather than truncated — a reason cut
    mid-sentence reads as a bug and the reader cannot tell what was lost."""
    import textwrap
    out: list[str] = []
    for r in sig.technical_reasons[:_MAX_REASONS]:
        chunks = textwrap.wrap(str(r), _WRAP) or [""]
        out.append(f"•  {chunks[0]}")
        out.extend(f"    {c}" for c in chunks[1:])
    return out
