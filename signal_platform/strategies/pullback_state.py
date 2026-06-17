"""
PullbackState — persistent dedup memory for the pullback strategy.

Holds the three trackers the strategy used to keep in plain dicts/sets, but backs
them with the database (strategy_state table) so a redeploy/restart does NOT wipe
them and re-fire setups/entries already alerted. Timestamps are WALL-CLOCK unix
seconds (not time.monotonic) so the TTL cleanup stays valid across restarts.
"""

import time
import logging

from storage import strategy_state_repo

log = logging.getLogger(__name__)


class PullbackState:
    def __init__(self, strategy_id: str):
        self.strategy_id = strategy_id
        self.setup_alerted: dict[str, float] = {}   # cluster_sig → wall-clock unix ts
        self.entry_alerted: set[str]          = set()
        self.qualified:     dict[str, bool]   = {}   # cluster_sig → passed all rules
        self._load()

    # ── persistence ──────────────────────────────────────────────────────────
    def _load(self) -> None:
        try:
            blob = strategy_state_repo.load(self.strategy_id) or {}
            self.setup_alerted = {k: float(v) for k, v in (blob.get("setup_alerted") or {}).items()}
            self.entry_alerted = set(blob.get("entry_alerted") or [])
            self.qualified     = {k: bool(v) for k, v in (blob.get("qualified") or {}).items()}
            if self.setup_alerted or self.entry_alerted:
                log.info("[pullback_state] %s: restored %d setup / %d entry key(s)",
                         self.strategy_id, len(self.setup_alerted), len(self.entry_alerted))
        except Exception as exc:
            log.warning("[pullback_state] load failed (%s) — starting with empty state", exc)

    def persist(self) -> None:
        try:
            strategy_state_repo.save(self.strategy_id, {
                "setup_alerted": self.setup_alerted,
                "entry_alerted": sorted(self.entry_alerted),
                "qualified":     self.qualified,
            })
        except Exception as exc:
            log.warning("[pullback_state] persist failed (%s) — keeping in-memory state", exc)

    # ── mutations (persist only on real changes) ─────────────────────────────
    def mark_setup(self, sig: str, qualified: bool) -> None:
        self.setup_alerted[sig] = time.time()
        self.qualified[sig]     = qualified
        self.persist()

    def set_qualified(self, sig: str, qualified: bool) -> None:
        if self.qualified.get(sig) != qualified:
            self.qualified[sig] = qualified
            self.persist()

    def mark_entry(self, sig: str) -> None:
        if sig not in self.entry_alerted:
            self.entry_alerted.add(sig)
            self.persist()

    def cleanup(self, ttl_seconds: int) -> None:
        cutoff = time.time() - ttl_seconds
        stale  = [k for k, ts in self.setup_alerted.items() if ts < cutoff]
        if not stale:
            return
        for k in stale:
            self.setup_alerted.pop(k, None)
            self.entry_alerted.discard(k)
            self.qualified.pop(k, None)
        self.persist()
