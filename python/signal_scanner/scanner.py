"""
Main SignalScanner class that orchestrates all modules.
Provides the entry point for scanning markets and generating signals.
"""

import asyncio
import time
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from .types import StrategySignal, MultiTimeframeData
from .instruments import TRADEABLE_INSTRUMENTS, Instrument
from .market_hours import filter_tradeable_instruments, get_session_info
from .data_fetcher import data_fetcher
from .strategies.base import strategy_registry, InstrumentData
from .strategies.smc import smc_strategy
from .validators.gemini import validate_signal
from .storage.database import signal_storage
from .notifications.telegram import send_signal_notification
from .config import scanner_config
from .logging_config import get_logger

logger = get_logger("scanner")


class SignalScanner:
    """
    Main signal scanner that orchestrates market analysis.
    
    Features:
    - Parallel data fetching
    - Multi-strategy analysis
    - Gemini AI validation
    - Database persistence
    - Telegram notifications
    """
    
    def __init__(self):
        self.is_scanning = False
        self.last_scan_time: Optional[float] = None
        self.scan_count = 0
        self._initialize_strategies()
    
    def _initialize_strategies(self):
        """Register all strategies."""
        strategy_registry.register(smc_strategy)
        stats = strategy_registry.get_stats()
        logger.info(f"Initialized {stats['enabled_strategies']} strategies")
    
    async def scan_markets(self) -> Dict[str, Any]:
        """
        Main entry point for scanning all markets.
        
        Returns:
            Scan results including signals generated and statistics
        """
        if self.is_scanning:
            logger.warning("Scan already in progress, skipping...")
            return {"status": "skipped", "reason": "scan_in_progress"}
        
        try:
            self.is_scanning = True
            start_time = time.time()
            logger.info("Starting modular market scan...")
            
            stats = strategy_registry.get_stats()
            logger.info(f"Running {stats['enabled_strategies']} enabled strategies")
            
            filter_result = filter_tradeable_instruments(TRADEABLE_INSTRUMENTS)
            
            if filter_result.skipped:
                skipped_by_class: Dict[str, int] = {}
                for inst, reason in filter_result.skipped:
                    skipped_by_class[inst.asset_class] = skipped_by_class.get(inst.asset_class, 0) + 1
                skipped_summary = ", ".join(f"{count} {cls}" for cls, count in skipped_by_class.items())
                logger.info(f"Skipping closed markets: {skipped_summary}")
            
            logger.info(f"Analyzing {len(filter_result.tradeable)} instruments in open markets")
            
            new_signals: List[StrategySignal] = []
            all_pending = []
            errors = []
            
            for instrument in filter_result.tradeable:
                try:
                    result = await self._analyze_instrument(instrument)
                    new_signals.extend(result["signals"])
                    all_pending.extend(result["pending"])
                except Exception as e:
                    logger.error(f"Error analyzing {instrument.symbol}: {e}")
                    errors.append(f"{instrument.symbol}: {str(e)}")
            
            if new_signals:
                logger.info(f"Generated {len(new_signals)} new trading signals")
                
                for signal in new_signals:
                    await self._save_and_notify_signal(signal)
            else:
                logger.info("No high-confidence signals found in this scan")
            
            if all_pending:
                logger.info(f"Found {len(all_pending)} pending setups for watchlist")
                for setup in all_pending:
                    await self._save_watchlist_signal(setup)
            
            elapsed = time.time() - start_time
            self.last_scan_time = time.time()
            self.scan_count += 1
            
            return {
                "status": "completed",
                "signals_generated": len(new_signals),
                "pending_setups": len(all_pending),
                "instruments_scanned": len(filter_result.tradeable),
                "instruments_skipped": len(filter_result.skipped),
                "errors": len(errors),
                "duration_seconds": elapsed,
                "scan_number": self.scan_count
            }
            
        except Exception as e:
            logger.error(f"Error during market scan: {e}")
            return {"status": "error", "error": str(e)}
        finally:
            self.is_scanning = False
    
    async def _analyze_instrument(self, instrument: Instrument) -> Dict[str, Any]:
        """Analyze a single instrument with all strategies."""
        symbol = instrument.symbol
        asset_class = instrument.asset_class
        
        price_result = await data_fetcher.get_price(symbol, asset_class)
        current_price = price_result.price if price_result else instrument.default_price
        
        mtf_data = await data_fetcher.fetch_multi_timeframe_data(
            symbol, asset_class, current_price
        )
        
        instrument_data = InstrumentData(
            symbol=symbol,
            asset_class=asset_class,
            current_price=current_price,
            data=mtf_data
        )
        
        existing_active = await signal_storage.get_active_signals(symbol)
        
        cooldown_ms = scanner_config.signal_cooldown_hours * 3600 * 1000
        now = time.time() * 1000
        
        recent_active = [
            s for s in existing_active
            if s.get("created_at") and (now - s["created_at"].timestamp() * 1000) < cooldown_ms
        ]
        
        if recent_active:
            return {"signals": [], "pending": []}
        
        result = await strategy_registry.run_all_strategies(instrument_data)
        
        return {
            "signals": result.signals,
            "pending": result.pending_setups
        }
    
    async def _save_and_notify_signal(self, signal: StrategySignal) -> None:
        """Validate, save, and notify about a signal."""
        try:
            validation = await validate_signal(signal)
            
            if validation:
                if validation.recommendation == "skip":
                    logger.info(f"Gemini REJECTED {signal.symbol}: {validation.reasoning}")
                    return
                
                adjusted_confidence = max(0, min(100,
                    signal.confidence + validation.confidence_adjustment
                ))
                
                logger.info(
                    f"Gemini {validation.recommendation.upper()} {signal.symbol}: "
                    f"{'Validated' if validation.validated else 'Concerns'} "
                    f"(Confidence: {adjusted_confidence}%, "
                    f"Adj: {'+' if validation.confidence_adjustment > 0 else ''}{validation.confidence_adjustment})"
                )
                
                signal.confidence = adjusted_confidence
            
            signal_id = await signal_storage.create_signal(signal)
            
            await send_signal_notification(signal)
            
            logger.info(f"Signal saved and notifications sent: {signal.symbol} {signal.direction.value}")
            
        except Exception as e:
            logger.error(f"Error saving signal for {signal.symbol}: {e}")
    
    async def _save_watchlist_signal(self, setup) -> None:
        """Save a pending setup to watchlist."""
        try:
            if hasattr(setup, "entry_zone"):
                await signal_storage.create_watchlist_signal(
                    symbol=getattr(setup, "symbol", "UNKNOWN"),
                    asset_class=getattr(setup, "asset_class", "forex"),
                    direction=setup.direction.value,
                    confidence=setup.confidence,
                    entry_zone_top=setup.entry_zone.top_price,
                    entry_zone_bottom=setup.entry_zone.bottom_price,
                    zone_type=setup.entry_zone.type.value,
                    timeframe=getattr(setup, "timeframe", "15M")
                )
                logger.info(f"Added to watchlist: {getattr(setup, 'symbol', 'UNKNOWN')} ({setup.confidence}%)")
        except Exception as e:
            logger.error(f"Error saving watchlist signal: {e}")
    
    async def scan_single(self, symbol: str) -> Dict[str, Any]:
        """Scan a single instrument."""
        for inst in TRADEABLE_INSTRUMENTS:
            if inst.symbol == symbol:
                return await self._analyze_instrument(inst)
        return {"status": "error", "error": f"Symbol {symbol} not found"}
    
    def get_status(self) -> Dict[str, Any]:
        """Get scanner status."""
        return {
            "is_scanning": self.is_scanning,
            "last_scan_time": datetime.fromtimestamp(self.last_scan_time).isoformat() if self.last_scan_time else None,
            "scan_count": self.scan_count,
            "session_info": get_session_info(),
            "strategies": strategy_registry.get_stats()
        }
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        await signal_storage.close()
        data_fetcher.cleanup()
        logger.info("Scanner resources cleaned up")


async def run_scan():
    """Convenience function to run a single scan."""
    scanner = SignalScanner()
    try:
        result = await scanner.scan_markets()
        return result
    finally:
        await scanner.cleanup()


if __name__ == "__main__":
    asyncio.run(run_scan())
