"""
Scan the instant a 1-minute bar closes, instead of up to a minute later.

WHY, MEASURED. Every stored VIX.1 signal was tested against real broker M1 bars for whether price had
ALREADY traded past its own entry when the signal fired:

    EUR/USD BUY  17 Aug  entry 1.15975   best before firing 1.15973   0.2 pips short
    EUR/USD BUY  19 Aug  entry 1.16487   best before firing 1.16498   ALREADY PAST by 1.1 pips
    XAU/USD BUY  19 Aug  entry 4460.59   best before firing 4461.52   ALREADY PAST by 9.3 pips
    GBP/USD SELL 28 Aug  entry 1.35508   best before firing 1.35509   0.1 pips short

A stop order cannot be placed where price has already been, so two of four were unplaceable on
arrival and the other two had no room at all. On a 3-pip stop that is not slowness, it is the whole
margin. His words: *"signal arrives late when its past entry."*

Part of the delay is that the scan lands at an arbitrary offset — the 1M bar the entry is read from
closes, and then nothing looks at it for up to a full interval (30s/45s/60s, plus a 20s M1 cache).
This closes that gap: FIX carries every tick with the broker's own timestamp, so the minute roll is
known as it happens, and the existing scan runs immediately.

THE RATE DOES NOT GO UP. An M1 bar closes once a minute; the scan already runs every 30-60s. The same
work is simply aligned to the bar instead of to an arbitrary clock offset, and `scan_on_demand`
enforces a minimum gap so a scheduled tick and a bar-triggered scan cannot double up.

WHAT THIS DOES NOT DO, which is what makes it safe to run unattended: it decides nothing, changes no
threshold, and places nothing. It calls the same `run_strategy` a scheduled tick calls, behind the
same gates. **If this dies, is switched off, or loses its stream, the scheduled scan carries on and
behaviour is exactly today's** — the worst case of this being wrong is what we already have.
"""
import asyncio
import logging
import time

from config.settings import settings
from data import instrument_filter

log = logging.getLogger(__name__)

_POLL_S = 0.25            # how often the tick stream is examined; costs no broker requests
_IDLE_S = 60.0            # how often to look again when the market is shut
_STALE_AFTER_S = 90.0     # no tick this long, on an open market, means the stream is not working
_REPORT_EVERY_S = 15 * 60 # how often the tick-vs-broker candle match rate is logged


