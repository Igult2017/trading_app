"""
Engine — loads all active masters from the DB, starts one provider per master,
and polls the DB every 60 s for newly registered masters.
"""
import asyncio
import logging
from db import Session, CopyMaster, BrokerAccount
from cred_manager import get_creds
from dispatcher import dispatch

log = logging.getLogger("engine")

SUPPORTED_PLATFORMS = {"ctrader", "ct", "binance", "dxtrade", "tradelocker"}


def _make_provider(platform: str, master_id: str, creds: dict,
                   account_type: str, on_event):
    if platform in ("ctrader", "ct"):
        from providers.ctrader import CTraderProvider
        return CTraderProvider(master_id, creds, account_type, on_event)
    if platform == "binance":
        from providers.binance import BinanceProvider
        return BinanceProvider(master_id, creds, account_type, on_event)
    if platform == "dxtrade":
        from providers.dxtrade import DXTradeProvider
        return DXTradeProvider(master_id, creds, account_type, on_event)
    if platform == "tradelocker":
        from providers.tradelocker import TradeLockerProvider
        return TradeLockerProvider(master_id, creds, account_type, on_event)
    raise ValueError(f"No provider for platform: {platform}")


class CopyEngine:
    def __init__(self):
        self._providers: dict[str, object] = {}   # master_id → provider

    async def start(self) -> None:
        log.info("[engine] starting copy engine")
        await self._load_masters()
        asyncio.ensure_future(self._watch_loop())

    async def _watch_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            await self._load_masters()

    async def _load_masters(self) -> None:
        with Session() as db:
            masters    = db.query(CopyMaster).filter_by(is_active=True).all()
            broker_ids = [m.broker_account_id for m in masters if m.broker_account_id]
            accounts   = {}
            if broker_ids:
                accounts = {
                    a.id: a
                    for a in db.query(BrokerAccount)
                        .filter(BrokerAccount.id.in_(broker_ids)).all()
                }

        for master in masters:
            if master.id in self._providers:
                continue
            if not master.broker_account_id or master.broker_account_id not in accounts:
                log.warning(f"[engine] master {master.id}: broker account not found")
                continue
            broker_account = accounts[master.broker_account_id]
            platform = broker_account.platform.lower()
            if platform not in SUPPORTED_PLATFORMS:
                log.info(f"[engine] skipping {master.id}: {platform} not yet supported")
                continue
            await self._start_provider(master, broker_account)

    async def _start_provider(self, master: CopyMaster,
                              broker_account: BrokerAccount) -> None:
        creds = await get_creds(broker_account)
        if not creds:
            log.error(f"[engine] cannot get creds for master {master.id}")
            return
        try:
            provider = _make_provider(
                broker_account.platform.lower(),
                master.id, creds,
                broker_account.account_type or "demo",
                dispatch,
            )
        except ValueError as e:
            log.error(f"[engine] {e}")
            return
        self._providers[master.id] = provider
        provider.start()
        log.info(f"[engine] provider started for master {master.id} ({broker_account.name})")

    def stop_provider(self, master_id: str) -> None:
        p = self._providers.pop(master_id, None)
        if p:
            p.stop()
            log.info(f"[engine] provider stopped for master {master_id}")
