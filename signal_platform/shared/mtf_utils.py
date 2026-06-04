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
    Return (yfinance interval, fetch period) for any TF string.
    Period is chosen to give ~300 bars of history minimum.

    yfinance interval limits:
      1m  → max 7 days
      2m  → max 60 days
      5m  → max 60 days
      15m → max 60 days
      30m → max 60 days
      60m → max 730 days
      90m → max 60 days
      1h  → max 730 days
      4h  → max 730 days (unofficial, works)
      1d  → unlimited
      1wk → unlimited
      1mo → unlimited
    """
    mins = to_minutes(tf)

    # ── Sub-hour ──────────────────────────────────────────────────────────────
    if mins == 1:
        return "1m",  "7d"
    if mins <= 2:
        return "2m",  "60d"
    if mins <= 5:
        return "5m",  "60d"
    if mins <= 15:
        return "15m", "60d"
    if mins <= 30:
        return "30m", "60d"

    # ── Hourly ────────────────────────────────────────────────────────────────
    if mins <= 60:
        return "60m", "730d"
    if mins <= 120:
        return "60m", "730d"   # aggregate 2× after fetch
    if mins <= 240:
        return "4h",  "730d"
    if mins <= 480:
        return "4h",  "730d"   # aggregate 2× after fetch
    if mins <= 720:
        return "4h",  "730d"   # aggregate 3× after fetch

    # ── Daily and above ───────────────────────────────────────────────────────
    if mins <= 1_440:
        return "1d",  "max"
    if mins <= 10_080:
        return "1wk", "max"

    return "1mo", "max"


def seconds(tf: str) -> int:
    """Duration of one bar in seconds — used for signal expiry calculations."""
    return to_minutes(tf) * 60
