"""
Risk guard for copy followers — pre-trade safety checks run on each OPEN.
Keeps the dispatcher lean and the safety logic testable in isolation.

Returns (allowed, skip_reason). Only OPENs are gated; CLOSE / MODIFY always pass
so a follower can never be stranded holding a position it can't exit.
"""
import logging

from db import Session, CopyTradeFollower, CopyFollower

log = logging.getLogger("risk_guard")

# Highest balance seen per follower (in-memory; rebuilds from current balance on
# restart). cTrader exposes balance but NOT equity, so the drawdown guard measures
# *realized* drawdown — balance fallen from its peak. (Floating/equity drawdown
# would need a live price feed to value open positions — a future addition.)
_peak_balance: dict[str, float] = {}


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

    # 2. Drawdown / loss guard — realized drawdown of balance from its peak.
    #    balance is refreshed by autoSyncService; degrades to a no-op until a
    #    balance is known, so it never blocks on missing data.
    if getattr(follower, "pause_on_dd", False):
        balance = _to_float(getattr(broker_account, "balance", None))
        if balance and balance > 0:
            peak = max(_peak_balance.get(follower.id, balance), balance)
            _peak_balance[follower.id] = peak
            drop   = peak - balance                      # realized loss from the peak
            dd_pct = (drop / peak * 100) if peak > 0 else 0.0

            max_dd = _to_float(follower.max_dd_percent)
            if max_dd and dd_pct >= max_dd:
                _auto_pause(follower.id, f"drawdown {dd_pct:.1f}% >= {max_dd}%")
                return False, f"drawdown {dd_pct:.1f}% >= max {max_dd}%"

            max_loss = _to_float(follower.max_daily_loss)
            if max_loss and drop >= max_loss:
                _auto_pause(follower.id, f"loss {drop:.2f} from peak >= {max_loss}")
                return False, f"loss {drop:.2f} >= max {max_loss}"

    return True, None
