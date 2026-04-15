"""
MT5 trade executor for follower accounts.
Receives a NormalisedSignal + follower config and executes OPEN / MODIFY / CLOSE
on the follower's MT5 account.

Fixes applied:
  - CLOSE uses the follower's actual open volume (not the master's lot)
  - Risk-mode lot calculation uses symbol-aware pip size and pip value
  - Retry logic with exponential back-off is preserved
"""
import asyncio
import logging
from typing import Optional
from ..models import NormalisedSignal
from ..config import MT5_RECONNECT_DELAY_SEC, WORKER_MAX_RETRIES
from .. import database as db

log = logging.getLogger(__name__)

# mt5-remote forwards all calls over a local socket to an MT5 terminal running
# inside Wine (Linux VPS) or natively (Windows).  The API surface is identical
# to the official MetaTrader5 package so no other code in this file needs to change.
try:
    from mt5_remote import MetaTrader5 as mt5  # Linux VPS via Wine bridge
    MT5_AVAILABLE = True
except ImportError:
    try:
        import MetaTrader5 as mt5              # Windows direct fallback
        MT5_AVAILABLE = True
    except ImportError:
        MT5_AVAILABLE = False


# ── Pip helpers ───────────────────────────────────────────────────────────────

def _pip_size(symbol: str) -> float:
    """Return the value of one pip for the given symbol."""
    s = symbol.upper()
    if s.endswith("JPY") or s.startswith("JPY"):
        return 0.01
    if s in ("XAUUSD", "GOLD", "XAGUSD", "SILVER", "XPTUSD", "XPDUSD"):
        return 0.01
    if any(c in s for c in ("BTC", "ETH", "XRP", "SOL", "BNB", "ADA", "DOT")):
        return 1.0
    return 0.0001  # standard 4-decimal forex pair


def _pip_value_per_lot(symbol: str) -> float:
    """Return approximate USD pip value for 1 standard lot."""
    s = symbol.upper()
    if s.endswith("JPY") or s.startswith("JPY"):
        return 8.0        # varies ~7-9 USD
    if s in ("XAUUSD", "GOLD"):
        return 1.0        # $1 per $0.01 move per oz (100 oz contract)
    if s in ("XAGUSD", "SILVER"):
        return 0.5
    if "BTC" in s:
        return 100.0
    if "ETH" in s:
        return 10.0
    if s in ("US100", "NAS100", "NDX", "NASDAQ"):
        return 1.0
    if s in ("US500", "SPX500", "SP500"):
        return 1.0
    if s in ("US30", "DJ30", "DOW", "DOWJONES"):
        return 1.0
    return 10.0           # standard major FX pair (USD-quoted)


# ── Lot calculator ────────────────────────────────────────────────────────────

def calculate_lot(mode: str, follower: dict, signal: NormalisedSignal,
                  account_info: dict) -> float:
    master_volume = signal.volume or 0.01
    equity = account_info.get("equity", 1000.0)

    if mode == "fixed":
        lot = float(follower.get("fixed_lot") or 0.01)

    elif mode == "risk":
        risk_pct = float(follower.get("risk_percent") or 1.0) / 100.0
        entry = signal.entry_price or 0.0
        sl    = signal.stop_loss  or 0.0
        sl_distance = abs(entry - sl)

        if sl_distance <= 0:
            lot = 0.01
        else:
            pip_sz  = _pip_size(signal.symbol)
            pip_val = _pip_value_per_lot(signal.symbol)
            sl_pips = sl_distance / pip_sz if pip_sz > 0 else 1.0
            lot = (equity * risk_pct) / (sl_pips * pip_val)

    else:  # "mult" (default)
        multiplier = float(follower.get("lot_multiplier") or 1.0)
        lot = master_volume * multiplier

    lot = max(0.01, round(lot, 2))
    return lot


# ── Symbol remapping ──────────────────────────────────────────────────────────

def remap_symbol(symbol: str, prefix: str = "", suffix: str = "") -> str:
    return f"{prefix}{symbol}{suffix}"


# ── MT5 execution helpers ─────────────────────────────────────────────────────

