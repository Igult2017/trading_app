"""
Signal CRUD — four functions, no business logic.
All decisions about what to store are made in the orchestrator or monitor.
"""

import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, and_
from sqlalchemy.exc import IntegrityError
from core.types import Signal, SignalStatus
from storage.db import get_session
from storage.models import SignalModel

log = logging.getLogger(__name__)


STATUS_WATCHING = "watching"   # a setup being watched for entry — NOT a live trade


def save(signal: Signal, status: str | None = None) -> str:
    """Persist a new signal. Returns the generated ID, or '' on duplicate.

    `status` overrides the signal's own. It exists for the WATCH heads-ups: those are setups being
    watched for entry, not live trades, and they must not occupy the live keyspace. The partial
    unique index `trading_signals_one_active_per_key` is scoped `WHERE status='active'`, so a
    watching row and an active row for the same strategy+symbol+direction cannot suppress each
    other. There is a mirrored index for `'watching'` so repeated heads-ups do not accumulate.

    One insert path on purpose — a second `save_watch()` would drift from this one.
    """
    with get_session() as s:
        row = SignalModel(
            symbol=signal.symbol,
            asset_class=signal.asset_class,
            type=signal.direction.value,
            strategy=signal.strategy_id,
            entry_price=signal.entry_price or None,
            stop_loss=signal.stop_loss or None,
            take_profit=signal.take_profit or None,
            risk_reward=signal.risk_reward or None,
            primary_tf=signal.primary_timeframe,
            confidence=int(signal.confidence * 100),
            smc_factors=signal.smc_factors,
            technical_reasons=signal.technical_reasons,
            market_context=signal.market_context,
            trend_direction=signal.direction.value,
            status=status or signal.status.value,
            expires_at=signal.expires_at,
            created_at=signal.created_at,
            updated_at=signal.created_at,
        )
        s.add(row)
        try:
            s.flush()
        except IntegrityError:
            log.warning(f"[signal_repo] duplicate signal for {signal.symbol} — skipped")
            return ""
        log.info(f"[signal_repo] saved signal {row.id} for {signal.symbol}")
        return row.id


def touch_watch(strategy_id: str, symbol: str, direction: str,
                when: datetime | None = None) -> int:
    """Refresh a WATCHING row's `updated_at` — i.e. "still being watched, as of now".

    LOAD-BEARING for `drop_abandoned`. `save()` writes `updated_at` once at insert, and the partial
    unique index means a repeat heads-up for the same key cannot insert again. So without this,
    `updated_at` would freeze at FIRST sighting, and a setup still being actively watched would be
    dropped 24h later as stale. Called whenever a heads-up is re-emitted for a key that already
    exists.
    """
    with get_session() as s:
        n = s.query(SignalModel).filter(
            SignalModel.status == STATUS_WATCHING,
            SignalModel.strategy == strategy_id,
            SignalModel.symbol == symbol,
            SignalModel.type == direction,
        ).update({SignalModel.updated_at: when or datetime.now(timezone.utc)},
                 synchronize_session=False)
    return n


def drop_watch(strategy_id: str, symbol: str, direction: str) -> int:
    """Delete the WATCHING row for a setup whose entry has now confirmed.

    The watch row and the confirmed entry are separate rows written by separate paths (the heads-up
    carries strategy id `<id>_watch`, the entry carries `<id>`). Without this the board would show
    the same setup twice — once as WATCHING FOR ENTRY and once as IN PROGRESS — which is exactly the
    confusion the labels exist to remove. The watch has served its purpose the moment the entry
    fires, so it is removed rather than left to expire.
    """
    with get_session() as s:
        n = s.query(SignalModel).filter(
            SignalModel.status == STATUS_WATCHING,
            SignalModel.strategy == f"{strategy_id}_watch",
            SignalModel.symbol == symbol,
            SignalModel.type == direction,
        ).delete(synchronize_session=False)
    if n:
        log.info(f"[signal_repo] {symbol} {strategy_id} entry confirmed — watch row promoted")
    return n


