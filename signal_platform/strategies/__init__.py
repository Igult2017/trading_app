from strategies.vix1 import Vix1Strategy
from strategies.bx_sd import BXStrategy
from strategies.ovp import OVPStrategy
from core import strategy_registry

strategy_registry.register(Vix1Strategy())
strategy_registry.register(BXStrategy())
# OVP — BTC/USD + XAU/USD, his skeleton (18 Nov 2026). Signals to the channel only; NOT in autotrade_strategies.
strategy_registry.register(OVPStrategy())
