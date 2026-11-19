"""SETTINGS CHANGED FROM THE ADMIN PANEL (19 Nov 2026) — `config/live_settings.py`, proved with known answers.

His ask: *"remove any settings we would need to change any time from coolify and put it in admin where settings
are."* A `platform_settings` row wins; no row = the Coolify/code value; a bad row is IGNORED; the database being
unreadable keeps the last good read. And no engine file may read a moved setting straight from `settings` — that
would make its admin-panel box look saved and do nothing.
Run: python tests/test_live_settings.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "vix1")))
from _harness import Suite  # noqa: E402

import config.live_settings as L  # noqa: E402
from config.settings import Settings, settings  # noqa: E402

s = Suite("ADMIN-PANEL SETTINGS — a row wins, a bad row is ignored, a dead database keeps the last read")
ROWS: dict = {}
DOWN = [False]


def _load():
    if DOWN[0]:
        raise RuntimeError("database down")
    return dict(ROWS)


L._load = _load


def fresh(**rows):
    ROWS.clear()
    ROWS.update(rows)
    L.forget()


# ── 1. the one list agrees with config/settings.py ───────────────────────────────────────────────────────────────
bad = []
for e in L.SPEC["settings"]:
    d = Settings.model_fields[e["name"]].default
    v = L._convert(e["name"], e["default"])
    if v != (d.lower() if isinstance(d, str) else d) or not L.MANAGED[e["name"]](v):
        bad.append(e["name"])
s.check("every default in engine_settings.json equals config/settings.py and passes its own check", bad, [])
s.check("17 settings are managed", len(L.MANAGED), 17)
s.check("the start-up-only watcher switch is NOT managed (a panel box would do nothing)",
        "trade_watcher_enabled" in L.MANAGED, False)

# ── 2. which value wins ──────────────────────────────────────────────────────────────────────────────────────────
fresh()
s.check("no row → the Coolify/code value", L.get("autotrade_symbols"), settings.autotrade_symbols)
fresh(autotrade_symbols="eur/usd,xau/usd")
s.check("a row → the row's value", L.get("autotrade_symbols"), "eur/usd,xau/usd")
fresh(autotrade_risk_pct="1.5", autotrade_max_per_day="4", scan_enabled="false", auto_breakeven_enabled="true")
s.check("numbers and switches are turned into their real types",
        (L.get("autotrade_risk_pct"), L.get("autotrade_max_per_day"), L.get("scan_enabled"), L.get("auto_breakeven_enabled")),
        (1.5, 4, False, True))
fresh(autotrade_risk_pct="50")
s.check("risk 50% (outside 0.1-5) → IGNORED, the default used", L.get("autotrade_risk_pct"), settings.autotrade_risk_pct)
fresh(autotrade_sessions="moon")
s.check("an unknown session → IGNORED", L.get("autotrade_sessions"), settings.autotrade_sessions)
fresh(autotrade_symbols="eur/usd,doge/usd")
s.check("an unknown pair → IGNORED", L.get("autotrade_symbols"), settings.autotrade_symbols)
fresh(autotrade_cutoff_utc="25:00")
s.check("a cut-off of 25:00 → IGNORED", L.get("autotrade_cutoff_utc"), settings.autotrade_cutoff_utc)
fresh(autotrade_cutoff_utc="")
s.check("an EMPTY cut-off is allowed (it means no cut-off)", L.get("autotrade_cutoff_utc"), "")
fresh(scan_enabled="maybe")
s.check("a switch that is not true/false → IGNORED", L.get("scan_enabled"), settings.scan_enabled)
fresh(min_confidence_overrides="vix1:0.6,pix:1.4")
s.check("a per-strategy confidence over 1 → IGNORED", L.get("min_confidence_overrides"), settings.min_confidence_overrides)
_real_checks = dict(L.MANAGED)
for k in L.MANAGED:
    L.MANAGED[k] = lambda v: True                                       # SABOTAGE: every value accepted
fresh(autotrade_risk_pct="50")
s.teeth("a bad row is ignored", L.get("autotrade_risk_pct") != settings.autotrade_risk_pct)
L.MANAGED.update(_real_checks)
try:
    L.get("database_url")
    s.check("a name not on the list is refused", False, True)
except KeyError:
    s.check("a name not on the list is refused", True, True)

# ── 3. the 5-second memory and a dead database ───────────────────────────────────────────────────────────────────
fresh(autotrade_max_lots="2")
L.get("autotrade_max_lots")
ROWS["autotrade_max_lots"] = "3"
s.check("a change is picked up only after the 5 s memory expires", L.get("autotrade_max_lots"), 2.0)
L._read_at -= 6
s.check("...and then it is", L.get("autotrade_max_lots"), 3.0)
DOWN[0] = True
L._read_at -= 6
s.check("database unreadable → the LAST GOOD read is kept", L.get("autotrade_max_lots"), 3.0)
DOWN[0] = False
fresh()

# ── 4. every reader goes through it ──────────────────────────────────────────────────────────────────────────────
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
pat = re.compile(r"(?<![\w.])settings\.(" + "|".join(L.MANAGED) + r")\b")
direct = []
for d, _, fs in os.walk(ROOT):
    if os.sep + "tests" in d or "__pycache__" in d or ".venv" in d:
        continue
    for f in fs:
        if f.endswith(".py") and f != "live_settings.py":
            for n, line in enumerate(open(os.path.join(d, f), encoding="utf-8", errors="replace"), 1):
                if not line.lstrip().startswith("#") and pat.search(line):
                    direct.append(f"{os.path.relpath(os.path.join(d, f), ROOT)}:{n}")
s.check("no engine file reads a moved setting straight from Coolify", direct, [])
from execution import guards  # noqa: E402
fresh(autotrade_strategies="vix1,pix", autotrade_symbols="", autotrade_sessions="", autotrade_cutoff_utc="")
s.check("the order checks follow the panel (PIX allowed by a row)", guards.scope_refusal("XAU/USD", "pix"), None)
fresh()
s.done()
