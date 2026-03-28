"""
drawdown/_utils.py
──────────────────────────────────────────────────────────────────────────────
Shared field-access helpers for the drawdown sub-module.
All functions are pure (no side effects) and never raise — they return None
(or a safe default) when the requested data is absent or unparseable.

Field mapping from the journalEntries DB schema (camelCase from Drizzle ORM):
  profitLoss      decimal  → get_pnl
  pnlPercent      decimal  → get_pnl_pct
  outcome         text     → get_outcome
  entryTime       text     → get_trade_dt (primary)
  exitTime        text     → get_trade_dt (fallback)
  createdAt       ISO str  → get_trade_dt (last resort)
  instrument      text     → get_instrument
  entryTF / aiExtracted.strategy → get_strategy
  sessionPhase / sessionName     → get_session
  aiExtracted     jsonb    → blob_field
  manualFields    jsonb    → blob_field
"""
from __future__ import annotations
import re
from datetime import datetime
from statistics import mean as _mean
from typing import Any


# ── Primitive coercions ───────────────────────────────────────────────────────

def _f(val: Any) -> float | None:
    """Coerce a value to float; return None if not parseable."""
    if val is None:
        return None
    try:
        return float(str(val).strip())
    except (ValueError, TypeError):
        return None


def _s(val: Any) -> str:
    """Coerce a value to stripped lowercase string."""
    if val is None:
        return ""
    return str(val).strip().lower()


def safe_mean(values: list) -> float:
    """Mean of a list; 0.0 when empty."""
    if not values:
        return 0.0
    try:
        return _mean(float(v) for v in values)
    except (TypeError, ValueError):
        return 0.0


# ── JSONB blob accessor ───────────────────────────────────────────────────────

def blob_field(t: dict, key: str) -> Any:
    """
    Look up *key* inside the aiExtracted and manualFields JSONB blobs.
    Returns the first non-None value found, or None.
    """
    for blob_key in ("aiExtracted", "ai_extracted", "manualFields", "manual_fields"):
        blob = t.get(blob_key)
        if isinstance(blob, dict):
            val = blob.get(key)
            if val is not None:
                return val
    return None


# ── Domain helpers ────────────────────────────────────────────────────────────

def get_pnl(t: dict) -> float | None:
    """Monetary P&L from profitLoss field."""
    return _f(t.get("profitLoss") or t.get("profit_loss"))


def get_pnl_pct(t: dict) -> float | None:
    """
    Percentage P&L.  Priority:
      1. pnlPercent (explicit percentage field)
      2. _pnlPct    (pre-computed by core._annotate_pnl_pct from monetary P&L)
    Returns None when absent.
    """
    return _f(
        t.get("pnlPercent") or
        t.get("pnl_percent") or
        blob_field(t, "pnlPercent") or
        blob_field(t, "pnl_percent") or
        t.get("_pnlPct")
    )


_WIN_ALIASES     = frozenset({"win", "won", "profit", "tp", "take profit", "1", "true"})
_LOSS_ALIASES    = frozenset({"loss", "lose", "lost", "sl", "stop loss", "stopped", "0", "false"})
_BE_ALIASES      = frozenset({"be", "breakeven", "break even", "break-even", "scratch"})


def get_outcome(t: dict) -> str:
    """
    Normalise outcome to 'win' | 'loss' | 'breakeven' | ''.
    Checks t['outcome'] then JSONB blobs.
    """
    raw = (
        t.get("outcome") or
        blob_field(t, "outcome") or
        ""
    )
    s = _s(raw)
    if s in _WIN_ALIASES:
        return "win"
    if s in _LOSS_ALIASES:
        return "loss"
    if s in _BE_ALIASES:
        return "breakeven"
    return ""


# ── Date parsing ──────────────────────────────────────────────────────────────

_ISO_RE    = re.compile(r"(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})")
_ISO_D_RE  = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_DMY_RE    = re.compile(r"(\d{1,2})[/.](\d{1,2})[/.](\d{4})\s*(\d{2}:\d{2})?")
_TIME_RE   = re.compile(r"^\d{1,2}:\d{2}")