def _mt5_open(follower: dict, signal: NormalisedSignal, lot: float) -> Optional[int]:
    symbol = remap_symbol(
        signal.symbol,
        follower.get("symbol_prefix", "") or "",
        follower.get("symbol_suffix", "") or "",
    )
    order_type = mt5.ORDER_TYPE_BUY if signal.action == "BUY" else mt5.ORDER_TYPE_SELL
    price = mt5.symbol_info_tick(symbol)
    if price is None:
        log.error("[Exec] Symbol %s not found on follower broker", symbol)
        return None

    ask = price.ask if signal.action == "BUY" else price.bid

    # Determine supported filling mode
    sym_info = mt5.symbol_info(symbol)
    if sym_info is not None and sym_info.filling_mode & mt5.ORDER_FILLING_FOK:
        filling = mt5.ORDER_FILLING_FOK
    elif sym_info is not None and sym_info.filling_mode & mt5.ORDER_FILLING_IOC:
        filling = mt5.ORDER_FILLING_IOC
    else:
        filling = mt5.ORDER_FILLING_RETURN

    request = {
        "action":       mt5.TRADE_ACTION_DEAL,
        "symbol":       symbol,
        "volume":       lot,
        "type":         order_type,
        "price":        ask,
        "sl":           signal.stop_loss  or 0.0,
        "tp":           signal.take_profit or 0.0,
        "deviation":    20,
        "magic":        20250101,
        "comment":      f"copy:{signal.master_id[:8]}",
        "type_time":    mt5.ORDER_TIME_GTC,
        "type_filling": filling,
    }
    result = mt5.order_send(request)
    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
        return result.order
    log.error("[Exec] order_send failed: %s", result)
    return None


def _mt5_modify(ticket: int, sl: float, tp: float) -> bool:
    request = {
        "action":   mt5.TRADE_ACTION_SLTP,
        "position": ticket,
        "sl":       sl or 0.0,
        "tp":       tp or 0.0,
    }
    result = mt5.order_send(request)
    return bool(result and result.retcode == mt5.TRADE_RETCODE_DONE)


def _mt5_close(ticket: int, volume: float, symbol: str,
               action: str, prefix: str = "", suffix: str = "") -> bool:
    sym = remap_symbol(symbol, prefix, suffix)
    tick = mt5.symbol_info_tick(sym)
    if tick is None:
        return False
    close_price = tick.bid if action == "BUY" else tick.ask
    close_type  = mt5.ORDER_TYPE_SELL if action == "BUY" else mt5.ORDER_TYPE_BUY

    sym_info = mt5.symbol_info(sym)
    if sym_info is not None and sym_info.filling_mode & mt5.ORDER_FILLING_FOK:
        filling = mt5.ORDER_FILLING_FOK
    elif sym_info is not None and sym_info.filling_mode & mt5.ORDER_FILLING_IOC:
        filling = mt5.ORDER_FILLING_IOC
    else:
        filling = mt5.ORDER_FILLING_RETURN

    request = {
        "action":       mt5.TRADE_ACTION_DEAL,
        "position":     ticket,
        "symbol":       sym,
        "volume":       volume,
        "type":         close_type,
        "price":        close_price,
        "deviation":    20,
        "magic":        20250101,
        "comment":      "copy:close",
        "type_time":    mt5.ORDER_TIME_GTC,
        "type_filling": filling,
    }
    result = mt5.order_send(request)
    return bool(result and result.retcode == mt5.TRADE_RETCODE_DONE)


# ── Main executor ─────────────────────────────────────────────────────────────

