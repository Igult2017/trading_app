"""
EVERY AUTOTRADE DECISION, WRITTEN WHERE A DEPLOY CANNOT ERASE IT.

His question, 2026-09-15: *"Is autotrader even taking trades anymore?"* Answering it needed the broker's
own order history, because a REFUSAL lived only in a Telegram DM and a container log line, and every
deploy wipes the log. His EUR/USD sell of 14 Sep 13:03 had no order behind it and nothing on the
platform said why.

One row per decision in `signal_events`, the platform's existing audit trail (no new table): placed,
refused by our own guards, rejected by the broker, cancelled, or failed. `detail` is JSON so the admin
Autotrade screen can show the side, the levels and the reason without parsing prose.

NEVER RAISES, NEVER BLOCKS THE LOOP. The write goes to a worker thread, the way
`dispatcher._record_delivery` does it, and any failure is only a warning: recording that we refused an
order must never be able to change whether we place one.
"""
import asyncio
import json
import logging

from storage.observability_models import (
    STAGE_AUTOTRADE_CANCELLED, STAGE_AUTOTRADE_FAILED, STAGE_AUTOTRADE_PLACED,
    STAGE_AUTOTRADE_REFUSED, STAGE_AUTOTRADE_REJECTED,
)

log = logging.getLogger(__name__)


async def _write(stage: str, strategy: str, symbol: str, signal_id, fields: dict) -> None:
    try:
        # Looked up at CALL time, not import time, so the test harness's stub of `record` applies.
        from storage import observability_repo as obs
        detail = json.dumps({k: v for k, v in fields.items() if v is not None}, default=str)
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, lambda: obs.record(stage, strategy or "", symbol or "", signal_id or None, detail))
    except Exception as exc:
        log.warning(f"[decision_log] could not record {stage} for {symbol}: "
                    f"{type(exc).__name__}: {exc}")


def _about(signal) -> tuple[str, str, str | None, str | None]:
    """strategy, symbol, saved signal id, side. Read defensively: a half-built signal still gets a row."""
    direction = getattr(getattr(signal, "direction", None), "value", "") or ""
    side = "BUY" if direction == "buy" else "SELL" if direction == "sell" else None
    return (getattr(signal, "strategy_id", "") or "", getattr(signal, "symbol", "") or "",
            getattr(signal, "db_id", None) or None, side)


def _levels(signal) -> dict:
    return dict(entry=getattr(signal, "entry_price", None), stop=getattr(signal, "stop_loss", None),
                target=getattr(signal, "take_profit", None))


async def placed(signal, order_id, lots, entry, sl, tp) -> None:
    strategy, symbol, sid, side = _about(signal)
    await _write(STAGE_AUTOTRADE_PLACED, strategy, symbol, sid,
                 dict(side=side, order=str(order_id) if order_id else None, lots=lots,
                      entry=entry, stop=sl, target=tp))


async def refused(signal, reason: str, lots=None) -> None:
    strategy, symbol, sid, side = _about(signal)
    await _write(STAGE_AUTOTRADE_REFUSED, strategy, symbol, sid,
                 dict(side=side, lots=lots, **_levels(signal), reason=reason))


async def rejected(signal, error, lots, entry, sl, tp) -> None:
    strategy, symbol, sid, side = _about(signal)
    await _write(STAGE_AUTOTRADE_REJECTED, strategy, symbol, sid,
                 dict(side=side, lots=lots, entry=entry, stop=sl, target=tp, reason=str(error)))


async def failed(signal, reason: str) -> None:
    strategy, symbol, sid, side = _about(signal)
    await _write(STAGE_AUTOTRADE_FAILED, strategy, symbol, sid,
                 dict(side=side, **_levels(signal), reason=reason))


async def cancelled(signal_id: str | None, symbol: str, order_id, reason: str) -> None:
    await _write(STAGE_AUTOTRADE_CANCELLED, "", symbol, signal_id,
                 dict(order=str(order_id) if order_id else None, reason=reason))
