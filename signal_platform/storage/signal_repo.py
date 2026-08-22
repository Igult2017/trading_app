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


def save(signal: Signal, status: str | None = None, ref_price: float | None = None) -> str:
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
            # `trading_signals.entry_price` is NOT NULL. `signal.entry_price or None` therefore
            # turned a legitimate 0.0 into NULL and the INSERT died on the constraint — so EVERY
            # heads-up without an entry (a stage-1 "building" alert: BX zone mitigated, VIX.1
            # momentum candle closed) failed to reach the Assets board, while the Telegram alert
            # still went out. It logged and continued, so the board just stayed empty.
            # `ref_price` is the price being WATCHED — not a level to trade, and the card still
            # renders an em dash because it reads `signal.entry_price`, which stays 0.
            # ALL FOUR ARE NOT NULL, not just `entry_price`. The fix above was made for `entry_price`
            # alone on 2026-08-20 and the other three kept the `or None` pattern — so a stage-1 alert
            # (no entry, no stop, no target, by design) still died on the `stop_loss` constraint. The
            # INSERT raised, `save` returned "" as though it were a duplicate, and BX-S/D's heads-ups
            # never reached the Assets board ONCE, in silence, for the whole life of the feature.
            #
            # `ref_price` is the price being WATCHED — not a level to trade. Using it for all three
            # price columns says "no distance from the watched price", which is the truth about a
            # heads-up, and matches the shape a VIX.1 watch row already stores (take_profit == entry).
            # `risk_reward` goes to 0 for the same reason: there is no ratio, and 0 says so.
            #
            # NOTHING WRONG REACHES THE USER: the card reads `signal.*`, which stays 0, so it still
            # renders an em dash. This only decides what the ROW holds.
            entry_price=signal.entry_price or ref_price or None,
            stop_loss=signal.stop_loss or ref_price or None,
            take_profit=signal.take_profit or ref_price or None,
            risk_reward=signal.risk_reward or 0,
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
        except IntegrityError as exc:
            # A DUPLICATE AND A MALFORMED ROW ARE NOT THE SAME EVENT, and treating them as one is why
            # the bug above survived for the entire life of the feature. Both landed here, both
            # returned "", and the caller reads "" as "a row is already there" — so a NOT NULL
            # violation was reported to nobody, logged nowhere, and looked exactly like normal
            # operation. Whatever the next constraint failure is, it must not get that treatment.
            #
            # 23505 = unique_violation, the expected case. Anything else is a real fault.
            _pgcode = getattr(getattr(exc, "orig", None), "pgcode", "") or ""
            _dup = _pgcode == "23505" or (not _pgcode and "unique" in str(exc).lower())
            if not _dup:
                s.rollback()
                log.error(f"[signal_repo] REFUSED to store {signal.strategy_id} {signal.symbol} — "
                          f"the row is malformed, not a duplicate (pgcode={_pgcode or '?'}): "
                          f"{str(exc.orig or exc)[:200]}")
                # Into `signal_events` too, so it is answerable after the log buffer has rolled —
                # a failure nobody can query is a failure nobody finds.
                try:
                    from storage import observability_repo as obs
                    obs.record(obs.STAGE_DROPPED, signal.strategy_id or "", signal.symbol or "",
                               detail=f"save refused (pgcode={_pgcode or '?'}): {str(exc.orig or exc)[:300]}")
                except Exception:
                    pass
                return ""
            # ROLL BACK BEFORE RETURNING. A failed flush leaves the transaction in a state where the
            # only legal next move is a rollback — and `get_session` commits on the way out of this
            # `with`, so without this the commit raised PendingRollbackError ("This Session's
            # transaction has been rolled back") and `save` RAISED instead of returning "".
            #
            # WHAT THAT COST, and it is not cosmetic: a duplicate here is the NORMAL case — a repeat
            # heads-up for a setup already on the board. The caller's `else` branch, which calls
            # `touch_watch` to say "still being watched", was therefore UNREACHABLE, because the
            # caller only reaches it when `save` returns "". `updated_at` froze at first sighting and
            # `drop_abandoned` dropped setups that were still live 24h later — exactly what the
            # `touch_watch` docstring says it exists to prevent. Seen in production 2026-08-20 as two
            # "watch-row save failed" errors on USD/JPY.
            s.rollback()
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


def month_start(now: datetime | None = None) -> datetime:
    """First day of this month, 00:00 UTC, at or before `now`.

    Taken as a parameter so the boundary is testable against fixed dates — a purge that is only
    ever exercised against `now()` is a purge nobody has actually checked.

    Was `week_start` (most recent Monday) until 2026-08-22. His instruction: *"let the signals expire
    at the end of every month."* `server/routes.ts` computes the SAME instant independently for its
    read-time filter; if the two ever disagree the board shows rows the purge already deleted, or
    hides rows it kept, so they are asserted against each other in `tests/test_signal_board.py`.
    """
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def purge_before_month_start(now: datetime | None = None) -> int:
    """Delete every signal created before the 1st of this month. Returns the row count.

    The user's rule: the board carries ONE MONTH and starts fresh on the 1st. Deliberately deletes
    rather than archives — there is no win/loss logic, so an older signal carries no outcome worth
    keeping, and a growing table would only make the Assets panel slower to no benefit.

    Runs on a monthly cron AND once at boot: a container that restarts across the 1st would otherwise
    skip it entirely and carry two months.
    """
    cutoff = month_start(now)
    with get_session() as s:
        # NEVER delete a row that is still ACTIVE. In practice `expire_stale` closes anything older
        # than 24h so an active row cannot reach a month, but "in practice" is not a guarantee: if
        # one ever did, deleting it would drop a LIVE trade the monitor is tracking, and the monitor
        # would simply stop watching a position that is still open. A stale row on the board is a
        # cosmetic problem; a silently abandoned trade is not.
        n = s.query(SignalModel).filter(
            SignalModel.created_at < cutoff,
            SignalModel.status != "active",
        ).delete(synchronize_session=False)
    if n:
        log.info(f"[signal_repo] monthly reset — purged {n} signal(s) created before {cutoff:%Y-%m-%d}")
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
