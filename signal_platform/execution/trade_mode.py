"""
THE TRADING MODE — the one switch that decides whether autotrade places, asks him first, or does nothing.

HIS ASK, 16 Nov 2026: a switch in the admin panel for autotrade, and one for DM confirmation, *"Only one
switch can work at a time. If I switch DM confirm on, autotrade goes off."* So it is ONE value with three
positions, saved in `platform_settings` and set from the admin Autotrade page:

    off      nothing is placed; every signal is still recorded, as autotrade-off always was
    auto     autotrade places what it qualifies, by itself
    confirm  what autotrade would place is sent to his DM with Confirm / Reject instead

It REPLACES the `AUTOTRADE_ENABLED` environment variable, which needed a redeploy to change and would
otherwise be a second switch that could disagree with this one.

READ FROM THE DATABASE, KEPT `_TTL_S` SECONDS IN MEMORY, so a flip takes effect within seconds and the
trading path does not query the database for every check. UNREADABLE = OFF: like every guard, doubt
refuses — a database fault must never be read as permission to trade.
"""
import logging
import time

log = logging.getLogger(__name__)

OFF, AUTO, CONFIRM = "off", "auto", "confirm"
MODES = (OFF, AUTO, CONFIRM)
_TTL_S = 5.0
_cached: tuple[str, float] | None = None
_last_logged: str | None = None


def _read() -> str:
    from storage.confirm_models import PlatformSettingModel
    from storage.db import get_session
    with get_session() as s:
        row = s.get(PlatformSettingModel, "trade_mode")
        value = (row.value if row else "").strip().lower()
    return value if value in MODES else OFF


def mode() -> str:
    """off | auto | confirm. Never raises; anything unreadable or unknown is `off`."""
    global _cached, _last_logged
    now = time.monotonic()
    if _cached and now - _cached[1] < _TTL_S:
        return _cached[0]
    try:
        value = _read()
    except Exception as exc:
        log.warning(f"[trade_mode] could not read the trading mode ({type(exc).__name__}: {exc}) — "
                    f"treating it as OFF")
        value = OFF
    _cached = (value, now)
    if value != _last_logged:
        log.info(f"[trade_mode] trading mode is now {value.upper()}")
        _last_logged = value
    return value


def describe(value: str) -> str:
    return {OFF: "trading is OFF (both switches off in the admin panel)",
            AUTO: "autotrade is ON", CONFIRM: "DM confirmation is ON"}.get(value, value)


def forget() -> None:
    """Tests only — drop the cached value."""
    global _cached
    _cached = None