class TradeExecutor:
    """Executes one NormalisedSignal against one follower account."""

    def __init__(self, follower: dict):
        self.follower = follower
        self.login    = int(follower["login_id"])
        self.password = self._decrypt(follower["password_enc"])
        self.server   = follower.get("broker_server", "")
        self._connected = False

    @staticmethod
    def _decrypt(enc: str) -> str:
        from ..config import ENCRYPTION_KEY
        if not ENCRYPTION_KEY:
            import base64
            try:
                return base64.b64decode(enc).decode()
            except Exception:
                return enc
        try:
            import base64
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            key = bytes.fromhex(ENCRYPTION_KEY)
            raw = base64.b64decode(enc)
            nonce, ct = raw[:12], raw[12:]
            return AESGCM(key).decrypt(nonce, ct, None).decode()
        except Exception:
            return enc

    def connect(self) -> bool:
        if not MT5_AVAILABLE:
            log.warning("[Exec] MT5 not available — skipping connection (Linux/non-Windows)")
            return False
        if not mt5.initialize():
            return False
        if not mt5.login(self.login, password=self.password, server=self.server):
            mt5.shutdown()
            return False
        self._connected = True
        return True

    def disconnect(self) -> None:
        if MT5_AVAILABLE and self._connected:
            mt5.shutdown()
            self._connected = False

    async def execute(self, signal: NormalisedSignal, master_trade_db_id: str,
                      follower_trade_db_id: str) -> bool:
        follower_id = self.follower["id"]

        for attempt in range(1, WORKER_MAX_RETRIES + 1):
            try:
                if not self.connect():
                    raise ConnectionError(f"Cannot connect to MT5 login={self.login}")

                account_info = mt5.account_info()._asdict() if MT5_AVAILABLE else {}
                lot = calculate_lot(
                    self.follower.get("lot_mode", "mult"),
                    self.follower, signal, account_info,
                )

                success = False
                ticket: Optional[int] = None

                if signal.event_type == "OPEN":
                    ticket = _mt5_open(self.follower, signal, lot)
                    success = ticket is not None

                elif signal.event_type == "MODIFY":
                    existing = await self._find_follower_ticket(master_trade_db_id, follower_id)
                    if existing:
                        success = _mt5_modify(existing, signal.stop_loss or 0.0, signal.take_profit or 0.0)

                elif signal.event_type == "CLOSE":
                    existing = await self._find_follower_ticket(master_trade_db_id, follower_id)
                    if existing:
                        # Use the actual volume the follower opened with, not master lot
                        actual_vol = await self._get_follower_open_volume(master_trade_db_id, follower_id)
                        close_lot  = actual_vol if actual_vol and actual_vol > 0 else lot
                        success = _mt5_close(
                            existing, close_lot, signal.symbol, signal.action,
                            self.follower.get("symbol_prefix", "") or "",
                            self.follower.get("symbol_suffix", "") or "",
                        )

                if success:
                    await db.update_follower_trade(
                        follower_trade_db_id, "executed",
                        external_id=str(ticket) if ticket else None,
                    )
                    await db.insert_execution_log(
                        follower_id, "INFO", signal.event_type,
                        f"{signal.event_type} {signal.action} {signal.symbol} lot={lot:.2f} — OK",
                        trade_id=follower_trade_db_id,
                    )
                    return True

                raise RuntimeError(f"MT5 execution failed (attempt {attempt})")

            except Exception as e:
                log.error("[Exec] Attempt %d/%d failed: %s", attempt, WORKER_MAX_RETRIES, e)
                await db.update_follower_trade(
                    follower_trade_db_id, "pending",
                    error=str(e), retry_count=attempt,
                )
                await db.insert_execution_log(
                    follower_id, "WARN", "RETRY",
                    f"Attempt {attempt} failed: {e}",
                    trade_id=follower_trade_db_id,
                )
                if attempt < WORKER_MAX_RETRIES:
                    await asyncio.sleep(MT5_RECONNECT_DELAY_SEC * attempt)
            finally:
                self.disconnect()

        await db.update_follower_trade(follower_trade_db_id, "failed")
        await db.insert_execution_log(
            follower_id, "ERROR", "FAIL",
            f"All {WORKER_MAX_RETRIES} attempts failed for {signal.event_type} {signal.symbol}",
            trade_id=follower_trade_db_id,
        )
        return False

    @staticmethod
    async def _find_follower_ticket(master_trade_db_id: str, follower_id: str) -> Optional[int]:
        pool = await db.get_pool()
        row = await pool.fetchrow(
            """
            SELECT external_id FROM copy_trades_follower
            WHERE  master_trade_id = $1
              AND  follower_id     = $2
              AND  status          = 'executed'
              AND  external_id IS NOT NULL
            ORDER  BY created_at DESC LIMIT 1
            """,
            master_trade_db_id, follower_id,
        )
        if row and row["external_id"]:
            try:
                return int(row["external_id"])
            except ValueError:
                pass
        return None

    @staticmethod
    async def _get_follower_open_volume(master_trade_db_id: str, follower_id: str) -> Optional[float]:
        """Return the lot volume the follower used when opening this trade."""
        pool = await db.get_pool()
        row = await pool.fetchrow(
            """
            SELECT volume FROM copy_trades_follower
            WHERE  master_trade_id = $1
              AND  follower_id     = $2
              AND  event_type      = 'OPEN'
              AND  status          = 'executed'
            ORDER  BY created_at DESC LIMIT 1
            """,
            master_trade_db_id, follower_id,
        )
        if row and row["volume"] is not None:
            try:
                return float(row["volume"])
            except (TypeError, ValueError):
                pass
        return None
