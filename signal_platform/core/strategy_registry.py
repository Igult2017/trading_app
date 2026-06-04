import logging
from core.base_strategy import BaseStrategy

log = logging.getLogger(__name__)
_strategies: dict[str, BaseStrategy] = {}


def register(strategy: BaseStrategy) -> None:
    """Validate all declarations and add strategy. Raises at boot — never silently."""
    type(strategy).validate_declarations()
    if not strategy.enabled:
        log.info(f"[strategy_registry] '{strategy.id}' registered but disabled — skipping")
        return
    _strategies[strategy.id] = strategy
    log.info(f"[strategy_registry] registered '{strategy.name}' (id={strategy.id})")


def get_enabled() -> list[BaseStrategy]:
    return list(_strategies.values())


def count() -> int:
    return len(_strategies)
