from strategies.vocant1 import Vocant1Strategy
from strategies.bx_sd import BXStrategy
from core import strategy_registry

strategy_registry.register(Vocant1Strategy())
strategy_registry.register(BXStrategy())
