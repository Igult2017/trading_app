"""
Unit tests for the signal scanner.
"""

import pytest
import asyncio
from datetime import datetime, timezone, time

from signal_scanner.instruments import (
    TRADEABLE_INSTRUMENTS,
    get_instrument_by_symbol,
    get_instruments_by_class
)
from signal_scanner.market_hours import (
    filter_tradeable_instruments,
    is_market_open,
    get_active_session,
    TradingSession
)
from signal_scanner.types import (
    Candle,
    Zone,
    ZoneType,
    SignalDirection,
    TrendDirection
)
from signal_scanner.strategies.smc import (
    analyze_clarity,
    detect_swing_points,
    determine_trend,
    detect_zones,
    detect_entry
)


class TestInstruments:
    """Test instrument definitions."""
    
    def test_instrument_count(self):
        """Should have 62 tradeable instruments."""
        assert len(TRADEABLE_INSTRUMENTS) == 62
    
    def test_get_instrument_by_symbol(self):
        """Should find instrument by symbol."""
        eurusd = get_instrument_by_symbol("EUR/USD")
        assert eurusd is not None
        assert eurusd.asset_class == "forex"
    
    def test_get_instruments_by_class(self):
        """Should filter by asset class."""
        forex = get_instruments_by_class("forex")
        assert len(forex) == 28
        
        stocks = get_instruments_by_class("stock")
        assert len(stocks) == 20
    
    def test_pip_size_calculation(self):
        """Should calculate correct pip sizes."""
        eurusd = get_instrument_by_symbol("EUR/USD")
        assert eurusd.pip_size == 0.0001
        
        usdjpy = get_instrument_by_symbol("USD/JPY")
        assert usdjpy.pip_size == 0.01


class TestMarketHours:
    """Test market hours filtering."""
    
    def test_crypto_always_open(self):
        """Crypto should always be tradeable."""
        assert is_market_open("crypto") == True
    
    def test_session_detection(self):
        """Should detect active sessions."""
        london = TradingSession(
            name="london",
            open_utc=time(7, 0),
            close_utc=time(16, 0),
            asset_classes=["forex"]
        )
        
        assert london.is_open(time(10, 0)) == True
        assert london.is_open(time(18, 0)) == False


class TestCandleAnalysis:
    """Test candle pattern analysis."""
    
    def create_bullish_candle(self, idx: int) -> Candle:
        """Create a bullish candle."""
        return Candle(
            timestamp=idx * 60000,
            open=100.0 + idx * 0.1,
            high=101.0 + idx * 0.1,
            low=99.5 + idx * 0.1,
            close=100.8 + idx * 0.1,
            volume=1000
        )
    
    def create_bearish_candle(self, idx: int) -> Candle:
        """Create a bearish candle."""
        return Candle(
            timestamp=idx * 60000,
            open=100.8 + idx * 0.1,
            high=101.0 + idx * 0.1,
            low=99.5 + idx * 0.1,
            close=100.0 + idx * 0.1,
            volume=1000
        )
    
    def test_candle_properties(self):
        """Test candle property calculations."""
        candle = self.create_bullish_candle(0)
        
        assert candle.is_bullish == True
        assert candle.is_bearish == False
        assert candle.body_size == pytest.approx(0.8, rel=0.01)
        assert candle.total_range == pytest.approx(1.5, rel=0.01)
    
    def test_clarity_analysis_clear_market(self):
        """Test clarity analysis on clear trending market."""
        candles = [self.create_bullish_candle(i) for i in range(25)]
        
        result = analyze_clarity(candles)
        
        assert result.score >= 0
        assert result.trend_consistency >= 0
        assert result.zone_clarity >= 0
        assert result.structure_clarity >= 0
    
    def test_clarity_analysis_insufficient_data(self):
        """Test clarity analysis with insufficient data."""
        candles = [self.create_bullish_candle(i) for i in range(5)]
        
        result = analyze_clarity(candles)
        
        assert result.is_clear == False
        assert result.score == 0


class TestZoneDetection:
    """Test supply/demand zone detection."""
    
    def test_zone_properties(self):
        """Test zone property calculations."""
        zone = Zone(
            top_price=1.1050,
            bottom_price=1.1000,
            type=ZoneType.DEMAND,
            strength="strong"
        )
        
        assert zone.mid_price == pytest.approx(1.1025, rel=0.01)
        assert zone.zone_size == pytest.approx(0.005, rel=0.01)
        assert zone.price_in_zone(1.1020) == True
        assert zone.price_in_zone(1.1100) == False
    
    def test_detect_zones_insufficient_data(self):
        """Test zone detection with insufficient data."""
        candles = []
        result = detect_zones(candles, "neutral", 1.1000)
        
        assert len(result.tradable_zones) == 0


class TestEntryDetection:
    """Test entry signal detection."""
    
    def create_zone(self) -> Zone:
        """Create a test zone."""
        return Zone(
            top_price=1.1050,
            bottom_price=1.1000,
            type=ZoneType.DEMAND,
            strength="strong"
        )
    
    def test_entry_insufficient_candles(self):
        """Test entry detection with insufficient candles."""
        candles = []
        zone = self.create_zone()
        
        result = detect_entry(
            candles,
            zone,
            SignalDirection.BUY,
            None,
            []
        )
        
        assert result.has_valid_entry == False
    
    def test_entry_price_not_at_zone(self):
        """Test entry detection when price is not at zone."""
        candles = [
            Candle(i * 60000, 1.2000, 1.2010, 1.1990, 1.2005, 1000)
            for i in range(10)
        ]
        zone = self.create_zone()
        
        result = detect_entry(
            candles,
            zone,
            SignalDirection.BUY,
            None,
            []
        )
        
        assert result.has_valid_entry == False


class TestTrendDetection:
    """Test trend direction detection."""
    
    def test_determine_trend_insufficient_swings(self):
        """Test trend detection with few swing points."""
        from signal_scanner.types import SwingPoint
        
        swings = [
            SwingPoint(price=1.1000, index=0, is_high=True),
            SwingPoint(price=1.0900, index=1, is_high=False),
        ]
        
        trend = determine_trend([], swings)
        
        assert trend == TrendDirection.SIDEWAYS


def run_tests():
    """Run all tests."""
    pytest.main([__file__, "-v"])


if __name__ == "__main__":
    run_tests()
