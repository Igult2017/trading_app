"""
Copy Platform — entry point.

Uses Twisted's asyncio reactor so cTrader Open API (Twisted) and our asyncio
code share the same event loop — no threads needed.

Run: python main.py
Requires: copy_platform/.env  (see .env.example)
"""
import logging
import sys

# MUST install asyncio reactor before any other twisted import
from twisted.internet import asyncioreactor
asyncioreactor.install()

from twisted.internet import reactor  # noqa: E402 — after asyncioreactor.install()

import asyncio  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("copy_platform")


async def _startup() -> None:
    log.info("[boot] copy platform starting")

    from engine import CopyEngine
    engine = CopyEngine()
    await engine.start()

    log.info("[boot] copy platform running — waiting for position events")


def main() -> None:
    # Schedule startup inside the reactor's asyncio loop — do NOT call
    # run_until_complete() here because that stops the loop after startup
    # and breaks all ensure_future tasks (watch_loop, provider reconnects).
    reactor.callWhenRunning(lambda: asyncio.ensure_future(_startup()))

    try:
        reactor.run()
    except KeyboardInterrupt:
        log.info("[shutdown] received interrupt — stopping")
    finally:
        log.info("[shutdown] complete")


if __name__ == "__main__":
    main()
