"""
Risk guard for copy followers — pre-trade safety checks run on each OPEN.
Keeps the dispatcher lean and the safety logic testable in isolation.

Returns (allowed, skip_reason). Only OPENs are gated; CLOSE / MODIFY always pass
so a follower can never be stranded holding a position it can't exit.
"""
import logging
import os
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


# A follower may never risk more than this share of their account on ONE copied trade.
# User rule, 2026-07-26: "a follower cannot trade more than 3% of his total account when following
# a provider." Overridable per follower via max_trade_risk_pct, and platform-wide by env.
MAX_TRADE_RISK_PCT = float(os.environ.get("COPY_MAX_TRADE_RISK_PCT", "3") or 3)


def check_trade_risk(follower, broker_account, lots: float, sl_pips: float | None,
                     pip_val: float) -> tuple[bool, str | None]:
    """Refuse an OPEN that would risk more than the cap. (allowed, reason).

    RISK, not notional. "3% of the account" as notional would be ~0.003 lots on a $10k balance and
    unusable; 3% risk is a real ceiling and matches how the rest of this module thinks — daily loss
    and drawdown are both percentages of balance.

        risk_amount = lots x sl_pips x pip_value

    NO STOP LOSS IS A REFUSAL. Risk without a stop is unbounded, so it cannot be checked, and
    letting an unmeasurable trade past the guard whose entire job is to bound risk defeats it.
    Copy a provider who trades without stops and you are not risking 3%, you are risking the
    account.

    REFUSED, NEVER RESIZED. Quietly shrinking a trade to fit would place a position the follower's
    provider did not signal and the follower did not choose. A skip is visible in the log and
    costs nothing but a missed entry.

    WHY IT EXISTS: nothing here ever asked whether ONE position was too big. The only ceiling was
    MAX_LOTS = 100 in lot_calc — a clamp, not a safety limit, and ruinous on a retail account. Had
    this check existed, the 100,000x master-size misread would have been caught the first time a
    trade was copied, because 100 lots breaches 3% of any retail balance by orders of magnitude.
    """
    balance = _to_float(getattr(broker_account, "balance", None))
    if not balance or balance <= 0:
        return True, None                    # unknown balance: the existing guards already no-op

    cap_pct = _to_float(getattr(follower, "max_trade_risk_pct", None)) or MAX_TRADE_RISK_PCT
    if cap_pct <= 0:
        return True, None

    if not sl_pips or sl_pips <= 0:
        return False, (f"no stop loss — risk is unbounded and cannot be checked against the "
                       f"{cap_pct:.1f}% per-trade cap")

    risk_amount = float(lots) * float(sl_pips) * float(pip_val or 0)
    if risk_amount <= 0:
        return True, None
    risk_pct = risk_amount / balance * 100
    if risk_pct > cap_pct:
        return False, (f"trade would risk {risk_amount:,.2f} = {risk_pct:.1f}% of the "
                       f"{balance:,.2f} balance, over the {cap_pct:.1f}% per-trade cap "
                       f"({lots} lots x {sl_pips:.1f} pips)")
    return True, None
