"""
Registers all 21 candle patterns at boot.
To add a new pattern: create the class, add it to CandlePattern enum, register here.
"""

from core import pattern_registry

from patterns.volume_patterns       import VolumeCandlePattern, MarubozuPattern
from patterns.wick_patterns         import LongUpperWickPattern, LongLowerWickPattern, ViolentCandlePattern
from patterns.doji_family           import DojiPattern, GravestoneDoji, DragonflyDoji, LongLeggedDoji
from patterns.reversal_patterns     import HammerPattern, ShootingStarPattern, InvertedHammerPattern, HangingManPattern
from patterns.engulfing_patterns    import BullishEngulfingPattern, BearishEngulfingPattern
from patterns.institutional_patterns import InstitutionalPattern, ImpulsePattern, RejectionPattern
from patterns.consolidation_patterns import InsideBarPattern, OutsideBarPattern, SpinningTopPattern

pattern_registry.register(VolumeCandlePattern())
pattern_registry.register(MarubozuPattern())
pattern_registry.register(LongUpperWickPattern())
pattern_registry.register(LongLowerWickPattern())
pattern_registry.register(ViolentCandlePattern())
pattern_registry.register(DojiPattern())
pattern_registry.register(GravestoneDoji())
pattern_registry.register(DragonflyDoji())
pattern_registry.register(LongLeggedDoji())
pattern_registry.register(HammerPattern())
pattern_registry.register(ShootingStarPattern())
pattern_registry.register(InvertedHammerPattern())
pattern_registry.register(HangingManPattern())
pattern_registry.register(BullishEngulfingPattern())
pattern_registry.register(BearishEngulfingPattern())
pattern_registry.register(InstitutionalPattern())
pattern_registry.register(ImpulsePattern())
pattern_registry.register(RejectionPattern())
pattern_registry.register(InsideBarPattern())
pattern_registry.register(OutsideBarPattern())
pattern_registry.register(SpinningTopPattern())
