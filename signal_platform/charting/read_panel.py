"""The `READ ON THE TRADE` section — numbered reasons, bold lead-in, detail on the same line.

Split out of `card_panel` when that file passed the 150-line limit. It owns one thing: turning a
signal's `technical_reasons` into set type, and telling the card how much height it needs.

NO SOURCE CITATIONS REACH THIS PANEL. It renders the reasons verbatim, and they are kept
citation-free at the producer (`tests/test_no_book_citations.py`).
"""
import textwrap

from core.types import Signal
from charting import theme

MAX_REASONS = 5          # beyond this the card stops being scannable on a phone


def _blank(ax):
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_facecolor(theme.PAPER)


def _text_width(ax, s: str, fp) -> float:
    """Width of `s` in AXES FRACTION, measured with the real renderer.

    Estimating it as `len(s) * a_constant` put the body text on top of the bold lead-in on every
    row — Playfair is proportional, so "Wick-only tap." and "Confirmation." are nothing like the
    same width. Measuring is the only way to butt two differently-weighted runs together on one
    line, which is what the layout calls for.
    """
    t = ax.text(0, -5, s, fontproperties=fp)           # off-canvas probe
    try:
        bb = t.get_window_extent(renderer=ax.figure.canvas.get_renderer())
        inv = ax.transAxes.inverted()
        return inv.transform((bb.x1, 0))[0] - inv.transform((bb.x0, 0))[0]
    finally:
        t.remove()


# Vertical rhythm in INCHES, not axes fractions. Axes-fraction spacing stretches or squashes with
# the panel's height, so five short reasons left a third of the card blank while the same code would
# clip five long ones. In inches the type sets at one rhythm and `signal_card` sizes the panel to
# match exactly — see `read_inches`.
LINE_IN = 0.235          # one wrapped text line
GAP_IN = 0.105           # extra space between reasons
HEAD_IN = 0.40           # the "READ ON THE TRADE" header and its air


def read_inches(sig: Signal) -> float:
    """Exact height the read section needs, in inches. `signal_card` sizes the panel from this."""
    return HEAD_IN + estimate_lines(sig) * LINE_IN + _n(sig) * GAP_IN + 0.10


def _n(sig: Signal) -> int:
    return min(len(sig.technical_reasons), MAX_REASONS)


def reasons(ax, sig: Signal) -> None:
    """`READ ON THE TRADE` — numbered, each with a bold lead-in then the detail on the same line."""
    _blank(ax)
    h_in = max(0.6, ax.get_position().height * ax.figure.get_figheight())
    f = lambda inches: inches / h_in                     # inches -> this axes' fraction
    ax.text(0.0, 1.0, "READ ON THE TRADE", color=theme.INK_DIM, va="top", ha="left",
            fontproperties=theme.font(8.5, bold=True))
    fp_lead, fp_body = theme.font(10.5, bold=True), theme.font(9.5)
    x0, right = 0.055, 0.995
    em = _text_width(ax, "n" * 50, fp_body) / 50.0       # mean body char width, measured once
    y = 1.0 - f(HEAD_IN)
    for i, raw in enumerate(sig.technical_reasons[:MAX_REASONS], 1):
        lead, rest = _split(str(raw))
        ax.text(0.0, y, f"{i:02d}", color=theme.INK_DIM, va="top", ha="left",
                fontproperties=theme.font(8.5))
        lead_w = _text_width(ax, lead + " ", fp_lead)
        ax.text(x0, y, lead, color=theme.INK, va="top", ha="left", fontproperties=fp_lead)
        first_n = max(8, int((right - x0 - lead_w) / em))
        full_n = max(20, int((right - x0) / em))
        lines = []
        if rest:
            lines = textwrap.wrap(rest, full_n, initial_indent=" " * max(0, full_n - first_n))
            lines[0] = lines[0].lstrip()
        y_top = y
        for j, chunk in enumerate(lines):
            ax.text(x0 + (lead_w if j == 0 else 0), y, chunk, color=theme.INK_MID,
                    va="top", ha="left", fontproperties=fp_body)
            y -= f(LINE_IN)
        if not lines:
            y -= f(LINE_IN)
        ax.plot([0.038, 0.038], [y + f(LINE_IN) * 0.35, y_top - f(0.02)],
                color=theme.RULE, linewidth=1)
        y -= f(GAP_IN)


def _split(text: str) -> tuple[str, str]:
    """Lead-in + detail. Splits on an em/en dash, then a colon, then the first sentence — the three
    shapes the strategies actually produce. Falls back to the first few words so a reason with no
    natural break still gets a bold opener rather than a wall of grey.

    The detail is re-capitalised: the strategies write "zone respected — price left it", so the body
    would otherwise start mid-sentence in lower case once the dash is replaced by a full stop.
    """
    lead, rest = text, ""
    for sep in (" — ", " – ", " - "):
        if sep in text:
            lead, rest = text.split(sep, 1)
            break
    else:
        for sep in (": ", ". "):
            if sep in text:
                lead, rest = text.split(sep, 1)
                break
        else:
            words = text.split()
            if len(words) > 4:
                lead, rest = " ".join(words[:3]), " ".join(words[3:])
    lead, rest = lead.strip(), rest.strip()
    if rest:
        rest = rest[0].upper() + rest[1:]
    if lead and not lead.endswith((".", "!", "?")):
        lead += "."
    return lead, rest


def estimate_lines(sig: Signal, per_line: int = 78) -> int:
    """Roughly how many text lines the read section will need.

    Used by `signal_card` to size that panel BEFORE anything is drawn, so five one-line reasons do
    not leave a third of the card blank while five long ones still fit. An estimate is enough — it
    only picks the panel's share of the figure, and `bbox_inches="tight"` trims the remainder.
    """
    total = 0
    for raw in sig.technical_reasons[:MAX_REASONS]:
        lead, rest = _split(str(raw))
        total += max(1, -(-(len(lead) + len(rest)) // per_line))
    return total or 1
