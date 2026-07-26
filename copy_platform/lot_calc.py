"""
Lot sizing for copy followers.
  mult  → follower_lots = master_lots × multiplier
  fixed → follower_lots = fixed_lot (ignores master size)
  risk  → follower_lots = (equity × risk%) / (sl_pips × pip_value)
"""
import math
from decimal import Decimal

# Safety backstop: a corrupt multiplier / fixed-lot must never place a giant order.
# A BACKSTOP, NOT THE SIZE CONTROL. This clamp was the only ceiling on a copied trade's size for
# the platform's whole life, and it ended up load-bearing by accident: the provider read every
# master position as 100,000 lots, so calc_lots clamped EVERY mult-mode trade to exactly this
# number. 100 lots is ruinous on a retail account — it was never a safety limit, it just stopped
# the absurd value being more absurd. The real control is risk_guard.check_trade_risk (3% of the
# follower's balance per trade). Leave this here as a last resort; do not treat it as protection.
MAX_LOTS = 100.0


def calc_lots(
    follower,
    master_lots: float,
    sl_pips: float | None = None,
    follower_equity: float | None = None,
    pip_value: float = 10.0,   # USD per pip per standard lot (default for majors)
) -> float:
    mode = (follower.lot_mode or "mult").lower()

    if mode == "fixed" and follower.fixed_lot:
        lots = float(follower.fixed_lot)

    elif mode == "risk":
        # Size so a stop-out costs exactly risk_percent of equity. If we can't size it — the
        # trade has no stop-loss, or the account balance isn't synced yet — we must NOT fall
        # back to the master's raw lot (that could blow past the user's % cap). Size 0 so the
        # caller SKIPS the trade instead, honouring the risk limit.
        if follower.risk_percent and sl_pips and follower_equity:
            risk_amount = follower_equity * float(follower.risk_percent) / 100
            lots = risk_amount / (sl_pips * pip_value)
        else:
            lots = 0.0

    else:  # mult (default)
        if master_lots and master_lots > 0:
            lots = master_lots * float(follower.lot_multiplier or 1.0)
        elif follower.fixed_lot:
            lots = float(follower.fixed_lot)            # explicit fallback size
        else:
            # No master volume (e.g. a Telegram signal) and no fixed_lot → 0 so the
            # caller SKIPS rather than guessing a live size. Signal followers should
            # use fixed or risk mode.
            lots = 0.0

    # Guard NaN/inf and treat <=0 as "skip" (no valid size). Otherwise floor at the
    # cTrader minimum (0.01), cap at a sane maximum, and round to 2 dp.
    if not math.isfinite(lots) or lots <= 0:
        return 0.0
    return max(0.01, min(MAX_LOTS, round(lots, 2)))


def pip_size(symbol: str) -> float:
    """Approximate pip size for risk-based sizing (best-effort, not broker-exact)."""
    s = (symbol or "").upper()
    if s.endswith("JPY"):
        return 0.01
    if s.startswith("XAU") or s in ("US30", "US500", "NAS100", "GER40", "UK100", "JP225", "AUS200"):
        return 0.1
    return 0.0001


def pip_value(symbol: str) -> float:
    """USD value per pip per standard lot, for risk-mode sizing (best-effort).

    Exact for USD-quoted pairs (EURUSD, GBPUSD, …) = $10/pip/lot. For JPY-quoted and
    cross pairs the true value depends on the quote-currency→USD rate, which the engine
    doesn't have here, so those return a rough approximation — risk-mode sizing on
    non-USD pairs is therefore approximate; use fixed/mult mode for exact sizing there."""
    s = (symbol or "").upper()
    if s.endswith("USD"):
        return 10.0          # USD-quoted: exact
    if s.endswith("JPY"):
        return 7.0           # ~1000 JPY/lot ≈ $6.5–7 — approximate
    return 10.0              # crosses / metals / indices — approximate fallback


