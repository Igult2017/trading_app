"""
OPEN POSITIONS, AS THE BROKER HAS THEM — the platform's first look at a real trade.

Until 2026-08-21 nothing in this codebase had ever read a position. The trade-management alerts
(`strategies/vix1_manage` + `monitor/vix1_alerts`) inferred everything from candles and the SIGNAL's
assumed entry: they took it on faith that he filled at the signalled price, with the signalled stop,
and that he was still in. Wrong the moment he slipped, moved his own stop, closed early, or simply
did not take the trade — and it kept advising regardless.

His words, 2026-08-21, asking for the tracker: *"I mean the accurate one."* This is what makes it
accurate: R measured from HIS fill and HIS stop.

ONE REQUEST, THE SAME LOCK. `ProtoOAReconcileReq` returns every open position and pending order in a
single reply, so this costs one round trip per poll and takes `ctrader_client._req_lock` exactly like
the candle fetch — the shared socket is strictly request/response and nothing here changes that.

PRICES ARE 1e5-SCALED, MONEY IS `moneyDigits`-SCALED, AND THEY ARE DIFFERENT SCALES ON THE SAME
MESSAGE. `price`, `stopLoss` and `takeProfit` divide by a fixed 100,000 like trendbars; `swap` and
`commission` divide by `10^moneyDigits` off the position itself. Mixing them is the classic cTrader
foot-gun (`Q-K19` in the skill's ledger), so each is converted once, here, and never again.

COMMISSION IS ONE SIDE ONLY. The `commission` field is what has been charged SO FAR — the opening
half. Closing costs the same again, so the round-trip cost is 2x it. That matters because the whole
point of the breakeven alert is a stop where closing nets ZERO, and a stop that only covers the
opening commission still loses the closing one.
"""
import asyncio
import logging
from dataclasses import dataclass

from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOADealListReq, ProtoOADealListRes, ProtoOAReconcileReq, ProtoOAReconcileRes,
)

from data import ctrader_session as _sess
from data.ctrader_client import _load_symbols, _req_lock, _symbols

log = logging.getLogger(__name__)

_DIVISOR = 100_000.0
_TYPE_RECONCILE_RES = ProtoOAReconcileRes().payloadType
_TYPE_DEAL_LIST_RES = ProtoOADealListRes().payloadType

# THE ORDERS RESTING AT THE BROKER, from the SAME reconcile reply as the positions. Added 2026-09-15.
# The reply always carried them (`ProtoOAReconcileRes.order`, confirmed off the installed package) and
# this module threw them away. The duplicate-order guard needs them to tell a live order from a
# withdrawn one, and reading them here costs no extra request. None until the first successful read.
_resting_order_ids: set[int] | None = None


def _resting_ids(res) -> set[int]:
    """The ids of every pending order in a reconcile reply."""
    return {int(o.orderId) for o in res.order}


def last_resting_order_ids() -> set[int] | None:
    """Resting order ids from the most recent SUCCESSFUL read, or None if there has been none."""
    return None if _resting_order_ids is None else set(_resting_order_ids)


@dataclass(frozen=True)
class Position:
    """One open trade, in display units, with every scale already applied."""
    position_id: int
    symbol: str            # platform form, e.g. "EUR/USD"
    bullish: bool
    volume: int            # cTrader's own units (cents for FX)
    entry: float
    stop: float | None     # None = no stop set; R is undefined and the tracker says so
    target: float | None
    commission: float      # one side, in account currency — DOUBLE it for the round trip
    swap: float
    opened_at: int         # epoch seconds
    # THE STOP THE TRADE STARTED WITH — attached by `monitor/start_stops` from the broker's opening
    # order. None until it is known. It is the ONLY yardstick R is counted in (see `r_at`).
    start_stop: float | None = None

    def risk(self) -> float | None:
        """1R in price: the distance from the fill to the STARTING stop. None if that is not known."""
        if self.start_stop is None:
            return None
        r = abs(self.entry - self.start_stop)
        return r if r > 0 else None

    def r_at(self, price: float) -> float | None:
        """How many R this trade is up at `price`, counted from where it STARTED. None = unknown.

        COUNTED FROM THE STARTING STOP, NEVER THE CURRENT ONE (fixed 19 Sep 2026, docs/OPEN.md B27).
        This used `abs(entry - stop)` with the stop the position carries NOW. The ladder's own first
        move put that stop on the entry, so risk read zero and R read None for the rest of the trade:
        his EUR/USD sell of 18 Sep reached 2.85R and closed at $0 with the stop never leaving the entry.
        With no starting stop known the answer is None and the ladder does nothing — falling back to
        the current stop would be the defect itself.

        R IS A RATIO OF PRICE DISTANCES, so it needs no pip size, no contract size and no currency
        conversion — it is identical on EUR/USD and on gold. Only the printed price needs precision.
        """
        risk = self.risk()
        if risk is None:
            return None
        move = (price - self.entry) if self.bullish else (self.entry - price)
        return move / risk

    def breakeven(self, volume_units: float | None = None) -> float | None:
        """The price at which closing NETS ZERO — his definition, not the entry price.

        *"when the market takes us out we lose nothing and gain nothing"* and *"gain just enough to
        cover cost"*. A stop AT the entry still loses the round-trip commission and any swap, so the
        stop has to sit that much beyond it.

        The cost is money and the answer is a price, so it is divided by the position's size: for a
        one-unit-quote instrument, moving one price unit on `volume` units earns `volume`. Returns
        None when the size is unknown rather than guessing, because a wrong breakeven is worse than
        no breakeven — it is a stop he would actually move.
        """
        vol = volume_units if volume_units is not None else float(self.volume)
        if not vol:
            return None
        cost = abs(self.commission) * 2.0 + abs(self.swap)     # open + close, plus financing
        offset = cost / vol
        return self.entry + offset if self.bullish else self.entry - offset


