"""
WHEN DID THE PLATFORM FIRST SEE THIS INSTRUMENT? — the guard against firing on backfilled history.

THE INCIDENT IT EXISTS FOR (2026-08-19). Gold was added to VIX.1 and switched on mid-session. Its
very first scan fetched the usual 3,000 bars of history, found a big candle from the PREVIOUS
AFTERNOON (18 Aug 14:00) still inside `momentum_run`'s 12-bar lookback, and emitted a SELL on it.
By then price had fallen $33 and bounced $23 back. The user read the alert, looked at his chart and
said exactly the right thing: *"there is no momentum candle that has closed there."* There wasn't —
it was eleven hours behind him.

Nothing was broken in the detection. The candle was real and it had genuinely closed. The fault is
that a newly-enabled instrument is allowed to reach back into a past it was never watching and trade
it as if it had just happened.

THE RULE, and it needs no tuned number: a candle that closed BEFORE this instrument was first
scanned is history the platform never saw live, and must not produce a signal. "When did this go
live" is a fact, not a setting.

WHY IT IS MEASURED IN BAR TIME, NOT WALL CLOCK. A wall-clock debut would make every replay, test and
measurement refuse everything, because their candles are always older than "now". Recording the
LATEST CLOSED BAR at first sight makes the comparison bar-time against bar-time, so a replay behaves
exactly like a cold start — which is the behaviour under test — and production is unaffected.

PERSISTED, so a redeploy is not mistaken for a new instrument. It writes its own `strategy_state`
row (`<strategy_id>:debut`) rather than sharing one: `FiredRegistry._persist` replaces the whole blob
with `{"fired": ...}`, so anything else stored under that key would be silently wiped on the next
fired-key write. Degrades to in-memory on any DB error — this must never take a scan down.
"""
import logging

from storage import strategy_state_repo

log = logging.getLogger(__name__)


class InstrumentDebut:
    def __init__(self, strategy_id: str):
        self.key = f"{strategy_id}:debut"
        self._first: dict[str, int] = {}     # symbol -> bar time of the newest bar at first sight
        try:
            blob = strategy_state_repo.load(self.key) or {}
            self._first = {k: int(v) for k, v in (blob.get("debut") or {}).items()}
            if self._first:
                log.info("[debut] %s: restored %d instrument(s)", strategy_id, len(self._first))
        except Exception as exc:
            # Type only, not the full exception: a SQLAlchemy connection error prints a multi-line
            # traceback that buries every test run this touches. Degrading is the designed
            # behaviour, so it should read as one line, not as a failure.
            log.warning("[debut] %s load failed (%s) — starting empty",
                        strategy_id, type(exc).__name__)

    def _persist(self) -> None:
        try:
            strategy_state_repo.save(self.key, {"debut": self._first})
        except Exception as exc:
            log.warning("[debut] persist failed (%s) — keeping in-memory", type(exc).__name__)

    def note(self, symbol: str, latest_bar_time: int) -> int:
        """Record this instrument's debut on first sight; return it. Idempotent afterwards."""
        seen = self._first.get(symbol)
        if seen is None:
            self._first[symbol] = int(latest_bar_time)
            self._persist()
            log.info("[debut] %s first seen at bar %s — earlier candles are backfill",
                     symbol, latest_bar_time)
            return int(latest_bar_time)
        return seen

    def is_backfill(self, symbol: str, candle_time: int) -> bool:
        """Did this candle close before we were watching? Unknown instrument -> False (never guess)."""
        seen = self._first.get(symbol)
        return seen is not None and int(candle_time) < seen