def drop_abandoned(now: datetime | None = None, stale_hours: int = 24) -> int:
    """Delete setups that never produced an entry. Returns the row count.

    The user's rule: a signal that does not go past WATCHING is dropped the moment the system stops
    watching it — its entry never aligned, so it is not a record of anything worth keeping.

    Two kinds:
      * WATCHING rows that have gone stale. A heads-up re-fires while the setup is live, so one that
        has not been refreshed within `stale_hours` is no longer being watched. This is an
        APPROXIMATION of "immediately": nothing in the strategy emits a stop-watching event, so
        staleness is the only honest signal available. If such an event is ever added, key off it
        instead and delete this window.
      * EXPIRED rows — a signal that fired but whose entry was never filled (the stop order was
        cancelled). It went past watching, but never became a trade, so it is dropped rather than
        shown as closed.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=stale_hours)
    with get_session() as s:
        n = s.query(SignalModel).filter(
            or_(
                and_(SignalModel.status == STATUS_WATCHING, SignalModel.updated_at < cutoff),
                SignalModel.status == SignalStatus.EXPIRED.value,
            )
        ).delete(synchronize_session=False)
    if n:
        log.info(f"[signal_repo] dropped {n} setup(s) that never produced an entry")
    return n


def week_start(now: datetime | None = None) -> datetime:
    """Most recent Monday 00:00 UTC, at or before `now`.

    Taken as a parameter so the boundary is testable against fixed dates — a purge that is only
    ever exercised against `now()` is a purge nobody has actually checked.
    """
    now = now or datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight - timedelta(days=midnight.weekday())      # Monday == 0


def purge_before_week_start(now: datetime | None = None) -> int:
    """Delete every signal created before this week's Monday. Returns the row count.

    The user's rule: the board carries ONE WEEK and starts fresh every Monday. Deliberately deletes
    rather than archives — there is no win/loss logic, so an older signal carries no outcome worth
    keeping, and a growing table would only make the Assets panel slower to no benefit.

    Runs on a Monday cron AND once at boot: a container that restarts over a weekend would otherwise
    skip its Monday entirely and carry two weeks.
    """
    cutoff = week_start(now)
    with get_session() as s:
        # NEVER delete a row that is still ACTIVE. In practice `expire_stale` closes anything older
        # than 24h so an active row cannot reach a week, but "in practice" is not a guarantee: if
        # one ever did, deleting it would drop a LIVE trade the monitor is tracking, and the monitor
        # would simply stop watching a position that is still open. A stale row on the board is a
        # cosmetic problem; a silently abandoned trade is not.
        n = s.query(SignalModel).filter(
            SignalModel.created_at < cutoff,
            SignalModel.status != "active",
        ).delete(synchronize_session=False)
    if n:
        log.info(f"[signal_repo] weekly reset — purged {n} signal(s) created before {cutoff:%Y-%m-%d}")
    return n


def get_active() -> list[SignalModel]:
    """Return all signals currently in 'active' status."""
    with get_session() as s:
        return s.query(SignalModel).filter(
            SignalModel.status == "active"
        ).all()


def update_status(signal_id: str, status: SignalStatus,
                  timestamp_field: str | None = None,
                  when: datetime | None = None) -> None:
    """Update the status of a signal and optionally stamp a timestamp field.

    `when` is the time the thing ACTUALLY HAPPENED — the close bar's time — not the time we noticed
    it. Since the monitor replays candles it can detect a close minutes after the fact (a missed
    poll, a restart), and a now() stamp would put the wrong time on the outcome card and in the
    trade record. Same reasoning as mark_triggered. Defaults to now() for callers with no bar.
    """
    with get_session() as s:
        row = s.get(SignalModel, signal_id)
        if not row:
            return
        row.status = status.value
        if timestamp_field:
            setattr(row, timestamp_field, when or datetime.now(timezone.utc))


def mark_triggered(signal_id: str, when: datetime | None = None) -> None:
    """Stamp the moment the ENTRY actually filled. Status stays 'active' — the card is live either
    way; triggered_at is what separates an open POSITION (TP/SL outcomes are real) from a pending
    stop ORDER (nothing has been won or lost yet).

    `when` is the time of the BAR the fill happened on, not the time we noticed it. The monitor
    replays candles from this timestamp forward, so a `now()` stamp would silently skip every bar
    between the real fill and the poll that spotted it — which is the whole class of bug the replay
    exists to remove. Defaults to now() for callers with no bar to point at.

    Idempotent: an already-triggered row is left alone, so re-running the replay over the same
    window cannot move the fill time.
    """
    with get_session() as s:
        row = s.get(SignalModel, signal_id)
        if row and row.triggered_at is None:
            row.triggered_at = when or datetime.now(timezone.utc)


def cancel_active(strategy: str, symbol: str, direction: str) -> int:
    """Expire the still-PENDING active signal(s) a strategy has retracted (setup invalidated before
    the entry filled). EXPIRED, not INVALIDATED: invalidated is a real SL loss; a retracted setup
    never opened a trade and must not be scored as one. Rows already triggered are left alone —
    the monitor owns a live position. Returns the count cancelled."""
    with get_session() as s:
        rows = s.query(SignalModel).filter(
            SignalModel.status == "active",
            SignalModel.strategy == strategy,
            SignalModel.symbol == symbol,
            SignalModel.type == direction,
            SignalModel.triggered_at.is_(None),
        ).all()
        for row in rows:
            row.status = SignalStatus.EXPIRED.value
            row.invalidated_at = datetime.now(timezone.utc)
        if rows:
            log.info(f"[signal_repo] cancelled {len(rows)} retracted pending signal(s) "
                     f"{strategy}/{symbol}/{direction}")
        return len(rows)


def expire_stale(older_than_hours: int = 24) -> list[tuple[str, str, str]]:
    """Mark expired signals; returns (symbol, type, strategy) per expired row so the CALLER can
    free the in-memory dedup reservations. Without that release an expired signal held its
    strategy:symbol:direction key for the whole process lifetime, silently muting the strategy
    for that pair+direction until a restart (guaranteed for any Friday-evening signal — the
    weekend passes, nothing touches TP/SL, the 24h cap expires it).

    Honours each signal's own expires_at when set (e.g. a 4h intraday setup);
    falls back to created_at + older_than_hours as a blanket cap when expires_at
    is null."""
    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=older_than_hours)
    with get_session() as s:
        rows = s.query(SignalModel).filter(
            SignalModel.status == "active",
            or_(
                SignalModel.expires_at < now,
                and_(SignalModel.expires_at.is_(None), SignalModel.created_at < cutoff),
            ),
        ).all()
        freed = [(row.symbol, row.type, row.strategy or "") for row in rows]
        for row in rows:
            row.status = SignalStatus.EXPIRED.value
        if rows:
            log.info(f"[signal_repo] expired {len(rows)} stale signals")
        return freed
        return len(rows)
