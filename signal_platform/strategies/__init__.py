from strategies.eurusd_pullback import EURUSDPullbackStrategy
from strategies.vocant1 import Vocant1Strategy
from core import strategy_registry

strategy_registry.register(EURUSDPullbackStrategy())
strategy_registry.register(Vocant1Strategy())
