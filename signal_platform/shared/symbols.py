"""
Turning THIS platform's symbol names into the broker's, in one place.

TWO NAMES FOR THE SAME INSTRUMENT, and they must not be confused:

    "GBP/USD"   the platform's own form — `config/instruments.py`, every signal, every DB row
    "GBPUSD"    what cTrader calls it — the keys of the broker's symbol list

`data/data_source.py` has bridged that gap since the beginning and has done so correctly across
45,000+ scans. This file exists because the ORDER path did not: `execution/orders.py` borrowed
copy_platform's `resolve_symbol_id`, whose affix and alias handling covers `EURUSD.r` and `GOLD` but
has no rule for a slash. Measured against the real function and the broker's real map, every symbol
this platform actually trades came back None:

    resolve_symbol_id("GBP/USD", {"GBPUSD": 2, ...})  ->  None
    resolve_symbol_id("XAU/USD", {"XAUUSD": 41, ...}) ->  None

`build_stop` turns that None into "symbol not on this account", so with autotrade switched on EVERY
order would have been refused — a refusal that reads like a broker problem and is not one.

One definition, two callers (`data_source` and `execution/orders`), so the rule cannot drift into a
third copy — which is how it came to be wrong in the first place.

DELIBERATELY NOT HANDLED: broker suffixes and prefixes (`EURUSD.r`, `.mEURUSD`) and nickname aliases
(`GOLD` for `XAUUSD`). Pepperstone serves plain names — verified against the live symbol list, where
GBPUSD, EURUSD, USDJPY, GBPJPY and XAUUSD are all present unadorned. Writing tolerance for a broker
he does not use would be untested code on the order path, and resolution failing loudly is the safer
answer: an order that is refused is visible, an order placed on the wrong instrument is not.
"""


def broker_symbol(symbol: str) -> str:
    """This platform's name for an instrument -> the broker's.

    'GBP/USD' -> 'GBPUSD'. Idempotent, so passing an already-broker name is safe.
    """
    return (symbol or "").replace("/", "")


def resolve_symbol_id(symbol: str, symbol_map: dict[str, int]) -> int | None:
    """The broker's numeric id for a symbol, or None when it genuinely is not on the account.

    Exact match is tried FIRST and wins, so a broker that already uses the platform's own spelling
    is never second-guessed. Only on a miss is the slash removed.

    None means "not tradeable here" and callers must treat it as a refusal, never as a reason to
    guess at a neighbouring instrument.
    """
    if not symbol or not symbol_map:
        return None
    sid = symbol_map.get(symbol)
    if sid is not None:
        return sid
    return symbol_map.get(broker_symbol(symbol))
