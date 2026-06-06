"""
TimeFrame string → yfinance parameters.
Fully dynamic — derives interval and period from any TF string.
No fixed mapping table; no enum restriction.

Supported formats: M1, M3, M5, M10, M15, M30,
                   H1, H2, H3, H4, H6, H8, H12,
                   D1, W1, MN
"""

import re


def to_minutes(tf: str) -> int:
    """
    Convert any TF string to its duration in minutes.
    Used for ordering (highest TF = longest duration).
    """
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


def to_yf(tf: str) -> tuple[str, str]:
    """
    Return (yfinance interval, fetch period) for a NATIVE TF string.
    Non-native TFs (H2, H3, H6, H8, H12, M3, M10, …) must be built by
    aggregating their base TF — call native_base_for(tf) first.

    yfinance interval limits:
      1m  → max 7 days      2m  → max 60 days    5m  → max 60 days
      15m → max 60 days     30m → max 60 days     60m → max 730 days
      4h  → max 730 days (unofficial, works)
      1d / 1wk / 1mo → unlimited
    """
    mins = to_minutes(tf)

    if mins == 1:       return "1m",  "7d"
    if mins == 2:       return "2m",  "60d"
    if mins == 5:       return "5m",  "60d"
    if mins == 15:      return "15m", "60d"
    if mins == 30:      return "30m", "60d"
    if mins == 60:      return "60m", "730d"
    if mins == 240:     return "4h",  "730d"
    if mins == 1_440:   return "1d",  "max"
    if mins == 10_080:  return "1wk", "max"
    if mins == 43_200:  return "1mo", "max"

    raise ValueError(
        f"'{tf}' ({mins}m) has no native yfinance interval. "
        "Use native_base_for(tf) to get the fetch base, then aggregate."
    )


def seconds(tf: str) -> int:
    """Duration of one bar in seconds — used for signal expiry calculations."""
    return to_minutes(tf) * 60


# ── Native TF helpers — used by candle_fetcher for aggregation routing ─────────

# Bar durations (minutes) that yfinance serves natively without aggregation.
_NATIVE_MINUTES: frozenset[int] = frozenset({1, 2, 5, 15, 30, 60, 240, 1440, 10080, 43200})

_NATIVE_TF: dict[int, str] = {
    1: "M1", 2: "M2", 5: "M5", 15: "M15", 30: "M30",
    60: "H1", 240: "H4", 1440: "D1", 10080: "W1", 43200: "MN",
}


def is_native_yf(tf: str) -> bool:
    """True if yfinance has a native interval for this TF (no aggregation needed)."""
    return to_minutes(tf) in _NATIVE_MINUTES


def native_base_for(tf: str) -> str:
    """
    For a non-native TF, return the native base TF to fetch then aggregate from.
    Picks the largest native divisor to minimise bar count and keep timestamps exact.

      H2  (120m) → H1  (ratio 2)   H3  (180m) → H1  (ratio 3)
      H6  (360m) → H1  (ratio 6)   H8  (480m) → H4  (ratio 2)
      H12 (720m) → H4  (ratio 3)   M3  (  3m) → M1  (ratio 3)
      M10 ( 10m) → M5  (ratio 2)   M20 ( 20m) → M5  (ratio 4)
    """
    mins = to_minutes(tf)
    if mins in _NATIVE_MINUTES:
        return tf
    for base_mins in (240, 60, 30, 15, 5, 2, 1):
        if mins % base_mins == 0:
            return _NATIVE_TF[base_mins]
    return "M1"
