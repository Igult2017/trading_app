"""Chart theme — Playfair Display + one palette, defined ONCE.

The user's rule for the image cards, 2026-08-03: *"The telegram signals will now be written in
playfiar font because it is image."* Telegram cannot style text, so the typography has to live in
the pixels — which is the whole reason these cards are rendered rather than sent as text.

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

# Dark card. Chosen to read on a phone in a Telegram thread, which is where every one of these is
# actually looked at — not on a desktop monitor.
BG = "#0E1117"          # page
PANEL = "#151A23"       # the text panel behind the numbers
GRID = "#222834"
INK = "#F2F4F8"         # primary text
INK_DIM = "#9AA4B5"     # labels
UP = "#26A96C"          # bullish candle / buy
DOWN = "#E5484D"        # bearish candle / sell
ENTRY = "#E8B339"       # entry line
STOP = "#E5484D"        # stop line
TARGET = "#26A96C"      # target line
ZONE_SUPPLY = "#E5484D"
ZONE_DEMAND = "#26A96C"


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
