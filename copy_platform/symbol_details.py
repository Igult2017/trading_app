"""
The broker's OWN facts about a symbol: lot size, volume step, min/max volume, price digits.

WHY THIS EXISTS. Nothing in this repository has ever asked cTrader how big a lot is. Both trading
paths guess it — `lot_calc`/`executors.ctrader` with one constant, `shared/pip` with a lookup table
— and a guess about volume is not a rounding error, it is the difference between 0.01 lots and 1000.

The trap is that the symbol list everything already fetches does NOT carry this. `ProtoOASymbolsListRes`
returns `ProtoOALightSymbol`, whose entire contents are:

    symbolId, symbolName, enabled, baseAssetId, quoteAssetId, symbolCategoryId, description

No lotSize. No minVolume. No stepVolume. No digits. Those live on `ProtoOASymbol`, which is reachable
only through `ProtoOASymbolByIdReq` — a request no code in this repo sends. So the data has always
been one round trip away and nobody made the trip.

WHAT THE NUMBERS MEAN, because they are easy to transpose:
    lotSize     units of the base currency in ONE lot. Usually 100,000 for forex — but this is
                per-symbol and per-broker, which is exactly why it must be read and not assumed.
    volume      the wire field on an order, in HUNDREDTHS OF A UNIT. So for a symbol whose lotSize
                is 100,000:  1 lot -> 100,000 * 100 = 10,000,000.
    stepVolume  the granularity the broker will accept, in those same hundredths.
    min/maxVolume  the bounds, same units. An order under minVolume is rejected.
    digits      price decimals. pipPosition gives the pip. Authoritative, unlike our table.

This module only READS and CACHES. It deliberately performs no arithmetic on orders — `lot_calc`
owns that — so a caching bug can never silently resize a trade.
"""
import logging

log = logging.getLogger("symbol_details")

# (ctraderId, symbolId) -> ProtoOASymbol. Per process: these change when a broker changes contract
# specs, which is rare and always accompanied by a restart-worthy announcement.
_cache: dict[tuple[int, int], object] = {}


def get(ctrader_id: int, symbol_id: int):
    """Cached ProtoOASymbol, or None if it has not been fetched yet."""
    return _cache.get((int(ctrader_id), int(symbol_id)))


def put(ctrader_id: int, symbol) -> None:
    """Cache a ProtoOASymbol from a ProtoOASymbolByIdRes."""
    _cache[(int(ctrader_id), int(symbol.symbolId))] = symbol


def build_request(ctrader_id: int, symbol_id: int):
    """The ProtoOASymbolByIdReq nobody was sending."""
    from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOASymbolByIdReq
    req = ProtoOASymbolByIdReq()
    req.ctidTraderAccountId = int(ctrader_id)
    req.symbolId.append(int(symbol_id))
    return req


def absorb(ctrader_id: int, response) -> object | None:
    """Cache every symbol on a ProtoOASymbolByIdRes; return the first."""
    first = None
    for sym in getattr(response, "symbol", []):
        put(ctrader_id, sym)
        if first is None:
            first = sym
    return first


def describe(symbol) -> dict:
    """The fields that matter, with safe defaults when the broker omits one.

    Defaults are the FOREX NORM and are only ever a fallback for a missing field — they are not a
    licence to skip the fetch. `known` says whether this came from the broker at all, so callers can
    log the difference between measured and assumed instead of blurring them.
    """
    if symbol is None:
        return dict(known=False, lot_size=100_000, step=1, min_volume=0, max_volume=0, digits=5)
    return dict(
        known      = True,
        lot_size   = int(getattr(symbol, "lotSize", 0) or 100_000),
        step       = int(getattr(symbol, "stepVolume", 0) or 1),
        min_volume = int(getattr(symbol, "minVolume", 0) or 0),
        max_volume = int(getattr(symbol, "maxVolume", 0) or 0),
        digits     = int(getattr(symbol, "digits", 0) or 5),
    )
