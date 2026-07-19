from strategies.vix1 import Vix1Strategy
from strategies.bx_sd import BXStrategy
from core import strategy_registry

strategy_registry.register(Vix1Strategy())
strategy_registry.register(BXStrategy())
