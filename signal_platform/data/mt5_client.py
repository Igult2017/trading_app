"""
MT5 data client — connects to MT5 running inside Wine/Docker via mt5linux (RPyC).

Architecture:
  signal_platform ──TCP/RPyC──► mt5 container (Wine + MT5 terminal)
                   port 8812          └──IPC──► Pepperstone servers

MT5 runs fully headless inside the gmag11/metatrader5_vnc container.
No laptop terminal needed. Pepperstone-accurate OHLCV for all TFs.

First time only: log in via VNC at http://localhost:3010, connect to
Pepperstone-Demo, enable algorithmic trading (Tools → Options → EA).
After that, initialize() with credentials handles login automatically.

pip install mt5linux  (client-side only — Wine container has MetaTrader5)
"""

import logging
import threading

from config.settings import settings

log = logging.getLogger(__name__)

_mt5       = None
_lock      = threading.Lock()
_failed    = False

# MT5 TIMEFRAME constants — hardcoded so we never do an RPyC attribute lookup
# for constants (avoids latency + proxy issues on every fetch call).
_TF: dict[str, int] = {
    "M1":  1,   "M2":  2,   "M3":  3,   "M4":  4,   "M5":  5,
    "M6":  6,   "M10": 10,  "M12": 12,  "M15": 15,  "M20": 20,  "M30": 30,
    "H1":  16385, "H2": 16386, "H3": 16387, "H4": 16388,
    "H6":  16390, "H8": 16392, "H12": 16396,
    "D1":  16408, "W1": 32769, "MN": 49153,
}


def is_configured() -> bool:
    return bool(settings.mt5_login and settings.mt5_password and settings.mt5_host)


def _ensure_init() -> bool:
    global _mt5, _failed
    if _mt5 is not None:
        return True
    if _failed:
        return False
    with _lock:
        if _mt5 is not None:
            return True
        if _failed:
            return False
        try:
            from mt5linux import MetaTrader5
            client = MetaTrader5(host=settings.mt5_host, port=settings.mt5_port)
            ok = client.initialize(
                login=int(settings.mt5_login),
                password=settings.mt5_password,
                server=settings.mt5_server,
            )
            if not ok:
                err = client.last_error()
                raise RuntimeError(f"initialize() failed: {err}")
            info = client.terminal_info()
            log.info(f"[mt5] connected — broker={info.company} build={info.build}")
            _mt5 = client
            return True
        except Exception as exc:
            log.error(f"[mt5] init failed: {exc}")
            _failed = True
            return False


def _reset() -> None:
    """Force reconnect on the next fetch (called after a connection error)."""
    global _mt5, _failed
    _mt5   = None
    _failed = False


def fetch_bars(symbol: str, tf: str, count: int = 100) -> list[dict]:
    """
    Fetch OHLCV bars — synchronous, call via asyncio executor.

    symbol — MT5 symbol without slash, e.g. 'EURUSD'
    tf     — TF string; all standard TFs are native in MT5
    Returns [{time (unix s), open, high, low, close, volume}] oldest→newest.
    """
    if not _ensure_init():
        return []

    tf_const = _TF.get(tf.upper())
    if tf_const is None:
        log.error(f"[mt5] unknown TF '{tf}'")
        return []

    try:
        rates = _mt5.copy_rates_from_pos(symbol, tf_const, 0, count)
    except Exception as exc:
        log.error(f"[mt5] {symbol} {tf}: connection error — {exc}")
        _reset()
        return []

    if rates is None or len(rates) == 0:
        log.warning(f"[mt5] {symbol} {tf}: no data — {_mt5.last_error()}")
        return []

    try:
        return [
            {"time": int(r["time"]),   "open":  float(r["open"]),
             "high": float(r["high"]), "low":   float(r["low"]),
             "close": float(r["close"]), "volume": float(r["tick_volume"])}
            for r in rates
        ]
    except Exception as exc:
        log.error(f"[mt5] {symbol} {tf}: parse error — {exc}")
        return []
