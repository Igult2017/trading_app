"""
Timeframe string utilities — fully dynamic, broker-agnostic.

Current broker: MetaTrader 5 (Pepperstone).
MT5 native periods: M1-M30 (all steps), H1 H2 H3 H4 H6 H8 H12, D1 W1 MN
ALL standard timeframes are native in MT5 — aggregation path rarely triggers.

When switching to cTrader (pending Spotware approval):
  Remove M6 M12 M20 H2 H3 H6 H8 from _NATIVE_MINUTES — those will aggregate.

Supported input formats: M1, M5, M15, M30, H1, H2, H4, H6, H8, D1, W1, MN
"""

import re


def to_minutes(tf: str) -> int:
    """Convert any TF string to its duration in minutes."""
    tf = tf.strip().upper()

    m = re.fullmatch(r'M(\d+)', tf)
    if m:
        return int(m.group(1))

    m = re.fullmatch(r'H(\d+)', tf)
    if m:
        return int(m.group(1)) * 60

    if tf in ('D', 'D1'):
        return 1_440
    if tf in ('W', 'W1'):
        return 10_080
    if tf in ('MN', 'MON', 'M'):
        return 43_200

    raise ValueError(
        f"Unrecognised timeframe '{tf}'. "
        "Expected formats: M1, M5, M15, M30, H1, H4, D1, W1, MN"
    )


def seconds(tf: str) -> int:
    """Duration of one bar in seconds — used for cache TTL and signal expiry."""
    return to_minutes(tf) * 60


# ── Native TF helpers ────────────────────────────────────────────────────────

# Durations (minutes) that MT5 serves natively without aggregation.
# MT5 has every standard timeframe built-in — no gaps.
_NATIVE_MINUTES: frozenset[int] = frozenset({
    1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30,          # minute bars
    60, 120, 180, 240, 360, 480, 720,                # hour bars
    1440, 10080, 43200,                              # D1 W1 MN
})

_NATIVE_TF: dict[int, str] = {
    1: "M1",  2: "M2",  3: "M3",  4: "M4",  5: "M5",
    6: "M6",  10: "M10", 12: "M12", 15: "M15", 20: "M20", 30: "M30",
    60: "H1",  120: "H2",  180: "H3",  240: "H4",
    360: "H6", 480: "H8",  720: "H12",
    1440: "D1", 10080: "W1", 43200: "MN",
}


def is_native(tf: str) -> bool:
    """True if MT5 serves this TF natively (no aggregation needed)."""
    return to_minutes(tf) in _NATIVE_MINUTES


def native_base_for(tf: str) -> str:
    """
    For a non-native TF, return the native base to fetch then aggregate from.
    Picks the largest native divisor to minimise bar count.

      H2  (120m) → H1  (ratio 2)   H3  (180m) → H1  (ratio 3)
      H6  (360m) → H1  (ratio 6)   H8  (480m) → H4  (ratio 2)
      M20 ( 20m) → M10 (ratio 2)   M6  (  6m) → M3  (ratio 2)
    """
    mins = to_minutes(tf)
    if mins in _NATIVE_MINUTES:
        return tf
    for base_mins in (240, 60, 30, 15, 10, 5, 4, 3, 2, 1):
        if mins % base_mins == 0 and base_mins in _NATIVE_MINUTES:
            return _NATIVE_TF[base_mins]
    return "M1"
