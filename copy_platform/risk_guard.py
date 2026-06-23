"""
Risk guard for copy followers — pre-trade safety checks run on each OPEN.
Keeps the dispatcher lean and the safety logic testable in isolation.

Returns (allowed, skip_reason). Only OPENs are gated; CLOSE / MODIFY always pass
so a follower can never be stranded holding a position it can't exit.
"""
import logging
from datetime import datetime, timezone

from db import Session, CopyTradeFollower, CopyFollower

log = logging.getLogger("risk_guard")

# Highest balance seen per follower (in-memory; rebuilds from current balance on
# restart). cTrader exposes balance but NOT equity, so the drawdown guard measures
# *realized* drawdown — balance fallen from its peak. (Floating/equity drawdown
# would need a live price feed to value open positions — a future addition.)
_peak_balance: dict[str, float] = {}

# Per-follower day-start balance for the DAILY-loss guard: follower_id -> (UTC date, balance).
# In-memory: on the first check of each UTC day it seeds from the current balance, so an
# engine restart mid-day re-anchors to the restart balance (conservative degradation).
_day_start: dict[str, tuple[str, float]] = {}


def _daily_loss_pct(follower_id: str, balance: float) -> float:
    """Realized loss TODAY as a percent of the day's starting balance (0 if flat/up)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rec = _day_start.get(follower_id)
    if rec is None or rec[0] != today:
        _day_start[follower_id] = (today, balance)   # seed the day's anchor
        return 0.0
    start_bal = rec[1]
    if start_bal <= 0:
        return 0.0
    return max(0.0, (start_bal - balance) / start_bal * 100)


def _open_position_count(db, follower_id: str) -> int:
    """Approximate live open positions = executed OPENs minus executed CLOSEs."""
    opens = db.query(CopyTradeFollower).filter_by(
        follower_id=follower_id, event_type="OPEN", status="executed").count()
    closes = db.query(CopyTradeFollower).filter_by(
        follower_id=follower_id, event_type="CLOSE", status="executed").count()
    return max(0, opens - closes)


def _auto_pause(follower_id: str, reason: str) -> None:
    """Disable a follower after a drawdown / loss breach (re-enable from the UI)."""
    try:
        with Session() as db:
            f = db.get(CopyFollower, follower_id)
            if f and f.is_active:
                f.is_active = False
                db.commit()
        log.warning(f"[{follower_id}] auto-paused: {reason}")
    except Exception:
        pass


def _to_float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def check_follower_allowed(follower, snap, etype: str, broker_account) -> tuple[bool, str | None]:
    """Gate a new OPEN against the follower's safety limits. Exits are never blocked."""
    if etype != "OPEN":
        return True, None

    # 1. Max concurrent open trades
    if follower.max_open_trades:
        with Session() as db:
            if _open_position_count(db, follower.id) >= int(follower.max_open_trades):
                return False, f"max_open_trades ({follower.max_open_trades}) reached"

    # 2. Balance-based risk guards (balance is refreshed by autoSyncService; the whole
    #    block degrades to a no-op until a balance is known, so it never blocks on missing
    #    data). cTrader has no equity field, so these are REALIZED-balance based.
    balance = _to_float(getattr(broker_account, "balance", None))
    if balance and balance > 0:
        # 2a. DAILY loss — realized loss today vs the day's starting balance. Interpreted
        #     as a PERCENT, default 2% when unset so every follower is protected. Always on.
        daily_limit = _to_float(follower.max_daily_loss) or 2.0
        daily_loss  = _daily_loss_pct(follower.id, balance)
        if daily_loss >= daily_limit:
            _auto_pause(follower.id, f"daily loss {daily_loss:.1f}% >= {daily_limit}%")
            return False, f"daily loss {daily_loss:.1f}% >= max {daily_limit}%"

        # 2b. Peak-to-trough drawdown — opt-in via pause_on_dd.
        if getattr(follower, "pause_on_dd", False):
            peak = max(_peak_balance.get(follower.id, balance), balance)
            _peak_balance[follower.id] = peak
            dd_pct = ((peak - balance) / peak * 100) if peak > 0 else 0.0
            max_dd = _to_float(follower.max_dd_percent)
            if max_dd and dd_pct >= max_dd:
                _auto_pause(follower.id, f"drawdown {dd_pct:.1f}% >= {max_dd}%")
                return False, f"drawdown {dd_pct:.1f}% >= max {max_dd}%"

    return True, None
