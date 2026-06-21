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
log = logging.getLogger("signal_platform")


async def _startup() -> None:
    from config.settings import settings
    from core.startup_helpers import write_status, bootstrap_ctrader_tokens

    write_status("starting")

    # 1. Database — create tables if not present
    from storage.db import create_tables
    create_tables()
    log.info("[boot] database ready")

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
    try:
        _, _w = await asyncio.wait_for(
            asyncio.open_connection(_host, 5035, ssl=__import__("ssl").create_default_context()),
            timeout=10,
        )
        _w.close()
        log.info("[boot] TCP %s:5035 reachable", _host)
    except asyncio.TimeoutError:
        msg  = f"TCP {_host}:5035 timeout — outbound port 5035 is blocked"
        hint = "Open outbound TCP 5035 in your VPS firewall (UFW / iptables / provider panel)"
        write_status("error", msg, hint)
        log.error("[boot] %s", msg)
        sys.exit(1)
    except OSError as exc:
        msg  = f"TCP {_host}:5035 refused — {exc}"
        hint = "Check VPS firewall outbound rules for port 5035"
        write_status("error", msg, hint)
        log.error("[boot] %s", msg)
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
    import indicators    # noqa: F401
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
    scheduler.build(scan_markets, check_all)
    scheduler.start()

    write_status("ok")
    log.info("[boot] scheduler started — platform is running")

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
