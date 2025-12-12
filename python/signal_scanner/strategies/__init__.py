"""
Trading strategies module.
Contains strategy implementations and base classes.
"""

from .base import BaseStrategy
from .smc import SMCStrategy

__all__ = ["BaseStrategy", "SMCStrategy"]
