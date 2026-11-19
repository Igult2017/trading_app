"""
SETTINGS HE CHANGES FROM THE ADMIN PANEL — read from the database, not from Coolify.

HIS ASK, 19 Nov 2026: *"remove any settings we would need to change any time from coolify and put it in admin
where settings are."* Changing a Coolify variable means a redeploy; a row in `platform_settings` (the table the
trading switch already lives in, `execution/trade_mode.py`) takes effect within seconds.

HOW A VALUE IS CHOSEN, for every name in `MANAGED`:
  1. the `platform_settings` row of that name, if there is one and it passes its check;
  2. otherwise the value from `config.settings` (the Coolify variable, else the code default) — exactly what was
     used before this module existed.
A row that fails its check is logged and IGNORED, never half-used. The admin page (`server/lib/engineSettings.ts`)
applies the same checks before saving, so this only matters if a row is written some other way.

READ ONCE PER `_TTL_S` FOR THE WHOLE TABLE, so the trading path never queries per check. DATABASE UNREADABLE = the
last good read is kept (and before any good read, step 2 above). It is not "refuse everything": the order path
needs the same database a moment later and refuses on its own if it is really down.

THE START-UP-ONLY SWITCH IS NOT HERE: `trade_watcher_enabled` is read once in `main.py`; a panel switch for it would
look like it worked and do nothing until a restart. It stays in Coolify.
"""
import json
import logging
import re
import time
from pathlib import Path

from config.settings import Settings, settings

log = logging.getLogger(__name__)

_TTL_S = 5.0

# THE ONE LIST — `engine_settings.json` beside this file. The website's admin page checks values against the SAME
# file (`server/lib/engineSettings.ts`), so the two can never disagree about what is allowed.
SPEC = json.loads((Path(__file__).resolve().parent / "engine_settings.json").read_text(encoding="utf-8"))
_KNOWN = {"pairs": set(SPEC["pairs"]), "strategies": set(SPEC["strategies"]), "sessions": set(SPEC["sessions"])}


def _items(v: str) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()]


def _hhmm_ok(v: str) -> bool:
    if not v.strip():
        return True
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", v.strip())
    return bool(m) and int(m.group(1)) < 24 and int(m.group(2)) < 60


def _overrides_ok(v: str) -> bool:
    try:
        return all(k.strip() in _KNOWN["strategies"] and 0.0 <= float(n) <= 1.0
                   for k, n in (p.split(":", 1) for p in _items(v)))
    except Exception:
        return False


def _checker(entry: dict):
    kind = entry["kind"]
    if kind in _KNOWN:
        return lambda v: all(x in _KNOWN[kind] for x in _items(v))
    if kind == "hhmm":
        return _hhmm_ok
    if kind == "overrides":
        return _overrides_ok
    if kind in ("number", "int"):
        return lambda v: entry["min"] <= v <= entry["max"]
    if kind == "bool":
        return lambda v: True
    raise ValueError(f"unknown kind {kind!r} for {entry['name']}")


# name -> the check its value must pass (after being turned into the setting's own type).
MANAGED: dict[str, object] = {e["name"]: _checker(e) for e in SPEC["settings"]}

_rows: dict[str, str] = {}          # the last GOOD read of the table
_read_at: float | None = None
_warned: set[tuple[str, str]] = set()


def _convert(name: str, raw: str):
    kind = Settings.model_fields[name].annotation
    text = (raw or "").strip()
    if kind is bool:
        low = text.lower()
        if low in ("true", "1", "on", "yes"):
            return True
        if low in ("false", "0", "off", "no"):
            return False
        raise ValueError("not true/false")
    if kind is int:
        return int(text)
    if kind is float:
        return float(text)
    return text.lower()


def _load() -> dict[str, str]:
    from storage.confirm_models import PlatformSettingModel
    from storage.db import get_session
    with get_session() as s:
        rows = s.query(PlatformSettingModel).filter(PlatformSettingModel.key.in_(list(MANAGED))).all()
        return {r.key: r.value for r in rows}


def _table() -> dict[str, str]:
    global _rows, _read_at
    now = time.monotonic()
    if _read_at is not None and now - _read_at < _TTL_S:
        return _rows
    _read_at = now
    try:
        fresh = _load()
    except Exception as exc:
        log.warning(f"[live_settings] could not read the admin settings ({type(exc).__name__}) — "
                    f"keeping the last good read")
        return _rows
    for k in set(fresh) | set(_rows):
        if fresh.get(k) != _rows.get(k):
            log.info(f"[live_settings] {k} = {fresh.get(k)!r} (from the admin panel)" if k in fresh
                     else f"[live_settings] {k} no longer set in the admin panel — using the default")
    _rows = fresh
    return _rows


def get(name: str):
    """The value to use now for a setting in `MANAGED`. Never raises."""
    if name not in MANAGED:
        raise KeyError(f"{name} is not an admin-panel setting")
    raw = _table().get(name)
    if raw is not None:
        try:
            value = _convert(name, raw)
            if MANAGED[name](value):
                return value
            problem = "outside the allowed range"
        except Exception as exc:
            problem = str(exc)
        if (name, raw) not in _warned:
            _warned.add((name, raw))
            log.error(f"[live_settings] IGNORED {name}={raw!r} from the admin panel ({problem}) — "
                      f"using {getattr(settings, name)!r}")
    return getattr(settings, name)


def forget() -> None:
    """Tests only — drop the cached table."""
    global _rows, _read_at
    _rows, _read_at = {}, None
    _warned.clear()
