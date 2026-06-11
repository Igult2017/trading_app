"""
Signal Platform — entrypoint.
Wires up all layers and starts the scheduler.
Nothing of substance lives here — each concern is in its own module.
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

    # 1. Database — create tables if not present
    from storage.db import create_tables
    create_tables()
    log.info("[boot] database ready")

    # 2. Configure + verify cTrader data source
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
        log.error("[boot] cTrader not configured — missing env vars: %s", ", ".join(missing))
        sys.exit(1)

    log.info("[boot] probing cTrader connection (EUR/USD H1)...")
    try:
        from data.data_source import fetch_raw
        probe = await asyncio.wait_for(fetch_raw("EUR/USD", "H1", 5), timeout=25)
        if not probe:
            raise RuntimeError("Spotware returned 0 bars — account ID may be wrong")
        log.info("[boot] cTrader OK — %d bars received for EUR/USD H1", len(probe))
    except Exception as exc:
        log.error("[boot] cTrader probe FAILED: %s", exc)
        log.error("[boot] check CTRADER_ACCESS_TOKEN, CTRADER_REFRESH_TOKEN, CTRADER_ACCOUNT_ID")
        sys.exit(1)

    # 3. Register plugins (features first, then strategies/indicators/patterns)
    import features      # noqa: F401 — side-effect: registers platform features
    import strategies    # noqa: F401 — side-effect: registers strategies
    import indicators    # noqa: F401
    import patterns      # noqa: F401
    from core import strategy_registry, feature_registry
    log.info(f"[boot] {len(feature_registry.registered_ids())} feature(s) registered")
    log.info(f"[boot] {strategy_registry.count()} strategy(ies) registered")

    # 4. Wire notifications dispatcher into event bus
    from notifications.dispatcher import register as register_dispatcher
    register_dispatcher()

    # 5. Import scan functions (late import avoids circular deps)
    from orchestrator.scanner import scan_markets
    from monitor.signal_monitor import check_all

    # 6. Build + start scheduler
    from scheduler import scheduler
    scheduler.build(scan_markets, check_all)
    scheduler.start()
    log.info("[boot] scheduler started — platform is running")

    # 7. Run first scan immediately so there is no 60s cold-start delay
    log.info("[boot] running initial scan...")
    await scan_markets()


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
