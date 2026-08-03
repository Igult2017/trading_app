"""Chart theme — Playfair Display + one palette, defined ONCE.

The user's rule for the image cards, 2026-08-03: *"The telegram signals will now be written in
playfiar font because it is image."* Telegram cannot style text, so the typography has to live in
the pixels — which is the whole reason these cards are rendered rather than sent as text.

LIGHT, EDITORIAL PALETTE. The first build was a dark two-column card and the user rejected it as
"not clear": *"at the top we have the chart and below it an explanation follows."* A tall light card
reads on a phone the way a page does — one column, top to bottom — instead of asking the eye to
jump between two columns in a thumbnail.

THE FONT IS BUNDLED, NOT DOWNLOADED. `fonts/PlayfairDisplay-{Regular,Bold}.ttf` are committed next
to this module, converted from the `@fontsource` woff2 the client already uses so the Telegram card
and the web UI are the same typeface. A runtime download would add a network dependency to every
signal and would fail closed inside the container. The SIL OFL is bundled as `fonts/OFL.txt`.
"""
import threading
from pathlib import Path

# MPLCONFIGDIR is set in this package's `__init__`, which is the only place guaranteed to run before
# matplotlib is imported by ANY submodule. Setting it here looked correct and was not — `signal_card`
# imports matplotlib above its `theme` import, so the value never applied.
import matplotlib
matplotlib.use("Agg")                       # headless: no display in the container
from matplotlib import font_manager

_FONT_DIR = Path(__file__).parent / "fonts"
REGULAR = _FONT_DIR / "PlayfairDisplay-Regular.ttf"
BOLD = _FONT_DIR / "PlayfairDisplay-Bold.ttf"

PAPER = "#FFFFFF"       # card background
WASH = "#F4F3F0"        # the stats band — a warm grey, not a blue-grey
RULE = "#E4E2DD"        # hairlines between sections
GRID = "#EFEDE9"        # chart gridlines, lighter than the rules
INK = "#14171A"         # headline / numbers
INK_MID = "#4A5057"     # body text
INK_DIM = "#8B9198"     # labels, axis ticks, captions
UP = "#1F9D63"          # bullish candle / buy / target
DOWN = "#C8443F"        # bearish candle / sell / stop
ENTRY = "#14171A"       # entry line — ink, not a colour: it is a fact, not a warning
STOP = DOWN
TARGET = UP
ZONE_SUPPLY = "#C8443F"
ZONE_DEMAND = "#1F9D63"
LEVEL = "#7C3AED"       # a strategy's own reference level (VIX.1's line) — violet, so it
                        # is never confused with entry/stop/target or a zone
WAIT = "#B8860B"        # stage 1 "building" — amber, deliberately neither the buy nor the sell
WAIT_WASH = "#F6EFD9"   # its chip background


def font(size: float, bold: bool = False):
    """A Playfair FontProperties at `size`. Every string drawn on a card goes through here."""
    return font_manager.FontProperties(fname=str(BOLD if bold else REGULAR), size=size)


_registered: bool | None = None
_lock = threading.Lock()


def register() -> bool:
    """Register Playfair with matplotlib's font manager ONCE per process, and make it the default
    family so any text drawn without an explicit FontProperties still lands in Playfair.

    Idempotent and thread-safe on purpose. Renders run in executor threads (several instruments are
    scanned concurrently), and `addfont` mutates a global font list — calling it per render would
    append a duplicate entry every time, growing that list for the life of the container and
    re-triggering matplotlib's font cache work on each call.

    Returns whether both faces were found. A missing font must never take a signal down, so the
    caller treats False as "render in the default face", not as an error.
    """
    global _registered
    if _registered is not None:
        return _registered
    with _lock:
        if _registered is not None:               # another thread won the race while we waited
            return _registered
        ok = True
        for f in (REGULAR, BOLD):
            if f.exists():
                font_manager.fontManager.addfont(str(f))
            else:
                ok = False
        if ok:
            matplotlib.rcParams["font.family"] = "Playfair Display"
        else:
            import logging
            logging.getLogger(__name__).warning(
                "[chart] Playfair not found at %s — cards will render in the default face", _FONT_DIR)
        _registered = ok
        return ok
