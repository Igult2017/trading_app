"""
Signal Platform — entrypoint.
Wires up all layers and starts the scheduler.
Nothing of substance lives here — each concern is in its own module.
"""

import asyncio
import logging
import signal as os_signal
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

    # 2. Configure data sources
    from data import ctrader_session, ejtrader_ct_client
    from config.instruments import INSTRUMENTS

    # 2a. cTrader Open API (primary — requires approved app + auth_setup.py)
    ctrader_session.configure(
        client_id=settings.ctrader_client_id,
        client_secret=settings.ctrader_client_secret,
        account_id=settings.ctrader_account_id,
        env=settings.ctrader_env,
    )
    from data.data_source import active_source
    log.info(f"[boot] data source: {active_source()}")

    # 2b. ejtraderCT tick feed — live price overlay on yfinance bars
    if not ctrader_session.is_configured():
        if ejtrader_ct_client.is_configured():
            ejtrader_ct_client.subscribe(INSTRUMENTS)
            log.info("[boot] ejtraderCT live overlay: active")

    # 3. Register plugins (strategies, indicators, patterns)
    import strategies    # noqa: F401 — side-effect: registers strategies
    import indicators    # noqa: F401
    import patterns      # noqa: F401
    from core import strategy_registry
    log.info(f"[boot] {strategy_registry.count()} strategy(ies) registered")

    # 3. Wire notifications dispatcher into event bus
    from notifications.dispatcher import register as register_dispatcher
    register_dispatcher()

    # 4. Import scan functions (late import avoids circular deps)
    from orchestrator.scanner import scan_markets
    from monitor.signal_monitor import check_all

    # 5. Build + start scheduler
    from scheduler import scheduler
    sched = scheduler.build(scan_markets, check_all)
    scheduler.start()
    log.info("[boot] scheduler started — platform is running")

    # 6. Run first scan immediately so there is no 60s cold-start delay
    log.info("[boot] running initial scan...")
    await scan_markets()


def _shutdown(sched) -> None:
    from scheduler import scheduler
    scheduler.shutdown()
    log.info("[shutdown] complete")


def main() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(_startup())
        loop.run_forever()
    except KeyboardInterrupt:
        log.info("[shutdown] KeyboardInterrupt received")
    finally:
        loop.close()


if __name__ == "__main__":
    main()
