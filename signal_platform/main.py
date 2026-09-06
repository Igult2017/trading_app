"""
Signal Platform — entrypoint.
Wires up all layers and starts the scheduler.
"""

import asyncio
import logging
import sys

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
# IMMEDIATELY AFTER, AND BEFORE ANYTHING CAN LOG. INFO here applies to the ROOT logger, so every
# third-party library inherits it — and `httpx` logs the full address of each request it makes.
# Telegram puts the bot token inside that address, so every send wrote the live token into the
# container log in plaintext. See core/log_redaction.
from core.log_redaction import install as _install_log_redaction  # noqa: E402
_install_log_redaction()

log = logging.getLogger("signal_platform")


async def _track_positions() -> None:
    """The position tracker's scheduled job — his open trades, every 2 seconds.

    A REAL `async def`, NOT A LAMBDA, and that distinction cost a live outage on 2026-09-06.

    This was first wired as `lambda: track_positions(_dm)`. APScheduler decides how to run a job by
    asking `iscoroutinefunction(func)` — and a lambda that RETURNS a coroutine is not a coroutine
    function. So it ran the lambda in a worker thread, got a coroutine object back, and threw it
    away: `RuntimeWarning: coroutine 'check_all' was never awaited`, three times, and the tracker
    never executed once. The safety net was silently dead in production, which is worse than the 30
    seconds it replaced.

    It passed every check I ran — the modules imported, the signature matched, the suites were green
    — because none of them asked the only question that mattered: WOULD THE JOB ACTUALLY RUN.
    `test_position_book` now asks it.
    """
    from monitor.position_tracker import check_all as track
    from notifications.dispatcher import _send_private
    await track(_send_private)


