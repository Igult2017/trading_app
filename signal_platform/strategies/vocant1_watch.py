"""
VOCANT.1 — setup LOCK + invalidation WATCH.

Once a setup fires it is LOCKED (one pending setup per instrument). Every scan tick we watch BOTH
timeframes together, so we never keep assuming the bias still holds after price has actually turned:
  - 1HR: if detect_bias now points the OTHER way, the higher-timeframe bias has flipped → invalidate.
  - 1M : if price reversed past the stop before the entry triggered → invalidate.
Also detects 'triggered' (the entry stop was hit → hand off / stop watching) and 'expired' (the
pending setup went stale). On a genuine invalidation the strategy sends a DM alert and drops the lock.
"""
from core.types import Candle, Signal, Direction, TF
from strategies.vocant1_bias import detect_bias

_LOCK_TTL = 3 * 3600   # a pending setup that neither triggers nor invalidates expires after 3h
_WATCH_M1 = 120        # recent M1 bars inspected for a trigger / reversal


def check_invalidation(locked: dict, h1: list[Candle], m1: list[Candle], now_ts: float) -> str | None:
    """
    Watch a LOCKED (pending) setup on BOTH timeframes. Returns:
      a reason string  — the bias/price turned against the setup (invalidate + alert),
      'triggered'      — the entry stop was hit (trade is live; stop watching),
      'expired'        — pending too long,
      None             — still pending-valid (keep watching).
    locked = {bullish, entry, sl, locked_at, ...}
    """
    bullish = locked["bullish"]
    if now_ts - locked["locked_at"] > _LOCK_TTL:
        return "expired"

    # 1HR — has the higher-timeframe bias flipped to the other side?
    bias = detect_bias(h1)
    if bias is not None and bias[0] != bullish:
        return "1HR bias flipped against the setup"

    # 1M — since the lock, did the entry trigger, or did price reverse past the stop first?
    entry, sl = locked["entry"], locked["sl"]
    for c in [c for c in m1[-_WATCH_M1:] if c.time >= locked["locked_at"] - 3600]:
        if bullish:
            if c.high >= entry:
                return "triggered"
            if c.low <= sl:
                return "1M reversed below the stop before entry"
        else:
            if c.low <= entry:
                return "triggered"
            if c.high >= sl:
                return "1M reversed above the stop before entry"
    return None


def invalidation_signal(locked: dict, reason: str, symbol: str, strategy_name: str) -> Signal:
    """A DM alert telling the trader a previously-signalled setup is no longer valid."""
    side = "BUY" if locked["bullish"] else "SELL"
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if locked["bullish"] else Direction.SELL,
        strategy_id       = "vocant1_watch",     # → private DM
        strategy_name     = strategy_name,
        entry_price       = locked["entry"],
        stop_loss         = locked["sl"],
        take_profit       = locked["entry"],
        risk_reward       = 2.0,
        confidence        = 0.72,
        primary_timeframe = TF.H1,
        alert_only        = True,
        technical_reasons = [
            f"⚠️ {side} setup INVALIDATED — {reason}.",
            "Price no longer obeys the 1HR/1M bias — do NOT take this setup.",
        ],
        market_context    = f"VOCANT.1 INVALIDATED — {side} {symbol}: {reason}",
    )