def apply_direction(action: str, direction: str) -> str:
    """Apply follower direction setting to the master's trade action.

    reverse / hedge → open the OPPOSITE side. (On a netting cTrader account a
    hedge can net against an existing position rather than sit alongside it —
    that is account-mode dependent; v1 opens the opposite side either way.)
    """
    if direction in ("reverse", "hedge"):
        return "SELL" if action == "BUY" else "BUY"
    return action  # same


def is_symbol_allowed(symbol: str, follower) -> bool:
    wl = follower.symbol_whitelist or []
    bl = follower.symbol_blacklist or []
    if wl and symbol not in wl:
        return False
    if symbol in bl:
        return False
    return True


def volume_for(spec: dict, lots: float) -> tuple[int, str | None]:
    """Lots -> the Open API's `volume` field. Returns (volume, refusal_reason).

    BOTH `volume` and `lotSize` are in CENTS (cTrader: "Volume in cents (e.g. 1000 in protocol
    means 10.00 units)" / "Lot size of the Symbol (in cents)"), so the conversion is one
    multiplication and NOT the x100 that looks right:

        volume = lots x lotSize          correct
        volume = lots x lotSize x 100    100x too big — see symbol_details for why it tempts

    THE ANSWER IS VALIDATED, NOT TRUSTED. Whatever the arithmetic produces is checked against the
    broker's own minVolume/maxVolume and stepVolume, and a value outside them is REFUSED rather
    than sent. That is the whole safety property here: if the units are ever transposed again — in
    either direction, by anyone — the result lands outside the broker's published bounds and stops,
    instead of placing an order 100x or 100,000x off. `int(lots * 100)`, the expression this
    replaces, fails exactly this check.

    A missing spec is a refusal too. Guessing the contract size is the original defect; a caller
    that cannot fetch it must not trade rather than fall back to a constant.
    """
    if not spec or not spec.get("known"):
        return 0, "no contract spec from the broker — refusing to guess the lot size"
    if lots is None or lots <= 0:
        return 0, f"no valid lot size ({lots})"

    lot_size = int(spec["lot_size"])
    step     = max(1, int(spec.get("step") or 1))
    lo       = int(spec.get("min_volume") or 0)
    hi       = int(spec.get("max_volume") or 0)

    volume = int(round(lots * lot_size))
    volume = (volume // step) * step                 # DOWN to the step: never round a trade UP
    if lo and volume < lo:
        return 0, (f"{lots} lots = {volume} is below the broker's minVolume {lo} — "
                   f"the account cannot trade a position this small")
    if hi and volume > hi:
        return 0, (f"{lots} lots = {volume} is above the broker's maxVolume {hi}")
    if volume <= 0:
        return 0, f"{lots} lots quantised to {volume} at step {step}"
    return volume, None


def lots_from_volume(spec: dict, volume: int) -> float:
    """The EXACT INVERSE of volume_for: the broker's wire `volume` back into lots.

    These two live side by side deliberately. They were separated before — the write side in
    executors/ctrader, the read side in providers/ctrader — and they drifted into being wrong in
    OPPOSITE directions, each by 100,000x:

        write   volume = int(lots * 100)      100,000x too SMALL
        read    lots   = volume / 100         100,000x too LARGE

    The errors partly cancelled, which is precisely why neither was ever noticed. Fixing one alone
    is more dangerous than fixing neither, because it removes the cancellation: a 1-lot master read
    as 100,000 lots, clamped to MAX_LOTS=100, then written CORRECTLY is a real 100-lot order.

    Both directions now share one definition of the units — `volume` and `lotSize` are both in
    cents, so the conversion is a single division — and a round-trip test asserts they invert.

    Returns 0.0 when there is no contract spec. calc_lots already treats 0.0 as "no valid size,
    SKIP", so an unreadable master position produces no trade rather than a guessed one.
    """
    if not spec or not spec.get("known"):
        return 0.0
    lot_size = int(spec.get("lot_size") or 0)
    if lot_size <= 0 or not volume:
        return 0.0
    return round(float(volume) / lot_size, 4)
