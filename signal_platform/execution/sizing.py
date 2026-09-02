"""
Position sizing — risk % of equity, in the units cTrader's Open API actually wants.

THE ENCODING IS THE WHOLE POINT OF THIS FILE. `ProtoOANewOrderReq.volume` is an integer in
HUNDREDTHS OF A UNIT of the base currency — "cents" in the cTrader docs and in the
`ctrader-mcp-servers` skill. For forex, where one standard lot is 100,000 units:

    1.00 lot  ->  10,000,000
    0.01 lot  ->      100,000

That is verified against the skill's own `scripts/units_encoding.py`, which is the authority on the
wire format. Getting it wrong is silent: the broker accepts a number and fills a position of a size
nobody intended. `copy_platform/executors/ctrader.py` currently sends `int(lots * 100)` — 100,000x
under — which is flagged and deliberately untouched, but is exactly why this file states the rule
once and derives everything from it.

Risk maths is plain and unit-free: risk_amount = equity * pct, and lots = risk_amount / (stop_pips *
pip_value_per_lot). The stop distance comes from the signal's OWN prices via shared/pip, never a
rounded pip count — the skill's helper scripts round distance to an int (14.7 -> 15), which would
size a trade 2% hot. We work in the raw distance and only quantise at the very end, to the broker's
lot step.
"""
import logging

from shared.pip import pip_size

log = logging.getLogger(__name__)

LOT_UNITS      = 100_000     # units of base currency in one standard forex lot
CENTS_PER_UNIT = 100         # the Open API's volume unit: hundredths of a unit
MIN_LOTS       = 0.01        # cTrader's smallest tradeable size
LOT_STEP       = 0.01


# CONTRACT SIZE IS PER SYMBOL, AND ASSUMING FOREX'S COST A REAL ORDER.
#
# A currency lot is 100,000 units. **A GOLD LOT IS 100 OUNCES.** This file used LOT_UNITS for
# everything, so a 0.13-lot XAU/USD order went out as 13,000 units instead of 13 — 1,000x too large —
# and cTrader refused it on 01 Sep 2026: *"Order volume = 13000.00 is bigger than maximum allowed
# volume = 5000.00"*.
#
# The broker states the real figure per symbol (`ProtoOASymbol.lotSize`, already in the API's own
# hundredths), and `execution/connection.load_symbol_spec` now fetches it. This table is only the
# FALLBACK for when that fetch fails, so an order is still sized sanely rather than refused or —
# far worse — sent at the wrong scale.
_FALLBACK_LOT_UNITS = {"XAU": 100, "XAG": 5_000, "XPT": 100, "XPD": 100}


def lot_units_for(symbol: str) -> int:
    """Units of the base asset in one lot, for the fallback path. XAG is 5,000 oz, not 100."""
    s = "".join(ch for ch in (symbol or "").upper() if ch.isalpha())
    for pre, units in _FALLBACK_LOT_UNITS.items():
        if s.startswith(pre):
            return units
    return LOT_UNITS


def lots_to_volume(lots: float, symbol: str = "", lot_size: int | None = None) -> int:
    """Lots -> the integer `volume` field. The single place this conversion is written.

    `lot_size` is the broker's own `ProtoOASymbol.lotSize`, ALREADY in the API's hundredths — so when
    it is known the conversion is simply `lots * lot_size` and nothing is assumed. Without it, the
    per-instrument fallback above is used. `symbol` empty with no `lot_size` reproduces the old
    forex-only behaviour exactly, which is what the existing tests assert.
    """
    if lot_size and lot_size > 0:
        return int(round(lots * lot_size))
    return int(round(lots * lot_units_for(symbol) * CENTS_PER_UNIT))


