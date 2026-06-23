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

def _first(t: dict, *keys: str) -> Any:
    """First key whose value is not None — so a legitimate 0 / breakeven is not
    skipped the way an `a or b` chain would skip a falsy 0."""
    for k in keys:
        v = t.get(k)
        if v is not None:
            return v
    return None


def get_pnl(t: dict) -> float | None:
    """Monetary P&L. Matches the Metrics priority (pnl → profitLoss → profit_loss),
    checking top-level fields then JSONB blobs. 0 is a valid breakeven, not skipped.
    (Previously read only profitLoss/profit_loss and ignored blobs, so trades whose
    P&L lived under 'pnl' or in a blob were dropped from the equity curve.)"""
    v = _first(t, "pnl", "profitLoss", "profit_loss")
    if v is None:
        v = blob_field(t, "pnl")
    if v is None:
        v = blob_field(t, "profitLoss")
    return _f(v)


def get_pnl_pct(t: dict) -> float | None:
    """
    Percentage P&L.  Priority:
      1. pnlPercent (explicit percentage field)
      2. _pnlPct    (pre-computed by core._annotate_pnl_pct from monetary P&L)
    Returns None when absent.
    """
    v = _first(t, "pnlPercent", "pnl_percent")
    if v is None:
        v = blob_field(t, "pnlPercent")
    if v is None:
        v = blob_field(t, "pnl_percent")
    if v is None:
        v = t.get("_pnlPct")
    return _f(v)


# Superset of metrics_calculator's WIN/LOSS sets (adds 'w','l','loser' for parity)
# plus a few tolerant aliases. Drawdown lowercases first, so casing never matters.
_WIN_ALIASES     = frozenset({"win", "won", "w", "profit", "tp", "take profit", "1", "true"})
_LOSS_ALIASES    = frozenset({"loss", "lose", "lost", "loser", "l", "sl", "stop loss", "stopped", "0", "false"})
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
    Best available datetime for a trade (used for month bucketing / days-since-peak).
    Priority matches the Metrics page's trade_date:
      tradeDate → entryTime → exitTime → createdAt
    Bare time-only strings ("09:30") are skipped — they carry no date.
    """
    for key in ("tradeDate", "trade_date", "entryTime", "entry_time",
                "exitTime", "exit_time", "entryTimeUTC", "entry_time_utc",
                "createdAt", "created_at"):
        dt = _parse_dt(t.get(key))
        if dt is not None:
            return dt
    return None


def sort_by_date(trades: list) -> list:
    """Sort to match the Metrics page EXACTLY: by (exit/close time, entry/open time, id),
    undated trades FIRST. Realised P&L hits the account at CLOSE, so close-time ordering
    is the correct (and Metrics-consistent) equity sequence. The old version sorted
    entry-time-first with undated trades last, producing a different equity path."""
    _MIN = datetime.min
    def _key(t):
        ex = _parse_dt(_first(t, "exitTime", "exit_time", "closedAt", "closed_at"))
        en = _parse_dt(_first(t, "entryTime", "entry_time", "entryTimeUTC", "entry_time_utc", "openedAt", "opened_at"))
        return (ex or _MIN, en or _MIN, str(t.get("id") or t.get("_id") or ""))
    return sorted(trades, key=_key)


# ── Instrument / strategy / session ──────────────────────────────────────────

def get_instrument(t: dict) -> str:
    """Instrument/pair name, normalised IDENTICALLY to the Metrics page
    (metrics_calculator._normalize_instrument): upper-case + strip '/', '-', '_'
    so EUR/USD, EURUSD and eur_usd all group as ONE pair. Without this, drawdown
    treated 'EUR/USD' and 'EURUSD' as separate instruments and under-counted vs
    Metrics (e.g. 22 instead of 59)."""
    raw = (
        t.get("instrument") or
        blob_field(t, "instrument") or
        "Unknown"
    )
    norm = str(raw).upper().replace("/", "").replace("-", "").replace("_", "").strip()
    return norm or "Unknown"


def get_strategy(t: dict) -> str:
    """
    Strategy label — derived IDENTICALLY to the Metrics page
    (metrics_calculator: setupTag → strategyVersionId → strategy). Checks the
    top-level fields then JSONB blobs.

    NO timeframe fallback: the entry timeframe is NOT a strategy. The old version
    read 'strategy'/'entryReason' then fell back to entryTF, so when the real
    strategy lived in strategyVersionId/setupTag (as Metrics reads it) the
    Drawdown-by-strategy breakdown listed timeframes ('1m', '5M', '1H', …) as
    strategies instead of the actual strategy.
    """
    raw = (
        t.get("setupTag") or t.get("strategyVersionId") or t.get("strategy") or
        blob_field(t, "setupTag") or
        blob_field(t, "strategyVersionId") or
        blob_field(t, "strategy") or
        t.get("setup_tag") or t.get("strategy_version_id") or
        ""
    )
    s = str(raw).strip()
    return s or "Unknown"


# Mirror metrics_calculator._normalise_direction (long/buy/l/bullish/bull,
# short/sell/s/bearish/bear) plus a few extra safe aliases + a substring fallback.
_BULL_ALIASES = frozenset({"long", "buy", "bull", "bullish", "up", "b", "l"})
_BEAR_ALIASES = frozenset({"short", "sell", "bear", "bearish", "down", "s"})


def get_direction(t: dict) -> str:
    """
    Normalise trade direction to 'bullish' (long / buy) | 'bearish' (short / sell)
    | '' (unknown). Checks the direction field then common aliases + JSONB blobs.
    """
    raw = (
        t.get("direction") or t.get("tradeType") or t.get("trade_type") or
        t.get("side") or t.get("bias") or
        blob_field(t, "direction") or blob_field(t, "side") or
        blob_field(t, "tradeType") or ""
    )
    s = _s(raw)
    if s in _BULL_ALIASES:
        return "bullish"
    if s in _BEAR_ALIASES:
        return "bearish"
    # substring fallback for compound labels e.g. "Long (buy)"
    if "long" in s or "buy" in s or "bull" in s:
        return "bullish"
    if "short" in s or "sell" in s or "bear" in s:
        return "bearish"
    return ""


def get_session(t: dict) -> str:
    """
    Trading session label — matches the Metrics page exactly: session → sessionName →
    session_name (top-level then JSONB blobs), used VERBATIM with no remapping.

    The old version read sessionPhase FIRST (Open/Mid/Close) and remapped labels, so the
    Drawdown-by-session breakdown grouped by PHASE while Metrics groups by SESSION
    (London/NY/Asian) — the two pages never lined up. sessionPhase is a SEPARATE
    dimension and is no longer treated as the session.
    """
    raw = (
        t.get("session") or t.get("sessionName") or t.get("session_name") or
        blob_field(t, "session") or blob_field(t, "sessionName") or
        ""
    )
    s = str(raw).strip()
    return s or "Unknown"
