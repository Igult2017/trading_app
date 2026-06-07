"""
Engine — loads all active masters from the DB, starts a provider per master,
and polls the DB every 60 s for newly registered masters.
"""
import asyncio
import logging
from db import Session, CopyMaster, BrokerAccount
from token_manager import get_ctrader_creds
from providers.ctrader import CTraderProvider
from dispatcher import dispatch

log = logging.getLogger("engine")

PROVIDER_MAP = {"ctrader", "ct"}   # platform values that use cTrader provider


class CopyEngine:
    def __init__(self):
        self._providers: dict[str, CTraderProvider] = {}   # master_id → provider

    async def start(self) -> None:
        log.info("[engine] starting copy engine")
        await self._load_masters()
        asyncio.ensure_future(self._watch_loop())

    async def _watch_loop(self) -> None:
        """Reload masters every 60 s to pick up newly registered providers."""
        while True:
            await asyncio.sleep(60)
            await self._load_masters()

    async def _load_masters(self) -> None:
        with Session() as db:
            masters = db.query(CopyMaster).filter_by(is_active=True).all()
            broker_ids = [m.broker_account_id for m in masters if m.broker_account_id]
            accounts = {
                a.id: a
                for a in db.query(BrokerAccount).filter(
                    BrokerAccount.id.in_(broker_ids)
                ).all()
            }

        for master in masters:
            if master.id in self._providers:
                continue   # already running
            if master.broker_account_id not in accounts:
                log.warning(f"[engine] master {master.id}: broker account not found")
                continue

            broker_account = accounts[master.broker_account_id]
            if broker_account.platform.lower() not in PROVIDER_MAP:
                log.info(f"[engine] skipping {master.id}: platform {broker_account.platform} not yet supported")
                continue

            await self._start_provider(master, broker_account)

    async def _start_provider(self, master: CopyMaster,
                              broker_account: BrokerAccount) -> None:
        creds = await get_ctrader_creds(broker_account)
        if not creds:
            log.error(f"[engine] cannot decrypt creds for master {master.id}")
            return

        provider = CTraderProvider(
            master_id    = master.id,
            creds        = creds,
            account_type = broker_account.account_type or "demo",
            on_event     = dispatch,
        )
        self._providers[master.id] = provider
        provider.start()
        log.info(f"[engine] provider started for master {master.id} ({broker_account.name})")

    def stop_provider(self, master_id: str) -> None:
        p = self._providers.pop(master_id, None)
        if p:
            p.stop()
            log.info(f"[engine] provider stopped for master {master_id}")
