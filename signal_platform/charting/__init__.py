"""Signal chart cards.

THIS FILE EXISTS TO RUN FIRST. Python executes a package's `__init__` before any of its submodules,
which is the only place `MPLCONFIGDIR` can be set with a guarantee that matplotlib has not already
been imported. It was originally set in `theme.py`, which looked right and was not: `signal_card.py`
imports matplotlib at the top of the file and `theme` a few lines later, so importing `signal_card`
first — which is what the runner does — initialised matplotlib before the setting ever ran.

Why it matters: in the container there may be no writable HOME. matplotlib then warns on every
import and falls back to a non-persistent cache, rebuilding its font cache each time instead of
once. `setdefault` so a deliberate deployment value always wins.
"""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "mplconfig"))
