"""
The saved signal behind an order or an offer, rebuilt for the placer — or why it can no longer be taken.

Shared by the news pull (`execution/news_pull`, putting an order back after a release) and the DM
confirmation (`execution/confirmations`, placing what he confirmed). Moved here from `news_pull` on
16 Nov 2026 so both ask the same question the same way.

"STILL TAKEABLE" = the signal is still ACTIVE and its entry has NOT been reached (`triggered_at` is the
signal monitor's own record that price got to the entry — `monitor/signal_monitor.py`).
"""


def load(signal_id: str | None, spread_used: float = 0.0):
    """(Signal, None) when it can still be taken, else (None, the reason in plain words)."""
    from core.types import Direction, Signal
    from storage.db import get_session
    from storage.models import SignalModel
    if not signal_id:
        return None, "the order has no saved signal behind it"
    with get_session() as s:
        row = s.get(SignalModel, signal_id)
        if row is None:
            return None, "its signal is no longer saved"
        if row.triggered_at is not None:
            return None, "the price had already reached the entry"
        if row.status != "active":
            return None, f"the setup had already ended ({row.status})"
        f = lambda v: float(v) if v is not None else 0.0      # noqa: E731
        return Signal(symbol=row.symbol, direction=Direction(row.type), strategy_id=row.strategy or "",
                      strategy_name=row.strategy or "", entry_price=f(row.entry_price),
                      stop_loss=f(row.stop_loss), take_profit=f(row.take_profit),
                      confidence=(row.confidence or 0) / 100.0, expires_at=row.expires_at,
                      db_id=row.id, spread_used=float(spread_used or 0.0)), None
