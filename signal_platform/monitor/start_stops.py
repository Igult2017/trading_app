"""
EACH POSITION'S STARTING STOP — the fixed yardstick the profit ladder counts R from.

THE DEFECT THIS ENDS (docs/OPEN.md B27, proved 19 Sep 2026). The ladder rebuilt "1R" from the stop the
position carries NOW. Its first move (breakeven) put that stop on the entry, so the risk read zero, R
read "unknown", and every later step — lock +1R at 1.5R, the trail from 2.1R — was skipped for the rest
of the trade. His EUR/USD sell of 18 Sep ran to 2.85R and closed at $0. Replayed on the broker's real
ticks, counting from the starting stop turns the seven real fills from -4.14R into -1.08R.

WHERE THE NUMBER COMES FROM. The broker keeps the original stop on the order that opened the position
(`data/ctrader_orders.opening_stop`), verified 7/7 on his real positions. If that order carried no stop
(a manual trade whose stop was added later), the first stop seen is taken — safe only because the
ladder never moves a stop it cannot measure, so nothing we did can be what we see.

UNKNOWN MEANS DO NOTHING. A position whose starting stop is not known yet gets `start_stop=None`, and
`Position.r_at` then returns None, so the ladder leaves it alone. It NEVER falls back to the current
stop: that fallback is the defect.

OFF THE FAST PATH. `learn_soon` is started from the 5-second position refresh and returns at once; the
broker is asked once per position, in the background. His rule, *"you must persist any crucial memory"*:
the map is saved to `strategy_state` (in a thread) and restored once at boot.
"""
import asyncio
import dataclasses
import logging
import threading

from data import ctrader_orders

log = logging.getLogger(__name__)

_STATE_KEY = "position_start_stops"
_known: dict[int, float] = {}
_learning = False


def get(position_id: int) -> float | None:
    return _known.get(int(position_id))


def attach(positions):
    """The same positions, each carrying its starting stop (None if not known yet)."""
    if positions is None:
        return None
    return [dataclasses.replace(p, start_stop=_known.get(int(p.position_id)))
            if dataclasses.is_dataclass(p) and hasattr(p, "start_stop") else p
            for p in positions]


async def learn(positions) -> int:
    """Ask the broker for the starting stop of every position we do not know yet. Returns how many."""
    added = 0
    for p in positions or []:
        pid = int(p.position_id)
        if pid in _known or p.stop is None:
            continue
        asked, stop = await ctrader_orders.opening_stop(pid, p.bullish)
        if not asked:
            continue                                   # broker unreadable: ask again next time
        source = "opening order"
        if stop is None:
            stop, source = float(p.stop), "first stop seen (the opening order carried none)"
        _known[pid] = float(stop)
        added += 1
        log.info(f"[start_stops] {p.symbol} #{pid}: starting stop {stop} ({source})")
    open_ids = {int(p.position_id) for p in positions or []}
    gone = [pid for pid in _known if pid not in open_ids]
    for pid in gone:
        del _known[pid]
    if added or gone:
        _persist()
    return added


def learn_soon(positions) -> None:
    """Start `learn` for any unknown position and return immediately. Never two at once.

    NEVER RAISES. It is called from inside the position refresh that both stop-movers depend on; an
    error here must cost a lookup, never the position list (caught by `test_position_book`)."""
    try:
        _learn_soon([p for p in (positions or []) if hasattr(p, "position_id")]
                    if positions is not None else None)
    except Exception as exc:
        log.warning(f"[start_stops] could not schedule a lookup: {type(exc).__name__}: {exc}")


def _learn_soon(positions) -> None:
    global _learning
    if _learning or positions is None:
        return
    open_ids = {int(p.position_id) for p in positions}
    unknown = any(int(p.position_id) not in _known and p.stop is not None for p in positions)
    closed = any(pid not in open_ids for pid in _known)
    if not (unknown or closed):
        return                                         # nothing new and nothing closed
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    _learning = True

    async def _run():
        global _learning
        try:
            await learn(list(positions))
        except Exception as exc:
            log.warning(f"[start_stops] learn failed: {type(exc).__name__}: {exc}")
        finally:
            _learning = False

    loop.create_task(_run())


def _persist() -> None:
    snapshot = {str(k): v for k, v in _known.items()}

    def _write():
        try:
            from storage import strategy_state_repo
            strategy_state_repo.save(_STATE_KEY, snapshot)
        except Exception as exc:
            log.warning(f"[start_stops] could not save: {type(exc).__name__}: {exc}")

    try:
        threading.Thread(target=_write, name="start_stops_persist", daemon=True).start()
    except Exception as exc:
        log.warning(f"[start_stops] could not start the save thread: {type(exc).__name__}: {exc}")


def rehydrate() -> int:
    """Restore the map from the last run. Call ONCE at boot. Returns how many."""
    try:
        from storage import strategy_state_repo
        raw = strategy_state_repo.load(_STATE_KEY) or {}
    except Exception as exc:
        log.warning(f"[start_stops] could not restore: {type(exc).__name__}: {exc}")
        return 0
    restored = 0
    for pid, stop in raw.items():
        try:
            _known.setdefault(int(pid), float(stop))
            restored += 1
        except (TypeError, ValueError):
            continue
    if restored:
        log.info(f"[start_stops] restored {restored} starting stop(s) — the ladder keeps counting "
                 f"from where each trade began across the restart")
    return restored
