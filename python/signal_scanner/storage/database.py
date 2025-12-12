"""
PostgreSQL database storage for trading signals.
"""

import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import asdict
import json

from ..types import StrategySignal, SignalStatus
from ..config import database_config
from ..logging_config import get_logger

logger = get_logger("database")


class SignalStorage:
    """
    PostgreSQL storage for trading signals.
    
    Uses asyncpg for async database operations.
    """
    
    def __init__(self):
        self._pool = None
        self.database_url = database_config.database_url
    
    async def _get_pool(self):
        """Get or create connection pool."""
        if self._pool is None and self.database_url:
            try:
                import asyncpg
                self._pool = await asyncpg.create_pool(
                    self.database_url,
                    min_size=1,
                    max_size=database_config.pool_size
                )
                logger.info("Database connection pool created")
            except Exception as e:
                logger.error(f"Failed to create database pool: {e}")
        return self._pool
    
    async def create_signal(self, signal: StrategySignal) -> Optional[int]:
        """
        Save a new trading signal to the database.
        
        Args:
            signal: The signal to save
            
        Returns:
            The created signal ID or None if failed
        """
        pool = await self._get_pool()
        if not pool:
            logger.warning("No database connection, signal not saved")
            return None
        
        try:
            async with pool.acquire() as conn:
                query = """
                    INSERT INTO trading_signals (
                        symbol, asset_class, type, strategy,
                        primary_timeframe, confirmation_timeframe,
                        entry_price, stop_loss, take_profit,
                        risk_reward_ratio, overall_confidence,
                        trend_direction, trend_score, smc_score,
                        smc_factors, order_block_type, order_block_level,
                        fvg_detected, fvg_level, liquidity_sweep,
                        boc_choch_detected, technical_reasons, market_context,
                        strength, status, expires_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18, $19,
                        $20, $21, $22, $23, $24, $25, $26
                    ) RETURNING id
                """
                
                context = signal.market_context
                setup = signal.entry_setup
                
                result = await conn.fetchval(
                    query,
                    signal.symbol,
                    signal.asset_class,
                    signal.direction.value,
                    signal.strategy_name,
                    signal.timeframe,
                    "1M",
                    str(signal.entry_price),
                    str(signal.stop_loss),
                    str(signal.take_profit),
                    str(signal.risk_reward_ratio),
                    signal.confidence,
                    context.h4_trend_direction.value,
                    str(signal.confidence),
                    str(signal.confidence),
                    setup.confirmations,
                    setup.entry_zone.type.value,
                    str(setup.entry_zone.top_price),
                    False,
                    None,
                    signal.entry_type.value == "liquidity_sweep",
                    signal.entry_type.value if signal.entry_type.value == "choch" else None,
                    signal.reasoning[:10],
                    f"{signal.strategy_name} - {signal.entry_type.value} entry at {signal.timeframe} zone",
                    "strong" if signal.confidence >= 80 else "moderate" if signal.confidence >= 60 else "weak",
                    "active",
                    datetime.fromtimestamp(signal.expires_at / 1000)
                )
                
                logger.info(f"Signal saved with ID: {result}", extra={"symbol": signal.symbol})
                return result
                
        except Exception as e:
            logger.error(f"Failed to save signal: {e}")
            return None
    
    async def get_signals(
        self,
        symbol: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get trading signals from database.
        
        Args:
            symbol: Optional filter by symbol
            status: Optional filter by status
            limit: Maximum signals to return
            
        Returns:
            List of signal dictionaries
        """
        pool = await self._get_pool()
        if not pool:
            return []
        
        try:
            async with pool.acquire() as conn:
                conditions = []
                params = []
                param_idx = 1
                
                if symbol:
                    conditions.append(f"symbol = ${param_idx}")
                    params.append(symbol)
                    param_idx += 1
                
                if status:
                    conditions.append(f"status = ${param_idx}")
                    params.append(status)
                    param_idx += 1
                
                where_clause = " AND ".join(conditions) if conditions else "1=1"
                
                query = f"""
                    SELECT * FROM trading_signals
                    WHERE {where_clause}
                    ORDER BY created_at DESC
                    LIMIT ${param_idx}
                """
                params.append(limit)
                
                rows = await conn.fetch(query, *params)
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Failed to get signals: {e}")
            return []
    
    async def get_active_signals(self, symbol: str) -> List[Dict[str, Any]]:
        """Get active signals for a symbol."""
        return await self.get_signals(symbol=symbol, status="active")
    
    async def update_signal_status(
        self,
        signal_id: int,
        status: str,
        exit_price: Optional[float] = None
    ) -> bool:
        """
        Update signal status.
        
        Args:
            signal_id: Signal ID to update
            status: New status
            exit_price: Optional exit price if closed
            
        Returns:
            True if updated successfully
        """
        pool = await self._get_pool()
        if not pool:
            return False
        
        try:
            async with pool.acquire() as conn:
                if exit_price:
                    query = """
                        UPDATE trading_signals 
                        SET status = $1, exit_price = $2, updated_at = NOW()
                        WHERE id = $3
                    """
                    await conn.execute(query, status, str(exit_price), signal_id)
                else:
                    query = """
                        UPDATE trading_signals 
                        SET status = $1, updated_at = NOW()
                        WHERE id = $2
                    """
                    await conn.execute(query, status, signal_id)
                
                logger.info(f"Signal {signal_id} updated to {status}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to update signal: {e}")
            return False
    
    async def create_watchlist_signal(
        self,
        symbol: str,
        asset_class: str,
        direction: str,
        confidence: int,
        entry_zone_top: float,
        entry_zone_bottom: float,
        zone_type: str,
        timeframe: str
    ) -> Optional[int]:
        """Create a watchlist signal for monitoring."""
        pool = await self._get_pool()
        if not pool:
            return None
        
        try:
            async with pool.acquire() as conn:
                query = """
                    INSERT INTO trading_signals (
                        symbol, asset_class, type, strategy,
                        primary_timeframe, confirmation_timeframe,
                        entry_price, stop_loss, take_profit,
                        risk_reward_ratio, overall_confidence,
                        trend_direction, order_block_type,
                        order_block_level, status, expires_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9,
                        $10, $11, $12, $13, $14, $15, NOW() + INTERVAL '4 hours'
                    ) RETURNING id
                """
                
                mid_price = (entry_zone_top + entry_zone_bottom) / 2
                
                result = await conn.fetchval(
                    query,
                    symbol,
                    asset_class,
                    direction,
                    "Smart Money Concepts",
                    timeframe,
                    "1M",
                    str(mid_price),
                    str(entry_zone_bottom if direction == "buy" else entry_zone_top),
                    str(entry_zone_top if direction == "buy" else entry_zone_bottom),
                    "2",
                    confidence,
                    "sideways",
                    zone_type,
                    str(entry_zone_top),
                    "watchlist"
                )
                
                logger.info(f"Watchlist signal saved: {symbol}")
                return result
                
        except Exception as e:
            logger.error(f"Failed to save watchlist signal: {e}")
            return None
    
    async def close(self):
        """Close the database connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Database connection pool closed")


signal_storage = SignalStorage()