def _parse_dt(raw: Any) -> datetime | None:
    """Try to parse a date/datetime string; return None on failure."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or _TIME_RE.match(s):
        # bare time string like "09:30" — no date information, skip
        return None
    # ISO with time
    m = _ISO_RE.match(s)
    if m:
        try:
            return datetime(int(m[1]), int(m[2]), int(m[3]), int(m[4]), int(m[5]))
        except ValueError:
            pass
    # ISO date-only
    m = _ISO_D_RE.match(s)
    if m:
        try:
            return datetime(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            pass
    # DD/MM/YYYY or DD.MM.YYYY
    m = _DMY_RE.match(s)
    if m:
        try:
            d, mo, y = int(m[1]), int(m[2]), int(m[3])
            if mo > 12:         # must be MM/DD — swap
                d, mo = mo, d
            return datetime(y, mo, d)
        except ValueError:
            pass
    # Last resort — let datetime.fromisoformat / strptime try
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%a %b %d %Y %H:%M:%S"):
        try:
            return datetime.strptime(s[:26], fmt[:len(fmt)])
        except (ValueError, TypeError):
            pass
    return None


def get_trade_dt(t: dict) -> datetime | None:
    """
    Best available datetime for a trade.  Priority:
      entryTime → exitTime → entryTimeUTC → createdAt
    Bare time-only strings ("09:30") are skipped — they carry no date.
    """
    for key in ("entryTime", "entry_time", "exitTime", "exit_time",
                "entryTimeUTC", "entry_time_utc", "createdAt", "created_at"):
        dt = _parse_dt(t.get(key))
        if dt is not None:
            return dt
    return None


def sort_by_date(trades: list) -> list:
    """Return trades sorted by get_trade_dt ascending; undated trades go last."""
    def _key(t):
        dt = get_trade_dt(t)
        return dt if dt is not None else datetime(9999, 12, 31)
    return sorted(trades, key=_key)


# ── Instrument / strategy / session ──────────────────────────────────────────

def get_instrument(t: dict) -> str:
    """Instrument/pair name, upper-cased."""
    raw = (
        t.get("instrument") or
        blob_field(t, "instrument") or
        "Unknown"
    )
    return str(raw).strip().upper() or "Unknown"


def get_strategy(t: dict) -> str:
    """
    Strategy label.  Checks explicit fields then JSONB blobs.
    Falls back to the entry timeframe as a proxy (e.g. "5M", "15M").
    """
    raw = (
        t.get("strategy") or
        t.get("entryReason") or
        blob_field(t, "strategy") or
        blob_field(t, "entryReason") or
        t.get("entryTF") or
        t.get("entry_tf") or
        ""
    )
    s = str(raw).strip()
    return s or "Unknown"


_SESSION_MAP: dict[str, str] = {
    # normalised → display label
    "london":          "London Open",
    "london open":     "London Open",
    "london/ny":       "London/NY Overlap",
    "london/ny overlap": "London/NY Overlap",
    "overlap":         "London/NY Overlap",
    "new york":        "NY Session",
    "new york open":   "NY Session",
    "ny":              "NY Session",
    "ny open":         "NY Session",
    "ny session":      "NY Session",
    "new york session":"NY Session",
    "ny mid":          "NY Mid-Day",
    "ny mid-day":      "NY Mid-Day",
    "mid-day":         "NY Mid-Day",
    "asian":           "Asian",
    "asian open":      "Asian",
    "asia":            "Asian",
    "asian close":     "Asian Close",
    "off-hours":       "Off-Hours",
    "off hours":       "Off-Hours",
    "pre-market":      "Pre-Market",
}


def get_session(t: dict) -> str:
    """
    Normalise trading session label.
    Checks sessionPhase → sessionName → timingContext → JSONB blobs.
    """
    raw = (
        t.get("sessionPhase") or
        t.get("session_phase") or
        t.get("sessionName") or
        t.get("session_name") or
        t.get("timingContext") or
        t.get("timing_context") or
        blob_field(t, "sessionPhase") or
        blob_field(t, "session") or
        ""
    )
    s = str(raw).strip().lower()
    if not s:
        return "Off-Hours"
    # Try exact map first
    if s in _SESSION_MAP:
        return _SESSION_MAP[s]
    # Partial match
    for key, label in _SESSION_MAP.items():
        if key in s:
            return label
    # Return title-cased original as fallback
    return str(raw).strip().title() or "Off-Hours"
