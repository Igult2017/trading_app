"""
Market hours and session filtering.
Determines which instruments are tradeable based on current time and session.
"""

from dataclasses import dataclass
from datetime import datetime, time, timezone
from typing import List, Tuple, Optional, Literal
from .instruments import Instrument, AssetClass

SessionName = Literal["sydney", "tokyo", "london", "new_york", "closed"]


@dataclass
class TradingSession:
    """Represents a trading session with its hours in UTC."""
    name: SessionName
    open_utc: time
    close_utc: time
    asset_classes: List[AssetClass]
    
    def is_open(self, current_time: time) -> bool:
        """Check if session is currently open."""
        if self.open_utc < self.close_utc:
            return self.open_utc <= current_time < self.close_utc
        else:
            return current_time >= self.open_utc or current_time < self.close_utc


TRADING_SESSIONS: List[TradingSession] = [
    TradingSession(
        name="sydney",
        open_utc=time(21, 0),
        close_utc=time(6, 0),
        asset_classes=["forex", "crypto"]
    ),
    TradingSession(
        name="tokyo",
        open_utc=time(0, 0),
        close_utc=time(9, 0),
        asset_classes=["forex", "crypto"]
    ),
    TradingSession(
        name="london",
        open_utc=time(7, 0),
        close_utc=time(16, 0),
        asset_classes=["forex", "index", "commodity", "crypto"]
    ),
    TradingSession(
        name="new_york",
        open_utc=time(13, 0),
        close_utc=time(22, 0),
        asset_classes=["forex", "stock", "index", "commodity", "crypto"]
    ),
]


def get_active_sessions(current_utc: Optional[datetime] = None) -> List[TradingSession]:
    """Get all currently active trading sessions."""
    if current_utc is None:
        current_utc = datetime.now(timezone.utc)
    current_time = current_utc.time()
    
    return [s for s in TRADING_SESSIONS if s.is_open(current_time)]


def get_active_session(asset_class: AssetClass, current_utc: Optional[datetime] = None) -> Optional[SessionName]:
    """Get the primary active session for an asset class."""
    active = get_active_sessions(current_utc)
    
    for session in reversed(active):
        if asset_class in session.asset_classes:
            return session.name
    
    return None


def is_market_open(asset_class: AssetClass, current_utc: Optional[datetime] = None) -> bool:
    """Check if market is open for an asset class."""
    if asset_class == "crypto":
        return True
        
    if current_utc is None:
        current_utc = datetime.now(timezone.utc)
    
    if current_utc.weekday() >= 5:
        if asset_class != "crypto":
            return False
    
    return get_active_session(asset_class, current_utc) is not None


def is_high_volume_session(asset_class: AssetClass, current_utc: Optional[datetime] = None) -> bool:
    """Check if we're in a high volume session for the asset class."""
    if current_utc is None:
        current_utc = datetime.now(timezone.utc)
    
    current_time = current_utc.time()
    
    if asset_class in ("forex", "commodity"):
        london_ny_overlap = time(13, 0) <= current_time <= time(16, 0)
        return london_ny_overlap
    
    if asset_class in ("stock", "index"):
        ny_open = time(13, 30) <= current_time <= time(20, 0)
        return ny_open
    
    return True


@dataclass
class FilterResult:
    """Result of instrument filtering."""
    tradeable: List[Instrument]
    skipped: List[Tuple[Instrument, str]]


def filter_tradeable_instruments(
    instruments: List[Instrument],
    current_utc: Optional[datetime] = None
) -> FilterResult:
    """
    Filter instruments to only those that are tradeable now.
    
    Returns:
        FilterResult with tradeable instruments and skipped ones with reasons
    """
    if current_utc is None:
        current_utc = datetime.now(timezone.utc)
    
    tradeable: List[Instrument] = []
    skipped: List[Tuple[Instrument, str]] = []
    
    for instrument in instruments:
        if not is_market_open(instrument.asset_class, current_utc):
            reason = f"Market closed for {instrument.asset_class}"
            skipped.append((instrument, reason))
            continue
        
        tradeable.append(instrument)
    
    return FilterResult(tradeable=tradeable, skipped=skipped)


def get_session_info(current_utc: Optional[datetime] = None) -> dict:
    """Get detailed information about current trading sessions."""
    if current_utc is None:
        current_utc = datetime.now(timezone.utc)
    
    active = get_active_sessions(current_utc)
    
    return {
        "current_utc": current_utc.isoformat(),
        "weekday": current_utc.strftime("%A"),
        "active_sessions": [s.name for s in active],
        "forex_open": is_market_open("forex", current_utc),
        "stock_open": is_market_open("stock", current_utc),
        "crypto_open": is_market_open("crypto", current_utc),
        "high_volume_forex": is_high_volume_session("forex", current_utc),
        "high_volume_stock": is_high_volume_session("stock", current_utc),
    }