def clamp_to_broker(volume: int, spec: dict | None) -> tuple[int, str | None]:
    """Fit `volume` to the broker's own min/max/step. Returns (volume, refusal_reason).

    THE BROKER'S LIMITS ARE NOT GUESSES AND MUST NOT BE GUESSED AT. Sending a volume outside them is
    a refused order — which is a signal he never gets — so the size is quantised to `stepVolume` and
    checked against `minVolume`/`maxVolume` BEFORE the request leaves, and the reason is ours rather
    than a broker error string arriving two seconds later.

    Over the maximum is REFUSED, not silently capped: a cap would place a position of a size his risk
    settings never asked for.

    Quantising to the step is the one adjustment that IS made, because a size off the step cannot be
    sent at all — but it always reduces the position, so it is LOGGED rather than done quietly. On a
    coarse step that reduction is not small: with a 0.1-lot step, 0.13 lots becomes 0.10, and a
    quarter of the intended risk disappears with nothing said.
    """
    if not spec:
        return volume, None
    step = spec.get("stepVolume") or 0
    lo = spec.get("minVolume") or 0
    hi = spec.get("maxVolume") or 0
    v = volume
    if step > 0:
        v = (v // step) * step
        if v != volume:
            log.warning(f"[execution] volume {volume} is not a multiple of the broker's step {step} "
                        f"— reduced to {v} ({(volume - v) / volume:.0%} less than the size the risk "
                        f"settings asked for)")
    if lo and v < lo:
        return v, (f"size {volume} is below the broker's minimum {lo} for this symbol — "
                   f"the risk settings produce too small a position to place")
    if hi and v > hi:
        return v, (f"size {v} exceeds the broker's maximum {hi} for this symbol — refusing rather "
                   f"than capping, because a capped size is not the risk that was asked for")
    return v, None


def stop_distance_pips(entry: float, stop: float, symbol: str) -> float:
    """Entry-to-stop in pips, RAW — never rounded. Rounding here is a silent risk error."""
    return abs(entry - stop) / pip_size(symbol)


def size_lots(equity: float, risk_pct: float, stop_pips: float,
              pip_value_per_lot: float = 10.0,
              conversion_rate: float = 1.0,
              max_lots: float = 5.0) -> float:
    """Lots such that a stop-out costs `risk_pct` of `equity`.

    `pip_value_per_lot` is in the QUOTE currency (10.0 for a USD-quoted major); `conversion_rate`
    converts that to the account currency, per the skill's chain rule. Both default to the
    USD-account / USD-quoted case, which is what this platform trades today — a wrong assumption
    here shows up as a wrong SIZE, never a wrong entry, so it cannot corrupt the diagnostic.

    Returns 0.0 when it cannot size honestly (no equity, no stop, bad input). The caller must treat
    0.0 as SKIP and never fall back to a guess — an unsized trade is worse than no trade.
    """
    if equity <= 0 or risk_pct <= 0 or stop_pips <= 0:
        return 0.0
    pip_value = pip_value_per_lot * conversion_rate
    if pip_value <= 0:
        return 0.0
    lots = (equity * risk_pct / 100.0) / (stop_pips * pip_value)
    if lots != lots or lots in (float("inf"), float("-inf")) or lots <= 0:
        return 0.0
    lots = round(lots / LOT_STEP) * LOT_STEP           # quantise to the broker's step, once, at the end
    return round(max(MIN_LOTS, min(max_lots, lots)), 2)


def plan_size(equity: float, entry: float, stop: float, symbol: str,
              risk_pct: float, fixed_lots: float = 0.0,
              max_lots: float = 5.0) -> tuple[float, int, float]:
    """(lots, volume, stop_pips) for one signal.

    `fixed_lots` > 0 pins the size and skips the risk maths entirely. That is the DIAGNOSTIC mode:
    when the question is "where did it really fill?", size is noise and a constant minimum keeps
    exposure out of the answer.
    """
    pips = stop_distance_pips(entry, stop, symbol)
    if fixed_lots and fixed_lots > 0:
        lots = round(max(MIN_LOTS, min(max_lots, fixed_lots)), 2)
    else:
        lots = size_lots(equity, risk_pct, pips, max_lots=max_lots)
    # THE SYMBOL IS PASSED, so a gold lot is 100 ounces and not 100,000 units. Without it this
    # returned a volume 1,000x too large for metals and the broker refused the order.
    return lots, lots_to_volume(lots, symbol), pips
