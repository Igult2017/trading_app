"""
tf_metrics/grouping.py
Groups trades by their recorded entry timeframe.
Handles every realistic timeframe from 1 second to 1 month.
No trade ever ends up as "Unknown" if the TF string contains
a recognisable number + unit combination.
"""
from __future__ import annotations
from collections import defaultdict
import re

# ── Canonical alias map ───────────────────────────────────────────────────────
# Every common way a user might write any timeframe → canonical label.

CANONICAL_MAP: dict[str, str] = {
    # ── Seconds ───────────────────────────────────────────────────────────────
    "1s": "S1",  "s1": "S1",  "1sec": "S1",  "1second": "S1",
    "5s": "S5",  "s5": "S5",  "5sec": "S5",  "5seconds": "S5",
    "10s":"S10", "s10":"S10", "10sec":"S10",
    "15s":"S15", "s15":"S15", "15sec":"S15",
    "30s":"S30", "s30":"S30", "30sec":"S30",

    # ── Minutes ───────────────────────────────────────────────────────────────
    "1m":  "M1",  "m1":  "M1",  "1min":  "M1",  "1minute":  "M1",
    "2m":  "M2",  "m2":  "M2",  "2min":  "M2",
    "3m":  "M3",  "m3":  "M3",  "3min":  "M3",
    "5m":  "M5",  "m5":  "M5",  "5min":  "M5",  "5minutes": "M5",
    "10m": "M10", "m10": "M10", "10min": "M10",
    "15m": "M15", "m15": "M15", "15min": "M15", "15minutes":"M15",
    "20m": "M20", "m20": "M20", "20min": "M20",
    "30m": "M30", "m30": "M30", "30min": "M30", "30minutes":"M30",
    "45m": "M45", "m45": "M45", "45min": "M45",

    # ── Hours ─────────────────────────────────────────────────────────────────
    "1h":  "H1",  "h1":  "H1",  "1hr":  "H1",  "1hour":  "H1",
    "60m": "H1",  "60min":"H1",
    "2h":  "H2",  "h2":  "H2",  "2hr":  "H2",  "120m":  "H2",
    "3h":  "H3",  "h3":  "H3",  "3hr":  "H3",  "180m":  "H3",
    "4h":  "H4",  "h4":  "H4",  "4hr":  "H4",  "4hours":"H4",  "240m": "H4",
    "6h":  "H6",  "h6":  "H6",  "6hr":  "H6",  "360m":  "H6",
    "8h":  "H8",  "h8":  "H8",  "8hr":  "H8",  "480m":  "H8",
    "12h": "H12", "h12": "H12", "12hr": "H12", "720m":  "H12",

    # ── Days ──────────────────────────────────────────────────────────────────
    "1d":  "D1",  "d1":  "D1",  "daily": "D1",  "1day":  "D1",
    "2d":  "D2",  "d2":  "D2",  "2days": "D2",
    "3d":  "D3",  "d3":  "D3",

    # ── Weeks ─────────────────────────────────────────────────────────────────
    "1w":  "W1",  "w1":  "W1",  "weekly":"W1",  "1week": "W1",
    "2w":  "W2",  "w2":  "W2",

    # ── Months ────────────────────────────────────────────────────────────────
    "1mo": "MN1", "mn1": "MN1", "monthly":"MN1", "1month":"MN1",
    "mn":  "MN1", "month":"MN1",
}

# ── Display sort order: finest → coarsest ─────────────────────────────────────
_TF_ORDER = [
    "S1", "S5", "S10", "S15", "S30",
    "M1", "M2", "M3", "M5", "M10", "M15", "M20", "M30", "M45",
    "H1", "H2", "H3", "H4", "H6", "H8", "H12",
    "D1", "D2", "D3",
    "W1", "W2",
    "MN1",
]

# ── Regex parser for anything not in CANONICAL_MAP ───────────────────────────
# Matches patterns like "2H", "45MIN", "1SEC", "4HOUR", "3DAY" etc.
_PARSE_RE = re.compile(
    r'^(\d+)\s*'
    r'(s|sec|secs|second|seconds'
    r'|m|min|mins|minute|minutes'
    r'|h|hr|hrs|hour|hours'
    r'|d|day|days'
    r'|w|wk|wks|week|weeks'
    r'|mo|mon|month|months|mn)$',
    re.IGNORECASE,
)

_UNIT_TO_PREFIX = {
    "s": "S", "sec": "S", "secs": "S", "second": "S", "seconds": "S",
    "m": "M", "min": "M", "mins": "M", "minute": "M", "minutes": "M",
    "h": "H", "hr":  "H", "hrs":  "H", "hour":   "H", "hours":   "H",
    "d": "D", "day": "D", "days": "D",
    "w": "W", "wk":  "W", "wks":  "W", "week":   "W", "weeks":   "W",
    "mo": "MN", "mon": "MN", "month": "MN", "months": "MN", "mn": "MN",
}


def _normalise_tf(raw) -> str:
    """
    Convert any TF string the user might enter to a canonical label.

    Strategy (in order):
      1. Direct lookup in CANONICAL_MAP  (handles all common aliases)
      2. Already-canonical check         (e.g. "H4", "M15" passed directly)
      3. Regex parser                    (handles any number+unit combo)
      4. Return the uppercased string    (never "Unknown" if non-empty)
    """
    if not raw and raw != 0:
        return "Unknown"

    s = str(raw).strip()
    if not s:
        return "Unknown"

    key = s.lower()

    # 1. Direct alias lookup
    if key in CANONICAL_MAP:
        return CANONICAL_MAP[key]

    upper = s.upper()

    # 2. Already canonical (e.g. "H4", "M15", "S30", "MN1")
    if upper in _TF_ORDER:
        return upper

    # 3. Regex parser — handles any number+unit the user might type
    m = _PARSE_RE.match(s)
    if m:
        number = m.group(1)
        unit   = m.group(2).lower()
        prefix = _UNIT_TO_PREFIX.get(unit)
        if prefix:
            canonical = f"{prefix}{number}" if prefix != "MN" else f"MN{number}"
            return canonical

    # 4. Last resort — return uppercased verbatim so trade is never lost
    #    and the label is at least consistent (no mixed case duplicates)
    return upper


def group_by_timeframe(trades: list) -> dict:
    """
    Groups trades by their normalised entry timeframe label.

    Field priority (schema.ts journalEntries):
      1. entryTF    — the timeframe the entry candle was on
      2. analysisTF — fallback if entryTF absent
      3. contextTF  — last resort contextual TF
      4. Upper-cased verbatim — never silently dropped

    Returns dict[canonical_tf, list[trade_dict]].
    """
    groups: dict[str, list] = defaultdict(list)

    for trade in trades:
        if not isinstance(trade, dict):
            continue
        raw = (
            trade.get("entryTF")    or trade.get("entry_tf")    or
            trade.get("analysisTF") or trade.get("analysis_tf") or
            trade.get("contextTF")  or trade.get("context_tf")  or
            trade.get("timeframe")  or
            None
        )
        tf = _normalise_tf(raw)
        groups[tf].append(trade)

    return dict(groups)


def sorted_timeframes(tfs: list) -> list:
    """
    Return TF labels in canonical display order (finest → coarsest).
    Any TF not in _TF_ORDER (e.g. a custom label) sorts after all known ones.
    """
    def _key(tf: str) -> tuple:
        try:
            return (0, _TF_ORDER.index(tf))
        except ValueError:
            return (1, tf)  # unknown TFs sort after all known, then alphabetically

    return sorted(tfs, key=_key)
