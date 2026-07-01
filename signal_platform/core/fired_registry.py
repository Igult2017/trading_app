"""
FiredRegistry — a shared, DB-persisted "already-fired" dedup store for ANY strategy.

A strategy that must not re-fire a setup (a signal now, or a real order in Phase 2) after a
redeploy/restart keeps its fired keys here instead of an in-memory dict. Backed by the same
`strategy_state` table (via strategy_state_repo) that the pullback strategy uses, keyed by strategy
id, so a restart does NOT wipe the memory and re-fire setups already sent. Wall-clock TTL so cleanup
stays valid across restarts. Degrades to in-memory (never crashes a scan) if the DB is unavailable.

Usage in a strategy:
    self.fired = FiredRegistry(self.id)
    ...
    self.fired.cleanup(48 * 3600)
    if self.fired.has(key):
        return StrategyResult.empty()
    ...
    self.fired.add(key)
"""
import time
import logging

from storage import strategy_state_repo

log = logging.getLogger(__name__)


class FiredRegistry:
    def __init__(self, strategy_id: str):
        self.strategy_id = strategy_id
        self._fired: dict[str, float] = {}   # key → wall-clock unix ts fired
        self._load()

    def _load(self) -> None:
        try:
            blob = strategy_state_repo.load(self.strategy_id) or {}
            self._fired = {k: float(v) for k, v in (blob.get("fired") or {}).items()}
            if self._fired:
                log.info("[fired_registry] %s: restored %d fired key(s)", self.strategy_id, len(self._fired))
        except Exception as exc:
            log.warning("[fired_registry] %s load failed (%s) — starting empty", self.strategy_id, exc)

    def _persist(self) -> None:
        try:
            strategy_state_repo.save(self.strategy_id, {"fired": self._fired})
        except Exception as exc:
            log.warning("[fired_registry] %s persist failed (%s) — keeping in-memory", self.strategy_id, exc)

    def has(self, key: str) -> bool:
        return key in self._fired

    def add(self, key: str) -> None:
        if key not in self._fired:
            self._fired[key] = time.time()
            self._persist()

    def cleanup(self, ttl_seconds: int) -> None:
        cutoff = time.time() - ttl_seconds
        stale  = [k for k, ts in self._fired.items() if ts < cutoff]
        if stale:
            for k in stale:
                self._fired.pop(k, None)
            self._persist()
