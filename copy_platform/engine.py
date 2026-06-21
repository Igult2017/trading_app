"""
Engine — loads all active masters from the DB, starts one provider per master,
and polls the DB every 60 s for newly registered masters.
"""
import asyncio
import hashlib
import logging
from db import Session, CopyMaster, BrokerAccount
from cred_manager import get_creds
from dispatcher import dispatch
from notify import start_listener
from config import COPY_WORKER_INDEX, COPY_WORKER_COUNT

log = logging.getLogger("engine")

SUPPORTED_PLATFORMS = {"ctrader", "ct", "binance", "dxtrade", "tradelocker"}


def _shard_of(master_id: str) -> int:
    """Which worker owns this master (stable hash → worker index)."""
    return int(hashlib.md5(master_id.encode()).hexdigest(), 16) % COPY_WORKER_COUNT


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
        self._watch_task = None

    async def start(self) -> None:
        log.info("[engine] starting copy engine (worker %d/%d)",
                 COPY_WORKER_INDEX, COPY_WORKER_COUNT)
        await self._load_masters()
        self._watch_task = asyncio.ensure_future(self._watch_loop())
        asyncio.ensure_future(self._supervise_loop())
        # Instant pickup of new masters; silently falls back to the 60s poll.
        start_listener(asyncio.get_running_loop(), self._load_masters)

    async def _watch_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            await self._load_masters()

    async def _supervise_loop(self) -> None:
        """Recycle providers whose connection has been dead too long (their own
        reconnect chain may have silently stopped), then reload to restart them."""
        while True:
            await asyncio.sleep(90)
            for mid, p in list(self._providers.items()):
                try:
                    recycle = getattr(p, "needs_recycle", None)
                    if recycle and recycle():
                        log.warning(f"[engine] recycling stale provider for master {mid}")
                        self.stop_provider(mid)
                except Exception as e:
                    log.warning(f"[engine] supervise error for {mid}: {e}")
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
            is_telegram = (master.source_type or "").lower() == "telegram"
            if COPY_WORKER_COUNT > 1:
                # Telegram uses ONE shared bot poller, so all Telegram masters live
                # on worker 0 — otherwise every worker would poll the same bot
                # (Telegram 409 conflict / updates split at random). cTrader masters
                # shard normally by id so no master is ever copied twice.
                owner = 0 if is_telegram else _shard_of(master.id)
                if owner != COPY_WORKER_INDEX:
                    continue
            if is_telegram:
                await self._start_telegram(master)
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

    async def _start_telegram(self, master: CopyMaster) -> None:
        from db import Session, TelegramSource
        from providers.telegram import TelegramProvider
        with Session() as db:
            src = db.query(TelegramSource).filter_by(master_id=master.id, is_active=True).first()
        if not src or not src.channel_name:
            log.info(f"[engine] telegram master {master.id}: no active source/channel — skipping")
            return
        cfg = {
            "entry_keyword":     src.entry_keyword,
            "sl_keyword":        src.sl_keyword,
            "tp_keyword":        src.tp_keyword,
            "symbol_keyword":    src.symbol_keyword,
            "execute_no_sl":     bool(src.execute_no_sl),
            "execute_no_tp":     bool(src.execute_no_tp),
            "use_first_tp_only": bool(src.use_first_tp_only),
            "min_confidence":    "medium",
        }
        provider = TelegramProvider(master.id, src.channel_name, cfg, dispatch)
        self._providers[master.id] = provider
        provider.start()
        log.info(f"[engine] telegram provider started for master {master.id} (channel {src.channel_name})")

    def stop_provider(self, master_id: str) -> None:
        p = self._providers.pop(master_id, None)
        if p:
            p.stop()
            log.info(f"[engine] provider stopped for master {master_id}")
