"""
Feature registration — side-effect import.
All platform features are registered here at boot.
"""
from core.feature_registry import register as _reg
from features.trend_feature import TrendFeature
from features.swing_feature import SwingFeature
from features.liquidity_feature import LiquidityFeature
from features.pullback_feature import PullbackFeature
from features.zone_feature import ZoneFeature
from features.market_structure_feature import MarketStructureFeature

_reg(TrendFeature())
_reg(SwingFeature())
_reg(LiquidityFeature())
_reg(PullbackFeature())
_reg(ZoneFeature())
_reg(MarketStructureFeature())
