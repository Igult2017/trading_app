"""The non-chart parts of the card: the masthead, the levels band, and the numbered read.

Laid out top-to-bottom the way the user asked for: *"at the top we have the chart and below it an
explanation follows."* Every string here is drawn in Playfair via `theme.font`.

NO SOURCE CITATIONS REACH THIS PANEL. It renders `signal.technical_reasons` verbatim, and those are
kept citation-free at the producer (`tests/test_no_book_citations.py`). Do not add a chapter or page
reference here — a page number is noise to someone deciding whether to take a trade.
"""
from core.types import Signal
from charting import theme



def _blank(ax, face=None):
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_facecolor(face or theme.PAPER)


def masthead(ax, sig: Signal, buy: bool, subtitle: str) -> None:
    _blank(ax)
    building = sig.stage == "building"
    # STAGE 1 IS AMBER AND SAYS SO. The two cards must be unmistakable at a glance in a thread:
    # a "building" heads-up is a reason to WATCH, and a reader who mistakes it for a ready entry
    # takes the trade early — which is the exact failure the two-stage split exists to prevent.
    accent = theme.WAIT if building else (theme.UP if buy else theme.DOWN)
    # HIS LABELS, 2026-08-19: *"Signal 1 should be labelled UNCONFIRMED ENTRY and signal 2 should be
    # labelled CONFIRMED ENTRY."* They name what the reader is looking at in his own vocabulary —
    # "SETUP BUILDING" / "READY" described the old one-zone two-stage split, which no longer exists.
    # Signal 1 is the reaction at the extreme (no entry price yet); signal 2 is the return to the
    # zone that reaction created, with entry, stop and target on it.
    #
    # A STRATEGY MAY NAME ITS OWN MOMENT. These two defaults describe one strategy's zone sequence,
    # and deriving the headline from `stage` alone put that strategy's vocabulary on every amber card
    # in the platform — a card whose reader is waiting for something else entirely was still told to
    # "AWAIT THE RETURN". `headline` / `label` let the producer say what its own moment is; unset,
    # these defaults apply exactly as before.
    head = sig.headline or (f"{'BUY' if buy else 'SELL'} — UNCONFIRMED ENTRY" if building
                            else f"{'BUY' if buy else 'SELL'} — CONFIRMED ENTRY")
    # THE STRATEGY GOES IN THE TITLE ITSELF. His instruction, 2026-08-21: *"include the strategy that
    # produced the signal in the title."* It was already on the card, but lower down and dim; the
    # title said only what happened, never whose.
    #
    # IN THE HEADLINE, NOT ON A LINE ABOVE IT. The first attempt drew a separate kicker at y=0.945
    # and it collided with the headline against the top edge — rendered and looked at, which is the
    # only way that was going to be caught. Same words as `notifications.titles.kicker`, so the
    # picture and the Telegram message keep saying the same thing.
    if sig.strategy_name:
        head = f"{sig.strategy_name}  ·  {head}"
    ax.plot([0.0, 0.022], [0.86, 0.86], color=accent, linewidth=3, zorder=3)
    ax.text(0.032, 0.845, head, color=accent, va="center",
            ha="left", fontproperties=theme.font(15, bold=True))
    # THE ORDER TYPE IS THE HEADLINE OF A READY CARD — it is the instruction. It replaces the
    # strategy label chip, which was decoration next to it.
    chip = sig.order_type if (sig.order_type and not building) else (
        (sig.label or "AWAIT THE RETURN") if building else sig.label)
    if chip:
        ax.text(0.995, 0.845, f" {chip} ", color=theme.PAPER if not building else theme.INK,
                va="center", ha="right", fontproperties=theme.font(13, bold=True),
                bbox=dict(facecolor=accent if not building else theme.WAIT_WASH,
                          edgecolor="none", pad=5.0))
    ax.text(0.0, 0.44, sig.symbol.replace("/", " / "), color=theme.INK, va="center", ha="left",
            fontproperties=theme.font(46, bold=True))
    line = f"{sig.strategy_name}  ·  {subtitle}" if subtitle else sig.strategy_name
    ax.text(0.004, 0.10, line, color=theme.INK_DIM, va="center", ha="left",
            fontproperties=theme.font(14))


def levels(ax, sig: Signal, digits: int, notes: list[str]) -> None:
    """ENTRY / STOP / TARGET as three columns, each with a caption underneath."""
    _blank(ax)
    cols = (("ENTRY", sig.entry_price, theme.INK, notes[0]),
            ("STOP", sig.stop_loss, theme.STOP, notes[1]),
            ("TARGET", sig.take_profit, theme.TARGET, notes[2]))
    for i, (label, value, colour, note) in enumerate(cols):
        x = 0.035 + i * 0.333
        if i:
            ax.plot([x - 0.028, x - 0.028], [0.12, 0.88], color=theme.RULE, linewidth=1)
        ax.scatter([x], [0.80], s=42, color=colour if value else theme.INK_DIM, zorder=3)
        ax.text(x + 0.022, 0.80, label, color=theme.INK_MID, va="center", ha="left",
                fontproperties=theme.font(13, bold=True))
        # AN UNSET LEVEL PRINTS AN EM DASH, NOT 0.00000. A stage-1 heads-up has no entry yet, and a
        # card showing a price of zero reads as a broken signal rather than as "not decided".
        shown = f"{value:.{digits}f}" if value else "—"
        ax.text(x, 0.44, shown, color=theme.INK if value else theme.INK_DIM, va="center",
                ha="left", fontproperties=theme.font(31, bold=True))
        ax.text(x, 0.14, note if value else "set on confirmation", color=theme.INK_DIM,
                va="center", ha="left", fontproperties=theme.font(12.5))


def stats(ax, sig: Signal, digits: int) -> None:
    """The washed band: reward:risk, pips risked, confidence."""
    _blank(ax, theme.WASH)
    pip = 0.01 if digits <= 3 else 0.0001
    risk = abs(sig.entry_price - sig.stop_loss) / pip if sig.entry_price and sig.stop_loss else 0
    cells = ((f"{sig.risk_reward:g}R" if sig.risk_reward else "—", "REWARD : RISK"),
             (f"{risk:.1f}" if risk else "—", "PIPS RISK"),
             (f"~{sig.confidence * 100:.0f}%" if sig.confidence else "—", "CONFIDENCE"))
    for i, (big, small) in enumerate(cells):
        x = 0.1667 + i * 0.3333
        if i:
            ax.plot([x - 0.1667, x - 0.1667], [0.18, 0.82], color=theme.RULE, linewidth=1)
        ax.text(x, 0.62, big, color=theme.INK, va="center", ha="center",
                fontproperties=theme.font(27, bold=True))
        ax.text(x, 0.24, small, color=theme.INK_DIM, va="center", ha="center",
                fontproperties=theme.font(12))