class EntryWatcher:
    """Streams prices for the open instruments and scans each one as its 1-minute bar closes."""

    def __init__(self, send=None):
        self.send = send                       # optional admin DM, for the stale alarm only
        self._stream = None
        self._running = False
        self._degraded = False
        self._last_report = 0.0

    async def run_forever(self) -> None:
        """Never raises. A watcher that can take the platform down is not a safety feature."""
        self._running = True
        while self._running:
            try:
                await self._cycle()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error(f"[entry-watcher] {type(exc).__name__}: {exc}", exc_info=True)
                await asyncio.sleep(_IDLE_S)

    async def stop(self) -> None:
        self._running = False
        await self._drop()

    # ── internals ──────────────────────────────────────────────────────────────

    async def _cycle(self) -> None:
        from datetime import datetime, timezone
        instruments = instrument_filter.get_open_instruments(datetime.now(timezone.utc))
        if not instruments:
            await self._drop()                 # market shut: hold no session open pointlessly
            await asyncio.sleep(_IDLE_S)
            return

        if not await self._ensure(instruments):
            await asyncio.sleep(_IDLE_S)
            return

        await self._check_stale()
        self._report_match_rate()
        for inst in instruments:
            if self._stream.minute_rolled(inst):
                from orchestrator.scan_on_demand import scan_one
                await scan_one(inst, reason="1M bar closed")
        await asyncio.sleep(_POLL_S)

    def _report_match_rate(self) -> None:
        """Log how our tick-built candles are scoring against the broker's, every 15 minutes.

        This is the go/no-go for ever serving them, so it belongs in the log where it can be read
        after the fact — not only in a tool that needs a shell inside the container. Never raises: a
        report must not be able to disturb the thing it reports on.
        """
        now = time.monotonic()
        if now - self._last_report < _REPORT_EVERY_S:
            return
        self._last_report = now
        try:
            from data.tick_bar_audit import audit
            rows = audit.report()
            if not rows:
                return
            parts = [f"{s}:{r['recent_matched']}/{r['recent']}{'*' if r['trusted'] else ''}"
                     for s, r in sorted(rows.items())]
            # THE LINE MUST SAY WHICH IT IS. It used to state flatly that nothing was served, which
            # stopped being true the moment the switch existed — and a log that misreports whether
            # live data is reaching a strategy is worse than no log at all.
            from data.tick_serving import serving_enabled
            state = ("* = SERVED to strategies" if serving_enabled()
                     else "* = would be trusted; nothing is served yet")
            log.info(f"[tick-audit] tick-built vs broker candles — {' '.join(parts)} ({state})")
            for s, r in rows.items():
                if r["last_mismatch"]:
                    log.warning(f"[tick-audit] {s} last mismatch: {r['last_mismatch']}")
        except Exception:
            pass

    async def _ensure(self, instruments: list[str]) -> bool:
        from data.fix_quotes import FixQuoteStream
        # BOTH are required, and the account id is the FIX one — NOT `ctrader_account_id`. FIX knows
        # this account by its cTrader login (5296567), the Open API by its ctidTraderAccountId
        # (47535363). Sending the wrong one is refused with RET_NO_SUCH_LOGIN.
        if not settings.ctrader_fix_password or not settings.ctrader_fix_account_id:
            return False
        if self._stream is not None and self._stream.connected:
            return True
        await self._drop()
        self._stream = FixQuoteStream(str(settings.ctrader_fix_account_id),
                                      settings.ctrader_fix_password,
                                      host=settings.ctrader_fix_host,
                                      port=settings.ctrader_fix_quote_port)
        # FEED THE BAR BUILDER. Registered BEFORE connecting so coverage is recorded from the first
        # instant — a minute already in progress when we attach is missing its early ticks, and the
        # builder must be able to tell the difference. Phase 1: these bars are compared against the
        # broker's and nothing else; they are not served to any strategy.
        from data.tick_bars import builder
        self._stream.on_bid_tick(builder.on_tick)
        self._stream.on_coverage(builder.connected, builder.disconnected)
        ok = await self._stream.connect(instruments)
        if not ok:
            self._stream = None
        return ok

    async def _drop(self) -> None:
        if self._stream is not None:
            await self._stream.close()
            self._stream = None

    async def _check_stale(self) -> None:
        """A DEAD STREAM LOOKS EXACTLY LIKE A QUIET MARKET, so silence is reported rather than
        assumed to be calm. Said ONCE per outage so it stays visible without becoming noise, and
        re-armed on recovery. The scheduled scan covers the gap meanwhile — nothing stops working,
        it just goes back to being as late as it was before."""
        stale = self._stream is None or self._stream.is_stale(_STALE_AFTER_S)
        if stale and not self._degraded:
            self._degraded = True
            log.warning("[entry-watcher] price stream quiet — falling back to the scheduled scan")
            if self.send:
                try:
                    await self.send(
                        "⚠️ The live price stream went quiet. Signals fall back to the normal "
                        "60-second scan, so they may arrive later than usual. Nothing is lost — "
                        "the scanner is unaffected.")
                except Exception:
                    pass
        elif not stale and self._degraded:
            self._degraded = False
            log.info("[entry-watcher] price stream is flowing again")
            # SAY SO. Recovery only ever wrote a log line, which dies at the next deploy, so the
            # last thing he was left holding was a warning that the price feed was dead — for a
            # feed that had come back. A warning with no all-clear is worse than no warning.
            if self.send:
                try:
                    await self.send("✅ The live price stream is flowing again — signals are back "
                                    "to arriving the moment a 1-minute candle closes.")
                except Exception:
                    pass
