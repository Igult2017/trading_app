"""
Lot sizing for copy followers.
  mult  → follower_lots = master_lots × multiplier
  fixed → follower_lots = fixed_lot (ignores master size)
  risk  → follower_lots = (equity × risk%) / (sl_pips × pip_value)
"""
import math
from decimal import Decimal

# Safety backstop: a corrupt multiplier / fixed-lot must never place a giant order.
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