async def _startup() -> None:
    from config.settings import settings
    from core.startup_helpers import write_status, bootstrap_ctrader_tokens

    write_status("starting")

    # 1. Database — create tables if not present
    from storage.db import create_tables
    create_tables()
    log.info("[boot] database ready")

    # 1a. ORDERS STILL AWAITING A FILL, restored from the last run. Autotrade used to hold these in a
    # plain dict, so a redeploy between placing an order and its fill lost the fill report and the
    # only link back to the signal — and nothing said why. His instruction, 2026-09-02: *"persist
    # every memory that we might need ... I dont want to here that we redeployed and the memory was
    # wiped so we cant know what happened."* Read ONCE here, never on the trading path.
    from execution.placer import rehydrate_intents
    rehydrate_intents()

    # 1c. THE DUPLICATE-ORDER GUARD. `guards._placed` enforces one live order per symbol+direction
    # and the daily cap; both lived only in memory, so the first signal after a restart could place a
    # SECOND real order on a setup already live. Rebuilt from `autotrade_orders`, which already has
    # every placement. His rule, 2026-09-03: *"you must persist any crucial memory."*
    from execution import guards
    guards.rehydrate()

    # 1d. THE HIGH-WATER MARKS of every open position — how far each ran in his favour and against
    # him. They cannot be recovered after the fact, and they are the MAE/MFE the journal wants.
    from monitor import exit_watch
    exit_watch.rehydrate()

    # 1e. ORPHANED ORDERS are swept by the SIGNAL MONITOR's first poll, not here.
    #
    # It was here, and it could not work: the sweep needs credentials from the Node app, which is not
    # serving yet at boot. The first production run proved it — it identified the orphaned gold order
    # correctly and logged "no usable account" nine seconds before the scheduler even started.
    # `execution.canceller.sweep_orphans_soon` now runs it on the monitor's first poll instead, when
    # everything is up. No delay to tune, no timing to guess.


    # 1b. HOW LONG WERE WE GONE? Read the heartbeat BEFORE anything overwrites it — its age is the
    # outage. A signal that never arrived has two very different explanations, "the strategy declined
    # it" and "the process was not running", and until 2026-07-27 nothing in the system could tell
    # them apart: container logs start at boot, so an outage erases its own evidence.
    # ...AND SAY SO. Recording the outage was only half of it: the row went into the database and
    # nothing ever read it, so the 4h45m absence on 15 Aug 2026 surfaced five days later by accident.
    # The existing S3 alert cannot cover this case — it fires from `write_status` on a boot ERROR, so
    # a process that was KILLED (or a container that died) reports nothing at all. See
    # `startup_helpers.report_downtime`.
    from storage import observability_repo as obs
    from core.startup_helpers import report_downtime
    report_downtime(obs.detect_downtime())
    obs.beat(scanned=False)   # booting proves liveness; it is not a scan, so it must not count as one

    # 2. Bootstrap tokens from Node DB (always fresh — overrides potentially-stale env vars)
    await bootstrap_ctrader_tokens(settings)

    # 3. Configure + verify cTrader data source
    from data import ctrader_session
    ctrader_session.configure(
        client_id=settings.ctrader_client_id,
        client_secret=settings.ctrader_client_secret,
        account_id=settings.ctrader_account_id,
        env=settings.ctrader_env,
    )

    if not ctrader_session.is_configured():
        missing = []
        if not settings.ctrader_client_id:     missing.append("CTRADER_CLIENT_ID")
        if not settings.ctrader_client_secret: missing.append("CTRADER_CLIENT_SECRET")
        if not settings.ctrader_account_id:    missing.append("CTRADER_ACCOUNT_ID")
        if not settings.ctrader_access_token:  missing.append("CTRADER_ACCESS_TOKEN")
        if not settings.ctrader_refresh_token: missing.append("CTRADER_REFRESH_TOKEN")
        msg = "Missing env vars: " + ", ".join(missing)
        write_status("error", msg, "Add the missing env vars in Coolify and redeploy")
        log.error("[boot] cTrader not configured — %s", msg)
        sys.exit(1)

    # Port-reachability check — catches VPS firewall blocking port 5035
    _env  = settings.ctrader_env or "demo"
    _host = "demo.ctraderapi.com" if _env == "demo" else "live.ctraderapi.com"
    log.info("[boot] checking TCP %s:5035 ...", _host)
    _reach_err = ""
    for _attempt in range(1, 4):        # retry transient blips before alerting — only cry when truly down
        try:
            _, _w = await asyncio.wait_for(
                asyncio.open_connection(_host, 5035, ssl=__import__("ssl").create_default_context()),
                timeout=10,
            )
            _w.close()
            log.info("[boot] TCP %s:5035 reachable (attempt %d)", _host, _attempt)
            _reach_err = ""
            break
        except asyncio.TimeoutError:
            _reach_err = f"TCP {_host}:5035 timeout — outbound port 5035 is blocked"
        except OSError as exc:
            _reach_err = f"TCP {_host}:5035 refused — {exc}"
        if _attempt < 3:
            log.warning("[boot] 5035 check attempt %d/3 failed (%s) — retrying in 4s", _attempt, _reach_err)
            await asyncio.sleep(4)
    if _reach_err:                      # all 3 attempts failed → genuinely down, then alert + exit
        hint = "Open outbound TCP 5035 in your VPS firewall (UFW / iptables / provider panel)"
        write_status("error", _reach_err, hint)
        log.error("[boot] %s (after 3 attempts)", _reach_err)
        sys.exit(1)

    # cTrader probe — actually fetches bars to confirm auth + account ID are correct
    log.info("[boot] probing cTrader connection (EUR/USD H1)...")
    try:
        from data.data_source import fetch_raw
        probe = await asyncio.wait_for(fetch_raw("EUR/USD", "H1", 5), timeout=25)
        if not probe:
            msg  = f"Spotware returned 0 bars — CTRADER_ACCOUNT_ID={settings.ctrader_account_id} may be wrong"
            hint = "Confirm CTRADER_ACCOUNT_ID is the ctid numeric ID, not your broker login number"
            write_status("error", msg, hint)
            log.error("[boot] %s", msg)
            sys.exit(1)
        log.info("[boot] cTrader OK — %d bars received for EUR/USD H1", len(probe))
    except Exception as exc:
        raw = str(exc)
        if "refresh" in raw.lower() or "token" in raw.lower() or "backoff" in raw.lower():
            hint = "CTRADER_REFRESH_TOKEN is stale. ADMIN_SECRET must be set so Python can auto-fetch tokens from Node DB."
        elif "app auth failed" in raw.lower():
            hint = "CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET is wrong, OR the app is not Active in the cTrader portal"
        elif "account auth failed" in raw.lower():
            hint = f"CTRADER_ACCOUNT_ID={settings.ctrader_account_id} is invalid on the {_env} server"
        else:
            hint = "Check CTRADER_ACCESS_TOKEN, CTRADER_REFRESH_TOKEN, CTRADER_ACCOUNT_ID in Coolify"
        write_status("error", raw, hint)
        log.error("[boot] cTrader probe FAILED: %s", raw)
        log.error("[boot] hint: %s", hint)
        sys.exit(1)

    # 4. Register plugins
    import features      # noqa: F401
    import strategies    # noqa: F401
    import patterns      # noqa: F401
    from core import strategy_registry, feature_registry
    log.info("[boot] %d feature(s), %d strategy(ies) registered",
             len(feature_registry.registered_ids()), strategy_registry.count())

    # 5. Wire notifications
    from notifications.dispatcher import register as register_dispatcher
    register_dispatcher()

    # 6. Build + start scheduler
    from orchestrator.scanner import scan_markets
    from monitor.signal_monitor import check_all
    from scheduler import scheduler
    # THE TRADE TRACKER GETS ITS OWN JOB. It used to be called from inside `check_all` above, which
    # is why it ran on the signal poller's 30-second clock — see the note on the job in
    # scheduler.py. Signals are watched every 30s; his open trades every 2s.
    scheduler.build(scan_markets, check_all, _track_positions)
    scheduler.start()

    write_status("ok")
    log.info("[boot] scheduler started — platform is running")

    # 6a. REAL-TIME TRADE WATCHER — opt-in, and started as its own task so it cannot delay boot.
    #     It streams prices over FIX (a different protocol, a different port, its own credential)
    #     and spends NONE of the Open API request budget the scanner uses. Every failure inside it
    #     is caught by its own loop; the 30s position tracker keeps working whether it runs or not,
    #     so the worst case of this feature being broken is the behaviour we had before it existed.
    if settings.trade_watcher_enabled:
        try:
            from monitor.trade_watcher import TradeWatcher
            from monitor.entry_watcher import EntryWatcher
            # The same admin-DM sender position_tracker is given (signal_monitor.py:105-106), so
            # these messages land exactly where the 30s tracker's already do.
            from notifications.dispatcher import _send_private
            _watcher = TradeWatcher(_send_private)
            asyncio.create_task(_watcher.run_forever())
            # AND the entry side: scan the moment a 1M bar closes rather than up to a minute later.
            # Measured cause — every stored signal arrived at or PAST its own entry, two of four
            # already through it. This only makes the existing scan happen sooner; if it dies, the
            # scheduled scan carries on and behaviour is exactly what it is today.
            _entry = EntryWatcher(_send_private)
            asyncio.create_task(_entry.run_forever())
            log.info("[boot] real-time watchers started (trade + entry)")
        except Exception as exc:
            log.warning(f"[boot] watchers failed to start (non-fatal): {exc}")
    else:
        log.info("[boot] real-time watchers are OFF (trade_watcher_enabled=false)")

    # 6b. Boot heartbeat + first scan — BEST-EFFORT. A failure here must never crash
    #     _startup: the process would exit, the watchdog would restart it, and it would
    #     re-send the boot heartbeat on every restart (a Telegram spam loop). The
    #     scheduler already runs scans on its own interval regardless.
    try:
        from notifications.dispatcher import announce_status
        await announce_status()
    except Exception as exc:
        log.warning(f"[boot] heartbeat failed (non-fatal): {exc}")

    try:
        log.info("[boot] running initial scan...")
        await scan_markets()
    except Exception as exc:
        log.warning(f"[boot] initial scan failed (non-fatal): {exc}")


def main() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_startup())
        loop.run_forever()
    except KeyboardInterrupt:
        log.info("[shutdown] KeyboardInterrupt received")
    finally:
        from scheduler import scheduler
        scheduler.shutdown()
        loop.close()
        log.info("[shutdown] complete")


if __name__ == "__main__":
    main()
