"""
Timeframe string utilities — fully dynamic, broker-agnostic.

Any TF string is valid. Non-native TFs are aggregated transparently
from the largest native base — strategies never need to know this.

cTrader Open API native periods (ProtoOATrendbarPeriod enum):
  M1 M2 M3 M4 M5 M10 M15 M30  H1 H4 H12  D1 W1 MN

Non-native (aggregated automatically):
  M6  → M3  × 2       H2  → H1  × 2
  M12 → M4  × 3       H3  → H1  × 3
  M20 → M10 × 2       H6  → H1  × 6
                       H8  → H4  × 2

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


# ── cTrader native TF registry ────────────────────────────────────────────────

# Durations (minutes) that cTrader serves natively via ProtoOATrendbarPeriod.
# Everything NOT in this set is fetched from the largest native divisor
# and aggregated by candle_aggregator.aggregate() — transparent to strategies.
_NATIVE_MINUTES: frozenset[int] = frozenset({
    1, 2, 3, 4, 5, 10, 15, 30,    # minute bars  (M6 M12 M20 NOT native)
    60, 240, 720,                   # hour bars    (H1 H4 H12 only — H2 H3 H6 H8 NOT native)
    1440, 10080, 43200,             # D1  W1  MN
})

_NATIVE_TF: dict[int, str] = {
    1: "M1",   2: "M2",   3: "M3",   4: "M4",  5: "M5",
    10: "M10", 15: "M15", 30: "M30",
    60: "H1",  240: "H4", 720: "H12",
    1440: "D1", 10080: "W1", 43200: "MN",
}


def is_native(tf: str) -> bool:
    """True if cTrader serves this TF natively — no aggregation needed."""
    return to_minutes(tf) in _NATIVE_MINUTES


def native_base_for(tf: str) -> str:
    """
    For a non-native TF, return the largest native TF that divides evenly into it.
    candle_fetcher fetches the base and candle_aggregator builds the target bars.

    Examples:
      H2  (120m) → H1  (60m,  ratio 2)
      H3  (180m) → H1  (60m,  ratio 3)
      H6  (360m) → H1  (60m,  ratio 6)
      H8  (480m) → H4  (240m, ratio 2)
      M6  (  6m) → M3  (3m,   ratio 2)
      M12 ( 12m) → M4  (4m,   ratio 3)
      M20 ( 20m) → M10 (10m,  ratio 2)
    """
    mins = to_minutes(tf)
    if mins in _NATIVE_MINUTES:
        return tf
    for base_mins in (240, 60, 30, 15, 10, 5, 4, 3, 2, 1):
        if mins % base_mins == 0 and base_mins in _NATIVE_MINUTES:
            return _NATIVE_TF[base_mins]
    return "M1"