def _name_for(symbol_id: int) -> str | None:
    """Broker symbolId -> the platform's slashed form. Uses the map the candle fetch already built."""
    for name, sid in _symbols.items():
        if sid == symbol_id:
            return f"{name[:3]}/{name[3:]}" if len(name) == 6 else name
    return None


async def open_positions() -> list[Position] | None:
    """Every open position, or None when the broker could not be read.

    None and [] MEAN DIFFERENT THINGS and the caller must not confuse them: [] is "you have no trades
    open", None is "I could not find out". Alerting on the first is correct; alerting on the second
    would be inventing a fact.
    """
    global _resting_order_ids
    try:
        async with _req_lock:
            reader, writer = await _sess.get_connection()
            await _load_symbols(reader, writer)
            req = ProtoOAReconcileReq(ctidTraderAccountId=_sess._account_id)
            await _sess.send(writer, req.payloadType, req.SerializeToString())
            # recv_expect, NOT recv — opening a position makes cTrader push an execution event, and
            # a bare recv reads that as the reply, leaving the real one to desynchronise the shared
            # socket for every later reader. That is exactly what this module caused on 2026-08-21.
            resp = await asyncio.wait_for(
                _sess.recv_expect(reader, _TYPE_RECONCILE_RES), timeout=15)
        if resp.payloadType != _TYPE_RECONCILE_RES:
            log.warning(f"[ctrader_positions] broker answered {resp.payloadType} "
                        f"({_sess._describe_resp(resp)})")
            return None
        res = ProtoOAReconcileRes()
        res.ParseFromString(resp.payload)
        _resting_order_ids = _resting_ids(res)
        out: list[Position] = []
        for p in res.position:
            name = _name_for(p.tradeData.symbolId)
            if name is None:
                continue
            money = 10.0 ** (p.moneyDigits or 2)
            out.append(Position(
                position_id=p.positionId,
                symbol=name,
                bullish=(p.tradeData.tradeSide == 1),          # 1 = BUY, 2 = SELL
                volume=p.tradeData.volume,
                entry=p.price,                                  # already a display price on positions
                stop=(p.stopLoss or None),
                target=(p.takeProfit or None),
                commission=(p.commission or 0) / money,
                swap=(p.swap or 0) / money,
                opened_at=int(p.tradeData.openTimestamp / 1000),
            ))
        return out
    except Exception as exc:
        log.warning(f"[ctrader_positions] read failed: {type(exc).__name__}: {exc}")
        return None


@dataclass(frozen=True)
class ClosingDeal:
    """How a position actually ended — read from the broker, not inferred from its last stop."""
    position_id: int
    exit_price:  float
    profit:      float | None      # in the account currency, scaled by the deal's own moneyDigits
    closed_at:   int               # broker epoch milliseconds


async def closing_deal(position_id: int, lookback_hours: int = 48) -> ClosingDeal | None:
    """The deal that CLOSED this position, or None if it cannot be read.

    WHY THIS EXISTS. `open_positions` cannot answer "was my stop hit?" — a closed position is simply
    absent from it, and its exit price is nowhere in that feed. His instruction, 2026-09-02: *"we
    should get a message when a trade is placed and when SL is hit"*. Saying "stop hit" honestly
    needs the price it actually closed at, and that only exists on the deal.

    RETURNS None RATHER THAN GUESSING. The caller (`monitor/exit_watch`) falls back to describing
    the stop the position was carrying, which is still true and still tells him he is out. An exit
    reported with an invented price would be worse than a vaguer one.

    `closePositionDetail` IS NOT RELIED ON. Measured against this broker on 2026-09-02, 0 of 30 real
    deals carried it — the same finding that had stopped every cTrader trade reaching the journal.
    The closing deal is identified by its positionId and the fact that it is the LAST one for that
    position, which is data the gateway does send.
    """
    import time
    try:
        now_ms = int(time.time() * 1000)
        async with _req_lock:
            reader, writer = await _sess.get_connection()
            req = ProtoOADealListReq(
                ctidTraderAccountId=_sess._account_id,
                fromTimestamp=now_ms - lookback_hours * 3600 * 1000,
                toTimestamp=now_ms,
                maxRows=500,
            )
            await _sess.send(writer, req.payloadType, req.SerializeToString())
            # recv_expect, never a bare recv — the same shared-socket rule `open_positions` records.
            resp = await asyncio.wait_for(
                _sess.recv_expect(reader, _TYPE_DEAL_LIST_RES), timeout=15)
        if resp.payloadType != _TYPE_DEAL_LIST_RES:
            return None
        res = ProtoOADealListRes()
        res.ParseFromString(resp.payload)
        mine = [d for d in res.deal if int(getattr(d, "positionId", 0) or 0) == int(position_id)]
        if len(mine) < 2:
            return None                     # only the opening deal — it has not actually closed
        last = max(mine, key=lambda d: int(getattr(d, "executionTimestamp", 0) or 0))
        px = float(getattr(last, "executionPrice", 0) or 0)
        if px <= 0:
            return None
        money = 10.0 ** (int(getattr(last, "moneyDigits", 2) or 2))
        detail = getattr(last, "closePositionDetail", None)
        gross = getattr(detail, "grossProfit", None) if detail is not None else None
        return ClosingDeal(
            position_id=int(position_id),
            exit_price=px,
            profit=(float(gross) / money) if gross not in (None, 0) else None,
            closed_at=int(getattr(last, "executionTimestamp", 0) or 0),
        )
    except Exception as exc:
        log.warning(f"[ctrader_positions] could not read the closing deal for {position_id}: "
                    f"{type(exc).__name__}: {exc}")
        return None
